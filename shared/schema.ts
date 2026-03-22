import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: varchar("username").notNull().unique(),
  email: varchar("email"), // Optional now
  mobile: varchar("mobile").notNull().unique(), // Required for password reset
  password: text("password").notNull(),
  role: text("role").notNull().default("viewer"), // super_admin, admin, poster, viewer
  quickbooksCompanyId: text("quickbooks_company_id"),
  quickbooksCompanyName: text("quickbooks_company_name"),
  quickbooksAccessToken: text("quickbooks_access_token"),
  quickbooksRefreshToken: text("quickbooks_refresh_token"),
  quickbooksTokenExpiry: timestamp("quickbooks_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// System-wide QuickBooks configuration (shared across all users)
export const systemSettings = pgTable("system_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactPersonName: text("contact_person_name"),
  email: text("email"),
  phone: text("phone"),
  address: jsonb("address").$type<{
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  }>(),
  type: text("type").notNull().default("customer"), // "customer" or "vendor"
  isActive: boolean("is_active").default(true),
  defaultMarginPercent: decimal("default_margin_percent", { precision: 5, scale: 2 }), // Customer default margin for pricing
  customerCategory: text("customer_category"),
  quickbooksCustomerId: text("quickbooks_customer_id"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Product Name
  brand: text("brand"), // Brand
  date: timestamp("date").notNull(), // Date
  itemCode: text("item_code"), // Item Code
  packingSize: text("packing_size"), // Packing Size
  category: text("category"), // Category
  qty: integer("qty").notNull().default(0), // Qty
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(), // Base Price
  salesPrice: decimal("sales_price", { precision: 10, scale: 2 }), // Sales Price
  grossWeight: decimal("gross_weight", { precision: 10, scale: 3 }), // Gross Weight
  netWeight: decimal("net_weight", { precision: 10, scale: 3 }), // Net Weight
  description: text("description"),
  schemeDescription: text("scheme_description"), // Scheme Description
  cartoonBarcode: text("cartoon_barcode"), // Cartoon Barcode
  marginPerCarton: decimal("margin_per_carton", { precision: 10, scale: 2 }), // Margin per carton (inventory default)
  marginUpdatedBy: varchar("margin_updated_by"), // User who last updated margin
  marginUpdatedAt: timestamp("margin_updated_at"), // When margin was last updated
  quickbooksItemId: text("quickbooks_item_id"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// PRICE RULE TABLES
// ============================================

// Global Price Rule - fallback margin when no other rule applies
// Only one row should be active at a time
export const globalPriceRule = pgTable("global_price_rule", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  enableAutoPriceRule: boolean("enable_auto_price_rule").default(true).notNull(),
  defaultMarginPercent: decimal("default_margin_percent", { precision: 5, scale: 2 }).notNull(),
  userId: varchar("user_id").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Price Rule - default margin per product (applies to all customers unless overridden)
export const productPriceRule = pgTable("product_price_rule", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id).notNull(),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"), // 'active' or 'inactive'
  userId: varchar("user_id").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer Price Rule - default margin per customer for all products
export const customerPriceRule = pgTable("customer_price_rule", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id),
  customerCategory: text("customer_category"),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).notNull(),
  effectiveFromDate: timestamp("effective_from_date").notNull(),
  status: text("status").notNull().default("active"), // 'active' or 'inactive'
  userId: varchar("user_id").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer + Product Price Rule - highest-priority margin for specific customer and product
// This replaces the simpler customerProductMargins table with full status/date tracking
export const customerProductPriceRule = pgTable("customer_product_price_rule", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).notNull(),
  effectiveFromDate: timestamp("effective_from_date").notNull(),
  status: text("status").notNull().default("active"), // 'active' or 'inactive'
  userId: varchar("user_id").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Unified Price Rules table - single table for all price rule types
export const priceRules = pgTable("price_rules", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ruleType: text("rule_type").notNull(), // 'global', 'product', 'customer', 'customer_product'
  customerId: varchar("customer_id").references(() => customers.id),
  customerCategory: text("customer_category"), // customer category name for category-based rules
  productId: varchar("product_id").references(() => products.id),
  marginPercent: decimal("margin_percent", { precision: 7, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  effectiveFromDate: timestamp("effective_from_date"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Legacy table - kept for backwards compatibility, will be deprecated
// Customer-Product Margin table for specific margin rules per customer-product combination
// Used in Advanced Price Rule feature to calculate sales prices
export const customerProductMargins = pgTable("customer_product_margins", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).notNull(), // Margin percentage for this customer-product pair
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productVariants = pgTable("product_variants", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stockQuantity: integer("stock_quantity").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  attributes: jsonb("attributes").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const productSchemes = pgTable("product_schemes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  productId: varchar("product_id").references(() => products.id), // Optional - schemes are now based on total qty
  productIds: text("product_ids").array(), // Multiple products for the scheme
  buyQuantity: integer("buy_quantity").notNull(),
  freeQuantity: integer("free_quantity").notNull(),
  isActive: boolean("is_active").default(true),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  purchaseOrder: text("purchase_order"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  freight: decimal("freight", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, sent, paid, overdue
  invoiceType: text("invoice_type").notNull().default("receivable"), // receivable (AR), payable (AP)
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  paymentTerms: integer("payment_terms").default(30).notNull(),
  notes: text("notes"),
  bankDetails: text("bank_details"),
  quickbooksInvoiceId: text("quickbooks_invoice_id"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  productId: varchar("product_id").references(() => products.id),
  variantId: varchar("variant_id").references(() => productVariants.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  productCode: text("product_code"),
  cartoonBarcode: text("cartoon_barcode"),
  packingSize: text("packing_size"),
  grossWeightKgs: decimal("gross_weight_kgs", { precision: 10, scale: 3 }),
  netWeightKgs: decimal("net_weight_kgs", { precision: 10, scale: 3 }),
  category: text("category"),
  isFreeFromScheme: boolean("is_free_from_scheme").default(false),
  isSchemeDescription: boolean("is_scheme_description").default(false),
  schemeId: varchar("scheme_id").references(() => productSchemes.id),
  marginPerCarton: decimal("margin_per_carton", { precision: 10, scale: 2 }),
  marginUpdatedBy: varchar("margin_updated_by"),
  marginUpdatedAt: timestamp("margin_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const creditMemos = pgTable("credit_memos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creditMemoNumber: text("credit_memo_number").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  freight: decimal("freight", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, sent, paid
  invoiceType: text("invoice_type").notNull().default("receivable"), // receivable (AR), payable (AP)
  creditMemoDate: timestamp("credit_memo_date").notNull(),
  notes: text("notes"),
  quickbooksCreditMemoId: text("quickbooks_credit_memo_id"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creditMemoLineItems = pgTable("credit_memo_line_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creditMemoId: varchar("credit_memo_id").references(() => creditMemos.id),
  productId: varchar("product_id").references(() => products.id),
  variantId: varchar("variant_id").references(() => productVariants.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  productCode: text("product_code"),
  cartoonBarcode: text("cartoon_barcode"),
  packingSize: text("packing_size"),
  grossWeightKgs: decimal("gross_weight_kgs", { precision: 10, scale: 3 }),
  netWeightKgs: decimal("net_weight_kgs", { precision: 10, scale: 3 }),
  category: text("category"),
  isFreeFromScheme: boolean("is_free_from_scheme").default(false),
  isSchemeDescription: boolean("is_scheme_description").default(false),
  schemeId: varchar("scheme_id").references(() => productSchemes.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  purchaseOrder: text("purchase_order"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  freight: decimal("freight", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, approved, closed, cancelled
  orderType: text("order_type").notNull().default("sales"), // sales (SO), purchase (PO)
  orderDate: timestamp("order_date").notNull(),
  expectedDate: timestamp("expected_date"),
  notes: text("notes"),
  isConverted: boolean("is_converted").default(false),
  convertedDocumentId: varchar("converted_document_id"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orderLineItems = pgTable("order_line_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id),
  productId: varchar("product_id").references(() => products.id),
  variantId: varchar("variant_id").references(() => productVariants.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  productCode: text("product_code"),
  cartoonBarcode: text("cartoon_barcode"),
  packingSize: text("packing_size"),
  grossWeightKgs: decimal("gross_weight_kgs", { precision: 10, scale: 3 }),
  netWeightKgs: decimal("net_weight_kgs", { precision: 10, scale: 3 }),
  category: text("category"),
  isFreeFromScheme: boolean("is_free_from_scheme").default(false),
  isSchemeDescription: boolean("is_scheme_description").default(false),
  schemeId: varchar("scheme_id").references(() => productSchemes.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  quickbooksCompanyId: true,
  quickbooksCompanyName: true,
  quickbooksAccessToken: true,
  quickbooksRefreshToken: true,
  quickbooksTokenExpiry: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
  })
  .extend({
    date: z.string().transform((str) => new Date(str)),
  });

export const insertProductVariantSchema = createInsertSchema(
  productVariants,
).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerProductMarginSchema = createInsertSchema(
  customerProductMargins,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Price Rule Schemas
export const insertGlobalPriceRuleSchema = createInsertSchema(globalPriceRule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductPriceRuleSchema = createInsertSchema(productPriceRule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerPriceRuleSchema = createInsertSchema(customerPriceRule)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    effectiveFromDate: z.string().transform((str) => new Date(str)),
  });

export const insertCustomerProductPriceRuleSchema = createInsertSchema(customerProductPriceRule)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    effectiveFromDate: z.string().transform((str) => new Date(str)),
  });

export const insertPriceRuleSchema = createInsertSchema(priceRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchemeSchema = createInsertSchema(
  productSchemes,
).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    invoiceDate: z.string().transform((str) => new Date(str)),
    dueDate: z
      .string()
      .optional()
      .transform((str) => (str ? new Date(str) : null)),
    purchaseOrder: z.union([z.string(), z.null()]).optional(),
  });

export const insertInvoiceLineItemSchema = createInsertSchema(
  invoiceLineItems,
).omit({
  id: true,
  createdAt: true,
});

export const insertCreditMemoSchema = createInsertSchema(creditMemos)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    creditMemoDate: z.string().transform((str) => new Date(str)),
  });

export const insertCreditMemoLineItemSchema = createInsertSchema(
  creditMemoLineItems,
).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderDate: z.string().transform((str) => new Date(str)),
    expectedDate: z
      .string()
      .optional()
      .transform((str) => (str ? new Date(str) : null)),
    purchaseOrder: z.union([z.string(), z.null()]).optional(),
  });

export const insertOrderLineItemSchema = createInsertSchema(
  orderLineItems,
).omit({
  id: true,
  createdAt: true,
});

// Types
// ============================================
// SALES TAX CENTER TABLES (QuickBooks Aligned)
// ============================================

// Tax Agency - represents tax collection authorities (state/county/city)
// QB Alignment: Maps to QuickBooks TaxAgency entity
export const taxAgencies = pgTable("tax_agencies", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  qbTaxAgencyId: text("qb_tax_agency_id"), // QuickBooks TaxAgency ID for sync
  name: text("name").notNull(), // Agency display name
  jurisdiction: text("jurisdiction"), // Jurisdiction name (e.g., "New Jersey", "Los Angeles County")
  jurisdictionType: text("jurisdiction_type").notNull().default("state"), // state, county, city, district
  status: text("status").notNull().default("active"), // active, inactive
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tax Rate - individual tax rate with percentage
// QB Alignment: Maps to QuickBooks TaxRate entity
export const taxRates = pgTable("tax_rates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  qbTaxRateId: text("qb_tax_rate_id"), // QuickBooks TaxRate ID for sync
  name: text("name").notNull(), // Tax rate display name
  rate: decimal("rate", { precision: 6, scale: 4 }).notNull(), // e.g., 8.2500%
  taxAgencyId: varchar("tax_agency_id").references(() => taxAgencies.id),
  effectiveFrom: text("effective_from"), // ISO date string for effective start
  effectiveTo: text("effective_to"), // null = currently active
  status: text("status").notNull().default("active"), // active, inactive
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tax Code - QB style tax code combining multiple rates
// QB Alignment: Maps to QuickBooks TaxCode entity (e.g., TAX, NON)
export const taxCodes = pgTable("tax_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  qbTaxCodeId: text("qb_tax_code_id"), // QuickBooks TaxCode ID for sync
  code: text("code").notNull(), // Short code like TAX, NON, CA_TAX
  name: text("name").notNull(), // Display name
  description: text("description"),
  isTaxable: boolean("is_taxable").notNull().default(true),
  isDefault: boolean("is_default").default(false), // Company default tax code
  status: text("status").notNull().default("active"), // active, inactive
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tax Code Rates - junction table linking tax codes to multiple rates
// QB Alignment: Supports combined tax rates (state + local)
export const taxCodeRates = pgTable("tax_code_rates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  taxCodeId: varchar("tax_code_id").references(() => taxCodes.id).notNull(),
  taxRateId: varchar("tax_rate_id").references(() => taxRates.id).notNull(),
  displayOrder: integer("display_order").default(0), // Order of application
  createdAt: timestamp("created_at").defaultNow(),
});

// Product Tax Code Mapping - default tax code for products
// QB Alignment: Determines which tax code to use for product lines
export const productTaxCodes = pgTable("product_tax_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id).notNull(),
  taxCodeId: varchar("tax_code_id").references(() => taxCodes.id).notNull(),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer Tax Setup - tax exemption and override settings
// QB Alignment: Matches QB customer tax settings
export const customerTaxSettings = pgTable("customer_tax_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id).notNull(),
  isTaxExempt: boolean("is_tax_exempt").default(false), // Customer is tax exempt
  taxExemptReason: text("tax_exempt_reason"), // Reason for exemption
  taxExemptNumber: text("tax_exempt_number"), // Exemption certificate number
  overrideTaxCodeId: varchar("override_tax_code_id").references(() => taxCodes.id), // Override tax code for this customer
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice Tax Details - stores calculated tax per line item
// QB Alignment: Records exact tax calculations for QB sync
export const invoiceTaxDetails = pgTable("invoice_tax_details", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id).notNull(),
  lineItemId: varchar("line_item_id").references(() => invoiceLineItems.id),
  taxCodeId: varchar("tax_code_id").references(() => taxCodes.id).notNull(),
  taxableAmount: decimal("taxable_amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  taxPercentageTotal: decimal("tax_percentage_total", { precision: 6, scale: 4 }).notNull(),
  appliedTaxRates: jsonb("applied_tax_rates").$type<{
    taxRateId: string;
    taxName: string;
    percentage: string;
    amount: string;
    taxAgencyId?: string;
  }[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for Sales Tax tables
export const insertTaxAgencySchema = createInsertSchema(taxAgencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaxRateSchema = createInsertSchema(taxRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaxCodeSchema = createInsertSchema(taxCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaxCodeRateSchema = createInsertSchema(taxCodeRates).omit({
  id: true,
  createdAt: true,
});

export const insertProductTaxCodeSchema = createInsertSchema(productTaxCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerTaxSettingsSchema = createInsertSchema(customerTaxSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceTaxDetailSchema = createInsertSchema(invoiceTaxDetails).omit({
  id: true,
  createdAt: true,
});

// ============================================
// TYPE EXPORTS
// ============================================

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type CustomerProductMargin = typeof customerProductMargins.$inferSelect;
export type InsertCustomerProductMargin = z.infer<typeof insertCustomerProductMarginSchema>;

// Price Rule Types (Legacy - kept for backward compatibility)
export type GlobalPriceRule = typeof globalPriceRule.$inferSelect;
export type InsertGlobalPriceRule = z.infer<typeof insertGlobalPriceRuleSchema>;
export type ProductPriceRule = typeof productPriceRule.$inferSelect;
export type InsertProductPriceRule = z.infer<typeof insertProductPriceRuleSchema>;
export type CustomerPriceRule = typeof customerPriceRule.$inferSelect;
export type InsertCustomerPriceRule = z.infer<typeof insertCustomerPriceRuleSchema>;
export type CustomerProductPriceRule = typeof customerProductPriceRule.$inferSelect;
export type InsertCustomerProductPriceRule = z.infer<typeof insertCustomerProductPriceRuleSchema>;

// Unified Price Rule Types
export type PriceRule = typeof priceRules.$inferSelect;
export type InsertPriceRule = z.infer<typeof insertPriceRuleSchema>;

export type ProductScheme = typeof productSchemes.$inferSelect;
export type InsertProductScheme = z.infer<typeof insertProductSchemeSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type CreditMemo = typeof creditMemos.$inferSelect;
export type InsertCreditMemo = z.infer<typeof insertCreditMemoSchema>;
export type CreditMemoLineItem = typeof creditMemoLineItems.$inferSelect;
export type InsertCreditMemoLineItem = z.infer<
  typeof insertCreditMemoLineItemSchema
>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderLineItem = typeof orderLineItems.$inferSelect;
export type InsertOrderLineItem = z.infer<typeof insertOrderLineItemSchema>;

// Sales Tax Types
export type TaxAgency = typeof taxAgencies.$inferSelect;
export type InsertTaxAgency = z.infer<typeof insertTaxAgencySchema>;
export type TaxRate = typeof taxRates.$inferSelect;
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxCode = typeof taxCodes.$inferSelect;
export type InsertTaxCode = z.infer<typeof insertTaxCodeSchema>;
export type TaxCodeRate = typeof taxCodeRates.$inferSelect;
export type InsertTaxCodeRate = z.infer<typeof insertTaxCodeRateSchema>;
export type ProductTaxCode = typeof productTaxCodes.$inferSelect;
export type InsertProductTaxCode = z.infer<typeof insertProductTaxCodeSchema>;
export type CustomerTaxSettings = typeof customerTaxSettings.$inferSelect;
export type InsertCustomerTaxSettings = z.infer<typeof insertCustomerTaxSettingsSchema>;
export type InvoiceTaxDetail = typeof invoiceTaxDetails.$inferSelect;
export type InsertInvoiceTaxDetail = z.infer<typeof insertInvoiceTaxDetailSchema>;
