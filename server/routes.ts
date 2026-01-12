import {
  insertCreditMemoLineItemSchema,
  insertCreditMemoSchema,
  insertCustomerSchema,
  insertInvoiceLineItemSchema,
  insertInvoiceSchema,
  insertProductSchema,
  insertProductSchemeSchema,
  insertProductVariantSchema,
} from "@shared/schema";
import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { isAuthenticated, requireRole } from "./auth";
import { registerAuthRoutes } from "./authRoutes";
import { quickBooksService } from "./services/quickbooks";
import { storage } from "./storage";

// Configure multer for file uploads (memory storage) with limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only accept Excel and CSV files
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
    ];
    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const ext = file.originalname
      .toLowerCase()
      .substring(file.originalname.lastIndexOf("."));

    if (
      allowedMimes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.",
        ),
      );
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup JWT authentication routes
  registerAuthRoutes(app);

  // User routes (protected)
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/users", isAuthenticated, async (req, res) => {
    try {
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error: any) {
      console.error("Error creating user:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Filter out undefined values, keep null values for QuickBooks disconnection
      const filteredData: any = {};
      for (const [key, value] of Object.entries(updateData)) {
        if (value !== undefined) {
          filteredData[key] = value;
        }
      }

      // Ensure we have at least one field to update
      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const user = await storage.updateUser(id, filteredData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;

      // Prevent deletion of default user
      if (id === "user-1") {
        return res.status(400).json({ message: "Cannot delete default user" });
      }

      const success = await storage.deleteUser(id);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // QuickBooks OAuth routes
  app.get("/api/auth/quickbooks", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user.userId;

      const authUrl = quickBooksService.getAuthorizationUrl(userId);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  app.get("/api/auth/quickbooks/callback", async (req, res) => {
    try {
      const { code, realmId, state } = req.query;

      // Log request query params (excluding sensitive code)
      console.log("QuickBooks callback params:", {
        realmId,
        state,
        hasCode: !!code,
      });

      // Get the frontend URL from request origin or environment
      const origin =
        req.headers.origin ||
        req.headers.referer?.split("/").slice(0, 3).join("/") ||
        `${req.protocol}://${req.get("host")}`;

      // Check if this is a direct browser request (from QuickBooks) or an API call (from frontend)
      const isApiCall =
        req.headers.accept?.includes("application/json") ||
        req.headers["x-requested-with"];

      if (!code || !realmId || !state) {
        console.log("QuickBooks callback missing params:", {
          code: !!code,
          realmId: !!realmId,
          state: !!state,
        });
        if (isApiCall) {
          return res.status(400).json({ error: "missing_params" });
        }
        return res.redirect(`${origin}/#/quickbooks/auth#error=missing_params`);
      }

      console.log("QuickBooks callback received:", { realmId, state });

      // Verify user exists before proceeding
      const user = await storage.getUser(state as string);
      if (!user) {
        console.error("QuickBooks callback error: User not found", {
          userId: state,
        });
        if (isApiCall) {
          return res.status(404).json({ error: "user_not_found" });
        }
        return res.redirect(`${origin}/#/quickbooks/auth#error=user_not_found`);
      }

      const tokens = await quickBooksService.exchangeCodeForTokens(
        code as string,
        realmId as string,
      );

      console.log("QuickBooks tokens exchanged successfully");

      // Fetch company information
      let companyName = null;
      try {
        const companyInfo = await quickBooksService.getCompanyInfo(
          tokens.accessToken,
          tokens.companyId,
        );
        companyName =
          companyInfo?.CompanyName || companyInfo?.LegalName || null;
        console.log("QuickBooks company info fetched:", { companyName });
      } catch (companyInfoError) {
        console.error("Failed to fetch company info:", companyInfoError);
      }

      // Store QuickBooks config in system settings (system-wide, not per-user)
      await storage.setSystemSetting("quickbooks_config", {
        companyId: tokens.companyId,
        companyName: companyName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
      });

      console.log("QuickBooks connection successful for user:", {
        userId: state,
        companyName,
      });

      if (isApiCall) {
        return res.json({ connected: true });
      }
      res.redirect(`${origin}/#/quickbooks/auth#success=true`);
    } catch (error: any) {
      console.error("QuickBooks callback error:", {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      const origin =
        req.headers.origin ||
        req.headers.referer?.split("/").slice(0, 3).join("/") ||
        `${req.protocol}://${req.get("host")}`;
      const isApiCall =
        req.headers.accept?.includes("application/json") ||
        req.headers["x-requested-with"];

      const errorMessage = error.message || "Authentication failed";
      const errorType = error.message?.includes("invalid_grant")
        ? "invalid_grant"
        : "auth_failed";
      if (isApiCall) {
        return res.status(500).json({
          error: errorType,
          message: errorMessage,
        });
      }
      const encodedMessage = encodeURIComponent(errorMessage);
      res.redirect(
        `${origin}/#/quickbooks/auth#error=${errorType}&message=${encodedMessage}`,
      );
    }
  });

  app.post(
    "/api/auth/quickbooks/disconnect",
    isAuthenticated,
    async (req, res) => {
      try {
        // Delete system-wide QuickBooks config (affects all users)
        await storage.deleteSystemSetting("quickbooks_config");

        res.json({ success: true });
      } catch (error) {
        console.error("QuickBooks disconnect error:", error);
        res.status(500).json({ message: "Failed to disconnect QuickBooks" });
      }
    },
  );

  // Customer routes
  app.get("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const customers = await storage.getCustomers(user.userId);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const validation = insertCustomerSchema
        .extend({
          type: z.enum(["customer", "vendor"]).optional(),
        })
        .safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid customer data",
          errors: validation.error.errors,
        });
      }

      const user = (req as any).user;
      const customerData = {
        ...validation.data,
        userId: user.userId,
      };

      const customer = await storage.createCustomer(customerData);
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  app.patch(
    "/api/customers/:id",
    isAuthenticated,
    requireRole(["super_admin", "admin"]),
    async (req, res) => {
      try {
        const customer = await storage.updateCustomer(req.params.id, req.body);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }
        res.json(customer);
      } catch (error) {
        res.status(500).json({ message: "Failed to update customer" });
      }
    },
  );

  app.delete(
    "/api/customers/:id",
    isAuthenticated,
    requireRole(["super_admin", "admin"]),
    async (req, res) => {
      try {
        const success = await storage.deleteCustomer(req.params.id);
        if (!success) {
          return res.status(404).json({ message: "Customer not found" });
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete customer" });
      }
    },
  );

  // Export customers/vendors to Excel (separate sheets with all fields)
  app.get("/api/customers/export", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const allAccounts = await storage.getCustomers(user.userId);

      // Separate customers and vendors
      const customersList = allAccounts.filter((c) => c.type === "customer");
      const vendorsList = allAccounts.filter((c) => c.type === "vendor");

      // Prepare customer data for Excel with all fields separated
      const customerData = customersList.map((customer) => ({
        Name: customer.name,
        Email: customer.email || "",
        Phone: customer.phone || "",
        Street: customer.address?.street || "",
        City: customer.address?.city || "",
        State: customer.address?.state || "",
        ZipCode: customer.address?.zipCode || "",
        Country: customer.address?.country || "",
        IsActive: customer.isActive !== false ? "Yes" : "No",
        QuickBooksCustomerId: customer.quickbooksCustomerId || "",
      }));

      // Prepare vendor data for Excel with all fields separated
      const vendorData = vendorsList.map((vendor) => ({
        Name: vendor.name,
        Email: vendor.email || "",
        Phone: vendor.phone || "",
        Street: vendor.address?.street || "",
        City: vendor.address?.city || "",
        State: vendor.address?.state || "",
        ZipCode: vendor.address?.zipCode || "",
        Country: vendor.address?.country || "",
        IsActive: vendor.isActive !== false ? "Yes" : "No",
        QuickBooksCustomerId: vendor.quickbooksCustomerId || "",
      }));

      // Create workbook with separate sheets
      const wb = XLSX.utils.book_new();
      
      // Add Customers sheet
      const customersWs = XLSX.utils.json_to_sheet(customerData);
      XLSX.utils.book_append_sheet(wb, customersWs, "Customers");
      
      // Add Vendors sheet
      const vendorsWs = XLSX.utils.json_to_sheet(vendorData);
      XLSX.utils.book_append_sheet(wb, vendorsWs, "Vendors");

      // Generate buffer
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      // Set response headers
      const filename = "accounts.xlsx";
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.send(buffer);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Import customers/vendors from Excel/CSV (supports separate sheets with all fields)
  app.post(
    "/api/customers/import",
    isAuthenticated,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "File is required" });
        }

        const user = (req as any).user;
        const userId = user.userId;

        // Parse Excel/CSV file
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

        const results = {
          success: 0,
          failed: 0,
          errors: [] as string[],
        };

        // Helper function to process rows from a sheet
        const processSheet = async (sheetName: string, type: "customer" | "vendor") => {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) return;

          const data = XLSX.utils.sheet_to_json(worksheet);

          for (let i = 0; i < data.length; i++) {
            const row: any = data[i];

            try {
              // Build address from separate columns or parse JSON if Address column exists
              let address = null;

              // Check for separate address columns first
              if (row.Street || row.City || row.State || row.ZipCode || row.Country) {
                address = {
                  street: row.Street || "",
                  city: row.City || "",
                  state: row.State || "",
                  zipCode: row.ZipCode || "",
                  country: row.Country || "",
                };
              } else if (row.Address) {
                // Fallback to JSON parsing for backwards compatibility
                try {
                  address = JSON.parse(row.Address);
                } catch {
                  address = null;
                }
              }

              // Parse isActive field
              const isActiveStr = (row.IsActive || "").toString().toLowerCase();
              const isActive = isActiveStr === "no" ? false : true;

              // Validate and create customer/vendor
              const customerData = {
                userId,
                name: row.Name,
                email: row.Email || null,
                phone: row.Phone || null,
                address,
                type,
                isActive,
                quickbooksCustomerId: row.QuickBooksCustomerId || null,
              };

              const validation = insertCustomerSchema
                .extend({
                  userId: z.string(),
                })
                .safeParse(customerData);

              if (!validation.success) {
                results.failed++;
                results.errors.push(
                  `${sheetName} Row ${i + 2}: ${validation.error.errors
                    .map((e) => e.message)
                    .join(", ")}`,
                );
                continue;
              }

              await storage.createCustomer(validation.data);
              results.success++;
            } catch (error: any) {
              results.failed++;
              results.errors.push(`${sheetName} Row ${i + 2}: ${error.message}`);
            }
          }
        };

        // Process Customers sheet if it exists
        if (workbook.SheetNames.includes("Customers")) {
          await processSheet("Customers", "customer");
        }

        // Process Vendors sheet if it exists
        if (workbook.SheetNames.includes("Vendors")) {
          await processSheet("Vendors", "vendor");
        }

        // Fallback: if no Customers/Vendors sheets, process the first sheet as before (backwards compatibility)
        if (!workbook.SheetNames.includes("Customers") && !workbook.SheetNames.includes("Vendors")) {
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);

          for (let i = 0; i < data.length; i++) {
            const row: any = data[i];

            try {
              // Build address from separate columns or parse JSON
              let address = null;

              if (row.Street || row.City || row.State || row.ZipCode || row.Country) {
                address = {
                  street: row.Street || "",
                  city: row.City || "",
                  state: row.State || "",
                  zipCode: row.ZipCode || "",
                  country: row.Country || "",
                };
              } else if (row.Address) {
                try {
                  address = JSON.parse(row.Address);
                } catch {
                  address = null;
                }
              }

              // Parse isActive and type fields
              const isActiveStr = (row.IsActive || "").toString().toLowerCase();
              const isActive = isActiveStr === "no" ? false : true;
              const type = (row.Type || "").toString().toLowerCase() === "vendor" ? "vendor" : "customer";

              const customerData = {
                userId,
                name: row.Name,
                email: row.Email || null,
                phone: row.Phone || null,
                address,
                type,
                isActive,
                quickbooksCustomerId: row.QuickBooksCustomerId || null,
              };

              const validation = insertCustomerSchema
                .extend({
                  userId: z.string(),
                })
                .safeParse(customerData);

              if (!validation.success) {
                results.failed++;
                results.errors.push(
                  `Row ${i + 2}: ${validation.error.errors
                    .map((e) => e.message)
                    .join(", ")}`,
                );
                continue;
              }

              await storage.createCustomer(validation.data);
              results.success++;
            } catch (error: any) {
              results.failed++;
              results.errors.push(`Row ${i + 2}: ${error.message}`);
            }
          }
        }

        res.json({
          message: `Import completed: ${results.success} succeeded, ${results.failed} failed`,
          ...results,
        });
      } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ message: "Failed to import data" });
      }
    },
  );

  // Export customers only to Excel
  app.get("/api/customers/export/customers-only", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const allAccounts = await storage.getCustomers(user.userId);
      const customersList = allAccounts.filter((c) => c.type === "customer");

      const customerData = customersList.map((customer) => ({
        Name: customer.name,
        Email: customer.email || "",
        Phone: customer.phone || "",
        Street: customer.address?.street || "",
        City: customer.address?.city || "",
        State: customer.address?.state || "",
        ZipCode: customer.address?.zipCode || "",
        Country: customer.address?.country || "",
        IsActive: customer.isActive !== false ? "Yes" : "No",
        QuickBooksCustomerId: customer.quickbooksCustomerId || "",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(customerData);
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Disposition", `attachment; filename="customers.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export customers" });
    }
  });

  // Export vendors only to Excel
  app.get("/api/customers/export/vendors-only", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const allAccounts = await storage.getCustomers(user.userId);
      const vendorsList = allAccounts.filter((c) => c.type === "vendor");

      const vendorData = vendorsList.map((vendor) => ({
        Name: vendor.name,
        Email: vendor.email || "",
        Phone: vendor.phone || "",
        Street: vendor.address?.street || "",
        City: vendor.address?.city || "",
        State: vendor.address?.state || "",
        ZipCode: vendor.address?.zipCode || "",
        Country: vendor.address?.country || "",
        IsActive: vendor.isActive !== false ? "Yes" : "No",
        QuickBooksCustomerId: vendor.quickbooksCustomerId || "",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(vendorData);
      XLSX.utils.book_append_sheet(wb, ws, "Vendors");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Disposition", `attachment; filename="vendors.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export vendors" });
    }
  });

  // Import customers only from Excel
  app.post(
    "/api/customers/import/customers-only",
    isAuthenticated,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "File is required" });
        }

        const user = (req as any).user;
        const userId = user.userId;
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        const results = { success: 0, failed: 0, errors: [] as string[] };

        // Helper to safely convert Excel values to strings
        const toStr = (val: any) => val !== undefined && val !== null ? String(val).trim() : "";

        for (let i = 0; i < data.length; i++) {
          const row: any = data[i];
          try {
            const name = toStr(row.Name);
            if (!name) {
              results.failed++;
              results.errors.push(`Row ${i + 2}: Name is required`);
              continue;
            }

            let address = null;
            const street = toStr(row.Street);
            const city = toStr(row.City);
            const state = toStr(row.State);
            const zipCode = toStr(row.ZipCode);
            const country = toStr(row.Country);
            if (street || city || state || zipCode || country) {
              address = { street, city, state, zipCode, country };
            }

            const isActiveStr = toStr(row.IsActive).toLowerCase();
            const isActive = isActiveStr === "no" ? false : true;

            const customerData = {
              userId,
              name,
              email: toStr(row.Email) || null,
              phone: toStr(row.Phone) || null,
              address,
              type: "customer" as const,
              isActive,
              quickbooksCustomerId: toStr(row.QuickBooksCustomerId) || null,
            };

            const validation = insertCustomerSchema.extend({ userId: z.string() }).safeParse(customerData);
            if (!validation.success) {
              results.failed++;
              results.errors.push(`Row ${i + 2}: ${validation.error.errors.map((e) => e.message).join(", ")}`);
              continue;
            }

            await storage.createCustomer(validation.data);
            results.success++;
          } catch (error: any) {
            results.failed++;
            results.errors.push(`Row ${i + 2}: ${error.message}`);
          }
        }

        res.json({ message: `Customers import completed: ${results.success} succeeded, ${results.failed} failed`, ...results });
      } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ message: "Failed to import customers" });
      }
    },
  );

  // Import vendors only from Excel
  app.post(
    "/api/customers/import/vendors-only",
    isAuthenticated,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "File is required" });
        }

        const user = (req as any).user;
        const userId = user.userId;
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        const results = { success: 0, failed: 0, errors: [] as string[] };

        // Helper to safely convert Excel values to strings
        const toStr = (val: any) => val !== undefined && val !== null ? String(val).trim() : "";

        for (let i = 0; i < data.length; i++) {
          const row: any = data[i];
          try {
            const name = toStr(row.Name);
            if (!name) {
              results.failed++;
              results.errors.push(`Row ${i + 2}: Name is required`);
              continue;
            }

            let address = null;
            const street = toStr(row.Street);
            const city = toStr(row.City);
            const state = toStr(row.State);
            const zipCode = toStr(row.ZipCode);
            const country = toStr(row.Country);
            if (street || city || state || zipCode || country) {
              address = { street, city, state, zipCode, country };
            }

            const isActiveStr = toStr(row.IsActive).toLowerCase();
            const isActive = isActiveStr === "no" ? false : true;

            const vendorData = {
              userId,
              name,
              email: toStr(row.Email) || null,
              phone: toStr(row.Phone) || null,
              address,
              type: "vendor" as const,
              isActive,
              quickbooksCustomerId: toStr(row.QuickBooksCustomerId) || null,
            };

            const validation = insertCustomerSchema.extend({ userId: z.string() }).safeParse(vendorData);
            if (!validation.success) {
              results.failed++;
              results.errors.push(`Row ${i + 2}: ${validation.error.errors.map((e) => e.message).join(", ")}`);
              continue;
            }

            await storage.createCustomer(validation.data);
            results.success++;
          } catch (error: any) {
            results.failed++;
            results.errors.push(`Row ${i + 2}: ${error.message}`);
          }
        }

        res.json({ message: `Vendors import completed: ${results.success} succeeded, ${results.failed} failed`, ...results });
      } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ message: "Failed to import vendors" });
      }
    },
  );

  // Inventory movement report - Must be before other product routes
  app.get(
    "/api/reports/inventory-movement",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = (req as any).user;
        
        // Fetch all data in parallel for faster performance
        const [products, invoices, creditMemos, allInvoiceLineItems, allCreditMemoLineItems, customers] = await Promise.all([
          storage.getProducts(user.userId),
          storage.getInvoices(user.userId),
          storage.getCreditMemos(user.userId),
          storage.getAllInvoiceLineItems(),
          storage.getAllCreditMemoLineItems(),
          storage.getCustomers(user.userId),
        ]);

        // Create lookup maps for invoices and credit memos
        const invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]));
        const creditMemoMap = new Map(creditMemos.map((cm: any) => [cm.id, cm]));

        // Build all line items with invoice/credit memo data
        const allLineItems: any[] = [];
        
        // Process invoice line items
        for (const item of allInvoiceLineItems) {
          const invoice = invoiceMap.get(item.invoiceId);
          if (invoice) {
            allLineItems.push({
              ...item,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              invoiceType: invoice.invoiceType,
              customerId: invoice.customerId,
              isCreditMemo: false,
            });
          }
        }

        // Process credit memo line items
        for (const item of allCreditMemoLineItems) {
          const creditMemo = creditMemoMap.get(item.creditMemoId);
          if (creditMemo) {
            allLineItems.push({
              ...item,
              invoiceNumber: `CM-${creditMemo.creditMemoNumber}`,
              invoiceDate: creditMemo.creditMemoDate,
              invoiceType: creditMemo.invoiceType,
              customerId: creditMemo.customerId,
              isCreditMemo: true,
            });
          }
        }

        // Create customer lookup map (customers already fetched above)
        const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

        // Build the report data grouped by product
        const reportData: any[] = [];

        for (const product of products) {
          // Get all line items for this product
          const productLineItems = allLineItems.filter(
            (item: any) => item.productId === product.id,
          );

          if (productLineItems.length > 0) {
            // Add product name as header row
            reportData.push({
              "Product Name": product.name,
              "Invoice Number": "",
              "Invoice Date": "",
              Name: "",
              QTY: "",
            });

            // Add each transaction
            productLineItems.forEach((item: any) => {
              const customerName = customerMap.get(item.customerId) || "";
              let quantity;
              
              if (item.isCreditMemo) {
                // Credit memos have opposite effect of invoices:
                // AR Credit Memo: Positive (returning goods from customer - increases inventory)
                // AP Credit Memo: Negative (returning goods to supplier - decreases inventory)
                quantity = item.invoiceType === "receivable"
                  ? item.quantity
                  : -item.quantity;
              } else {
                // Invoices:
                // AR Invoice: Negative (sales/outgoing - decreases inventory)
                // AP Invoice: Positive (purchases/incoming - increases inventory)
                quantity = item.invoiceType === "receivable"
                  ? -item.quantity
                  : item.quantity;
              }

              reportData.push({
                "Product Name": "",
                "Invoice Number": item.invoiceNumber,
                "Invoice Date": item.invoiceDate
                  ? new Date(item.invoiceDate).toLocaleDateString("en-US")
                  : "",
                Name: customerName,
                QTY: quantity,
              });
            });
          }
        }

        // Generate Excel file
        const worksheet = XLSX.utils.json_to_sheet(reportData, {
          header: [
            "Product Name",
            "Invoice Number",
            "Invoice Date",
            "Name",
            "QTY",
          ],
          skipHeader: false,
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Movement");

        const buffer = XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
        });

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Inventory_Movement_Report_${
            new Date().toISOString().split("T")[0]
          }.xlsx"`,
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.send(buffer);
      } catch (error) {
        console.error("Error generating inventory movement report:", error);
        res
          .status(500)
          .json({ message: "Failed to generate inventory movement report" });
      }
    },
  );

  // Sync inventory quantities based on invoice and credit memo movements
  app.post(
    "/api/inventory/sync",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = (req as any).user;
        
        // Fetch all data in parallel for faster performance
        const [products, invoices, creditMemos, allInvoiceLineItems, allCreditMemoLineItems] = await Promise.all([
          storage.getProducts(user.userId),
          storage.getInvoices(user.userId),
          storage.getCreditMemos(user.userId),
          storage.getAllInvoiceLineItems(),
          storage.getAllCreditMemoLineItems(),
        ]);

        // Create lookup maps for invoices and credit memos
        const invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]));
        const creditMemoMap = new Map(creditMemos.map((cm: any) => [cm.id, cm]));

        // Build all line items with invoice/credit memo data
        const allLineItems: any[] = [];
        
        // Process invoice line items
        for (const item of allInvoiceLineItems) {
          const invoice = invoiceMap.get(item.invoiceId);
          if (invoice) {
            allLineItems.push({
              ...item,
              invoiceType: invoice.invoiceType,
              isCreditMemo: false,
            });
          }
        }

        // Process credit memo line items
        for (const item of allCreditMemoLineItems) {
          const creditMemo = creditMemoMap.get(item.creditMemoId);
          if (creditMemo) {
            allLineItems.push({
              ...item,
              invoiceType: creditMemo.invoiceType,
              isCreditMemo: true,
            });
          }
        }

        // Calculate correct quantity for each product based on movements
        const syncResults: any[] = [];
        for (const product of products) {
          const productLineItems = allLineItems.filter(
            (item: any) => item.productId === product.id && item.quantity > 0,
          );

          // Calculate net quantity based on invoices and credit memos
          let netQuantity = 0;
          for (const item of productLineItems) {
            if (item.isCreditMemo) {
              // Credit memos have opposite effect of invoices:
              // AR Credit Memo: Adds to inventory (returning goods from customer)
              // AP Credit Memo: Subtracts from inventory (returning goods to supplier)
              if (item.invoiceType === "receivable") {
                netQuantity += item.quantity;
              } else if (item.invoiceType === "payable") {
                netQuantity -= item.quantity;
              }
            } else {
              // Invoices:
              // AP Invoice: Adds to inventory (purchases)
              // AR Invoice: Subtracts from inventory (sales)
              if (item.invoiceType === "payable") {
                netQuantity += item.quantity;
              } else if (item.invoiceType === "receivable") {
                netQuantity -= item.quantity;
              }
            }
          }

          // Update product quantity if different
          if (product.qty !== netQuantity) {
            await storage.updateProduct(product.id, { qty: netQuantity });
            syncResults.push({
              productName: product.name,
              oldQty: product.qty,
              newQty: netQuantity,
            });
          }
        }

        res.json({
          message: `Inventory sync completed. ${syncResults.length} products updated.`,
          updates: syncResults,
        });
      } catch (error) {
        console.error("Error syncing inventory:", error);
        res.status(500).json({ message: "Failed to sync inventory" });
      }
    },
  );

  // Product routes
  app.get("/api/products", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const products = await storage.getProducts(user.userId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/products", isAuthenticated, async (req, res) => {
    try {
      console.log("Creating product with data:", req.body);

      const validation = insertProductSchema.safeParse(req.body);

      if (!validation.success) {
        console.error("Product validation failed:", validation.error.errors);
        return res.status(400).json({
          message: "Invalid product data",
          errors: validation.error.errors,
        });
      }

      const user = (req as any).user;
      const productData = {
        ...validation.data,
        userId: user.userId,
      };

      const product = await storage.createProduct(productData);
      console.log("Product created successfully:", product.id, product.name);
      res.json(product);
    } catch (error) {
      console.error("Product creation error:", error);
      const err = error as any;
      res
        .status(500)
        .json({ message: "Failed to create product", error: err.message });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    try {
      console.log("Updating product with data:", req.body);

      const validation = insertProductSchema.partial().safeParse(req.body);

      if (!validation.success) {
        console.error("Product validation failed:", validation.error.errors);
        return res.status(400).json({
          message: "Invalid product data",
          errors: validation.error.errors,
        });
      }

      const product = await storage.updateProduct(
        req.params.id,
        validation.data,
      );
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      console.log("Product updated successfully:", product.id, product.name);
      res.json(product);
    } catch (error) {
      console.error("Product update error:", error);
      const err = error as any;
      res
        .status(500)
        .json({ message: "Failed to update product", error: err.message });
    }
  });

  app.delete("/api/products", isAuthenticated, async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }

      const success = await storage.deleteAllProducts(userId);
      res.json({ success: true, message: "All products deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete all products" });
    }
  });

  app.delete("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const success = await storage.deleteProduct(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Product variant routes
  app.get(
    "/api/products/:productId/variants",
    isAuthenticated,
    async (req, res) => {
      try {
        const variants = await storage.getProductVariants(req.params.productId);
        res.json(variants);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch product variants" });
      }
    },
  );

  app.post("/api/variants", isAuthenticated, async (req, res) => {
    try {
      const validation = insertProductVariantSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid variant data",
          errors: validation.error.errors,
        });
      }

      const variant = await storage.createVariant(validation.data);
      res.json(variant);
    } catch (error) {
      res.status(500).json({ message: "Failed to create variant" });
    }
  });

  // Product scheme routes
  app.get("/api/schemes", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const schemes = await storage.getProductSchemes(user.userId);
      const usageCounts = await storage.getSchemeUsageCounts(user.userId);

      const schemesWithCounts = schemes.map((scheme) => ({
        ...scheme,
        usageCount: usageCounts[scheme.id] || 0,
      }));

      res.json(schemesWithCounts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schemes" });
    }
  });

  app.post("/api/schemes", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const validation = insertProductSchemeSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid scheme data",
          errors: validation.error.errors,
        });
      }

      const scheme = await storage.createScheme({
        ...validation.data,
        userId: user.userId,
      });
      res.json(scheme);
    } catch (error) {
      console.error("Error creating scheme:", error);
      res.status(500).json({ message: "Failed to create scheme" });
    }
  });

  app.patch("/api/schemes/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Ensure isActive is a boolean if provided
      if (updates.isActive !== undefined) {
        updates.isActive = Boolean(updates.isActive);
      }

      const updatedScheme = await storage.updateScheme(id, updates);
      if (!updatedScheme) {
        return res.status(404).json({ message: "Scheme not found" });
      }

      return res.status(200).json(updatedScheme);
    } catch (error) {
      console.error("Error updating scheme:", error);
      return res.status(500).json({ message: "Failed to update scheme" });
    }
  });

  app.delete("/api/schemes/:id", isAuthenticated, async (req, res) => {
    try {
      const success = await storage.deleteScheme(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Scheme not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete scheme" });
    }
  });

  // Invoice routes
  app.get("/api/invoices", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const invoices = await storage.getInvoices(user.userId);
      
      // Fetch all line items to calculate total cartons per invoice
      const allLineItems = await storage.getAllInvoiceLineItems();
      
      // Create a map of invoice ID to total cartons
      const cartonsByInvoice = new Map<string, number>();
      for (const item of allLineItems) {
        if (item.invoiceId) {
          const currentTotal = cartonsByInvoice.get(item.invoiceId) || 0;
          cartonsByInvoice.set(item.invoiceId, currentTotal + (item.quantity || 0));
        }
      }
      
      // Add totalCartons to each invoice
      const invoicesWithCartons = invoices.map(invoice => ({
        ...invoice,
        totalCartons: cartonsByInvoice.get(invoice.id) || 0,
      }));
      
      res.json(invoicesWithCartons);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/next-number", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const invoices = await storage.getInvoices(user.userId);

      // Filter for AR invoices only
      const arInvoices = invoices.filter(
        (inv) => inv.invoiceType === "receivable",
      );

      if (arInvoices.length === 0) {
        // Start from 1 if no AR invoices exist
        return res.json({ nextNumber: "1" });
      }

      // Extract numeric invoice numbers and find the maximum
      const numericInvoiceNumbers = arInvoices
        .map((inv) => {
          const invoiceNumber = inv.invoiceNumber.trim();
          // Remove any non-numeric characters and parse as number
          const numericPart = invoiceNumber.replace(/\D/g, "");
          return parseInt(numericPart, 10);
        })
        .filter((num) => !isNaN(num));

      if (numericInvoiceNumbers.length === 0) {
        // If no valid numeric invoice numbers found, start from 1
        return res.json({ nextNumber: "1" });
      }

      const maxNumber = Math.max(...numericInvoiceNumbers);
      const nextNumber = maxNumber + 1;

      res.json({ nextNumber: nextNumber.toString() });
    } catch (error) {
      console.error("Error getting next invoice number:", error);
      res.status(500).json({ message: "Failed to get next invoice number" });
    }
  });

  app.post("/api/invoices", isAuthenticated, async (req, res) => {
    try {
      console.log(
        "Creating invoice with data:",
        JSON.stringify(req.body, null, 2),
      );
      const { invoice, lineItems } = req.body;

      if (!invoice || !lineItems) {
        console.error("Missing invoice or lineItems in request body");
        return res
          .status(400)
          .json({ message: "Invoice and line items are required" });
      }

      const invoiceValidation = insertInvoiceSchema.safeParse(invoice);

      if (!invoiceValidation.success) {
        console.error(
          "Invoice validation failed:",
          invoiceValidation.error.errors,
        );
        return res.status(400).json({
          message: "Invalid invoice data",
          errors: invoiceValidation.error.errors,
        });
      }

      const user = (req as any).user;
      const invoiceData = {
        ...invoiceValidation.data,
        userId: user.userId,
      };

      // Create invoice
      const createdInvoice = await storage.createInvoice(invoiceData);

      // Pre-fetch all products for margin snapshotting (avoid N+1 queries)
      const allProducts = await storage.getProducts(user.userId);
      const productMarginMap = new Map(allProducts.map((p: any) => [
        p.id, 
        p.marginPerCarton ? parseFloat(p.marginPerCarton) : 0
      ]));

      // Create line items with scheme application and margin snapshot
      const createdLineItems = [];
      const hasFrontendFreeItems = lineItems.some(
        (li: any) => li.isFreeFromScheme,
      );

      for (const item of lineItems) {
        // Skip line items with empty productId
        if (!item.productId || item.productId.trim() === "") {
          console.log("Skipping line item with empty productId:", item);
          continue;
        }

        // MARGIN SNAPSHOT: Capture inventory margin at invoice creation time
        // This value is IMMUTABLE - margin changes to inventory won't affect past invoices
        const rate = parseFloat(item.unitPrice) || 0;
        let snapshotMargin: string;
        
        // Free products (rate <= 0 or isFreeFromScheme) MUST have zero margin
        if (rate <= 0 || item.isFreeFromScheme) {
          snapshotMargin = "0";
        } else {
          // Snapshot margin from inventory product at creation time
          const inventoryMargin = productMarginMap.get(item.productId) || 0;
          snapshotMargin = inventoryMargin.toString();
        }

        const lineItemValidation = insertInvoiceLineItemSchema.safeParse({
          ...item,
          invoiceId: createdInvoice.id,
          marginPerCarton: snapshotMargin, // Always set from server-side snapshot
        });

        if (lineItemValidation.success) {
          const lineItem = await storage.createLineItem(
            lineItemValidation.data,
          );
          createdLineItems.push(lineItem);

          // Check for applicable schemes only if no frontend free items exist
          if (item.productId && !hasFrontendFreeItems) {
            const schemes = await storage.getProductSchemes(user.userId);
            const applicableScheme = schemes.find(
              (scheme) =>
                scheme.productId === item.productId &&
                scheme.isActive &&
                item.quantity >= scheme.buyQuantity,
            );

            if (applicableScheme) {
              const freeQuantity =
                Math.floor(item.quantity / applicableScheme.buyQuantity) *
                applicableScheme.freeQuantity;
              if (freeQuantity > 0) {
                // Free scheme items MUST have zero margin (rate = 0)
                const freeLineItem = await storage.createLineItem({
                  invoiceId: createdInvoice.id,
                  productId: item.productId,
                  variantId: item.variantId,
                  description: `${item.description} & ${applicableScheme.name}`,
                  quantity: freeQuantity,
                  unitPrice: "0.00",
                  lineTotal: "0.00",
                  marginPerCarton: "0", // Free items always have zero margin
                  isFreeFromScheme: true,
                  schemeId: applicableScheme.id,
                  category: item.category,
                });
                createdLineItems.push(freeLineItem);
              }
            }
          }
        } else {
          console.error(
            "Line item validation failed:",
            lineItemValidation.error.errors,
            "for item:",
            item,
          );
        }
      }

      // Update inventory based on invoice type
      for (const item of lineItems) {
        if (item.productId && item.productId.trim() !== "") {
          try {
            const currentProduct = await storage.getProduct(item.productId);
            if (currentProduct) {
              let newQty = currentProduct.qty;

              // AR Invoice (receivable): Reduce inventory (selling to customer)
              if (invoice.invoiceType === "receivable") {
                newQty = currentProduct.qty - item.quantity;
                console.log(
                  `Reducing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (sold ${item.quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
                continue; // Skip the default update below
              }
              // AP Invoice (payable): Increase inventory (buying from supplier)
              else if (invoice.invoiceType === "payable") {
                newQty = currentProduct.qty + item.quantity;
                console.log(
                  `Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (purchased ${item.quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
                continue; // Skip the default update below
              }

              // This should not be reached due to continue statements above
              await storage.updateProduct(item.productId, { qty: newQty });
            }
          } catch (inventoryError) {
            console.error(
              `Failed to update inventory for product ${item.productId}:`,
              inventoryError,
            );
            // Don't fail the entire invoice creation if inventory update fails
          }
        }
      }

      // Also update inventory for any auto-generated free scheme items
      for (const lineItem of createdLineItems) {
        if (
          lineItem.isFreeFromScheme &&
          lineItem.productId &&
          invoice.invoiceType === "receivable"
        ) {
          try {
            const currentProduct = await storage.getProduct(lineItem.productId);
            if (currentProduct) {
              const newQty = currentProduct.qty - lineItem.quantity;
              console.log(
                `Reducing inventory for free scheme item ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (free quantity ${lineItem.quantity})`,
              );
              await storage.updateProduct(lineItem.productId, { qty: newQty });
            }
          } catch (inventoryError) {
            console.error(
              `Failed to update inventory for free scheme item ${lineItem.productId}:`,
              inventoryError,
            );
          }
        }
      }

      res.json({ invoice: createdInvoice, lineItems: createdLineItems });
    } catch (error) {
      console.error("Invoice creation error:", error);
      const err = error as any;
      res
        .status(500)
        .json({ message: "Failed to create invoice", error: err.message });
    }
  });

  app.get("/api/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.get("/api/invoices/:id/line-items", isAuthenticated, async (req, res) => {
    try {
      const lineItems = await storage.getInvoiceLineItems(req.params.id);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch line items" });
    }
  });

  app.delete("/api/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.userId;

      // Get invoice and line items before deletion for inventory adjustment
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const lineItems = await storage.getInvoiceLineItems(req.params.id);

      // Collect unique product IDs from deleted invoice
      const uniqueProductIds = new Set<string>();
      for (const item of lineItems) {
        if (item.productId && item.productId.trim() !== "") {
          uniqueProductIds.add(item.productId);
        }
      }

      // Fetch all invoices once (for efficiency)
      const allInvoices = await storage.getInvoices(userId);

      // Separate and sort invoices by type
      const otherApInvoices = allInvoices
        .filter(
          (inv) => inv.invoiceType === "payable" && inv.id !== req.params.id,
        )
        .sort(
          (a, b) =>
            new Date(b.invoiceDate).getTime() -
            new Date(a.invoiceDate).getTime(),
        );

      const otherArInvoices = allInvoices
        .filter(
          (inv) => inv.invoiceType === "receivable" && inv.id !== req.params.id,
        )
        .sort(
          (a, b) =>
            new Date(b.invoiceDate).getTime() -
            new Date(a.invoiceDate).getTime(),
        );

      // Cache line items for all relevant invoices to avoid repeated queries
      const lineItemsCache = new Map<string, any[]>();

      // Fetch line items for AP invoices
      for (const inv of otherApInvoices) {
        if (!lineItemsCache.has(inv.id)) {
          const items = await storage.getInvoiceLineItems(inv.id);
          lineItemsCache.set(inv.id, items);
        }
      }

      // Fetch line items for AR invoices
      for (const inv of otherArInvoices) {
        if (!lineItemsCache.has(inv.id)) {
          const items = await storage.getInvoiceLineItems(inv.id);
          lineItemsCache.set(inv.id, items);
        }
      }

      // Build a map of product prices from other invoices
      const productPriceMap = new Map<
        string,
        { basePrice: string; salesPrice: string }
      >();

      for (const productId of Array.from(uniqueProductIds)) {
        // For AP invoices: find latest Base Price from cached line items
        let latestBasePrice = "0.00";
        try {
          for (const otherInv of otherApInvoices) {
            const cachedItems = lineItemsCache.get(otherInv.id) || [];
            const matchingItem = cachedItems.find(
              (li) => li.productId === productId,
            );
            if (matchingItem) {
              latestBasePrice = matchingItem.unitPrice;
              break; // Take the first match (most recent due to sort)
            }
          }
        } catch (error) {
          console.error(
            `Error finding Base Price for product ${productId}:`,
            error,
          );
        }

        // For AR invoices: find latest Sales Price from cached line items
        let latestSalesPrice = "0.00";
        try {
          for (const otherInv of otherArInvoices) {
            const cachedItems = lineItemsCache.get(otherInv.id) || [];
            const matchingItem = cachedItems.find(
              (li) => li.productId === productId,
            );
            if (matchingItem) {
              latestSalesPrice = matchingItem.unitPrice;
              break; // Take the first match (most recent due to sort)
            }
          }
        } catch (error) {
          console.error(
            `Error finding Sales Price for product ${productId}:`,
            error,
          );
        }

        productPriceMap.set(productId, {
          basePrice: latestBasePrice,
          salesPrice: latestSalesPrice,
        });
      }

      // Revert inventory changes for AP invoices (subtract added quantity)
      if (invoice.invoiceType === "payable") {
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                const newQty = currentProduct.qty - item.quantity;
                const priceInfo = productPriceMap.get(item.productId);
                const latestBasePrice = priceInfo?.basePrice || "0.00";

                console.log(
                  `Reverting AP invoice deletion: Reducing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (removing ${item.quantity})`,
                );
                console.log(
                  `Updating Base Price for product ${
                    currentProduct.name
                  } to $${parseFloat(latestBasePrice).toFixed(
                    2,
                  )} after AP invoice deletion`,
                );

                await storage.updateProduct(item.productId, {
                  qty: newQty,
                  basePrice: latestBasePrice,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      // Revert inventory changes for AR invoices (add back sold quantity)
      if (invoice.invoiceType === "receivable") {
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                const newQty = currentProduct.qty + item.quantity;
                const priceInfo = productPriceMap.get(item.productId);
                const latestSalesPrice = priceInfo?.salesPrice || "0.00";

                console.log(
                  `Reverting AR invoice deletion: Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (adding back ${item.quantity})`,
                );
                console.log(
                  `Updating Sales Price for product ${
                    currentProduct.name
                  } to $${parseFloat(latestSalesPrice).toFixed(
                    2,
                  )} after AR invoice deletion`,
                );

                await storage.updateProduct(item.productId, {
                  qty: newQty,
                  salesPrice: latestSalesPrice,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      const success = await storage.deleteInvoice(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  app.patch("/api/invoices/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const success = await storage.updateInvoiceStatus(req.params.id, status);
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({
        message: "Failed to update invoice status",
        error: error.message,
      });
    }
  });

  app.put("/api/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      console.log(
        "Updating invoice with data:",
        JSON.stringify(req.body, null, 2),
      );
      const { invoice: invoiceData, lineItems } = req.body;
      const invoiceId = req.params.id;

      if (!invoiceData || !lineItems) {
        console.error("Missing invoice or lineItems in request body");
        return res
          .status(400)
          .json({ message: "Invoice and line items are required" });
      }

      // Get existing invoice to check if it exists
      const existingInvoice = await storage.getInvoice(invoiceId);
      if (!existingInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get existing line items for inventory adjustment
      const existingLineItems = await storage.getInvoiceLineItems(invoiceId);

      // For AP invoices, revert old inventory changes before applying new ones
      if (existingInvoice.invoiceType === "payable") {
        for (const oldItem of existingLineItems) {
          if (oldItem.productId && oldItem.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(
                oldItem.productId,
              );
              if (currentProduct) {
                // Subtract the old quantity
                const newQty = Math.max(
                  0,
                  currentProduct.qty - oldItem.quantity,
                );
                console.log(
                  `Reverting old AP line item: Reducing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (removing ${oldItem.quantity})`,
                );
                await storage.updateProduct(oldItem.productId, { qty: newQty });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${oldItem.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      // For AR invoices, revert old inventory changes before applying new ones
      if (existingInvoice.invoiceType === "receivable") {
        for (const oldItem of existingLineItems) {
          if (oldItem.productId && oldItem.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(
                oldItem.productId,
              );
              if (currentProduct) {
                // Add back the old quantity
                const newQty = currentProduct.qty + oldItem.quantity;
                console.log(
                  `Reverting old AR line item: Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (adding back ${oldItem.quantity})`,
                );
                await storage.updateProduct(oldItem.productId, { qty: newQty });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${oldItem.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      // Update invoice
      const updatedInvoice = await storage.updateInvoice(invoiceId, {
        customerId: invoiceData.customerId,
        invoiceNumber: invoiceData.invoiceNumber,
        purchaseOrder: invoiceData.purchaseOrder,
        invoiceDate: new Date(invoiceData.invoiceDate),
        dueDate: invoiceData.dueDate
          ? new Date(invoiceData.dueDate)
          : undefined,
        subtotal: invoiceData.subtotal,
        freight: invoiceData.freight,
        discount: invoiceData.discount,
        notes: invoiceData.notes,
        total: invoiceData.total,
        status: invoiceData.status,
        invoiceType: invoiceData.invoiceType,
        updatedAt: new Date(),
      });

      // PRESERVE EXISTING MARGINS: Create a map of existing line item margins BEFORE deleting
      // This ensures margin immutability - editing an invoice won't change stored margins
      // Key by line item ID (unique per line) to handle multiple items for same product
      const existingMarginByIdMap = new Map<string, string>();
      for (const oldItem of existingLineItems) {
        if (oldItem.id && oldItem.marginPerCarton) {
          existingMarginByIdMap.set(oldItem.id, oldItem.marginPerCarton);
        }
      }

      // Pre-fetch all products for margin snapshotting when adding NEW products
      const user = (req as any).user;
      const allProducts = await storage.getProducts(user.userId);
      const productMarginMap = new Map(allProducts.map((p: any) => [
        p.id, 
        p.marginPerCarton ? parseFloat(p.marginPerCarton) : 0
      ]));

      console.log(`Processing ${lineItems.length} line items for invoice ${invoiceId}`);
      
      // PHASE 1: Validate ALL line items BEFORE deleting existing ones
      // This prevents data loss if validation fails
      const validatedLineItems: any[] = [];
      const validationErrors: string[] = [];
      
      for (let idx = 0; idx < lineItems.length; idx++) {
        const item = lineItems[idx];
        console.log(`Line item ${idx + 1}:`, JSON.stringify({ 
          productId: item.productId, 
          quantity: item.quantity, 
          unitPrice: item.unitPrice,
          description: item.description?.substring(0, 30)
        }));
        
        // Skip items with no productId (empty rows)
        if (!item.productId || (typeof item.productId === 'string' && item.productId.trim() === "")) {
          console.log(`Skipping line item ${idx + 1}: empty productId`);
          continue;
        }

        // MARGIN IMMUTABILITY: Preserve existing margins for existing line items
        const rate = parseFloat(String(item.unitPrice)) || 0;
        let snapshotMargin: string;
        
        // Free products (rate <= 0 or isFreeFromScheme) MUST have zero margin
        if (rate <= 0 || item.isFreeFromScheme) {
          snapshotMargin = "0";
        } else if (item.marginPerCarton !== undefined && item.marginPerCarton !== null && item.marginPerCarton !== "") {
          snapshotMargin = String(item.marginPerCarton);
        } else if (item.id && existingMarginByIdMap.has(item.id)) {
          snapshotMargin = existingMarginByIdMap.get(item.id)!;
        } else {
          const inventoryMargin = productMarginMap.get(item.productId) || 0;
          snapshotMargin = String(inventoryMargin);
        }

        // Prepare line item data - preserve numeric values faithfully
        // Schema uses integer for quantity, so use Math.round to handle any floats
        const rawQuantity = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity);
        const quantity = isNaN(rawQuantity) ? 0 : Math.round(rawQuantity);
        
        const lineItemData = {
          invoiceId: invoiceId,
          productId: item.productId,
          variantId: item.variantId || null,
          description: item.description || "",
          quantity: quantity,
          unitPrice: item.unitPrice != null ? String(item.unitPrice) : "0",
          lineTotal: item.lineTotal != null ? String(item.lineTotal) : "0",
          productCode: item.productCode || null,
          cartoonBarcode: item.cartoonBarcode || null,
          packingSize: item.packingSize || null,
          grossWeightKgs: item.grossWeightKgs != null ? String(item.grossWeightKgs) : null,
          netWeightKgs: item.netWeightKgs != null ? String(item.netWeightKgs) : null,
          category: item.category || null,
          marginPerCarton: snapshotMargin,
          isFreeFromScheme: item.isFreeFromScheme || false,
          isSchemeDescription: item.isSchemeDescription || false,
          schemeId: item.schemeId || null,
        };

        const lineItemValidation = insertInvoiceLineItemSchema.safeParse(lineItemData);

        if (lineItemValidation.success) {
          validatedLineItems.push(lineItemValidation.data);
          console.log(`Line item ${idx + 1} validated successfully`);
        } else {
          const errorMsg = `Line item ${idx + 1} validation failed: ${JSON.stringify(lineItemValidation.error.errors)}`;
          console.error(errorMsg, "for item:", lineItemData);
          validationErrors.push(errorMsg);
        }
      }
      
      // Fail the entire update if ANY line item fails validation (except empty productId which are intentionally skipped)
      // This prevents partial data loss where some items are saved but others are lost
      if (validationErrors.length > 0) {
        console.error("Line item validation failed:", validationErrors);
        return res.status(400).json({ 
          message: "Line item validation failed - invoice not updated to prevent data loss",
          errors: validationErrors 
        });
      }
      
      // If user submitted items but all had empty productIds (all skipped), don't proceed
      if (validatedLineItems.length === 0 && lineItems.length > 0) {
        console.error("All submitted line items had empty productIds");
        return res.status(400).json({ 
          message: "At least one line item with a valid product is required"
        });
      }
      
      // PHASE 2: Now safe to delete and recreate
      await storage.deleteInvoiceLineItemsByInvoiceId(invoiceId);
      
      const createdLineItems = [];
      for (const validatedItem of validatedLineItems) {
        const lineItem = await storage.createLineItem(validatedItem);
        createdLineItems.push(lineItem);
      }
      
      console.log(`Created ${createdLineItems.length} line items out of ${lineItems.length} submitted`);

      // Apply new inventory changes for AP invoices
      if (invoiceData.invoiceType === "payable") {
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                // Add the new quantity
                const newQty = currentProduct.qty + item.quantity;
                console.log(
                  `Applying new AP line item: Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (adding ${item.quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to update inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      // Apply new inventory changes for AR invoices
      if (invoiceData.invoiceType === "receivable") {
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                // Subtract the new quantity
                const newQty = currentProduct.qty - item.quantity;
                console.log(
                  `Applying new AR line item: Reducing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (removing ${item.quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to update inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      res.json({ invoice: updatedInvoice, lineItems: createdLineItems });
    } catch (error) {
      console.error("Invoice update error:", error);
      const err = error as any;
      res
        .status(500)
        .json({ message: "Failed to update invoice", error: err.message });
    }
  });

  // Credit Memo routes
  app.get("/api/credit-memos", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      const creditMemos = await storage.getCreditMemos(user.userId);
      res.json(creditMemos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch credit memos" });
    }
  });

  app.get(
    "/api/credit-memos/next-number",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = (req as any).user;
        const creditMemos = await storage.getCreditMemos(user.userId);

        // Filter for AR credit memos only
        const arCreditMemos = creditMemos.filter(
          (cm) => cm.invoiceType === "receivable",
        );

        if (arCreditMemos.length === 0) {
          // Start from 1 if no AR credit memos exist
          return res.json({ nextNumber: "1" });
        }

        // Extract numeric credit memo numbers and find the maximum
        const numericCreditMemoNumbers = arCreditMemos
          .map((cm) => {
            const creditMemoNumber = cm.creditMemoNumber.trim();
            // Remove any non-numeric characters and parse as number
            const numericPart = creditMemoNumber.replace(/\D/g, "");
            return parseInt(numericPart, 10);
          })
          .filter((num) => !isNaN(num));

        if (numericCreditMemoNumbers.length === 0) {
          // If no valid numeric credit memo numbers found, start from 1
          return res.json({ nextNumber: "1" });
        }

        const maxNumber = Math.max(...numericCreditMemoNumbers);
        const nextNumber = maxNumber + 1;

        res.json({ nextNumber: nextNumber.toString() });
      } catch (error) {
        console.error("Error getting next credit memo number:", error);
        res
          .status(500)
          .json({ message: "Failed to get next credit memo number" });
      }
    },
  );

  app.post("/api/credit-memos", isAuthenticated, async (req, res) => {
    try {
      console.log(
        "Creating credit memo with data:",
        JSON.stringify(req.body, null, 2),
      );
      const { creditMemo, lineItems } = req.body;

      if (!creditMemo || !lineItems) {
        console.error("Missing creditMemo or lineItems in request body");
        return res
          .status(400)
          .json({ message: "Credit memo and line items are required" });
      }

      const creditMemoValidation = insertCreditMemoSchema.safeParse(creditMemo);

      if (!creditMemoValidation.success) {
        console.error(
          "Credit memo validation failed:",
          creditMemoValidation.error.errors,
        );
        return res.status(400).json({
          message: "Invalid credit memo data",
          errors: creditMemoValidation.error.errors,
        });
      }

      const user = (req as any).user;
      const creditMemoData = {
        ...creditMemoValidation.data,
        userId: user.userId,
      };

      // Create credit memo
      const createdCreditMemo = await storage.createCreditMemo(creditMemoData);

      // Create line items
      const createdLineItems = [];
      for (const item of lineItems) {
        // Skip line items with empty productId
        if (!item.productId || item.productId.trim() === "") {
          console.log("Skipping line item with empty productId:", item);
          continue;
        }

        const lineItemValidation = insertCreditMemoLineItemSchema.safeParse({
          ...item,
          creditMemoId: createdCreditMemo.id,
        });

        if (lineItemValidation.success) {
          const lineItem = await storage.createCreditMemoLineItem(
            lineItemValidation.data,
          );
          createdLineItems.push(lineItem);
        } else {
          console.error(
            "Credit memo line item validation failed:",
            lineItemValidation.error.errors,
            "for item:",
            item,
          );
        }
      }

      // Update inventory based on credit memo type
      // Credit memos have opposite effect of invoices:
      // - AR Credit Memo (receivable): Increase inventory (returning goods from customer)
      // - AP Credit Memo (payable): Decrease inventory (returning goods to supplier)
      for (const item of lineItems) {
        if (item.productId && item.productId.trim() !== "") {
          try {
            const currentProduct = await storage.getProduct(item.productId);
            if (currentProduct) {
              const quantity =
                typeof item.quantity === "string"
                  ? parseFloat(item.quantity)
                  : item.quantity;

              // AR Credit Memo (receivable): Increase inventory (returning goods from customer)
              if (createdCreditMemo.invoiceType === "receivable") {
                const newQty = currentProduct.qty + quantity;
                console.log(
                  `Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (credit memo returned ${quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
              // AP Credit Memo (payable): Decrease inventory (returning goods to supplier)
              else if (createdCreditMemo.invoiceType === "payable") {
                const newQty = currentProduct.qty - quantity;
                console.log(
                  `Decreasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (credit memo returned ${quantity} to supplier)`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            }
          } catch (inventoryError) {
            console.error(
              `Failed to update inventory for product ${item.productId}:`,
              inventoryError,
            );
            // Don't fail the entire credit memo creation if inventory update fails
          }
        }
      }

      res.json({ creditMemo: createdCreditMemo, lineItems: createdLineItems });
    } catch (error: any) {
      console.error("Credit memo creation error:", error);
      res.status(500).json({
        message: error.message || "Failed to create credit memo",
      });
    }
  });

  app.get("/api/credit-memos/:id", isAuthenticated, async (req, res) => {
    try {
      const creditMemo = await storage.getCreditMemo(req.params.id);
      if (!creditMemo) {
        return res.status(404).json({ message: "Credit memo not found" });
      }
      res.json(creditMemo);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch credit memo" });
    }
  });

  app.get(
    "/api/credit-memos/:id/line-items",
    isAuthenticated,
    async (req, res) => {
      try {
        const lineItems = await storage.getCreditMemoLineItems(req.params.id);
        res.json(lineItems);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to fetch credit memo line items" });
      }
    },
  );

  app.delete("/api/credit-memos/:id", isAuthenticated, async (req, res) => {
    try {
      // Get credit memo and line items before deletion for inventory adjustment
      const creditMemo = await storage.getCreditMemo(req.params.id);
      if (!creditMemo) {
        return res.status(404).json({ message: "Credit memo not found" });
      }

      const lineItems = await storage.getCreditMemoLineItems(req.params.id);

      // Revert inventory changes for credit memos
      // Credit memos have opposite effect of invoices, so revert accordingly:
      // - AR Credit Memo: was increasing inventory, so revert by decreasing
      // - AP Credit Memo: was decreasing inventory, so revert by increasing
      if (creditMemo.invoiceType === "receivable") {
        // AR Credit Memo: Revert by decreasing inventory
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                const quantity =
                  typeof item.quantity === "string"
                    ? parseFloat(item.quantity)
                    : item.quantity;
                const newQty = currentProduct.qty - quantity;
                console.log(
                  `Reverting AR credit memo deletion: Decreasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (removing ${quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      } else if (creditMemo.invoiceType === "payable") {
        // AP Credit Memo: Revert by increasing inventory
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                const quantity =
                  typeof item.quantity === "string"
                    ? parseFloat(item.quantity)
                    : item.quantity;
                const newQty = currentProduct.qty + quantity;
                console.log(
                  `Reverting AP credit memo deletion: Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (adding back ${quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      // Delete the credit memo (this will also delete line items via cascade/deleteCreditMemoLineItemsByCreditMemoId)
      const success = await storage.deleteCreditMemo(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Credit memo not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Credit memo deletion error:", error);
      res.status(500).json({ message: "Failed to delete credit memo" });
    }
  });

  app.patch(
    "/api/credit-memos/:id/status",
    isAuthenticated,
    async (req, res) => {
      try {
        const { status } = req.body;
        if (!status) {
          return res.status(400).json({ message: "Status is required" });
        }

        const success = await storage.updateCreditMemoStatus(
          req.params.id,
          status,
        );
        if (!success) {
          return res.status(404).json({ message: "Credit memo not found" });
        }
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({
          message: "Failed to update credit memo status",
          error: error.message,
        });
      }
    },
  );

  app.put("/api/credit-memos/:id", isAuthenticated, async (req, res) => {
    try {
      console.log(
        "Updating credit memo with data:",
        JSON.stringify(req.body, null, 2),
      );
      const { creditMemo: creditMemoData, lineItems } = req.body;
      const creditMemoId = req.params.id;

      if (!creditMemoData || !lineItems) {
        console.error("Missing creditMemo or lineItems in request body");
        return res
          .status(400)
          .json({ message: "Credit memo and line items are required" });
      }

      // Get existing credit memo to check if it exists
      const existingCreditMemo = await storage.getCreditMemo(creditMemoId);
      if (!existingCreditMemo) {
        return res.status(404).json({ message: "Credit memo not found" });
      }

      // Get existing line items for inventory adjustment
      const existingLineItems =
        await storage.getCreditMemoLineItems(creditMemoId);

      // Revert old inventory changes before applying new ones
      // Credit memos have opposite effect of invoices:
      // - AR Credit Memo: was increasing inventory, so revert by decreasing
      // - AP Credit Memo: was decreasing inventory, so revert by increasing
      if (existingCreditMemo.invoiceType === "receivable") {
        // AR Credit Memo: Revert by decreasing inventory
        for (const oldItem of existingLineItems) {
          if (oldItem.productId && oldItem.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(
                oldItem.productId,
              );
              if (currentProduct) {
                const oldQuantity =
                  typeof oldItem.quantity === "string"
                    ? parseFloat(oldItem.quantity)
                    : oldItem.quantity;
                const newQty = currentProduct.qty - oldQuantity;
                console.log(
                  `Reverting old AR credit memo line item: Decreasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (removing ${oldQuantity})`,
                );
                await storage.updateProduct(oldItem.productId, { qty: newQty });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${oldItem.productId}:`,
                inventoryError,
              );
            }
          }
        }
      } else if (existingCreditMemo.invoiceType === "payable") {
        // AP Credit Memo: Revert by increasing inventory
        for (const oldItem of existingLineItems) {
          if (oldItem.productId && oldItem.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(
                oldItem.productId,
              );
              if (currentProduct) {
                const oldQuantity =
                  typeof oldItem.quantity === "string"
                    ? parseFloat(oldItem.quantity)
                    : oldItem.quantity;
                const newQty = currentProduct.qty + oldQuantity;
                console.log(
                  `Reverting old AP credit memo line item: Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (adding back ${oldQuantity})`,
                );
                await storage.updateProduct(oldItem.productId, { qty: newQty });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to revert inventory for product ${oldItem.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      const creditMemoValidation =
        insertCreditMemoSchema.safeParse(creditMemoData);
      if (!creditMemoValidation.success) {
        return res.status(400).json({
          message: "Invalid credit memo data",
          errors: creditMemoValidation.error.errors,
        });
      }

      // Update credit memo
      const updatedCreditMemo = await storage.updateCreditMemo(creditMemoId, {
        customerId: creditMemoData.customerId,
        creditMemoNumber: creditMemoData.creditMemoNumber,
        creditMemoDate: new Date(creditMemoData.creditMemoDate),
        subtotal: creditMemoData.subtotal,
        freight: creditMemoData.freight,
        discount: creditMemoData.discount,
        notes: creditMemoData.notes,
        total: creditMemoData.total,
        status: creditMemoData.status,
        invoiceType: creditMemoData.invoiceType,
        updatedAt: new Date(),
      });

      // Delete existing line items and create new ones
      await storage.deleteCreditMemoLineItemsByCreditMemoId(creditMemoId);

      const createdLineItems = [];
      for (const item of lineItems) {
        if (!item.productId || item.productId.trim() === "") {
          console.log("Skipping line item with empty productId:", item);
          continue;
        }

        const lineItemValidation = insertCreditMemoLineItemSchema.safeParse({
          ...item,
          creditMemoId: creditMemoId,
        });

        if (lineItemValidation.success) {
          const lineItem = await storage.createCreditMemoLineItem(
            lineItemValidation.data,
          );
          createdLineItems.push(lineItem);
        } else {
          console.error(
            "Credit memo line item validation failed:",
            lineItemValidation.error.errors,
            "for item:",
            item,
          );
        }
      }

      // Apply new inventory changes
      // Credit memos have opposite effect of invoices:
      // - AR Credit Memo (receivable): Increase inventory (returning goods from customer)
      // - AP Credit Memo (payable): Decrease inventory (returning goods to supplier)
      if (creditMemoData.invoiceType === "receivable") {
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                const quantity =
                  typeof item.quantity === "string"
                    ? parseFloat(item.quantity)
                    : item.quantity;
                const newQty = currentProduct.qty + quantity;
                console.log(
                  `Applying new AR credit memo line item: Increasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (adding ${quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to update inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      } else if (creditMemoData.invoiceType === "payable") {
        for (const item of lineItems) {
          if (item.productId && item.productId.trim() !== "") {
            try {
              const currentProduct = await storage.getProduct(item.productId);
              if (currentProduct) {
                const quantity =
                  typeof item.quantity === "string"
                    ? parseFloat(item.quantity)
                    : item.quantity;
                const newQty = currentProduct.qty - quantity;
                console.log(
                  `Applying new AP credit memo line item: Decreasing inventory for product ${currentProduct.name}: ${currentProduct.qty} → ${newQty} (removing ${quantity})`,
                );

                // Update only quantity, keep prices as manually set in inventory
                await storage.updateProduct(item.productId, {
                  qty: newQty,
                });
              }
            } catch (inventoryError) {
              console.error(
                `Failed to update inventory for product ${item.productId}:`,
                inventoryError,
              );
            }
          }
        }
      }

      res.json({ creditMemo: updatedCreditMemo, lineItems: createdLineItems });
    } catch (error) {
      console.error("Credit memo update error:", error);
      const err = error as any;
      res
        .status(500)
        .json({ message: "Failed to update credit memo", error: err.message });
    }
  });

  // Post credit memo to QuickBooks
  app.post(
    "/api/credit-memos/:id/post-to-quickbooks",
    isAuthenticated,
    async (req, res) => {
      try {
        const creditMemo = await storage.getCreditMemo(req.params.id);
        if (!creditMemo) {
          return res.status(404).json({ message: "Credit memo not found" });
        }

        console.log("Credit memo retrieved:", {
          id: creditMemo.id,
          creditMemoNumber: creditMemo.creditMemoNumber,
          creditMemoDate: creditMemo.creditMemoDate,
          invoiceType: (creditMemo as any).invoiceType,
          customerId: creditMemo.customerId,
        });

        // Get system-wide QuickBooks config
        const qbConfig = await storage.getSystemSetting("quickbooks_config");
        if (!qbConfig || !qbConfig.accessToken || !qbConfig.companyId) {
          return res.status(400).json({ message: "QuickBooks not connected" });
        }

        // Ensure tokens are valid and refresh if needed
        const validQbConfig = await ensureValidTokens();

        // Get line items
        const lineItems = await storage.getCreditMemoLineItems(creditMemo.id);
        console.log("Line items retrieved:", lineItems.length);

        // Sync all products first - fail fast if any product sync fails
        const failedProducts: string[] = [];
        for (const item of lineItems) {
          if (!item.productId) continue;
          const product = await storage.getProduct(item.productId);
          if (product && !product.quickbooksItemId) {
            try {
              // Try to find existing item by SKU (item code) first
              let existingItem = null;
              if (product.itemCode) {
                existingItem = await quickBooksService.findItemBySKU(
                  validQbConfig.accessToken,
                  validQbConfig.companyId,
                  product.itemCode,
                );
              }

              // If not found by SKU, try by name
              if (!existingItem) {
                existingItem = await quickBooksService.findItemByName(
                  validQbConfig.accessToken,
                  validQbConfig.companyId,
                  product.name,
                );
              }

              if (existingItem) {
                // Update local product with existing QB item ID
                await storage.updateProduct(product.id, {
                  quickbooksItemId: existingItem.Id,
                });
              } else {
                // Create new item - use inventory type with SKU if item code exists
                const qbItemData: any = {
                  Name: product.name,
                  Type: product.itemCode ? "Inventory" : "Service",
                };

                // Add SKU if item code exists
                if (product.itemCode) {
                  qbItemData.Sku = product.itemCode;
                  // For inventory items, we need to specify income and expense accounts
                  qbItemData.IncomeAccountRef = { value: "79" }; // Sales of Product Income
                  qbItemData.ExpenseAccountRef = { value: "80" }; // Cost of Goods Sold
                  qbItemData.AssetAccountRef = { value: "81" }; // Inventory Asset
                  qbItemData.TrackQtyOnHand = true;
                  qbItemData.QtyOnHand = 0;
                  qbItemData.InvStartDate = new Date()
                    .toISOString()
                    .split("T")[0];
                }

                const qbItem = await quickBooksService.createItem(
                  validQbConfig.accessToken,
                  validQbConfig.companyId,
                  qbItemData,
                );

                // Update local product with QB item ID
                await storage.updateProduct(product.id, {
                  quickbooksItemId: qbItem.Id,
                });
              }
            } catch (itemError: any) {
              console.error(
                `Failed to sync product ${product.name}:`,
                itemError,
              );
              failedProducts.push(product.name);
            }
          }
        }

        // If any products failed to sync, return error immediately
        if (failedProducts.length > 0) {
          return res.status(500).json({
            message: `Failed to sync ${
              failedProducts.length
            } product(s) to QuickBooks. Please sync these products first: ${failedProducts.join(
              ", ",
            )}`,
            failedProducts,
          });
        }

        // Check credit memo type
        const creditMemoType = (creditMemo as any).invoiceType || "receivable";

        if (creditMemoType === "receivable") {
          // Handle AR credit memo
          const customer = await storage.getCustomer(creditMemo.customerId!);
          if (!customer) {
            return res.status(400).json({ message: "Customer not found" });
          }

          // Find or create customer
          const qbCustomer = await findOrCreateCustomer(
            validQbConfig,
            customer.name,
            customer.id,
            storage,
          );

          // Build credit memo line items (exclude 0-quantity scheme placeholders)
          const qbLineItems = [];
          for (const item of lineItems) {
            if (!item.productId) continue;
            if (parseFloat(String(item.quantity)) <= 0) continue;
            const product = await storage.getProduct(item.productId);
            if (product && product.quickbooksItemId) {
              qbLineItems.push({
                Amount: parseFloat(String(item.lineTotal)),
                DetailType: "SalesItemLineDetail",
                SalesItemLineDetail: {
                  ItemRef: {
                    value: product.quickbooksItemId,
                    name: product.name,
                  },
                  UnitPrice: parseFloat(String(item.unitPrice)),
                  Qty: parseFloat(String(item.quantity)),
                },
              });
            }
          }

          // Validate that we have at least one line item
          if (qbLineItems.length === 0) {
            return res.status(400).json({
              message:
                "No valid line items found. Please ensure all products are synced to QuickBooks.",
            });
          }

          // Ensure creditMemoDate is a Date object
          let creditMemoDate: Date;
          if (creditMemo.creditMemoDate instanceof Date) {
            creditMemoDate = creditMemo.creditMemoDate;
          } else if (typeof creditMemo.creditMemoDate === "string") {
            creditMemoDate = new Date(creditMemo.creditMemoDate);
          } else {
            throw new Error("Credit memo date is invalid or missing");
          }

          const creditMemoData = {
            CustomerRef: { value: qbCustomer.Id, name: qbCustomer.DisplayName },
            TxnDate: creditMemoDate.toISOString().split("T")[0],
            DocNumber: creditMemo.creditMemoNumber,
            PrivateNote: `Credit Memo from InvoiceFlow`,
            Line: qbLineItems,
          };

          console.log(
            "Credit memo data to post:",
            JSON.stringify(creditMemoData, null, 2),
          );

          const qbCreditMemo = await quickBooksService.createCreditMemo(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            creditMemoData,
          );

          // Update local credit memo with QB credit memo ID (and mark as sent if it was draft)
          const creditMemoUpdates: Record<string, any> = {
            quickbooksCreditMemoId: qbCreditMemo.Id,
          };
          if ((creditMemo as any).status === "draft") {
            creditMemoUpdates.status = "sent";
          }
          await storage.updateCreditMemo(creditMemo.id, creditMemoUpdates);

          return res.json({
            success: true,
            message: "AR Credit Memo posted to QuickBooks",
            docNumber: qbCreditMemo.DocNumber,
            quickbooksId: qbCreditMemo.Id,
          });
        } else if (creditMemoType === "payable") {
          // Handle AP vendor credit
          const vendor = await storage.getCustomer(creditMemo.customerId!);
          if (!vendor) {
            return res.status(400).json({ message: "Vendor not found" });
          }

          // Find or create vendor
          const qbVendor = await findOrCreateVendor(
            validQbConfig,
            vendor.name,
            vendor.id,
            storage,
          );

          // Build vendor credit line items (exclude 0-quantity scheme placeholders)
          const qbLineItems = [];
          for (const item of lineItems) {
            if (!item.productId) continue;
            if (parseFloat(String(item.quantity)) <= 0) continue;
            const product = await storage.getProduct(item.productId);
            if (product && product.quickbooksItemId) {
              qbLineItems.push({
                Amount: parseFloat(String(item.lineTotal)),
                DetailType: "ItemBasedExpenseLineDetail",
                ItemBasedExpenseLineDetail: {
                  ItemRef: {
                    value: product.quickbooksItemId,
                    name: product.name,
                  },
                  UnitPrice: parseFloat(String(item.unitPrice)),
                  Qty: parseFloat(String(item.quantity)),
                },
              });
            }
          }

          // Validate that we have at least one line item
          if (qbLineItems.length === 0) {
            return res.status(400).json({
              message: "No line items found in this credit memo.",
            });
          }

          // Ensure creditMemoDate is a Date object
          let creditMemoDate: Date;
          if (creditMemo.creditMemoDate instanceof Date) {
            creditMemoDate = creditMemo.creditMemoDate;
          } else if (typeof creditMemo.creditMemoDate === "string") {
            creditMemoDate = new Date(creditMemo.creditMemoDate);
          } else {
            throw new Error("Credit memo date is invalid or missing");
          }

          const vendorCreditData = {
            VendorRef: { value: qbVendor.Id, name: qbVendor.DisplayName },
            TxnDate: creditMemoDate.toISOString().split("T")[0],
            DocNumber: creditMemo.creditMemoNumber,
            PrivateNote: `Vendor Credit from InvoiceFlow`,
            Line: qbLineItems,
          };

          console.log(
            "Vendor credit data to post:",
            JSON.stringify(vendorCreditData, null, 2),
          );

          const qbVendorCredit = await quickBooksService.createVendorCredit(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            vendorCreditData,
          );

          // Update local credit memo with QB vendor credit ID (and mark as sent if it was draft)
          const vendorCreditUpdates: Record<string, any> = {
            quickbooksCreditMemoId: qbVendorCredit.Id,
          };
          if ((creditMemo as any).status === "draft") {
            vendorCreditUpdates.status = "sent";
          }
          await storage.updateCreditMemo(creditMemo.id, vendorCreditUpdates);

          return res.json({
            success: true,
            message: "AP Vendor Credit posted to QuickBooks",
            docNumber: qbVendorCredit.DocNumber,
            quickbooksId: qbVendorCredit.Id,
          });
        } else {
          return res.status(400).json({
            message:
              "Invalid credit memo type. Must be 'receivable' or 'payable'",
          });
        }
      } catch (error: unknown) {
        const err = error as any;
        console.error(
          "QuickBooks credit memo post error:",
          err.response?.data || err.message,
        );
        console.error(
          "Full error details:",
          JSON.stringify(err.response?.data, null, 2),
        );

        // Extract detailed error information
        let errorMessage = "Failed to post credit memo to QuickBooks";
        let fullErrorDetails = null;

        if (err.response?.data?.Fault?.Error?.[0]) {
          const qbError = err.response.data.Fault.Error[0];
          errorMessage = qbError.Detail || qbError.Message || errorMessage;
          fullErrorDetails = {
            code: qbError.code,
            detail: qbError.Detail,
            message: qbError.Message,
          };
        } else if (err.message) {
          errorMessage = err.message;
        }

        res.status(500).json({
          message: errorMessage,
          errorDetails: fullErrorDetails,
          error: err.response?.data || err.message,
        });
      }
    },
  );

  app.post(
    "/api/customers/:id/sync-quickbooks",
    isAuthenticated,
    async (req, res) => {
      try {
        const customer = await storage.getCustomer(req.params.id);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        // Get system-wide QuickBooks config
        const qbConfig = await storage.getSystemSetting("quickbooks_config");
        if (!qbConfig || !qbConfig.accessToken || !qbConfig.companyId) {
          return res.status(400).json({ message: "QuickBooks not connected" });
        }

        // Ensure tokens are valid and refresh if needed
        const validQbConfig = await ensureValidTokens();

        // Step 1: Try to find existing customer by DisplayName
        console.log(`Attempting to sync customer: "${customer.name}"`);

        let qbCustomer;
        try {
          qbCustomer = await quickBooksService.findCustomerByDisplayName(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            customer.name,
          );

          if (qbCustomer) {
            console.log(`Found existing customer in QuickBooks:`, {
              Id: qbCustomer.Id,
              DisplayName: qbCustomer.DisplayName,
              Name: qbCustomer.Name,
            });
          }
        } catch (lookupError: any) {
          console.error(
            "Customer lookup failed:",
            lookupError.response?.data || lookupError.message,
          );
          console.error(
            "Lookup error details:",
            JSON.stringify(lookupError.response?.data, null, 2),
          );
          // Continue to creation if lookup fails
          qbCustomer = null;
        }

        // Step 2: If customer doesn't exist, create it
        if (!qbCustomer) {
          console.log(
            `Customer "${customer.name}" not found in QuickBooks. Creating new customer...`,
          );

          const qbCustomerData = {
            DisplayName: customer.name,
          };

          try {
            qbCustomer = await quickBooksService.createCustomer(
              validQbConfig.accessToken,
              validQbConfig.companyId,
              qbCustomerData,
            );

            console.log(`Successfully created new customer in QuickBooks:`, {
              Id: qbCustomer.Id,
              DisplayName: qbCustomer.DisplayName,
              Name: qbCustomer.Name,
            });
          } catch (createError: any) {
            console.error(
              "Customer creation failed:",
              createError.response?.data || createError.message,
            );
            console.error(
              "Creation error details:",
              JSON.stringify(createError.response?.data, null, 2),
            );
            const errorMessage =
              createError.response?.data?.Fault?.Error?.[0]?.Detail ||
              createError.response?.data?.Fault?.Error?.[0]?.code ||
              "Failed to create customer in QuickBooks";
            return res
              .status(500)
              .json({ message: errorMessage, action: "create" });
          }
        }

        // Step 3: Update local customer record with QuickBooks ID
        await storage.updateCustomer(customer.id, {
          quickbooksCustomerId: qbCustomer.Id,
        });

        res.json({
          success: true,
          quickbooksCustomerId: qbCustomer.Id,
          action: qbCustomer.Name === customer.name ? "found" : "created",
          displayName: qbCustomer.DisplayName,
        });
      } catch (error: unknown) {
        const err = error as any;
        console.error(
          "QuickBooks customer sync error:",
          err.response?.data || err.message,
        );
        console.error(
          "Full error details:",
          JSON.stringify(err.response?.data, null, 2),
        );
        const errorMessage =
          err.response?.data?.Fault?.Error?.[0]?.Detail ||
          err.response?.data?.Fault?.Error?.[0]?.code ||
          "Failed to sync customer with QuickBooks";
        res.status(500).json({ message: errorMessage });
      }
    },
  );

  app.post(
    "/api/products/:id/sync-quickbooks",
    isAuthenticated,
    async (req, res) => {
      try {
        const product = await storage.getProduct(req.params.id);
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Get system-wide QuickBooks config
        const qbConfig = await storage.getSystemSetting("quickbooks_config");
        if (!qbConfig || !qbConfig.accessToken || !qbConfig.companyId) {
          return res.status(400).json({ message: "QuickBooks not connected" });
        }

        // Ensure tokens are valid and refresh if needed
        const validQbConfig = await ensureValidTokens();

        // Try to find existing item by SKU (item code) first
        let existingItem = null;
        if (product.itemCode) {
          existingItem = await quickBooksService.findItemBySKU(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            product.itemCode,
          );
        }

        // If not found by SKU, try by name
        if (!existingItem) {
          existingItem = await quickBooksService.findItemByName(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            product.name,
          );
        }

        let qbItem;
        if (existingItem) {
          // Use existing item
          qbItem = existingItem;
        } else {
          // Create new item - use inventory type with SKU if item code exists
          const qbItemData: any = {
            Name: product.name,
            Type: product.itemCode ? "Inventory" : "Service",
          };

          // Add SKU if item code exists
          if (product.itemCode) {
            qbItemData.Sku = product.itemCode;
            // For inventory items, we need to specify income and expense accounts
            qbItemData.IncomeAccountRef = { value: "79" }; // Sales of Product Income
            qbItemData.ExpenseAccountRef = { value: "80" }; // Cost of Goods Sold
            qbItemData.AssetAccountRef = { value: "81" }; // Inventory Asset
            qbItemData.TrackQtyOnHand = true;
            qbItemData.QtyOnHand = 0;
            qbItemData.InvStartDate = new Date().toISOString().split("T")[0];
          }

          qbItem = await quickBooksService.createItem(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            qbItemData,
          );
        }

        // Update product with QuickBooks ID
        await storage.updateProduct(product.id, {
          quickbooksItemId: qbItem.Id,
        });

        res.json({
          success: true,
          quickbooksItemId: qbItem.Id,
          action: existingItem ? "found" : "created",
          itemType: qbItem.Type,
        });
      } catch (error: unknown) {
        const err = error as any;
        console.error(
          "QuickBooks product sync error:",
          err.response?.data || err.message,
        );
        const errorMessage =
          err.response?.data?.Fault?.Error?.[0]?.Detail ||
          "Failed to sync product with QuickBooks";
        res.status(500).json({ message: errorMessage });
      }
    },
  );

  // Helper function to ensure valid QuickBooks tokens (system-wide)
  async function ensureValidTokens() {
    const qbConfig = await storage.getSystemSetting("quickbooks_config");

    if (!qbConfig || !qbConfig.refreshToken) {
      throw new Error(
        "No refresh token available. Please reconnect to QuickBooks.",
      );
    }

    // Check if token is expired (expires in 1 hour, refresh if less than 5 minutes left)
    const tokenExpiry = qbConfig.tokenExpiry
      ? new Date(qbConfig.tokenExpiry)
      : new Date(0);
    const now = new Date();
    const timeUntilExpiry = tokenExpiry.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (timeUntilExpiry < fiveMinutes) {
      console.log("QuickBooks token expired or expiring soon, refreshing...");
      try {
        const refreshedTokens = await quickBooksService.refreshAccessToken(
          qbConfig.refreshToken,
        );

        // Update system settings with new tokens
        const expiryTime = new Date(now.getTime() + 3600 * 1000); // 1 hour from now
        const updatedConfig = {
          ...qbConfig,
          accessToken: refreshedTokens.accessToken,
          refreshToken: refreshedTokens.refreshToken,
          tokenExpiry: expiryTime,
        };
        await storage.setSystemSetting("quickbooks_config", updatedConfig);

        console.log("QuickBooks tokens refreshed successfully");
        return updatedConfig;
      } catch (tokenError) {
        console.error("Failed to refresh QuickBooks tokens:", tokenError);
        throw new Error(
          "QuickBooks token refresh failed. Please reconnect to QuickBooks.",
        );
      }
    }

    return qbConfig;
  }

  // Post invoice/bill to QuickBooks
  app.post(
    "/api/invoices/:id/post-to-quickbooks",
    isAuthenticated,
    async (req, res) => {
      try {
        const invoice = await storage.getInvoice(req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        // Get system-wide QuickBooks config
        const qbConfig = await storage.getSystemSetting("quickbooks_config");
        if (!qbConfig || !qbConfig.accessToken || !qbConfig.companyId) {
          return res.status(400).json({ message: "QuickBooks not connected" });
        }

        // Ensure tokens are valid and refresh if needed
        const validQbConfig = await ensureValidTokens();

        // Get line items
        const lineItems = await storage.getInvoiceLineItems(invoice.id);

        // Sync all products first - fail fast if any product sync fails
        const failedProducts: string[] = [];
        for (const item of lineItems) {
          if (!item.productId) continue;
          const product = await storage.getProduct(item.productId);
          if (product && !product.quickbooksItemId) {
            try {
              // Try to find existing item by SKU (item code) first
              let existingItem = null;
              if (product.itemCode) {
                existingItem = await quickBooksService.findItemBySKU(
                  validQbConfig.accessToken,
                  validQbConfig.companyId,
                  product.itemCode,
                );
              }

              // If not found by SKU, try by name
              if (!existingItem) {
                existingItem = await quickBooksService.findItemByName(
                  validQbConfig.accessToken,
                  validQbConfig.companyId,
                  product.name,
                );
              }

              if (existingItem) {
                // Update local product with existing QB item ID
                await storage.updateProduct(product.id, {
                  quickbooksItemId: existingItem.Id,
                });
              } else {
                // Create new item - use inventory type with SKU if item code exists
                const qbItemData: any = {
                  Name: product.name,
                  Type: product.itemCode ? "Inventory" : "Service",
                };

                // Add SKU if item code exists
                if (product.itemCode) {
                  qbItemData.Sku = product.itemCode;
                  // For inventory items, we need to specify income and expense accounts
                  qbItemData.IncomeAccountRef = { value: "79" }; // Sales of Product Income
                  qbItemData.ExpenseAccountRef = { value: "80" }; // Cost of Goods Sold
                  qbItemData.AssetAccountRef = { value: "81" }; // Inventory Asset
                  qbItemData.TrackQtyOnHand = true;
                  qbItemData.QtyOnHand = 0;
                  qbItemData.InvStartDate = new Date()
                    .toISOString()
                    .split("T")[0];
                }

                const qbItem = await quickBooksService.createItem(
                  validQbConfig.accessToken,
                  validQbConfig.companyId,
                  qbItemData,
                );

                // Update local product with QB item ID
                await storage.updateProduct(product.id, {
                  quickbooksItemId: qbItem.Id,
                });
              }
            } catch (itemError: any) {
              console.error(
                `Failed to sync product ${product.name}:`,
                itemError,
              );
              failedProducts.push(product.name);
            }
          }
        }

        // If any products failed to sync, return error immediately
        if (failedProducts.length > 0) {
          return res.status(500).json({
            message: `Failed to sync ${
              failedProducts.length
            } product(s) to QuickBooks. Please sync these products first: ${failedProducts.join(
              ", ",
            )}`,
            failedProducts,
          });
        }

        // Check invoice type
        const invoiceType = (invoice as any).invoiceType || "receivable";

        if (invoiceType === "receivable") {
          // Handle AR invoice
          const customer = await storage.getCustomer(invoice.customerId!);
          if (!customer) {
            return res.status(400).json({ message: "Customer not found" });
          }

          // Find or create customer
          const qbCustomer = await findOrCreateCustomer(
            validQbConfig,
            customer.name,
            customer.id,
            storage,
          );

          // Build invoice line items (exclude 0-quantity scheme placeholders)
          const qbLineItems = [];
          for (const item of lineItems) {
            if (!item.productId) continue;
            if (parseFloat(String(item.quantity)) <= 0) continue;
            const product = await storage.getProduct(item.productId);
            if (product && product.quickbooksItemId) {
              qbLineItems.push({
                Amount: parseFloat(item.lineTotal),
                DetailType: "SalesItemLineDetail",
                SalesItemLineDetail: {
                  ItemRef: {
                    value: product.quickbooksItemId,
                    name: product.name,
                  },
                  UnitPrice: parseFloat(item.unitPrice),
                  Qty: parseFloat(String(item.quantity)),
                },
              });
            }
          }

          // Validate that we have at least one line item
          if (qbLineItems.length === 0) {
            return res.status(400).json({
              message:
                "No valid line items found. Please ensure all products are synced to QuickBooks.",
            });
          }

          const invoiceData = {
            CustomerRef: { value: qbCustomer.Id, name: qbCustomer.DisplayName },
            TxnDate: invoice.invoiceDate.toISOString().split("T")[0],
            DocNumber: invoice.invoiceNumber,
            PrivateNote: `Invoice from InvoiceFlow`,
            Line: qbLineItems,
          };

          const qbInvoice = await quickBooksService.createInvoice(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            invoiceData,
          );

          // Update local invoice with QB invoice ID (and mark as sent if it was draft)
          const invoiceUpdates: Record<string, any> = {
            quickbooksInvoiceId: qbInvoice.Id,
          };
          if ((invoice as any).status === "draft") {
            invoiceUpdates.status = "sent";
          }
          await storage.updateInvoice(invoice.id, invoiceUpdates);

          return res.json({
            success: true,
            message: "AR Invoice posted to QuickBooks",
            docNumber: qbInvoice.DocNumber,
            quickbooksId: qbInvoice.Id,
          });
        } else if (invoiceType === "payable") {
          // Handle AP bill
          const vendor = await storage.getCustomer(invoice.customerId!);
          if (!vendor) {
            return res.status(400).json({ message: "Vendor not found" });
          }

          // Find or create vendor
          const qbVendor = await findOrCreateVendor(
            validQbConfig,
            vendor.name,
            vendor.id,
            storage,
          );

          // Build bill line items with item references (exclude 0-quantity scheme placeholders)
          const qbLineItems = [];
          for (const item of lineItems) {
            if (!item.productId) continue;
            if (parseFloat(String(item.quantity)) <= 0) continue;
            const product = await storage.getProduct(item.productId);
            if (product && product.quickbooksItemId) {
              qbLineItems.push({
                Amount: parseFloat(item.lineTotal),
                DetailType: "ItemBasedExpenseLineDetail",
                ItemBasedExpenseLineDetail: {
                  ItemRef: {
                    value: product.quickbooksItemId,
                    name: product.name,
                  },
                  UnitPrice: parseFloat(item.unitPrice),
                  Qty: parseFloat(String(item.quantity)),
                },
              });
            }
          }

          // Validate that we have at least one line item
          if (qbLineItems.length === 0) {
            return res.status(400).json({
              message: "No line items found in this invoice.",
            });
          }

          const billData = {
            VendorRef: { value: qbVendor.Id, name: qbVendor.DisplayName },
            TxnDate: invoice.invoiceDate.toISOString().split("T")[0],
            DocNumber: invoice.invoiceNumber,
            PrivateNote: `Bill from InvoiceFlow`,
            Line: qbLineItems,
          };

          const qbBill = await quickBooksService.createBill(
            validQbConfig.accessToken,
            validQbConfig.companyId,
            billData,
          );

          // Update local invoice with QB bill ID (and mark as sent if it was draft)
          const billUpdates: Record<string, any> = {
            quickbooksInvoiceId: qbBill.Id,
          };
          if ((invoice as any).status === "draft") {
            billUpdates.status = "sent";
          }
          await storage.updateInvoice(invoice.id, billUpdates);

          return res.json({
            success: true,
            message: "AP Bill posted to QuickBooks",
            docNumber: qbBill.DocNumber,
            quickbooksId: qbBill.Id,
          });
        } else {
          return res.status(400).json({
            message: "Invalid invoice type",
          });
        }
      } catch (error: any) {
        console.error("Invoice post error:", error);

        // Extract QuickBooks error details if available
        const qbError = error.response?.data?.Fault?.Error?.[0];
        const errorMessage =
          qbError?.Detail ||
          qbError?.Message ||
          error.message ||
          "Failed to post invoice to QuickBooks";

        return res.status(500).json({
          message: errorMessage,
          errorDetails: qbError
            ? {
                code: qbError.code,
                detail: qbError.Detail,
                element: qbError.element,
              }
            : null,
        });
      }
    },
  );

  // Helper function to find or create customer
  async function findOrCreateCustomer(
    qbConfig: any,
    customerName: string,
    customerId: string,
    storage: any,
  ) {
    // Trim customer name to avoid leading/trailing space issues
    const trimmedName = customerName.trim();

    let qbCustomer;
    try {
      qbCustomer = await quickBooksService.findCustomerByDisplayName(
        qbConfig.accessToken,
        qbConfig.companyId,
        trimmedName,
      );

      if (qbCustomer) {
        console.log(`Found existing customer in QuickBooks:`, {
          Id: qbCustomer.Id,
          DisplayName: qbCustomer.DisplayName,
        });
        return qbCustomer;
      }
    } catch (lookupError: any) {
      console.error(
        "Customer lookup failed:",
        lookupError.response?.data || lookupError.message,
      );
    }

    // Create customer if not found
    console.log(`Creating customer "${trimmedName}" in QuickBooks...`);
    const qbCustomerData = {
      DisplayName: trimmedName,
    };

    qbCustomer = await quickBooksService.createCustomer(
      qbConfig.accessToken,
      qbConfig.companyId,
      qbCustomerData,
    );

    // Update local customer record with QuickBooks ID
    await storage.updateCustomer(customerId, {
      quickbooksCustomerId: qbCustomer.Id,
    });

    return qbCustomer;
  }

  async function findOrCreateVendor(
    qbConfig: any,
    vendorName: string,
    customerId: string,
    storage: any,
  ) {
    // Trim vendor name to avoid leading/trailing space issues
    const trimmedName = vendorName.trim();

    let qbVendor;
    try {
      qbVendor = await quickBooksService.findVendorByDisplayName(
        qbConfig.accessToken,
        qbConfig.companyId,
        trimmedName,
      );

      if (qbVendor) {
        console.log(`Found existing vendor in QuickBooks:`, {
          Id: qbVendor.Id,
          DisplayName: qbVendor.DisplayName,
        });
        return qbVendor;
      }
    } catch (lookupError: any) {
      console.error(
        "Vendor lookup failed:",
        lookupError.response?.data || lookupError.message,
      );
    }

    // Create vendor if not found
    console.log(`Creating vendor "${trimmedName}" in QuickBooks...`);
    const qbVendorData = {
      DisplayName: trimmedName,
    };

    qbVendor = await quickBooksService.createVendor(
      qbConfig.accessToken,
      qbConfig.companyId,
      qbVendorData,
    );

    // Update local customer record with QuickBooks Vendor ID (for AP invoices, customer record holds vendor info)
    await storage.updateCustomer(customerId, {
      quickbooksCustomerId: qbVendor.Id, // Store vendor ID in same field for AP invoices
    });

    return qbVendor;
  }

  // Debug endpoint to list QuickBooks accounts
  app.get("/api/quickbooks/accounts", isAuthenticated, async (req, res) => {
    try {
      // Get system-wide QuickBooks config
      const qbConfig = await storage.getSystemSetting("quickbooks_config");
      if (!qbConfig || !qbConfig.accessToken || !qbConfig.companyId) {
        return res.status(400).json({ message: "QuickBooks not connected" });
      }

      // Ensure tokens are valid and refresh if needed
      const validQbConfig = await ensureValidTokens();

      const accounts = await quickBooksService.getAccounts(
        validQbConfig.accessToken,
        validQbConfig.companyId,
      );

      // Format accounts for easy reading
      const formattedAccounts = accounts.map((acc: any) => ({
        id: acc.Id,
        name: acc.Name,
        type: acc.AccountType,
        subType: acc.AccountSubType || "N/A",
        active: acc.Active,
      }));

      res.json({
        totalAccounts: formattedAccounts.length,
        accounts: formattedAccounts,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error fetching QuickBooks accounts:", error);
      res.status(500).json({ message: "Failed to fetch QuickBooks accounts" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      // Use authenticated user ID from JWT token (global data visibility)
      const userId = (req as any).user?.userId;

      // Fetch all global data (storage methods now return all data)
      const invoices = await storage.getInvoices(userId);
      const products = await storage.getProducts(userId);
      const schemes = await storage.getProductSchemes(userId);

      // Calculate total revenue from AR (receivable) invoices only
      const receivableInvoices = invoices.filter(
        (invoice) => invoice.invoiceType === "receivable",
      );
      const totalRevenue = receivableInvoices.reduce(
        (sum, invoice) => sum + parseFloat(invoice.total),
        0,
      );
      console.log(
        `[STATS] AR Invoices: ${
          receivableInvoices.length
        }, Total Revenue: $${totalRevenue.toFixed(2)}`,
      );

      // Calculate total purchase from AP (payable) invoices only
      const payableInvoices = invoices.filter(
        (invoice) => invoice.invoiceType === "payable",
      );
      const totalPurchase = payableInvoices.reduce(
        (sum, invoice) => sum + parseFloat(invoice.total),
        0,
      );
      console.log(
        `[STATS] AP Invoices: ${
          payableInvoices.length
        }, Total Purchase: $${totalPurchase.toFixed(2)}`,
      );

      // Count active invoices (sent or draft status)
      const activeInvoices = invoices.filter(
        (invoice) => invoice.status === "sent" || invoice.status === "draft",
      ).length;

      // Count products in stock using product.qty field
      let totalStock = 0;
      let lowStockCount = 0;

      for (const product of products) {
        const qty = product.qty || 0;
        totalStock += qty;
        // Count as low stock if quantity is 10 or less
        if (qty <= 10 && qty > 0) {
          lowStockCount++;
        }
      }

      // Count active schemes
      const activeSchemes = schemes.filter((scheme) => scheme.isActive).length;

      res.json({
        totalRevenue: totalRevenue.toFixed(2),
        totalPurchase: totalPurchase.toFixed(2),
        activeInvoices,
        productsInStock: totalStock,
        lowStockCount,
        activeSchemes,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Migration endpoint: Recalculate all inventory quantities from invoices
  app.post(
    "/api/migrate/recalculate-inventory",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;

        console.log(
          "Starting optimized inventory recalculation from invoices...",
        );

        // Get all products
        const allProducts = await storage.getProducts(userId);
        console.log(`Found ${allProducts.length} products to recalculate`);

        // Get all invoices
        const allInvoices = await storage.getInvoices(userId);
        console.log(`Found ${allInvoices.length} invoices to process`);

        // Fetch ALL line items at once and build a map
        console.log("Fetching all line items...");
        const productQuantityMap = new Map<string, number>();

        for (const invoice of allInvoices) {
          const lineItems = await storage.getInvoiceLineItems(invoice.id);

          for (const item of lineItems) {
            if (item.productId && item.productId.trim() !== "") {
              const currentQty = productQuantityMap.get(item.productId) || 0;

              // AP (payable) invoices add to inventory
              // AR (receivable) invoices subtract from inventory
              if (invoice.invoiceType === "payable") {
                productQuantityMap.set(
                  item.productId,
                  currentQty + item.quantity,
                );
              } else if (invoice.invoiceType === "receivable") {
                productQuantityMap.set(
                  item.productId,
                  currentQty - item.quantity,
                );
              }
            }
          }
        }

        console.log(
          `Calculated quantities for ${productQuantityMap.size} products`,
        );

        // Update all products
        let updatedProductsCount = 0;

        for (const product of allProducts) {
          const calculatedQty = productQuantityMap.get(product.id) || 0;
          const finalQty = calculatedQty < 0 ? 0 : calculatedQty; // Don't allow negative

          if (product.qty !== finalQty) {
            console.log(
              `Updating ${product.name}: ${product.qty} → ${finalQty}`,
            );

            await storage.updateProduct(product.id, {
              qty: finalQty,
            });

            updatedProductsCount++;
          }
        }

        console.log(
          `Recalculation complete: Updated ${updatedProductsCount} products`,
        );

        res.json({
          success: true,
          message: `Successfully recalculated inventory for ${updatedProductsCount} products`,
          updatedCount: updatedProductsCount,
          totalProducts: allProducts.length,
        });
      } catch (error) {
        console.error("Inventory recalculation error:", error);
        const err = error as any;
        res.status(500).json({
          message: "Failed to recalculate inventory",
          error: err.message,
        });
      }
    },
  );

  // Migration endpoint: Update Sales Price from existing AR invoices
  app.post(
    "/api/migrate/sales-price-from-ar-invoices",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;

        console.log(
          "Starting Sales Price migration from existing AR invoices...",
        );

        // Get all AR invoices
        const allInvoices = await storage.getInvoices(userId);
        const arInvoices = allInvoices.filter(
          (invoice) => invoice.invoiceType === "receivable",
        );

        console.log(`Found ${arInvoices.length} AR invoices to process`);

        let updatedProductsCount = 0;
        const productUpdates = new Map<
          string,
          { productId: string; salesPrice: string; productName: string }
        >();

        // Process each AR invoice
        for (const invoice of arInvoices) {
          const lineItems = await storage.getInvoiceLineItems(invoice.id);

          for (const item of lineItems) {
            if (item.productId && item.productId.trim() !== "") {
              const product = await storage.getProduct(item.productId);

              if (product) {
                const newRate = parseFloat(item.unitPrice);
                const currentSalesPrice = parseFloat(product.salesPrice || "0");

                // Track the latest rate for each product (last invoice wins)
                if (newRate !== currentSalesPrice) {
                  productUpdates.set(item.productId, {
                    productId: item.productId,
                    salesPrice: item.unitPrice,
                    productName: product.name,
                  });
                }
              }
            }
          }
        }

        // Apply all updates
        for (const update of Array.from(productUpdates.values())) {
          const product = await storage.getProduct(update.productId);
          if (product) {
            const currentSalesPrice = parseFloat(product.salesPrice || "0");
            const newRate = parseFloat(update.salesPrice);

            console.log(
              `Updating Sales Price for product ${
                update.productName
              }: $${currentSalesPrice.toFixed(2)} → $${newRate.toFixed(2)}`,
            );

            await storage.updateProduct(update.productId, {
              salesPrice: update.salesPrice,
            });

            updatedProductsCount++;
          }
        }

        console.log(
          `Migration complete: Updated Sales Price for ${updatedProductsCount} products`,
        );

        res.json({
          success: true,
          message: `Successfully updated Sales Price for ${updatedProductsCount} products from existing AR invoices`,
          updatedCount: updatedProductsCount,
        });
      } catch (error) {
        console.error("Sales Price migration error:", error);
        const err = error as any;
        res.status(500).json({
          message: "Failed to migrate Sales Price",
          error: err.message,
        });
      }
    },
  );

  // ============================================
  // PROFITABILITY MODULE (Super Admin Only)
  // ============================================

  // Get all invoices with line items for profitability view
  app.get(
    "/api/profitability/invoices",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;
        const { startDate, endDate, customerId, categories, sort_by, sort_order } = req.query;
        
        // Validate sort parameters (prevent SQL injection)
        const allowedSortFields = ["invoiceNumber", "invoiceDate", "customerName", "totalAmount", "totalMargin"];
        const sortField = allowedSortFields.includes(sort_by as string) ? (sort_by as string) : "invoiceDate";
        const sortOrder = sort_order === "asc" ? "asc" : "desc";

        // Parse categories filter (comma-separated string)
        const categoryFilter: string[] = categories ? (categories as string).split(",").filter(c => c.trim()) : [];

        let invoices = await storage.getInvoices(userId);
        
        // Filter to AR invoices only (profitability applies to sales)
        invoices = invoices.filter((inv: any) => inv.invoiceType === "receivable");

        // Apply date filters
        if (startDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) >= new Date(startDate as string)
          );
        }
        if (endDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) <= new Date(endDate as string)
          );
        }
        if (customerId) {
          invoices = invoices.filter((inv: any) => inv.customerId === customerId);
        }

        // Fetch customers for lookup
        const customers = await storage.getCustomers(userId);
        const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

        // Fetch products for category lookup only (margin is read from invoice_items)
        const products = await storage.getProducts(userId);
        const productCategoryMap = new Map(products.map((p: any) => [p.id, p.category || "Uncategorized"]));

        // Fetch line items for each invoice
        const invoicesWithItems = await Promise.all(
          invoices.map(async (invoice: any) => {
            const lineItems = await storage.getInvoiceLineItems(invoice.id);
            let validLineItems = lineItems.filter((item: any) => item.quantity > 0);
            
            // Apply category filter to line items
            if (categoryFilter.length > 0) {
              validLineItems = validLineItems.filter((item: any) => {
                const itemCategory = productCategoryMap.get(item.productId) || "Uncategorized";
                return categoryFilter.includes(itemCategory);
              });
            }
            
            // Calculate totals based on filtered line items
            let totalAmount = 0;
            let totalMargin = 0;
            
            const itemsWithMargin = validLineItems.map((item: any) => {
              const qty = item.quantity || 0;
              const rate = parseFloat(item.unitPrice) || 0;
              // Free products (rate <= 0) must always have zero margin
              // IMPORTANT: Use ONLY stored invoice_items.margin_per_carton - never fallback to inventory
              let marginPerCarton = 0;
              if (rate > 0) {
                const lineItemMargin = parseFloat(item.marginPerCarton);
                marginPerCarton = (!isNaN(lineItemMargin) && lineItemMargin >= 0) ? lineItemMargin : 0;
              }
              const amount = qty * rate;
              const margin = qty * marginPerCarton;
              
              totalAmount += amount;
              totalMargin += margin;
              
              return {
                ...item,
                marginPerCarton: marginPerCarton.toString(),
                totalAmount: amount,
                totalMargin: margin,
              };
            });

            return {
              ...invoice,
              customerName: customerMap.get(invoice.customerId) || "Unknown",
              lineItems: itemsWithMargin,
              totalAmount,
              totalMargin,
              marginPercent: totalAmount > 0 ? (totalMargin / totalAmount) * 100 : 0,
            };
          })
        );
        
        // Filter out invoices with no line items after category filtering (if category filter is applied)
        const filteredInvoices = categoryFilter.length > 0 
          ? invoicesWithItems.filter((inv: any) => inv.lineItems.length > 0)
          : invoicesWithItems;

        // Apply server-side sorting
        filteredInvoices.sort((a: any, b: any) => {
          let aVal: any, bVal: any;
          switch (sortField) {
            case "invoiceNumber":
              aVal = a.invoiceNumber || "";
              bVal = b.invoiceNumber || "";
              break;
            case "invoiceDate":
              aVal = new Date(a.invoiceDate).getTime();
              bVal = new Date(b.invoiceDate).getTime();
              break;
            case "customerName":
              aVal = (a.customerName || "").toLowerCase();
              bVal = (b.customerName || "").toLowerCase();
              break;
            case "totalAmount":
              aVal = a.totalAmount || 0;
              bVal = b.totalAmount || 0;
              break;
            case "totalMargin":
              aVal = a.totalMargin || 0;
              bVal = b.totalMargin || 0;
              break;
            default:
              aVal = new Date(a.invoiceDate).getTime();
              bVal = new Date(b.invoiceDate).getTime();
          }
          if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
          if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
          return 0;
        });

        res.json(filteredInvoices);
      } catch (error) {
        console.error("Error fetching profitability data:", error);
        res.status(500).json({ message: "Failed to fetch profitability data" });
      }
    }
  );

  // Get single invoice with profit data (Super Admin only - for Profit Invoice View)
  app.get(
    "/api/profitability/invoices/:id",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;
        const { id } = req.params;

        const invoice = await storage.getInvoice(id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        // Verify invoice belongs to user
        if (invoice.userId !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Fetch customer info
        const customer = invoice.customerId ? await storage.getCustomer(invoice.customerId) : null;

        // Fetch products for additional data only (margin is read from invoice_items)
        const products = await storage.getProducts(userId);
        const productMap = new Map(products.map((p: any) => [p.id, p]));

        // Fetch line items
        const lineItems = await storage.getInvoiceLineItems(invoice.id);
        const validLineItems = lineItems.filter((item: any) => item.quantity > 0);

        let totalAmount = 0;
        let totalMargin = 0;

        const itemsWithMargin = validLineItems.map((item: any, index: number) => {
          const qty = item.quantity || 0;
          const rate = parseFloat(item.unitPrice) || 0;
          const product = productMap.get(item.productId);
          // Free products (rate <= 0) must always have zero margin
          // IMPORTANT: Use ONLY stored invoice_items.margin_per_carton - never fallback to inventory
          let marginPerCarton = 0;
          if (rate > 0) {
            const lineItemMargin = parseFloat(item.marginPerCarton);
            marginPerCarton = (!isNaN(lineItemMargin) && lineItemMargin >= 0) ? lineItemMargin : 0;
          }
          const amount = qty * rate;
          const margin = qty * marginPerCarton;

          totalAmount += amount;
          totalMargin += margin;

          return {
            srNo: index + 1,
            productCode: item.itemCode || product?.itemCode || "",
            packingSize: item.packingSize || product?.packingSize || "",
            productDescription: item.productName || product?.name || "",
            qty,
            ratePerCarton: rate,
            marginPerCarton,
            totalAmount: amount,
            totalMargin: margin,
          };
        });

        res.json({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          customerName: customer?.name || "Unknown",
          invoiceType: invoice.invoiceType,
          lineItems: itemsWithMargin,
          totalAmount,
          totalMargin,
          marginPercent: totalAmount > 0 ? (totalMargin / totalAmount) * 100 : 0,
        });
      } catch (error) {
        console.error("Error fetching profit invoice data:", error);
        res.status(500).json({ message: "Failed to fetch profit invoice data" });
      }
    }
  );

  // Update margin per carton for a line item (Super Admin only)
  app.patch(
    "/api/profitability/line-items/:id/margin",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { marginPerCarton } = req.body;
        const user = (req as any).user;

        if (marginPerCarton === undefined || marginPerCarton === null) {
          return res.status(400).json({ message: "marginPerCarton is required" });
        }

        const lineItem = await storage.getInvoiceLineItem(id);
        if (!lineItem) {
          return res.status(404).json({ message: "Line item not found" });
        }

        // ENFORCE FREE PRODUCT RULE: Free products (rate <= 0) must always have zero margin
        const rate = parseFloat(lineItem.unitPrice as any) || 0;
        const effectiveMargin = rate <= 0 ? "0" : marginPerCarton.toString();

        const updated = await storage.updateInvoiceLineItem(id, {
          marginPerCarton: effectiveMargin,
          marginUpdatedBy: user.userId,
          marginUpdatedAt: new Date(),
        });

        res.json(updated);
      } catch (error) {
        console.error("Error updating margin:", error);
        res.status(500).json({ message: "Failed to update margin" });
      }
    }
  );

  // Customer margin report
  app.get(
    "/api/profitability/reports/customer",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;
        const { startDate, endDate, customerId, productId, categories, sort_by, sort_order } = req.query;
        
        // Validate sort parameters (prevent SQL injection)
        const allowedSortFields = ["customerName", "totalCartons", "totalAmount", "totalMargin"];
        const sortField = allowedSortFields.includes(sort_by as string) ? (sort_by as string) : "customerName";
        const sortOrder = sort_order === "desc" ? "desc" : "asc"; // Default ASC for customer report

        // Parse categories filter (comma-separated string)
        const categoryFilter: string[] = categories ? (categories as string).split(",").filter(c => c.trim()) : [];

        let invoices = await storage.getInvoices(userId);
        invoices = invoices.filter((inv: any) => inv.invoiceType === "receivable");

        if (startDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) >= new Date(startDate as string)
          );
        }
        if (endDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) <= new Date(endDate as string)
          );
        }
        if (customerId) {
          invoices = invoices.filter((inv: any) => inv.customerId === customerId);
        }

        const customers = await storage.getCustomers(userId);
        const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

        // Fetch products for category lookup only (margin is read from invoice_items)
        const products = await storage.getProducts(userId);
        const productCategoryMap = new Map(products.map((p: any) => [p.id, p.category || "Uncategorized"]));

        // Aggregate by customer
        const customerData = new Map<string, {
          customerId: string;
          customerName: string;
          totalInvoices: number;
          totalCartons: number;
          totalAmount: number;
          totalMargin: number;
        }>();

        for (const invoice of invoices) {
          const lineItems = await storage.getInvoiceLineItems(invoice.id);
          
          for (const item of lineItems) {
            if (item.quantity <= 0) continue;
            if (productId && item.productId !== productId) continue;
            
            // Apply category filter
            if (categoryFilter.length > 0) {
              const itemCategory = productCategoryMap.get(item.productId) || "Uncategorized";
              if (!categoryFilter.includes(itemCategory)) continue;
            }

            const custId = invoice.customerId || "unknown";
            const existing = customerData.get(custId) || {
              customerId: custId,
              customerName: customerMap.get(custId) || "Unknown",
              totalInvoices: 0,
              totalCartons: 0,
              totalAmount: 0,
              totalMargin: 0,
            };

            // Free products (rate <= 0) must always have zero margin
            // IMPORTANT: Use ONLY stored invoice_items.margin_per_carton - never fallback to inventory
            const rate = parseFloat(item.unitPrice) || 0;
            let marginPerCarton = 0;
            if (rate > 0) {
              const lineItemMargin = parseFloat(item.marginPerCarton as any);
              marginPerCarton = (!isNaN(lineItemMargin) && lineItemMargin >= 0) ? lineItemMargin : 0;
            }

            existing.totalCartons += item.quantity;
            existing.totalAmount += item.quantity * rate;
            existing.totalMargin += item.quantity * marginPerCarton;
            
            customerData.set(custId, existing);
          }
        }

        // Count invoices per customer
        for (const invoice of invoices) {
          const custId = invoice.customerId || "unknown";
          const existing = customerData.get(custId);
          if (existing) {
            existing.totalInvoices++;
          }
        }

        const report = Array.from(customerData.values()).map(c => ({
          ...c,
          marginPercent: c.totalAmount > 0 ? (c.totalMargin / c.totalAmount) * 100 : 0,
        }));

        // Apply server-side sorting
        report.sort((a: any, b: any) => {
          let aVal: any, bVal: any;
          switch (sortField) {
            case "customerName":
              aVal = (a.customerName || "").toLowerCase();
              bVal = (b.customerName || "").toLowerCase();
              break;
            case "totalCartons":
              aVal = a.totalCartons || 0;
              bVal = b.totalCartons || 0;
              break;
            case "totalAmount":
              aVal = a.totalAmount || 0;
              bVal = b.totalAmount || 0;
              break;
            case "totalMargin":
              aVal = a.totalMargin || 0;
              bVal = b.totalMargin || 0;
              break;
            default:
              aVal = (a.customerName || "").toLowerCase();
              bVal = (b.customerName || "").toLowerCase();
          }
          if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
          if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
          return 0;
        });

        res.json(report);
      } catch (error) {
        console.error("Error generating customer margin report:", error);
        res.status(500).json({ message: "Failed to generate report" });
      }
    }
  );

  // Product margin report
  app.get(
    "/api/profitability/reports/product",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;
        const { startDate, endDate, customerId, categories, sort_by, sort_order } = req.query;

        // Validate sort parameters (prevent SQL injection)
        const allowedSortFields = ["productName", "totalQty", "totalAmount", "totalMargin"];
        const sortField = allowedSortFields.includes(sort_by as string) ? (sort_by as string) : "productName";
        const sortOrder = sort_order === "desc" ? "desc" : "asc"; // Default ASC for product report

        // Parse categories filter (comma-separated string)
        const categoryFilter: string[] = categories ? (categories as string).split(",").filter(c => c.trim()) : [];

        let invoices = await storage.getInvoices(userId);
        invoices = invoices.filter((inv: any) => inv.invoiceType === "receivable");

        if (startDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) >= new Date(startDate as string)
          );
        }
        if (endDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) <= new Date(endDate as string)
          );
        }
        if (customerId) {
          invoices = invoices.filter((inv: any) => inv.customerId === customerId);
        }

        // Fetch products for category lookup only (margin is read from invoice_items)
        const products = await storage.getProducts(userId);
        const productMap = new Map(products.map((p: any) => [p.id, p]));

        // Aggregate by product
        const productData = new Map<string, {
          productId: string;
          itemCode: string;
          productName: string;
          category: string;
          totalQty: number;
          totalAmount: number;
          totalMargin: number;
          marginSum: number;
          marginCount: number;
        }>();

        for (const invoice of invoices) {
          const lineItems = await storage.getInvoiceLineItems(invoice.id);
          
          for (const item of lineItems) {
            if (item.quantity <= 0) continue;

            const prodId = item.productId || "unknown";
            const product = productMap.get(prodId);
            const productCategory = product?.category || "Uncategorized";
            
            // Apply category filter
            if (categoryFilter.length > 0 && !categoryFilter.includes(productCategory)) {
              continue;
            }

            const existing = productData.get(prodId) || {
              productId: prodId,
              itemCode: item.productCode || product?.itemCode || "",
              productName: item.description || product?.name || "Unknown",
              category: productCategory,
              totalQty: 0,
              totalAmount: 0,
              totalMargin: 0,
              marginSum: 0,
              marginCount: 0,
            };

            // Free products (rate <= 0) must always have zero margin
            // IMPORTANT: Use ONLY stored invoice_items.margin_per_carton - never fallback to inventory
            const rate = parseFloat(item.unitPrice) || 0;
            let marginPerCarton = 0;
            if (rate > 0) {
              const lineItemMargin = parseFloat(item.marginPerCarton as any);
              marginPerCarton = (!isNaN(lineItemMargin) && lineItemMargin >= 0) ? lineItemMargin : 0;
            }
            
            existing.totalQty += item.quantity;
            existing.totalAmount += item.quantity * rate;
            existing.totalMargin += item.quantity * marginPerCarton;
            if (marginPerCarton > 0) {
              existing.marginSum += marginPerCarton;
              existing.marginCount++;
            }
            
            productData.set(prodId, existing);
          }
        }

        const report = Array.from(productData.values()).map(p => ({
          productId: p.productId,
          itemCode: p.itemCode,
          productName: p.productName,
          category: p.category,
          totalQty: p.totalQty,
          totalAmount: p.totalAmount,
          totalMargin: p.totalMargin,
          avgMarginPerCarton: p.marginCount > 0 ? p.marginSum / p.marginCount : 0,
          marginPercent: p.totalAmount > 0 ? (p.totalMargin / p.totalAmount) * 100 : 0,
        }));

        // Apply server-side sorting
        report.sort((a: any, b: any) => {
          let aVal: any, bVal: any;
          switch (sortField) {
            case "productName":
              aVal = (a.productName || "").toLowerCase();
              bVal = (b.productName || "").toLowerCase();
              break;
            case "totalQty":
              aVal = a.totalQty || 0;
              bVal = b.totalQty || 0;
              break;
            case "totalAmount":
              aVal = a.totalAmount || 0;
              bVal = b.totalAmount || 0;
              break;
            case "totalMargin":
              aVal = a.totalMargin || 0;
              bVal = b.totalMargin || 0;
              break;
            default:
              aVal = (a.productName || "").toLowerCase();
              bVal = (b.productName || "").toLowerCase();
          }
          if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
          if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
          return 0;
        });

        // Get unique categories for filter dropdown
        const categorySet = new Set(products.map((p: any) => p.category || "Uncategorized"));
        const allCategories = Array.from(categorySet).sort();

        res.json({ report, categories: allCategories });
      } catch (error) {
        console.error("Error generating product margin report:", error);
        res.status(500).json({ message: "Failed to generate report" });
      }
    }
  );

  // Profitability summary for KPI cards (with category filter support)
  app.get(
    "/api/profitability/summary",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;
        const { startDate, endDate, customerId, categories } = req.query;

        // Parse categories filter (comma-separated string)
        const categoryFilter: string[] = categories ? (categories as string).split(",").filter(c => c.trim()) : [];

        let invoices = await storage.getInvoices(userId);
        invoices = invoices.filter((inv: any) => inv.invoiceType === "receivable");

        if (startDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) >= new Date(startDate as string)
          );
        }
        if (endDate) {
          invoices = invoices.filter((inv: any) => 
            new Date(inv.invoiceDate) <= new Date(endDate as string)
          );
        }
        if (customerId) {
          invoices = invoices.filter((inv: any) => inv.customerId === customerId);
        }

        // Fetch products for category lookup only (margin is read from invoice_items)
        const products = await storage.getProducts(userId);
        const productCategoryMap = new Map(products.map((p: any) => [p.id, p.category || "Uncategorized"]));

        // Get unique categories for filter dropdown
        const categorySet = new Set(products.map((p: any) => p.category || "Uncategorized"));
        const allCategories = Array.from(categorySet).sort();

        let totalInvoices = 0;
        let totalRevenue = 0;
        let totalMargin = 0;
        const invoicesWithCategoryItems = new Set<string>();

        for (const invoice of invoices) {
          const lineItems = await storage.getInvoiceLineItems(invoice.id);
          let invoiceHasCategoryItems = false;
          
          for (const item of lineItems) {
            if (item.quantity <= 0) continue;
            
            // Apply category filter
            if (categoryFilter.length > 0) {
              const itemCategory = productCategoryMap.get(item.productId) || "Uncategorized";
              if (!categoryFilter.includes(itemCategory)) continue;
            }
            
            invoiceHasCategoryItems = true;
            const qty = item.quantity || 0;
            const rate = parseFloat(item.unitPrice) || 0;
            
            // Free products (rate <= 0) must always have zero margin
            // IMPORTANT: Use ONLY stored invoice_items.margin_per_carton - never fallback to inventory
            let marginPerCarton = 0;
            if (rate > 0) {
              const lineItemMargin = parseFloat(item.marginPerCarton as any);
              marginPerCarton = (!isNaN(lineItemMargin) && lineItemMargin >= 0) ? lineItemMargin : 0;
            }
            
            totalRevenue += qty * rate;
            totalMargin += qty * marginPerCarton;
          }
          
          if (invoiceHasCategoryItems) {
            invoicesWithCategoryItems.add(invoice.id);
          }
        }

        totalInvoices = categoryFilter.length > 0 ? invoicesWithCategoryItems.size : invoices.length;
        const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

        res.json({
          totalInvoices,
          totalRevenue,
          totalMargin,
          marginPercent,
          categories: allCategories,
        });
      } catch (error) {
        console.error("Error generating profitability summary:", error);
        res.status(500).json({ message: "Failed to generate summary" });
      }
    }
  );

  // ============================================
  // INVENTORY MARGIN MANAGEMENT (Super Admin Only)
  // ============================================

  // Get all inventory items with margin for the Add Margin modal
  app.get(
    "/api/inventory/margins",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const userId = (req as any).user?.userId;
        const { search, category } = req.query;

        let products = await storage.getProducts(userId);

        // Apply search filter
        if (search && typeof search === "string" && search.trim()) {
          const searchLower = search.toLowerCase().trim();
          products = products.filter((p: any) => 
            (p.name && p.name.toLowerCase().includes(searchLower)) ||
            (p.itemCode && p.itemCode.toLowerCase().includes(searchLower)) ||
            (p.category && p.category.toLowerCase().includes(searchLower))
          );
        }

        // Apply category filter
        if (category && typeof category === "string" && category !== "all") {
          products = products.filter((p: any) => p.category === category);
        }

        // Map to response format
        const inventoryItems = products.map((p: any) => ({
          id: p.id,
          itemCode: p.itemCode || "",
          name: p.name,
          category: p.category || "",
          packingSize: p.packingSize || "",
          salesPrice: p.salesPrice ? parseFloat(p.salesPrice) : 0,
          marginPerCarton: p.marginPerCarton ? parseFloat(p.marginPerCarton) : null,
          marginUpdatedBy: p.marginUpdatedBy,
          marginUpdatedAt: p.marginUpdatedAt,
        }));

        // Sort by product name ASC (for Add Margin modal ordering)
        inventoryItems.sort((a: any, b: any) => {
          const aName = (a.name || "").toLowerCase();
          const bName = (b.name || "").toLowerCase();
          if (aName < bName) return -1;
          if (aName > bName) return 1;
          return 0;
        });

        // Get unique categories for filter dropdown
        const categories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))).sort();

        res.json({ items: inventoryItems, categories });
      } catch (error) {
        console.error("Error fetching inventory margins:", error);
        res.status(500).json({ message: "Failed to fetch inventory margins" });
      }
    }
  );

  // Apply margin to selected inventory items (bulk update)
  app.put(
    "/api/inventory/apply-margin",
    isAuthenticated,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const user = (req as any).user;
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ message: "Items array is required" });
        }

        // Validate items format
        for (const item of items) {
          if (!item.id || item.marginPerCarton === undefined) {
            return res.status(400).json({ 
              message: "Each item must have 'id' and 'marginPerCarton'" 
            });
          }
          if (isNaN(parseFloat(item.marginPerCarton)) || parseFloat(item.marginPerCarton) < 0) {
            return res.status(400).json({ 
              message: "marginPerCarton must be a valid non-negative number" 
            });
          }
        }

        const results = {
          success: 0,
          failed: 0,
          errors: [] as string[],
        };

        for (const item of items) {
          try {
            await storage.updateProduct(item.id, {
              marginPerCarton: item.marginPerCarton.toString(),
              marginUpdatedBy: user.userId,
              marginUpdatedAt: new Date(),
            });
            results.success++;
          } catch (err: any) {
            results.failed++;
            results.errors.push(`Failed to update product ${item.id}: ${err.message}`);
          }
        }

        res.json({
          message: `Updated margin for ${results.success} items${results.failed > 0 ? `, ${results.failed} failed` : ""}`,
          ...results,
        });
      } catch (error) {
        console.error("Error applying inventory margins:", error);
        res.status(500).json({ message: "Failed to apply inventory margins" });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
