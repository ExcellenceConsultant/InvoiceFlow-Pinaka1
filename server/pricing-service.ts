/**
 * Advanced Price Rule Service
 * 
 * Calculates sales prices based on:
 * - Latest purchase price (determined by highest purchase_date before document_date)
 * - Margin percentage selected using priority rules
 * 
 * MARGIN PRIORITY (highest to lowest):
 * 1. Customer + Product specific margin (customer_product_margins table)
 * 2. Customer default margin (customers.default_margin_percent)
 * 3. Product default margin (products.margin_per_carton)
 * 4. Global default margin (system_settings with key 'global_default_margin')
 * 
 * PRICING FORMULA:
 * sales_price = latest_purchase_price × (1 + margin_percentage / 100)
 */

import { db } from "./db";
import { 
  invoices, 
  invoiceLineItems, 
  customers, 
  products, 
  customerProductMargins,
  systemSettings,
  globalPriceRule,
  productPriceRule,
  customerPriceRule,
  customerProductPriceRule
} from "@shared/schema";
import { eq, and, lte, desc, sql } from "drizzle-orm";

// Default global margin if nothing is configured
const FALLBACK_GLOBAL_MARGIN = 25;

export interface PriceCalculationResult {
  salesPrice: number;
  latestPurchasePrice: number | null;
  latestPurchaseDate: Date | null;
  marginPercent: number;
  marginSource: 'customer_product' | 'customer_default' | 'product_default' | 'global_default' | 'fallback';
  message?: string;
}

/**
 * Get the latest purchase price for a product on or before a given date
 * 
 * Latest purchase price is determined by:
 * - Highest purchase_date (and timestamp if same date)
 * - From AP invoices (payable type) that are NOT draft, void, or cancelled
 * - Effective from purchase date onward (older documents not recalculated)
 * 
 * @param productId - The product to find purchase price for
 * @param documentDate - The reference date (order/invoice date)
 * @returns Latest purchase price info or null if no purchases found
 */
async function getLatestPurchasePrice(
  productId: string,
  documentDate: Date
): Promise<{ price: number; purchaseDate: Date } | null> {
  // Find the most recent AP invoice (bill) line item for this product
  // that was created on or before the document date
  // Exclude draft, void, and cancelled invoices to ensure only finalized purchases are used
  const result = await db
    .select({
      unitPrice: invoiceLineItems.unitPrice,
      invoiceDate: invoices.invoiceDate,
      createdAt: invoiceLineItems.createdAt,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoiceLineItems.productId, productId),
        eq(invoices.invoiceType, "payable"), // AP invoices (bills) = purchases
        lte(invoices.invoiceDate, documentDate),
        // Exclude draft, void, and cancelled invoices - only use finalized/sent/paid invoices
        sql`${invoices.status} NOT IN ('draft', 'void', 'cancelled')`
      )
    )
    .orderBy(desc(invoices.invoiceDate), desc(invoiceLineItems.createdAt))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return {
    price: parseFloat(result[0].unitPrice),
    purchaseDate: result[0].invoiceDate,
  };
}

/**
 * Get the margin percentage using priority rules from Price Rule tables
 * 
 * Priority order (first match wins, margins not combined):
 * 1. Customer + Product Price Rule (active, effective_from_date <= documentDate)
 * 2. Customer Price Rule (active, effective_from_date <= documentDate)
 * 3. Product Price Rule (active)
 * 4. Global Price Rule (enabled)
 * 
 * @param customerId - The customer ID
 * @param productId - The product ID
 * @param documentDate - The document date for effective date filtering
 * @returns Margin info with percentage and source
 */
