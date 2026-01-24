import {
  type User,
  type InsertUser,
  type Customer,
  type InsertCustomer,
  type Product,
  type InsertProduct,
  type ProductVariant,
  type InsertProductVariant,
  type ProductScheme,
  type InsertProductScheme,
  type Invoice,
  type InsertInvoice,
  type InvoiceLineItem,
  type InsertInvoiceLineItem,
  type CreditMemo,
  type InsertCreditMemo,
  type CreditMemoLineItem,
  type InsertCreditMemoLineItem,
  type Order,
  type InsertOrder,
  type OrderLineItem,
  type InsertOrderLineItem,
  type CustomerProductMargin,
  type InsertCustomerProductMargin,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserPassword(id: string, hashedPassword: string): Promise<boolean>;
  deleteUser(id: string): Promise<boolean>;

  // Customers
  getCustomers(userId: string): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(
    customer: InsertCustomer & { userId: string },
  ): Promise<Customer>;
  updateCustomer(
    id: string,
    updates: Partial<Customer>,
  ): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;

  // Products
  getProducts(userId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct & { userId: string }): Promise<Product>;
  updateProduct(
    id: string,
    updates: Partial<Product>,
  ): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  deleteAllProducts(userId: string): Promise<boolean>;

  // Product Variants
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  getVariant(id: string): Promise<ProductVariant | undefined>;
  createVariant(variant: InsertProductVariant): Promise<ProductVariant>;
  updateVariant(
    id: string,
    updates: Partial<ProductVariant>,
  ): Promise<ProductVariant | undefined>;

  // Product Schemes
  getProductSchemes(userId: string): Promise<ProductScheme[]>;
  getSchemeUsageCounts(userId: string): Promise<{ [key: string]: number }>;
  getScheme(id: string): Promise<ProductScheme | undefined>;
  createScheme(
    scheme: InsertProductScheme & { userId: string },
  ): Promise<ProductScheme>;
  updateScheme(
    id: string,
    updates: Partial<ProductScheme>,
  ): Promise<ProductScheme | undefined>;
  deleteScheme(id: string): Promise<boolean>;

  // Invoices
  getInvoices(userId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice & { userId: string }): Promise<Invoice>;
  updateInvoice(
    id: string,
    updates: Partial<Invoice>,
  ): Promise<Invoice | undefined>;
  updateInvoiceStatus(id: string, status: string): Promise<boolean>;
  deleteInvoice(id: string): Promise<boolean>;

  // Invoice Line Items
  getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]>;
  getAllInvoiceLineItems(): Promise<InvoiceLineItem[]>;
  createLineItem(lineItem: InsertInvoiceLineItem): Promise<InvoiceLineItem>;
  deleteLineItem(id: string): Promise<boolean>;
  deleteInvoiceLineItemsByInvoiceId(invoiceId: string): Promise<boolean>;

  // Credit Memos
  getCreditMemos(userId: string): Promise<CreditMemo[]>;
  getCreditMemo(id: string): Promise<CreditMemo | undefined>;
  createCreditMemo(
    creditMemo: InsertCreditMemo & { userId: string },
  ): Promise<CreditMemo>;
  updateCreditMemo(
    id: string,
    updates: Partial<CreditMemo>,
  ): Promise<CreditMemo | undefined>;
  updateCreditMemoStatus(id: string, status: string): Promise<boolean>;
  deleteCreditMemo(id: string): Promise<boolean>;

  // Credit Memo Line Items
  getCreditMemoLineItems(creditMemoId: string): Promise<CreditMemoLineItem[]>;
  getAllCreditMemoLineItems(): Promise<CreditMemoLineItem[]>;
  createCreditMemoLineItem(
    lineItem: InsertCreditMemoLineItem,
  ): Promise<CreditMemoLineItem>;
  deleteCreditMemoLineItem(id: string): Promise<boolean>;
  deleteCreditMemoLineItemsByCreditMemoId(
    creditMemoId: string,
  ): Promise<boolean>;

  // System Settings (for system-wide QuickBooks config)
  getSystemSetting(key: string): Promise<any>;
  setSystemSetting(key: string, value: any): Promise<void>;
  deleteSystemSetting(key: string): Promise<boolean>;

  // Orders
  getOrders(userId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder & { userId: string }): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  updateOrderStatus(id: string, status: string): Promise<boolean>;
  deleteOrder(id: string): Promise<boolean>;

  // Order Line Items
  getOrderLineItems(orderId: string): Promise<OrderLineItem[]>;
  getAllOrderLineItems(): Promise<OrderLineItem[]>;
  createOrderLineItem(lineItem: InsertOrderLineItem): Promise<OrderLineItem>;
  deleteOrderLineItem(id: string): Promise<boolean>;
  deleteOrderLineItemsByOrderId(orderId: string): Promise<boolean>;

  // Customer Product Margins (for Advanced Price Rules)
  getCustomerProductMargins(): Promise<CustomerProductMargin[]>;
  getCustomerProductMarginsByCustomer(customerId: string): Promise<CustomerProductMargin[]>;
  getCustomerProductMargin(customerId: string, productId: string): Promise<CustomerProductMargin | undefined>;
  createCustomerProductMargin(margin: InsertCustomerProductMargin): Promise<CustomerProductMargin>;
  updateCustomerProductMargin(id: string, marginPercent: number): Promise<CustomerProductMargin | undefined>;
  deleteCustomerProductMargin(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private customers: Map<string, Customer> = new Map();
  private products: Map<string, Product> = new Map();
  private productVariants: Map<string, ProductVariant> = new Map();
  private productSchemes: Map<string, ProductScheme> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private invoiceLineItems: Map<string, InvoiceLineItem> = new Map();
  private creditMemos: Map<string, CreditMemo> = new Map();
  private creditMemoLineItems: Map<string, CreditMemoLineItem> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // No default user - users will be created via Replit Auth on first login
  }

  // Users
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      profileImageUrl: insertUser.profileImageUrl || null,
      role: insertUser.role || "view_print_only",
      quickbooksCompanyId: null,
      quickbooksCompanyName: null,
      quickbooksAccessToken: null,
      quickbooksRefreshToken: null,
      quickbooksTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(
    id: string,
    updates: Partial<User>,
  ): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    // Handle undefined values explicitly (for QuickBooks disconnection)
    const updatedUser = { ...user };
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        updatedUser[key as keyof User] = null as any;
      } else {
        updatedUser[key as keyof User] = value as any;
      }
    }

    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserPassword(
    id: string,
    hashedPassword: string,
  ): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;

    const updatedUser = {
      ...user,
      password: hashedPassword,
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return true;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  // Customers
  async getCustomers(userId: string): Promise<Customer[]> {
    // Return all customers globally (no user-specific filtering)
    return Array.from(this.customers.values());
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(
    customerData: InsertCustomer & { userId: string },
  ): Promise<Customer> {
    const id = randomUUID();
    const customer: Customer = {
      name: customerData.name,
      email: customerData.email || null,
      phone: customerData.phone || null,
      address: customerData.address
        ? {
            street: customerData.address.street || undefined,
            city: customerData.address.city || undefined,
            state: customerData.address.state || undefined,
            zipCode: customerData.address.zipCode || undefined,
            country: customerData.address.country || undefined,
          }
        : null,
      type: (customerData as any).type || "customer",
      isActive:
        customerData.isActive !== undefined ? customerData.isActive : true,
      userId: customerData.userId,
      id,
      quickbooksCustomerId: null,
      createdAt: new Date(),
    };
    this.customers.set(id, customer);
    return customer;
  }

  async updateCustomer(
    id: string,
    updates: Partial<Customer>,
  ): Promise<Customer | undefined> {
    const customer = this.customers.get(id);
    if (!customer) return undefined;
    const updatedCustomer = { ...customer, ...updates };
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    return this.customers.delete(id);
  }

  // Products
  async getProducts(userId: string): Promise<Product[]> {
    // Return all products globally (no user-specific filtering)
    return Array.from(this.products.values());
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(
    productData: InsertProduct & { userId: string },
  ): Promise<Product> {
    const id = randomUUID();
    const product: Product = {
      name: productData.name,
      description: productData.description || null,
      basePrice: productData.basePrice,
      category: productData.category || null,
      itemCode: productData.itemCode || null,
      packingType: productData.packingType || null,
      grossWeightKgs: productData.grossWeightKgs || null,
      netWeightKgs: productData.netWeightKgs || null,
      userId: productData.userId,
      id,
      quickbooksItemId: null,
      createdAt: new Date(),
    };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(
    id: string,
    updates: Partial<Product>,
  ): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    const updatedProduct = { ...product, ...updates };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  async deleteAllProducts(userId: string): Promise<boolean> {
    // Keep scoped deletion for safety - only delete products for specific user
    const userProducts = Array.from(this.products.values()).filter(
      (product) => product.userId === userId,
    );
    for (const product of userProducts) {
      this.products.delete(product.id);
    }
    return true;
  }

  // Product Variants
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return Array.from(this.productVariants.values()).filter(
      (variant) => variant.productId === productId,
    );
  }

  async getVariant(id: string): Promise<ProductVariant | undefined> {
    return this.productVariants.get(id);
  }

  async createVariant(
    variantData: InsertProductVariant,
  ): Promise<ProductVariant> {
    const id = randomUUID();
    const variant: ProductVariant = {
      productId: variantData.productId || null,
      name: variantData.name,
      sku: variantData.sku,
      price: variantData.price,
      stockQuantity: variantData.stockQuantity || null,
      lowStockThreshold: variantData.lowStockThreshold || null,
      attributes: variantData.attributes || null,
      id,
      createdAt: new Date(),
    };
    this.productVariants.set(id, variant);
    return variant;
  }

  async updateVariant(
    id: string,
    updates: Partial<ProductVariant>,
  ): Promise<ProductVariant | undefined> {
    const variant = this.productVariants.get(id);
    if (!variant) return undefined;
    const updatedVariant = { ...variant, ...updates };
    this.productVariants.set(id, updatedVariant);
    return updatedVariant;
  }

  // Product Schemes
  async getProductSchemes(userId: string): Promise<ProductScheme[]> {
    // Return all product schemes globally (no user-specific filtering)
    return Array.from(this.productSchemes.values());
  }

  async getSchemeUsageCounts(
    userId: string,
  ): Promise<{ [key: string]: number }> {
    const counts: { [key: string]: number } = {};
    // Count scheme usage across all invoices globally (no user-specific filtering)
    const allInvoices = Array.from(this.invoices.values());

    for (const invoice of allInvoices) {
      const lineItems = Array.from(this.invoiceLineItems.values()).filter(
        (item) =>
          item.invoiceId === invoice.id &&
          item.schemeId &&
          item.isFreeFromScheme,
      );

      lineItems.forEach((item) => {
        if (item.schemeId) {
          counts[item.schemeId] = (counts[item.schemeId] || 0) + 1;
        }
      });
    }

    return counts;
  }

  async getScheme(id: string): Promise<ProductScheme | undefined> {
    return this.productSchemes.get(id);
  }

  async createScheme(
    schemeData: InsertProductScheme & { userId: string },
  ): Promise<ProductScheme> {
    const id = randomUUID();
    const scheme: ProductScheme = {
      name: schemeData.name,
      description: schemeData.description || null,
      productId: schemeData.productId || null,
      buyQuantity: schemeData.buyQuantity,
      freeQuantity: schemeData.freeQuantity,
      isActive: schemeData.isActive !== undefined ? schemeData.isActive : true,
      userId: schemeData.userId,
      id,
      createdAt: new Date(),
    };
    this.productSchemes.set(id, scheme);
    return scheme;
  }

  async updateScheme(
    id: string,
    updates: Partial<ProductScheme>,
  ): Promise<ProductScheme | undefined> {
    const scheme = this.productSchemes.get(id);
    if (!scheme) return undefined;
    const updatedScheme = { ...scheme, ...updates };
    this.productSchemes.set(id, updatedScheme);
    return updatedScheme;
  }

  async deleteScheme(id: string): Promise<boolean> {
    return this.productSchemes.delete(id);
  }

  // Invoices
  async getInvoices(userId: string): Promise<Invoice[]> {
    // Return all invoices globally (no user-specific filtering)
    return Array.from(this.invoices.values());
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const invoice = this.invoices.get(id);
    if (!invoice) return undefined;

    // Include customer data in the invoice response
    const customer = invoice.customerId
      ? this.customers.get(invoice.customerId)
      : null;

    return {
      ...invoice,
      customer: customer || null,
    } as any;
  }

  async createInvoice(
    invoiceData: InsertInvoice & { userId: string },
  ): Promise<Invoice> {
    const id = randomUUID();
    const invoice: Invoice = {
      invoiceNumber: invoiceData.invoiceNumber,
      customerId: invoiceData.customerId || null,
      subtotal: invoiceData.subtotal,
      total: invoiceData.total,
      status: invoiceData.status || "draft",
      invoiceType: invoiceData.invoiceType || "receivable",
      invoiceDate: invoiceData.invoiceDate,
      dueDate: invoiceData.dueDate || null,
      userId: invoiceData.userId,
      id,
      quickbooksInvoiceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.invoices.set(id, invoice);
    return invoice;
  }

  async updateInvoice(
    id: string,
    updates: Partial<Invoice>,
  ): Promise<Invoice | undefined> {
    const invoice = this.invoices.get(id);
    if (!invoice) return undefined;
    const updatedInvoice = { ...invoice, ...updates, updatedAt: new Date() };
    this.invoices.set(id, updatedInvoice);
    return updatedInvoice;
  }

  async updateInvoiceStatus(id: string, status: string): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice) return false;
    const updatedInvoice = { ...invoice, status, updatedAt: new Date() };
    this.invoices.set(id, updatedInvoice);
    return true;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    return this.invoices.delete(id);
  }

  // Invoice Line Items
  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    return Array.from(this.invoiceLineItems.values()).filter(
      (item) => item.invoiceId === invoiceId,
    );
  }

  async getAllInvoiceLineItems(): Promise<InvoiceLineItem[]> {
    return Array.from(this.invoiceLineItems.values());
  }

  async createLineItem(
    lineItemData: InsertInvoiceLineItem,
  ): Promise<InvoiceLineItem> {
    const id = randomUUID();
    const lineItem: InvoiceLineItem = {
      invoiceId: lineItemData.invoiceId || null,
      productId: lineItemData.productId || null,
      variantId: lineItemData.variantId || null,
      description: lineItemData.description,
      quantity: lineItemData.quantity,
      unitPrice: lineItemData.unitPrice,
      lineTotal: lineItemData.lineTotal,
      category: (lineItemData as any).category || null,
      isFreeFromScheme: lineItemData.isFreeFromScheme || null,
      schemeId: lineItemData.schemeId || null,
      id,
      createdAt: new Date(),
    };
    this.invoiceLineItems.set(id, lineItem);
    return lineItem;
  }

  async deleteLineItem(id: string): Promise<boolean> {
    return this.invoiceLineItems.delete(id);
  }

  async deleteInvoiceLineItemsByInvoiceId(invoiceId: string): Promise<boolean> {
    const itemsToDelete = Array.from(this.invoiceLineItems.entries())
      .filter(([_, item]) => item.invoiceId === invoiceId)
      .map(([id]) => id);

    itemsToDelete.forEach((id) => this.invoiceLineItems.delete(id));
    return true;
  }

  // Credit Memos
  async getCreditMemos(userId: string): Promise<CreditMemo[]> {
    // Return all credit memos globally (no user-specific filtering)
    return Array.from(this.creditMemos.values());
  }

  async getCreditMemo(id: string): Promise<CreditMemo | undefined> {
    const creditMemo = this.creditMemos.get(id);
    if (!creditMemo) return undefined;

    // Include customer data in the credit memo response
    const customer = creditMemo.customerId
      ? this.customers.get(creditMemo.customerId)
      : null;

    return {
      ...creditMemo,
      customer: customer || null,
    } as any;
  }

  async createCreditMemo(
    creditMemoData: InsertCreditMemo & { userId: string },
  ): Promise<CreditMemo> {
    const id = randomUUID();
    const creditMemo: CreditMemo = {
      creditMemoNumber: creditMemoData.creditMemoNumber,
      customerId: creditMemoData.customerId || null,
      subtotal: creditMemoData.subtotal,
      freight: creditMemoData.freight || "0",
      discount: creditMemoData.discount || "0",
      total: creditMemoData.total,
      status: creditMemoData.status || "draft",
      invoiceType: creditMemoData.invoiceType || "receivable",
      creditMemoDate: creditMemoData.creditMemoDate,
      notes: creditMemoData.notes || null,
      userId: creditMemoData.userId,
      id,
      quickbooksCreditMemoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.creditMemos.set(id, creditMemo);
    return creditMemo;
  }

  async updateCreditMemo(
    id: string,
    updates: Partial<CreditMemo>,
  ): Promise<CreditMemo | undefined> {
    const creditMemo = this.creditMemos.get(id);
    if (!creditMemo) return undefined;
    const updatedCreditMemo = {
      ...creditMemo,
      ...updates,
      updatedAt: new Date(),
    };
    this.creditMemos.set(id, updatedCreditMemo);
    return updatedCreditMemo;
  }

  async updateCreditMemoStatus(id: string, status: string): Promise<boolean> {
    const creditMemo = this.creditMemos.get(id);
    if (!creditMemo) return false;
    const updatedCreditMemo = { ...creditMemo, status, updatedAt: new Date() };
    this.creditMemos.set(id, updatedCreditMemo);
    return true;
  }

  async deleteCreditMemo(id: string): Promise<boolean> {
    return this.creditMemos.delete(id);
  }

  // Credit Memo Line Items
  async getCreditMemoLineItems(
    creditMemoId: string,
  ): Promise<CreditMemoLineItem[]> {
    return Array.from(this.creditMemoLineItems.values()).filter(
      (item) => item.creditMemoId === creditMemoId,
    );
  }

  async getAllCreditMemoLineItems(): Promise<CreditMemoLineItem[]> {
    return Array.from(this.creditMemoLineItems.values());
  }

  async createCreditMemoLineItem(
    lineItemData: InsertCreditMemoLineItem,
  ): Promise<CreditMemoLineItem> {
    const id = randomUUID();
    const lineItem: CreditMemoLineItem = {
      creditMemoId: lineItemData.creditMemoId || null,
      productId: lineItemData.productId || null,
      variantId: lineItemData.variantId || null,
      description: lineItemData.description,
      quantity: lineItemData.quantity,
      unitPrice: lineItemData.unitPrice,
      lineTotal: lineItemData.lineTotal,
      productCode: (lineItemData as any).productCode || null,
      cartoonBarcode: (lineItemData as any).cartoonBarcode || null,
      packingSize: (lineItemData as any).packingSize || null,
      grossWeightKgs: (lineItemData as any).grossWeightKgs || null,
      netWeightKgs: (lineItemData as any).netWeightKgs || null,
      category: (lineItemData as any).category || null,
      isFreeFromScheme: lineItemData.isFreeFromScheme || false,
      isSchemeDescription: lineItemData.isSchemeDescription || false,
      schemeId: lineItemData.schemeId || null,
      id,
      createdAt: new Date(),
    };
    this.creditMemoLineItems.set(id, lineItem);
    return lineItem;
  }

  async deleteCreditMemoLineItem(id: string): Promise<boolean> {
    return this.creditMemoLineItems.delete(id);
  }

  async deleteCreditMemoLineItemsByCreditMemoId(
    creditMemoId: string,
  ): Promise<boolean> {
    const itemsToDelete = Array.from(this.creditMemoLineItems.entries())
      .filter(([_, item]) => item.creditMemoId === creditMemoId)
      .map(([id]) => id);

    itemsToDelete.forEach((id) => this.creditMemoLineItems.delete(id));
    return true;
  }

  // System Settings (for system-wide QuickBooks config)
  private systemSettings: Map<string, any> = new Map();

  async getSystemSetting(key: string): Promise<any> {
    return this.systemSettings.get(key);
  }

  async setSystemSetting(key: string, value: any): Promise<void> {
    this.systemSettings.set(key, value);
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    return this.systemSettings.delete(key);
  }

  // Orders
  private orders: Map<string, Order> = new Map();
  private orderLineItems: Map<string, OrderLineItem> = new Map();

  async getOrders(userId: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter((o) => o.userId === userId);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(orderData: InsertOrder & { userId: string }): Promise<Order> {
    const id = randomUUID();
    const order: Order = {
      ...orderData,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Order;
    this.orders.set(id, order);
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (order) {
      const updated = { ...order, ...updates, updatedAt: new Date() };
      this.orders.set(id, updated);
      return updated;
    }
    return undefined;
  }

  async updateOrderStatus(id: string, status: string): Promise<boolean> {
    const order = this.orders.get(id);
    if (order) {
      order.status = status;
      order.updatedAt = new Date();
      this.orders.set(id, order);
      return true;
    }
    return false;
  }

  async deleteOrder(id: string): Promise<boolean> {
    return this.orders.delete(id);
  }

  async getOrderLineItems(orderId: string): Promise<OrderLineItem[]> {
    return Array.from(this.orderLineItems.values()).filter(
      (item) => item.orderId === orderId,
    );
  }

  async getAllOrderLineItems(): Promise<OrderLineItem[]> {
    return Array.from(this.orderLineItems.values());
  }

  async createOrderLineItem(lineItemData: InsertOrderLineItem): Promise<OrderLineItem> {
    const id = randomUUID();
    const lineItem: OrderLineItem = {
      ...lineItemData,
      grossWeightKgs: (lineItemData as any).grossWeightKgs || null,
      netWeightKgs: (lineItemData as any).netWeightKgs || null,
      category: (lineItemData as any).category || null,
      isFreeFromScheme: lineItemData.isFreeFromScheme || false,
      isSchemeDescription: lineItemData.isSchemeDescription || false,
      schemeId: lineItemData.schemeId || null,
      id,
      createdAt: new Date(),
    };
    this.orderLineItems.set(id, lineItem);
    return lineItem;
  }

  async deleteOrderLineItem(id: string): Promise<boolean> {
    return this.orderLineItems.delete(id);
  }

  async deleteOrderLineItemsByOrderId(orderId: string): Promise<boolean> {
    const itemsToDelete = Array.from(this.orderLineItems.entries())
      .filter(([_, item]) => item.orderId === orderId)
      .map(([id]) => id);
    itemsToDelete.forEach((id) => this.orderLineItems.delete(id));
    return true;
  }

  // Customer Product Margins (stub implementations for MemStorage)
  async getCustomerProductMargins(): Promise<CustomerProductMargin[]> {
    return [];
  }

  async getCustomerProductMarginsByCustomer(_customerId: string): Promise<CustomerProductMargin[]> {
    return [];
  }

  async getCustomerProductMargin(_customerId: string, _productId: string): Promise<CustomerProductMargin | undefined> {
    return undefined;
  }

  async createCustomerProductMargin(_margin: InsertCustomerProductMargin): Promise<CustomerProductMargin> {
    throw new Error("Not implemented in MemStorage");
  }

  async updateCustomerProductMargin(_id: string, _marginPercent: number): Promise<CustomerProductMargin | undefined> {
    return undefined;
  }

  async deleteCustomerProductMargin(_id: string): Promise<boolean> {
    return false;
  }
}

// Import the database storage implementation
import { DatabaseStorage } from "./databaseStorage";

export const storage = new DatabaseStorage();
