import {
  creditMemoLineItems,
  creditMemos,
  customers,
  invoiceLineItems,
  invoices,
  orders,
  orderLineItems,
  products,
  productSchemes,
  productVariants,
  systemSettings,
  users,
  type CreditMemo,
  type CreditMemoLineItem,
  type Customer,
  type InsertCreditMemo,
  type InsertCreditMemoLineItem,
  type InsertCustomer,
  type InsertInvoice,
  type InsertInvoiceLineItem,
  type InsertOrder,
  type InsertOrderLineItem,
  type InsertProduct,
  type InsertProductScheme,
  type InsertProductVariant,
  type InsertUser,
  type Invoice,
  type InvoiceLineItem,
  type Order,
  type OrderLineItem,
  type Product,
  type ProductScheme,
  type ProductVariant,
  type User,
} from "@shared/schema";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  private initialized = false;

  private async ensureInitialized() {
    if (this.initialized) return;

    try {
      // No default user - users will be created via Replit Auth on first login
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize database:", error);
    }
  }

  // Users
  async getUsers(): Promise<User[]> {
    await this.ensureInitialized();
    return await db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureInitialized();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureInitialized();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.ensureInitialized();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(
    id: string,
    updates: Partial<User>,
  ): Promise<User | undefined> {
    // Check if this is a QuickBooks disconnect request (all QB fields are null)
    const isQBDisconnect =
      updates.quickbooksAccessToken === null &&
      updates.quickbooksRefreshToken === null &&
      updates.quickbooksCompanyId === null;

    if (isQBDisconnect) {
      // Use SQL template to force NULL values for QuickBooks fields
      const [user] = await db
        .update(users)
        .set({
          quickbooksAccessToken: sql`NULL`,
          quickbooksRefreshToken: sql`NULL`,
          quickbooksCompanyId: sql`NULL`,
          quickbooksTokenExpiry: sql`NULL`,
        })
        .where(eq(users.id, id))
        .returning();
      return user;
    }

    // For normal updates, filter out null and undefined values
    const filteredUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== null && value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    // If no fields to update, return current user
    if (Object.keys(filteredUpdates).length === 0) {
      return this.getUser(id);
    }

    const [user] = await db
      .update(users)
      .set(filteredUpdates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPassword(
    id: string,
    hashedPassword: string,
  ): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Customers
  async getCustomers(userId: string): Promise<Customer[]> {
    // Return all customers globally (no user-specific filtering)
    return await db.select().from(customers);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(
    insertCustomer: InsertCustomer & { userId: string },
  ): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async updateCustomer(
    id: string,
    updates: Partial<Customer>,
  ): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await db.delete(customers).where(eq(customers.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Products
  async getProducts(userId: string): Promise<Product[]> {
    // Return all products globally (no user-specific filtering)
    return await db.select().from(products);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));
    return product;
  }

  async createProduct(
    insertProduct: InsertProduct & { userId: string },
  ): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  async updateProduct(
    id: string,
    updates: Partial<Product>,
  ): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set(updates)
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteAllProducts(userId: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.userId, userId));
    return (result.rowCount || 0) > 0;
  }

  // Product Variants
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
  }

  async getProductVariant(id: string): Promise<ProductVariant | undefined> {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, id));
    return variant;
  }

  async getVariant(id: string): Promise<ProductVariant | undefined> {
    return this.getProductVariant(id);
  }

  async createProductVariant(
    insertVariant: InsertProductVariant,
  ): Promise<ProductVariant> {
    const [variant] = await db
      .insert(productVariants)
      .values(insertVariant)
      .returning();
    return variant;
  }

  async createVariant(
    insertVariant: InsertProductVariant,
  ): Promise<ProductVariant> {
    return this.createProductVariant(insertVariant);
  }

  async updateProductVariant(
    id: string,
    updates: Partial<ProductVariant>,
  ): Promise<ProductVariant | undefined> {
    const [variant] = await db
      .update(productVariants)
      .set(updates)
      .where(eq(productVariants.id, id))
      .returning();
    return variant;
  }

  async updateVariant(
    id: string,
    updates: Partial<ProductVariant>,
  ): Promise<ProductVariant | undefined> {
    return this.updateProductVariant(id, updates);
  }

  async deleteProductVariant(id: string): Promise<boolean> {
    const result = await db
      .delete(productVariants)
      .where(eq(productVariants.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Product Schemes
  async getProductSchemes(userId: string): Promise<ProductScheme[]> {
    // Return all product schemes globally (no user-specific filtering)
    return await db.select().from(productSchemes);
  }

  async getSchemeUsageCounts(
    userId: string,
  ): Promise<{ [key: string]: number }> {
    // Count scheme usage across all invoices globally (no user-specific filtering)
    const counts = await db
      .select({
        schemeId: invoiceLineItems.schemeId,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
      .where(
        and(
          isNotNull(invoiceLineItems.schemeId),
          eq(invoiceLineItems.isFreeFromScheme, true),
        ),
      )
      .groupBy(invoiceLineItems.schemeId);

    const result: { [key: string]: number } = {};
    counts.forEach((count) => {
      if (count.schemeId) {
        result[count.schemeId] = count.count;
      }
    });
    return result;
  }

  async getProductScheme(id: string): Promise<ProductScheme | undefined> {
    const [scheme] = await db
      .select()
      .from(productSchemes)
      .where(eq(productSchemes.id, id));
    return scheme;
  }

  async getScheme(id: string): Promise<ProductScheme | undefined> {
    return this.getProductScheme(id);
  }

  async createProductScheme(
    insertScheme: InsertProductScheme & { userId: string },
  ): Promise<ProductScheme> {
    const [scheme] = await db
      .insert(productSchemes)
      .values(insertScheme)
      .returning();
    return scheme;
  }

  async createScheme(
    insertScheme: InsertProductScheme & { userId: string },
  ): Promise<ProductScheme> {
    return this.createProductScheme(insertScheme);
  }

  async updateProductScheme(
    id: string,
    updates: Partial<ProductScheme>,
  ): Promise<ProductScheme | undefined> {
    const [scheme] = await db
      .update(productSchemes)
      .set(updates)
      .where(eq(productSchemes.id, id))
      .returning();
    return scheme;
  }

  async updateScheme(
    id: string,
    updates: Partial<ProductScheme>,
  ): Promise<ProductScheme | undefined> {
    return this.updateProductScheme(id, updates);
  }

  async deleteProductScheme(id: string): Promise<boolean> {
    // First remove references to this scheme from invoice line items
    await db
      .update(invoiceLineItems)
      .set({ schemeId: null, isFreeFromScheme: false })
      .where(eq(invoiceLineItems.schemeId, id));

    // Then delete the scheme itself
    const result = await db
      .delete(productSchemes)
      .where(eq(productSchemes.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteScheme(id: string): Promise<boolean> {
    return this.deleteProductScheme(id);
  }

  // Invoices
  async getInvoices(userId: string): Promise<Invoice[]> {
    // Return all invoices globally (no user-specific filtering), sorted by invoice number
    return await db
      .select()
      .from(invoices)
      .orderBy(asc(invoices.invoiceNumber));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    if (!invoice) return undefined;

    // Include customer data in the invoice response
    let customer = null;
    if (invoice.customerId) {
      customer = await this.getCustomer(invoice.customerId);
    }

    return {
      ...invoice,
      customer: customer || null,
    } as any;
  }

  async createInvoice(
    insertInvoice: InsertInvoice & { userId: string },
  ): Promise<Invoice> {
    const [invoice] = await db
      .insert(invoices)
      .values(insertInvoice)
      .returning();
    return invoice;
  }

  async updateInvoice(
    id: string,
    updates: Partial<Invoice>,
  ): Promise<Invoice | undefined> {
    const [invoice] = await db
      .update(invoices)
      .set(updates)
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async updateInvoiceStatus(id: string, status: string): Promise<boolean> {
    const [invoice] = await db
      .update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return !!invoice;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    // First delete all line items associated with this invoice
    await this.deleteInvoiceLineItemsByInvoiceId(id);

    // Then delete the invoice itself
    const result = await db.delete(invoices).where(eq(invoices.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Invoice Line Items
  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    return await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));
  }

  async getAllInvoiceLineItems(): Promise<InvoiceLineItem[]> {
    return await db.select().from(invoiceLineItems);
  }

  async getInvoiceLineItem(id: string): Promise<InvoiceLineItem | undefined> {
    const [item] = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.id, id));
    return item;
  }

  async createInvoiceLineItem(
    insertItem: InsertInvoiceLineItem,
  ): Promise<InvoiceLineItem> {
    const [item] = await db
      .insert(invoiceLineItems)
      .values(insertItem)
      .returning();
    return item;
  }

  async createLineItem(
    insertItem: InsertInvoiceLineItem,
  ): Promise<InvoiceLineItem> {
    return this.createInvoiceLineItem(insertItem);
  }

  async updateInvoiceLineItem(
    id: string,
    updates: Partial<InvoiceLineItem>,
  ): Promise<InvoiceLineItem | undefined> {
    const [item] = await db
      .update(invoiceLineItems)
      .set(updates)
      .where(eq(invoiceLineItems.id, id))
      .returning();
    return item;
  }

  async deleteInvoiceLineItem(id: string): Promise<boolean> {
    const result = await db
      .delete(invoiceLineItems)
      .where(eq(invoiceLineItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteLineItem(id: string): Promise<boolean> {
    return this.deleteInvoiceLineItem(id);
  }

  async deleteInvoiceLineItemsByInvoiceId(invoiceId: string): Promise<boolean> {
    const result = await db
      .delete(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));
    return (result.rowCount || 0) > 0;
  }

  // Credit Memos
  async getCreditMemos(userId: string): Promise<CreditMemo[]> {
    // Return all credit memos globally (no user-specific filtering), sorted by credit memo number
    return await db
      .select()
      .from(creditMemos)
      .orderBy(asc(creditMemos.creditMemoNumber));
  }

  async getCreditMemo(id: string): Promise<CreditMemo | undefined> {
    const [creditMemo] = await db
      .select()
      .from(creditMemos)
      .where(eq(creditMemos.id, id));
    if (!creditMemo) return undefined;

    // Include customer data in the credit memo response
    let customer = null;
    if (creditMemo.customerId) {
      customer = await this.getCustomer(creditMemo.customerId);
    }

    return {
      ...creditMemo,
      customer: customer || null,
    } as any;
  }

  async createCreditMemo(
    creditMemoData: InsertCreditMemo & { userId: string },
  ): Promise<CreditMemo> {
    const [creditMemo] = await db
      .insert(creditMemos)
      .values({
        ...creditMemoData,
        userId: creditMemoData.userId,
      })
      .returning();
    return creditMemo;
  }

  async updateCreditMemo(
    id: string,
    updates: Partial<CreditMemo>,
  ): Promise<CreditMemo | undefined> {
    const [creditMemo] = await db
      .update(creditMemos)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(creditMemos.id, id))
      .returning();
    return creditMemo;
  }

  async updateCreditMemoStatus(id: string, status: string): Promise<boolean> {
    const result = await db
      .update(creditMemos)
      .set({ status, updatedAt: new Date() })
      .where(eq(creditMemos.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteCreditMemo(id: string): Promise<boolean> {
    // Delete line items first
    await this.deleteCreditMemoLineItemsByCreditMemoId(id);
    const result = await db.delete(creditMemos).where(eq(creditMemos.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Credit Memo Line Items
  async getCreditMemoLineItems(
    creditMemoId: string,
  ): Promise<CreditMemoLineItem[]> {
    return await db
      .select()
      .from(creditMemoLineItems)
      .where(eq(creditMemoLineItems.creditMemoId, creditMemoId));
  }

  async getAllCreditMemoLineItems(): Promise<CreditMemoLineItem[]> {
    return await db.select().from(creditMemoLineItems);
  }

  async createCreditMemoLineItem(
    lineItemData: InsertCreditMemoLineItem,
  ): Promise<CreditMemoLineItem> {
    const [lineItem] = await db
      .insert(creditMemoLineItems)
      .values(lineItemData)
      .returning();
    return lineItem;
  }

  async deleteCreditMemoLineItem(id: string): Promise<boolean> {
    const result = await db
      .delete(creditMemoLineItems)
      .where(eq(creditMemoLineItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteCreditMemoLineItemsByCreditMemoId(
    creditMemoId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(creditMemoLineItems)
      .where(eq(creditMemoLineItems.creditMemoId, creditMemoId));
    return (result.rowCount || 0) > 0;
  }

  // System Settings (for system-wide QuickBooks config)
  async getSystemSetting(key: string): Promise<any> {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return setting?.value;
  }

  async setSystemSetting(key: string, value: any): Promise<void> {
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));

    if (existing.length > 0) {
      await db
        .update(systemSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value });
    }
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const result = await db
      .delete(systemSettings)
      .where(eq(systemSettings.key, key));
    return (result.rowCount || 0) > 0;
  }

  // Orders
  async getOrders(userId: string): Promise<Order[]> {
    await this.ensureInitialized();
    return db
      .select()
      .from(orders)
      .orderBy(asc(orders.orderNumber));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    await this.ensureInitialized();
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(orderData: InsertOrder & { userId: string }): Promise<Order> {
    await this.ensureInitialized();
    const [order] = await db.insert(orders).values(orderData).returning();
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    await this.ensureInitialized();
    const [order] = await db
      .update(orders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateOrderStatus(id: string, status: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteOrder(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(orders).where(eq(orders.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Order Line Items
  async getOrderLineItems(orderId: string): Promise<OrderLineItem[]> {
    await this.ensureInitialized();
    return db
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.orderId, orderId));
  }

  async getAllOrderLineItems(): Promise<OrderLineItem[]> {
    await this.ensureInitialized();
    return db.select().from(orderLineItems);
  }

  async createOrderLineItem(lineItemData: InsertOrderLineItem): Promise<OrderLineItem> {
    await this.ensureInitialized();
    const [lineItem] = await db
      .insert(orderLineItems)
      .values(lineItemData)
      .returning();
    return lineItem;
  }

  async deleteOrderLineItem(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .delete(orderLineItems)
      .where(eq(orderLineItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteOrderLineItemsByOrderId(orderId: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .delete(orderLineItems)
      .where(eq(orderLineItems.orderId, orderId));
    return (result.rowCount || 0) > 0;
  }
}
