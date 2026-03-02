/**
 * Unified Price Rule Service
 * 
 * Calculates sales prices based on:
 * - Latest purchase price from Bills (AP invoices)
 * - Margin percentage from unified price_rules table
 * 
 * PRICING LOGIC:
 * Step 1: Get latest purchase price from Bills. If none, use inventory base_price.
 * Step 2: Find applicable rule by priority:
 *   1. customer_product (customer_id+product_id OR customer_category+product_id)
 *   2. customer (customer_id OR customer_category)
 *   3. product (product_id)
 *   4. global
 * Step 3: If rule exists: finalPrice = baseCost × (1 + margin_percent/100)
 *         If no rule: finalPrice = inventory.sales_price
 * Round to 2 decimal places.
 */

import { db } from "./db";
import { 
  invoices, 
  invoiceLineItems, 
  customers, 
  products, 
  priceRules,
} from "@shared/schema";
import { eq, and, lte, desc, sql } from "drizzle-orm";

export interface PriceCalculationResult {
  salesPrice: number;
  latestPurchasePrice: number | null;
  latestPurchaseDate: Date | null;
  marginPercent: number;
  marginSource: 'customer_product' | 'customer' | 'product' | 'global' | 'inventory_fallback';
  ruleId?: string;
  message?: string;
}

/**
 * Get the latest purchase price for a product on or before a given date
 */