async function getMarginPercent(
  customerId: string,
  productId: string,
  documentDate: Date = new Date()
): Promise<{ margin: number; source: PriceCalculationResult['marginSource'] }> {
  
  // Priority 1: Customer + Product Price Rule (active, effective date check)
  const customerProductRule = await db
    .select({ marginPercent: customerProductPriceRule.marginPercent })
    .from(customerProductPriceRule)
    .where(
      and(
        eq(customerProductPriceRule.customerId, customerId),
        eq(customerProductPriceRule.productId, productId),
        eq(customerProductPriceRule.status, "active"),
        lte(customerProductPriceRule.effectiveFromDate, documentDate)
      )
    )
    .orderBy(desc(customerProductPriceRule.effectiveFromDate))
    .limit(1);

  if (customerProductRule.length > 0 && customerProductRule[0].marginPercent !== null) {
    return {
      margin: parseFloat(customerProductRule[0].marginPercent),
      source: 'customer_product',
    };
  }

  // Fallback: Check legacy customerProductMargins table for backwards compatibility
  const legacyMargin = await db
    .select({ marginPercent: customerProductMargins.marginPercent })
    .from(customerProductMargins)
    .where(
      and(
        eq(customerProductMargins.customerId, customerId),
        eq(customerProductMargins.productId, productId)
      )
    )
    .limit(1);

  if (legacyMargin.length > 0 && legacyMargin[0].marginPercent !== null) {
    return {
      margin: parseFloat(legacyMargin[0].marginPercent),
      source: 'customer_product',
    };
  }

  // Priority 2: Customer Price Rule (active, effective date check)
  const customerRule = await db
    .select({ marginPercent: customerPriceRule.marginPercent })
    .from(customerPriceRule)
    .where(
      and(
        eq(customerPriceRule.customerId, customerId),
        eq(customerPriceRule.status, "active"),
        lte(customerPriceRule.effectiveFromDate, documentDate)
      )
    )
    .orderBy(desc(customerPriceRule.effectiveFromDate))
    .limit(1);

  if (customerRule.length > 0 && customerRule[0].marginPercent !== null) {
    return {
      margin: parseFloat(customerRule[0].marginPercent),
      source: 'customer_default',
    };
  }

  // Fallback: Check legacy customer default margin
  const customer = await db
    .select({ defaultMarginPercent: customers.defaultMarginPercent })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (customer.length > 0 && customer[0].defaultMarginPercent !== null) {
    return {
      margin: parseFloat(customer[0].defaultMarginPercent),
      source: 'customer_default',
    };
  }

  // Priority 3: Product Price Rule (active)
  const productRule = await db
    .select({ marginPercent: productPriceRule.marginPercent })
    .from(productPriceRule)
    .where(
      and(
        eq(productPriceRule.productId, productId),
        eq(productPriceRule.status, "active")
      )
    )
    .limit(1);

  if (productRule.length > 0 && productRule[0].marginPercent !== null) {
    return {
      margin: parseFloat(productRule[0].marginPercent),
      source: 'product_default',
    };
  }

  // Fallback: Check legacy product margin
  const product = await db
    .select({ marginPerCarton: products.marginPerCarton })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (product.length > 0 && product[0].marginPerCarton !== null) {
    return {
      margin: parseFloat(product[0].marginPerCarton),
      source: 'product_default',
    };
  }

  // Priority 4: Global Price Rule (enabled)
  const globalRule = await db
    .select({ 
      enableAutoPriceRule: globalPriceRule.enableAutoPriceRule,
      defaultMarginPercent: globalPriceRule.defaultMarginPercent 
    })
    .from(globalPriceRule)
    .limit(1);

  if (globalRule.length > 0 && 
      globalRule[0].enableAutoPriceRule && 
      globalRule[0].defaultMarginPercent !== null) {
    return {
      margin: parseFloat(globalRule[0].defaultMarginPercent),
      source: 'global_default',
    };
  }

  // Legacy fallback: Check system settings
  const globalSetting = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'global_default_margin'))
    .limit(1);

  if (globalSetting.length > 0 && globalSetting[0].value !== null) {
    const globalMargin = globalSetting[0].value as { percent: number };
    if (typeof globalMargin.percent === 'number') {
      return {
        margin: globalMargin.percent,
        source: 'global_default',
      };
    }
  }

  // Fallback: Use hardcoded default
  return {
    margin: FALLBACK_GLOBAL_MARGIN,
    source: 'fallback',
  };
}

