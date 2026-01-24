import {
  creditMemoLineItems,
  creditMemos,
  customers,
  customerProductMargins,
  invoiceLineItems,
  invoices,
  orders,
  orderLineItems,
  products,
  productSchemes,
  productVariants,
  systemSettings,
  users,
  globalPriceRule,
  productPriceRule,
  customerPriceRule,
  customerProductPriceRule,
  taxAgencies,
  taxRates,
  taxCodes,
  taxCodeRates,
  productTaxCodes,
  customerTaxSettings,
  invoiceTaxDetails,
  type CreditMemo,
  type CreditMemoLineItem,
  type Customer,
  type CustomerProductMargin,
  type InsertCreditMemo,
  type InsertCreditMemoLineItem,
  type InsertCustomer,
  type InsertCustomerProductMargin,
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
  type GlobalPriceRule,
  type InsertGlobalPriceRule,
  type ProductPriceRule,
  type InsertProductPriceRule,
  type CustomerPriceRule,
  type InsertCustomerPriceRule,
  type CustomerProductPriceRule,
  type InsertCustomerProductPriceRule,
  type TaxAgency,
  type InsertTaxAgency,
  type TaxRate,
  type InsertTaxRate,
  type TaxCode,
  type InsertTaxCode,
  type TaxCodeRate,
  type InsertTaxCodeRate,
  type ProductTaxCode,
  type InsertProductTaxCode,
  type CustomerTaxSettings,
  type InsertCustomerTaxSettings,
  type InvoiceTaxDetail,
  type InsertInvoiceTaxDetail,
} from "@shared/schema";
import { and, asc, eq, isNotNull, lte, gte, isNull, or, sql } from "drizzle-orm";
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

  // Customer Product Margins (for Advanced Price Rules)
  async getCustomerProductMargins(): Promise<CustomerProductMargin[]> {
    await this.ensureInitialized();
    return db.select().from(customerProductMargins);
  }

  async getCustomerProductMarginsByCustomer(customerId: string): Promise<CustomerProductMargin[]> {
    await this.ensureInitialized();
    return db
      .select()
      .from(customerProductMargins)
      .where(eq(customerProductMargins.customerId, customerId));
  }

  async getCustomerProductMargin(customerId: string, productId: string): Promise<CustomerProductMargin | undefined> {
    await this.ensureInitialized();
    const [margin] = await db
      .select()
      .from(customerProductMargins)
      .where(
        and(
          eq(customerProductMargins.customerId, customerId),
          eq(customerProductMargins.productId, productId)
        )
      )
      .limit(1);
    return margin;
  }

  async createCustomerProductMargin(marginData: InsertCustomerProductMargin): Promise<CustomerProductMargin> {
    await this.ensureInitialized();
    const [margin] = await db
      .insert(customerProductMargins)
      .values(marginData)
      .returning();
    return margin;
  }

  async updateCustomerProductMargin(id: string, marginPercent: number): Promise<CustomerProductMargin | undefined> {
    await this.ensureInitialized();
    const [margin] = await db
      .update(customerProductMargins)
      .set({ 
        marginPercent: marginPercent.toString(),
        updatedAt: new Date() 
      })
      .where(eq(customerProductMargins.id, id))
      .returning();
    return margin;
  }

  async deleteCustomerProductMargin(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .delete(customerProductMargins)
      .where(eq(customerProductMargins.id, id));
    return (result.rowCount || 0) > 0;
  }

  // ============================================
  // PRICE RULE IMPLEMENTATIONS
  // ============================================

  // Global Price Rule
  async getGlobalPriceRule(userId: string): Promise<GlobalPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(globalPriceRule)
      .where(eq(globalPriceRule.userId, userId))
      .limit(1);
    return rule;
  }

  async createGlobalPriceRule(ruleData: InsertGlobalPriceRule & { userId: string }): Promise<GlobalPriceRule> {
    await this.ensureInitialized();
    const [rule] = await db
      .insert(globalPriceRule)
      .values(ruleData)
      .returning();
    return rule;
  }

  async updateGlobalPriceRule(id: string, updates: Partial<GlobalPriceRule>): Promise<GlobalPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .update(globalPriceRule)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(globalPriceRule.id, id))
      .returning();
    return rule;
  }

  // Product Price Rule
  async getProductPriceRules(userId: string): Promise<ProductPriceRule[]> {
    await this.ensureInitialized();
    return db
      .select()
      .from(productPriceRule)
      .where(eq(productPriceRule.userId, userId));
  }

  async getProductPriceRule(id: string): Promise<ProductPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(productPriceRule)
      .where(eq(productPriceRule.id, id))
      .limit(1);
    return rule;
  }

  async getProductPriceRuleByProduct(productId: string): Promise<ProductPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(productPriceRule)
      .where(
        and(
          eq(productPriceRule.productId, productId),
          eq(productPriceRule.status, "active")
        )
      )
      .limit(1);
    return rule;
  }

  async createProductPriceRule(ruleData: InsertProductPriceRule & { userId: string }): Promise<ProductPriceRule> {
    await this.ensureInitialized();
    const [rule] = await db
      .insert(productPriceRule)
      .values(ruleData)
      .returning();
    return rule;
  }

  async updateProductPriceRule(id: string, updates: Partial<ProductPriceRule>): Promise<ProductPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .update(productPriceRule)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(productPriceRule.id, id))
      .returning();
    return rule;
  }

  async deleteProductPriceRule(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .delete(productPriceRule)
      .where(eq(productPriceRule.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Customer Price Rule
  async getCustomerPriceRules(userId: string): Promise<CustomerPriceRule[]> {
    await this.ensureInitialized();
    return db
      .select()
      .from(customerPriceRule)
      .where(eq(customerPriceRule.userId, userId));
  }

  async getCustomerPriceRule(id: string): Promise<CustomerPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(customerPriceRule)
      .where(eq(customerPriceRule.id, id))
      .limit(1);
    return rule;
  }

  async getCustomerPriceRuleByCustomer(customerId: string): Promise<CustomerPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(customerPriceRule)
      .where(
        and(
          eq(customerPriceRule.customerId, customerId),
          eq(customerPriceRule.status, "active")
        )
      )
      .limit(1);
    return rule;
  }

  async createCustomerPriceRule(ruleData: InsertCustomerPriceRule & { userId: string }): Promise<CustomerPriceRule> {
    await this.ensureInitialized();
    const [rule] = await db
      .insert(customerPriceRule)
      .values(ruleData)
      .returning();
    return rule;
  }

  async updateCustomerPriceRule(id: string, updates: Partial<CustomerPriceRule>): Promise<CustomerPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .update(customerPriceRule)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerPriceRule.id, id))
      .returning();
    return rule;
  }

  async deleteCustomerPriceRule(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .delete(customerPriceRule)
      .where(eq(customerPriceRule.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Customer Product Price Rule
  async getCustomerProductPriceRules(userId: string): Promise<CustomerProductPriceRule[]> {
    await this.ensureInitialized();
    return db
      .select()
      .from(customerProductPriceRule)
      .where(eq(customerProductPriceRule.userId, userId));
  }

  async getCustomerProductPriceRule(id: string): Promise<CustomerProductPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(customerProductPriceRule)
      .where(eq(customerProductPriceRule.id, id))
      .limit(1);
    return rule;
  }

  async getCustomerProductPriceRuleByPair(customerId: string, productId: string): Promise<CustomerProductPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .select()
      .from(customerProductPriceRule)
      .where(
        and(
          eq(customerProductPriceRule.customerId, customerId),
          eq(customerProductPriceRule.productId, productId),
          eq(customerProductPriceRule.status, "active")
        )
      )
      .limit(1);
    return rule;
  }

  async createCustomerProductPriceRule(ruleData: InsertCustomerProductPriceRule & { userId: string }): Promise<CustomerProductPriceRule> {
    await this.ensureInitialized();
    const [rule] = await db
      .insert(customerProductPriceRule)
      .values(ruleData)
      .returning();
    return rule;
  }

  async updateCustomerProductPriceRule(id: string, updates: Partial<CustomerProductPriceRule>): Promise<CustomerProductPriceRule | undefined> {
    await this.ensureInitialized();
    const [rule] = await db
      .update(customerProductPriceRule)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerProductPriceRule.id, id))
      .returning();
    return rule;
  }

  async deleteCustomerProductPriceRule(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db
      .delete(customerProductPriceRule)
      .where(eq(customerProductPriceRule.id, id));
    return (result.rowCount || 0) > 0;
  }

  // ============================================
  // SALES TAX CENTER (QuickBooks Aligned)
  // ============================================

  // Tax Agencies
  async getTaxAgencies(userId: string): Promise<TaxAgency[]> {
    await this.ensureInitialized();
    return await db.select().from(taxAgencies).where(eq(taxAgencies.userId, userId));
  }

  async getTaxAgency(id: string): Promise<TaxAgency | undefined> {
    await this.ensureInitialized();
    const [agency] = await db.select().from(taxAgencies).where(eq(taxAgencies.id, id)).limit(1);
    return agency;
  }

  async getTaxAgencyByQbId(qbTaxAgencyId: string): Promise<TaxAgency | undefined> {
    await this.ensureInitialized();
    const [agency] = await db.select().from(taxAgencies).where(eq(taxAgencies.qbTaxAgencyId, qbTaxAgencyId)).limit(1);
    return agency;
  }

  async createTaxAgency(agencyData: InsertTaxAgency & { userId: string }): Promise<TaxAgency> {
    await this.ensureInitialized();
    const [agency] = await db.insert(taxAgencies).values(agencyData).returning();
    return agency;
  }

  async updateTaxAgency(id: string, updates: Partial<TaxAgency>): Promise<TaxAgency | undefined> {
    await this.ensureInitialized();
    const [agency] = await db.update(taxAgencies).set({ ...updates, updatedAt: new Date() }).where(eq(taxAgencies.id, id)).returning();
    return agency;
  }

  async deleteTaxAgency(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(taxAgencies).where(eq(taxAgencies.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Tax Rates
  async getTaxRates(userId: string): Promise<TaxRate[]> {
    await this.ensureInitialized();
    return await db.select().from(taxRates).where(eq(taxRates.userId, userId));
  }

  async getTaxRate(id: string): Promise<TaxRate | undefined> {
    await this.ensureInitialized();
    const [rate] = await db.select().from(taxRates).where(eq(taxRates.id, id)).limit(1);
    return rate;
  }

  async getTaxRateByQbId(qbTaxRateId: string): Promise<TaxRate | undefined> {
    await this.ensureInitialized();
    const [rate] = await db.select().from(taxRates).where(eq(taxRates.qbTaxRateId, qbTaxRateId)).limit(1);
    return rate;
  }

  async getTaxRatesByAgency(taxAgencyId: string): Promise<TaxRate[]> {
    await this.ensureInitialized();
    return await db.select().from(taxRates).where(eq(taxRates.taxAgencyId, taxAgencyId));
  }

  async getActiveTaxRatesForDate(date: Date, userId: string): Promise<TaxRate[]> {
    await this.ensureInitialized();
    // QB Alignment: Get tax rates active on the given date (effectiveFromDate <= date AND (effectiveToDate is null OR effectiveToDate >= date))
    return await db.select().from(taxRates).where(
      and(
        eq(taxRates.userId, userId),
        eq(taxRates.status, "active"),
        lte(taxRates.effectiveFromDate, date),
        or(
          isNull(taxRates.effectiveToDate),
          gte(taxRates.effectiveToDate, date)
        )
      )
    );
  }

  async createTaxRate(rateData: InsertTaxRate & { userId: string }): Promise<TaxRate> {
    await this.ensureInitialized();
    const [rate] = await db.insert(taxRates).values(rateData).returning();
    return rate;
  }

  async updateTaxRate(id: string, updates: Partial<TaxRate>): Promise<TaxRate | undefined> {
    await this.ensureInitialized();
    const [rate] = await db.update(taxRates).set({ ...updates, updatedAt: new Date() }).where(eq(taxRates.id, id)).returning();
    return rate;
  }

  async deleteTaxRate(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(taxRates).where(eq(taxRates.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Tax Codes
  async getTaxCodes(userId: string): Promise<TaxCode[]> {
    await this.ensureInitialized();
    return await db.select().from(taxCodes).where(eq(taxCodes.userId, userId));
  }

  async getTaxCode(id: string): Promise<TaxCode | undefined> {
    await this.ensureInitialized();
    const [code] = await db.select().from(taxCodes).where(eq(taxCodes.id, id)).limit(1);
    return code;
  }

  async getTaxCodeByQbId(qbTaxCodeId: string): Promise<TaxCode | undefined> {
    await this.ensureInitialized();
    const [code] = await db.select().from(taxCodes).where(eq(taxCodes.qbTaxCodeId, qbTaxCodeId)).limit(1);
    return code;
  }

  async getDefaultTaxCode(userId: string): Promise<TaxCode | undefined> {
    await this.ensureInitialized();
    // QB Alignment: Returns the company default tax code
    const [code] = await db.select().from(taxCodes).where(
      and(eq(taxCodes.userId, userId), eq(taxCodes.isDefault, true), eq(taxCodes.status, "active"))
    ).limit(1);
    return code;
  }

  async getNonTaxableTaxCode(userId: string): Promise<TaxCode | undefined> {
    await this.ensureInitialized();
    // QB Alignment: Returns the NON taxable tax code (isTaxable = false)
    const [code] = await db.select().from(taxCodes).where(
      and(eq(taxCodes.userId, userId), eq(taxCodes.isTaxable, false), eq(taxCodes.status, "active"))
    ).limit(1);
    return code;
  }

  async createTaxCode(codeData: InsertTaxCode & { userId: string }): Promise<TaxCode> {
    await this.ensureInitialized();
    const [code] = await db.insert(taxCodes).values(codeData).returning();
    return code;
  }

  async updateTaxCode(id: string, updates: Partial<TaxCode>): Promise<TaxCode | undefined> {
    await this.ensureInitialized();
    const [code] = await db.update(taxCodes).set({ ...updates, updatedAt: new Date() }).where(eq(taxCodes.id, id)).returning();
    return code;
  }

  async deleteTaxCode(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(taxCodes).where(eq(taxCodes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Tax Code Rates (junction table)
  async getTaxCodeRates(taxCodeId: string): Promise<TaxCodeRate[]> {
    await this.ensureInitialized();
    return await db.select().from(taxCodeRates).where(eq(taxCodeRates.taxCodeId, taxCodeId)).orderBy(asc(taxCodeRates.displayOrder));
  }

  async getTaxCodeRatesWithDetails(taxCodeId: string): Promise<(TaxCodeRate & { taxRate: TaxRate })[]> {
    await this.ensureInitialized();
    // Join tax code rates with tax rates to get full details
    const results = await db.select({
      taxCodeRate: taxCodeRates,
      taxRate: taxRates,
    }).from(taxCodeRates)
      .innerJoin(taxRates, eq(taxCodeRates.taxRateId, taxRates.id))
      .where(eq(taxCodeRates.taxCodeId, taxCodeId))
      .orderBy(asc(taxCodeRates.displayOrder));
    
    return results.map(r => ({ ...r.taxCodeRate, taxRate: r.taxRate }));
  }

  async createTaxCodeRate(rateData: InsertTaxCodeRate): Promise<TaxCodeRate> {
    await this.ensureInitialized();
    const [rate] = await db.insert(taxCodeRates).values(rateData).returning();
    return rate;
  }

  async deleteTaxCodeRate(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(taxCodeRates).where(eq(taxCodeRates.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteTaxCodeRatesByCodeId(taxCodeId: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(taxCodeRates).where(eq(taxCodeRates.taxCodeId, taxCodeId));
    return true;
  }

  // Product Tax Codes
  async getProductTaxCodes(userId: string): Promise<ProductTaxCode[]> {
    await this.ensureInitialized();
    return await db.select().from(productTaxCodes).where(eq(productTaxCodes.userId, userId));
  }

  async getProductTaxCode(productId: string): Promise<ProductTaxCode | undefined> {
    await this.ensureInitialized();
    const [mapping] = await db.select().from(productTaxCodes).where(eq(productTaxCodes.productId, productId)).limit(1);
    return mapping;
  }

  async createProductTaxCode(mappingData: InsertProductTaxCode & { userId: string }): Promise<ProductTaxCode> {
    await this.ensureInitialized();
    const [mapping] = await db.insert(productTaxCodes).values(mappingData).returning();
    return mapping;
  }

  async updateProductTaxCode(id: string, taxCodeId: string): Promise<ProductTaxCode | undefined> {
    await this.ensureInitialized();
    const [mapping] = await db.update(productTaxCodes).set({ taxCodeId, updatedAt: new Date() }).where(eq(productTaxCodes.id, id)).returning();
    return mapping;
  }

  async deleteProductTaxCode(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(productTaxCodes).where(eq(productTaxCodes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Customer Tax Settings
  async getCustomerTaxSettingsList(userId: string): Promise<CustomerTaxSettings[]> {
    await this.ensureInitialized();
    return await db.select().from(customerTaxSettings).where(eq(customerTaxSettings.userId, userId));
  }

  async getCustomerTaxSettings(customerId: string): Promise<CustomerTaxSettings | undefined> {
    await this.ensureInitialized();
    const [settings] = await db.select().from(customerTaxSettings).where(eq(customerTaxSettings.customerId, customerId)).limit(1);
    return settings;
  }

  async createCustomerTaxSettings(settingsData: InsertCustomerTaxSettings & { userId: string }): Promise<CustomerTaxSettings> {
    await this.ensureInitialized();
    const [settings] = await db.insert(customerTaxSettings).values(settingsData).returning();
    return settings;
  }

  async updateCustomerTaxSettings(id: string, updates: Partial<CustomerTaxSettings>): Promise<CustomerTaxSettings | undefined> {
    await this.ensureInitialized();
    const [settings] = await db.update(customerTaxSettings).set({ ...updates, updatedAt: new Date() }).where(eq(customerTaxSettings.id, id)).returning();
    return settings;
  }

  async deleteCustomerTaxSettings(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(customerTaxSettings).where(eq(customerTaxSettings.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Invoice Tax Details
  async getInvoiceTaxDetails(invoiceId: string): Promise<InvoiceTaxDetail[]> {
    await this.ensureInitialized();
    return await db.select().from(invoiceTaxDetails).where(eq(invoiceTaxDetails.invoiceId, invoiceId));
  }

  async getInvoiceTaxDetailByLineItem(lineItemId: string): Promise<InvoiceTaxDetail | undefined> {
    await this.ensureInitialized();
    const [detail] = await db.select().from(invoiceTaxDetails).where(eq(invoiceTaxDetails.lineItemId, lineItemId)).limit(1);
    return detail;
  }

  async createInvoiceTaxDetail(detailData: InsertInvoiceTaxDetail): Promise<InvoiceTaxDetail> {
    await this.ensureInitialized();
    const [detail] = await db.insert(invoiceTaxDetails).values(detailData).returning();
    return detail;
  }

  async deleteInvoiceTaxDetail(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await db.delete(invoiceTaxDetails).where(eq(invoiceTaxDetails.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteInvoiceTaxDetailsByInvoiceId(invoiceId: string): Promise<boolean> {
    await this.ensureInitialized();
    await db.delete(invoiceTaxDetails).where(eq(invoiceTaxDetails.invoiceId, invoiceId));
    return true;
  }
}