async function getLatestPurchasePrice(
  productId: string,
  documentDate: Date
): Promise<{ price: number; purchaseDate: Date } | null> {
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
        eq(invoices.invoiceType, "payable"),
        lte(invoices.invoiceDate, documentDate),
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
 * Find the applicable price rule using priority matching
 * 
 * Priority order:
 * 1. customer_product: (customer_id + product_id) OR (customer_category + product_id)
 * 2. customer: customer_id OR customer_category
 * 3. product: product_id
 * 4. global: rule_type = 'global'
 * 
 * Returns null if no rule found (will use inventory.sales_price as fallback)
 */
async function findApplicableRule(
  customerId: string,
  productId: string,
  userId?: string,
  documentDate?: Date,
): Promise<{ margin: number; source: PriceCalculationResult['marginSource']; ruleId: string } | null> {
  
  const userFilter = userId ? eq(priceRules.userId, userId) : sql`1=1`;
  const dateFilter = documentDate
    ? sql`(${priceRules.effectiveFromDate} IS NULL OR ${priceRules.effectiveFromDate} <= ${documentDate})`
    : sql`1=1`;

  const customerData = await db
    .select({ customerCategory: customers.customerCategory })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  const customerCategory = customerData.length > 0 ? customerData[0].customerCategory : null;

  const customerProductRules = await db
    .select({
      id: priceRules.id,
      marginPercent: priceRules.marginPercent,
      customerId: priceRules.customerId,
      customerCategory: priceRules.customerCategory,
    })
    .from(priceRules)
    .where(
      and(
        userFilter,
        dateFilter,
        eq(priceRules.ruleType, "customer_product"),
        eq(priceRules.isActive, true),
        eq(priceRules.productId, productId),
        sql`(${priceRules.customerId} = ${customerId} OR ${priceRules.customerCategory} = ${customerCategory || ''})`
      )
    )
    .orderBy(
      sql`CASE WHEN ${priceRules.customerId} = ${customerId} THEN 0 ELSE 1 END`,
      sql`${priceRules.effectiveFromDate} DESC NULLS LAST`,
      desc(priceRules.createdAt)
    )
    .limit(1);

  if (customerProductRules.length > 0) {
    return {
      margin: parseFloat(customerProductRules[0].marginPercent),
      source: 'customer_product',
      ruleId: customerProductRules[0].id,
    };
  }

  const customerRules = await db
    .select({
      id: priceRules.id,
      marginPercent: priceRules.marginPercent,
      customerId: priceRules.customerId,
      customerCategory: priceRules.customerCategory,
    })
    .from(priceRules)
    .where(
      and(
        userFilter,
        dateFilter,
        eq(priceRules.ruleType, "customer"),
        eq(priceRules.isActive, true),
        sql`(${priceRules.customerId} = ${customerId} OR ${priceRules.customerCategory} = ${customerCategory || ''})`
      )
    )
    .orderBy(
      sql`CASE WHEN ${priceRules.customerId} = ${customerId} THEN 0 ELSE 1 END`,
      sql`${priceRules.effectiveFromDate} DESC NULLS LAST`,
      desc(priceRules.createdAt)
    )
    .limit(1);

  if (customerRules.length > 0) {
    return {
      margin: parseFloat(customerRules[0].marginPercent),
      source: 'customer',
      ruleId: customerRules[0].id,
    };
  }

  const productRules = await db
    .select({
      id: priceRules.id,
      marginPercent: priceRules.marginPercent,
    })
    .from(priceRules)
    .where(
      and(
        userFilter,
        dateFilter,
        eq(priceRules.ruleType, "product"),
        eq(priceRules.isActive, true),
        eq(priceRules.productId, productId)
      )
    )
    .orderBy(
      sql`${priceRules.effectiveFromDate} DESC NULLS LAST`,
      desc(priceRules.createdAt)
    )
    .limit(1);

  if (productRules.length > 0) {
    return {
      margin: parseFloat(productRules[0].marginPercent),
      source: 'product',
      ruleId: productRules[0].id,
    };
  }

  const globalRules = await db
    .select({
      id: priceRules.id,
      marginPercent: priceRules.marginPercent,
    })
    .from(priceRules)
    .where(
      and(
        userFilter,
        dateFilter,
        eq(priceRules.ruleType, "global"),
        eq(priceRules.isActive, true)
      )
    )
    .orderBy(
      sql`${priceRules.effectiveFromDate} DESC NULLS LAST`,
      desc(priceRules.createdAt)
    )
    .limit(1);

  if (globalRules.length > 0) {
    return {
      margin: parseFloat(globalRules[0].marginPercent),
      source: 'global',
      ruleId: globalRules[0].id,
    };
  }

  return null;
}

/**
 * Main pricing function - calculates sales price for a product
 * 
 * Step 1: baseCost = latest purchase price from Bills, or inventory.base_price
 * Step 2: Find applicable rule by priority
 * Step 3: If rule exists: finalPrice = baseCost × (1 + margin/100)
 *         If no rule: finalPrice = inventory.sales_price
 */
export async function getSalesPrice(
  productId: string,
  customerId: string,
  documentDate: Date,
  userId?: string
): Promise<PriceCalculationResult> {
  const purchaseInfo = await getLatestPurchasePrice(productId, documentDate);
  
  const product = await db
    .select({ basePrice: products.basePrice, salesPrice: products.salesPrice })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (product.length === 0) {
    return {
      salesPrice: 0,
      latestPurchasePrice: null,
      latestPurchaseDate: null,
      marginPercent: 0,
      marginSource: 'inventory_fallback',
      message: 'Product not found.',
    };
  }

  const baseCost = purchaseInfo 
    ? purchaseInfo.price 
    : parseFloat(product[0].basePrice || "0");

  const rule = await findApplicableRule(customerId, productId, userId, documentDate);

  // Step 3: Calculate final price
  if (rule) {
    const finalPrice = baseCost * (1 + rule.margin / 100);
    return {
      salesPrice: Math.round(finalPrice * 100) / 100,
      latestPurchasePrice: purchaseInfo?.price || null,
      latestPurchaseDate: purchaseInfo?.purchaseDate || null,
      marginPercent: rule.margin,
      marginSource: rule.source,
      ruleId: rule.ruleId,
      message: purchaseInfo 
        ? undefined 
        : 'No purchase history. Using inventory base price as base cost.',
    };
  }

  // No rule found - use inventory.sales_price
  const inventorySalesPrice = parseFloat(product[0].salesPrice || "0");
  return {
    salesPrice: Math.round(inventorySalesPrice * 100) / 100,
    latestPurchasePrice: purchaseInfo?.price || null,
    latestPurchaseDate: purchaseInfo?.purchaseDate || null,
    marginPercent: 0,
    marginSource: 'inventory_fallback',
    message: 'No price rule found. Using inventory sales price.',
  };
}

/**
 * Get global default margin from the price_rules table
 */
export async function getGlobalDefaultMargin(userId?: string): Promise<number | null> {
  const conditions = [eq(priceRules.ruleType, "global"), eq(priceRules.isActive, true)];
  if (userId) conditions.push(eq(priceRules.userId, userId));
  
  const [rule] = await db
    .select()
    .from(priceRules)
    .where(and(...conditions))
    .limit(1);
  
  return rule ? parseFloat(rule.marginPercent) : null;
}

/**
 * Set global default margin in the price_rules table
 */
export async function setGlobalDefaultMargin(marginPercent: number, userId?: string): Promise<void> {
  const conditions = [eq(priceRules.ruleType, "global"), eq(priceRules.isActive, true)];
  if (userId) conditions.push(eq(priceRules.userId, userId));

  const [existing] = await db
    .select()
    .from(priceRules)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    await db
      .update(priceRules)
      .set({ marginPercent: marginPercent.toString(), updatedAt: new Date() })
      .where(eq(priceRules.id, existing.id));
  } else {
    await db.insert(priceRules).values({
      ruleType: "global",
      marginPercent: marginPercent.toString(),
      isActive: true,
      userId: userId || null,
    });
  }
}

/**
 * Batch get sales prices for multiple products
 */
export async function getBatchSalesPrices(
  productIds: string[],
  customerId: string,
  documentDate: Date,
  userId?: string
): Promise<Map<string, PriceCalculationResult>> {
  const results = new Map<string, PriceCalculationResult>();
  
  await Promise.all(
    productIds.map(async (productId) => {
      const result = await getSalesPrice(productId, customerId, documentDate, userId);
      results.set(productId, result);
    })
  );

  return results;
}