/**
 * Main pricing function - calculates sales price for a product based on customer and date
 * 
 * USAGE:
 * - Call when adding a product to a Sales Order or Sales Invoice
 * - Pass the document date to ensure proper price lookup
 * - Returns calculated price that can be manually overridden if needed
 * 
 * FORMULA:
 * sales_price = latest_purchase_price × (1 + margin_percentage / 100)
 * 
 * @param productId - The product ID
 * @param customerId - The customer ID
 * @param documentDate - The order/invoice date for price lookup
 * @returns PriceCalculationResult with calculated price and margin details
 */
export async function getSalesPrice(
  productId: string,
  customerId: string,
  documentDate: Date
): Promise<PriceCalculationResult> {
  // Get latest purchase price on or before the document date
  const purchaseInfo = await getLatestPurchasePrice(productId, documentDate);

  // Get the margin percentage using priority rules (with effective date filtering)
  const marginInfo = await getMarginPercent(customerId, productId, documentDate);

  // If no purchase price found, try to use product's base price as fallback
  if (!purchaseInfo) {
    const product = await db
      .select({ basePrice: products.basePrice, salesPrice: products.salesPrice })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length > 0) {
      // Use existing sales price if available, otherwise calculate from base price
      const basePrice = parseFloat(product[0].basePrice);
      const existingSalesPrice = product[0].salesPrice ? parseFloat(product[0].salesPrice) : null;
      
      // Calculate price using margin on base price if no sales price exists
      const calculatedPrice = existingSalesPrice || basePrice * (1 + marginInfo.margin / 100);
      
      return {
        salesPrice: Math.round(calculatedPrice * 100) / 100,
        latestPurchasePrice: null,
        latestPurchaseDate: null,
        marginPercent: marginInfo.margin,
        marginSource: marginInfo.source,
        message: 'No purchase history found. Using product base/sales price.',
      };
    }

    // No product found - return zero
    return {
      salesPrice: 0,
      latestPurchasePrice: null,
      latestPurchaseDate: null,
      marginPercent: marginInfo.margin,
      marginSource: marginInfo.source,
      message: 'Product not found.',
    };
  }

  // Calculate sales price: purchase_price × (1 + margin / 100)
  const salesPrice = purchaseInfo.price * (1 + marginInfo.margin / 100);

  return {
    salesPrice: Math.round(salesPrice * 100) / 100,
    latestPurchasePrice: purchaseInfo.price,
    latestPurchaseDate: purchaseInfo.purchaseDate,
    marginPercent: marginInfo.margin,
    marginSource: marginInfo.source,
  };
}

/**
 * Batch get sales prices for multiple products
 * Useful when loading all products for a specific customer
 * 
 * @param productIds - Array of product IDs
 * @param customerId - The customer ID
 * @param documentDate - The document date
 * @returns Map of productId to PriceCalculationResult
 */
export async function getBatchSalesPrices(
  productIds: string[],
  customerId: string,
  documentDate: Date
): Promise<Map<string, PriceCalculationResult>> {
  const results = new Map<string, PriceCalculationResult>();
  
  // Process in parallel for efficiency
  await Promise.all(
    productIds.map(async (productId) => {
      const result = await getSalesPrice(productId, customerId, documentDate);
      results.set(productId, result);
    })
  );

  return results;
}

/**
 * Set or update global default margin
 * 
 * @param marginPercent - The global margin percentage
 */
export async function setGlobalDefaultMargin(marginPercent: number): Promise<void> {
  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'global_default_margin'))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(systemSettings)
      .set({ 
        value: { percent: marginPercent },
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, 'global_default_margin'));
  } else {
    await db.insert(systemSettings).values({
      key: 'global_default_margin',
      value: { percent: marginPercent },
    });
  }
}

/**
 * Get global default margin
 * 
 * @returns The global margin percentage or fallback default
 */
export async function getGlobalDefaultMargin(): Promise<number> {
  const setting = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'global_default_margin'))
    .limit(1);

  if (setting.length > 0 && setting[0].value !== null) {
    const value = setting[0].value as { percent: number };
    if (typeof value.percent === 'number') {
      return value.percent;
    }
  }

  return FALLBACK_GLOBAL_MARGIN;
}
