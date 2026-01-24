/**
 * QuickBooks-Aligned Sales Tax Calculation Service
 * 
 * This service calculates sales tax exactly as QuickBooks does to ensure
 * zero mismatch when syncing invoices to QuickBooks Online.
 * 
 * QB Tax Resolution Priority:
 * 1. If customer is tax_exempt → use NON taxable tax code
 * 2. If customer has override_tax_code_id → use it
 * 3. Else if product has tax_code_id → use it
 * 4. Else use company default tax code
 */

import { storage } from "../storage";
import type {
  TaxCode,
  TaxRate,
  TaxAgency,
  CustomerTaxSettings,
  ProductTaxCode,
  InvoiceTaxDetail,
} from "@shared/schema";

// QB-aligned tax calculation result
export interface TaxCalculationResult {
  qbTaxCodeId: string | null;
  taxCodeId: string;
  taxCodeName: string;
  isTaxable: boolean;
  appliedTaxRates: {
    taxRateId: string;
    taxName: string;
    percentage: string;
    amount: string;
    taxAgencyId?: string;
  }[];
  taxPercentageTotal: string;
  taxAmount: string;
  taxableAmount: string;
}

// Input for single line item tax calculation
export interface TaxCalculationInput {
  productId: string;
  customerId: string;
  invoiceDate: Date;
  taxableAmount: number;
  state?: string;
  userId: string;
}

// Batch calculation input
export interface BatchTaxCalculationInput {
  customerId: string;
  invoiceDate: Date;
  state?: string;
  userId: string;
  lineItems: {
    productId: string;
    taxableAmount: number;
  }[];
}

// Invoice tax summary
export interface InvoiceTaxSummary {
  lineItemTaxes: TaxCalculationResult[];
  totalTaxAmount: string;
  totalTaxableAmount: string;
  isFullyTaxExempt: boolean;
}

/**
 * QuickBooks-style banker's rounding (round half to even)
 * This matches QB's rounding behavior for tax calculations
 */
function qbRound(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  const shifted = value * multiplier;
  const floor = Math.floor(shifted);
  const diff = shifted - floor;
  
  if (diff < 0.5) {
    return floor / multiplier;
  } else if (diff > 0.5) {
    return (floor + 1) / multiplier;
  } else {
    // Round half to even (banker's rounding)
    if (floor % 2 === 0) {
      return floor / multiplier;
    } else {
      return (floor + 1) / multiplier;
    }
  }
}

/**
 * Get the applicable tax code for a transaction line
 * Follows QB tax resolution priority
 * QB Alignment: Only returns active tax codes to prevent sync issues
 */
async function resolveTaxCode(
  customerId: string,
  productId: string,
  userId: string
): Promise<TaxCode | null> {
  // 1. Check customer tax settings
  const customerSettings = await storage.getCustomerTaxSettings(customerId);
  
  if (customerSettings) {
    // If customer is tax exempt, return the NON taxable tax code
    if (customerSettings.isTaxExempt) {
      const nonTaxable = await storage.getNonTaxableTaxCode(userId);
      return nonTaxable || null;
    }
    
    // If customer has override tax code, use it (only if active)
    if (customerSettings.overrideTaxCodeId) {
      const overrideCode = await storage.getTaxCode(customerSettings.overrideTaxCodeId);
      if (overrideCode && overrideCode.status === "active") return overrideCode;
    }
  }
  
  // 2. Check product tax code mapping (only if active)
  const productTaxCode = await storage.getProductTaxCode(productId);
  if (productTaxCode) {
    const productCode = await storage.getTaxCode(productTaxCode.taxCodeId);
    if (productCode && productCode.status === "active") return productCode;
  }
  
  // 3. Fall back to company default tax code (already checks active in storage)
  const defaultCode = await storage.getDefaultTaxCode(userId);
  return defaultCode || null;
}

/**
 * Get active tax rates for a tax code on a specific date
 * Respects effective date ranges for accurate historical tax calculation
 */
async function getActiveTaxRatesForCode(
  taxCodeId: string,
  invoiceDate: Date,
  userId: string
): Promise<(TaxRate & { displayOrder: number })[]> {
  const taxCodeRates = await storage.getTaxCodeRatesWithDetails(taxCodeId);
  const activeRates: (TaxRate & { displayOrder: number })[] = [];
  
  for (const tcr of taxCodeRates) {
    const rate = tcr.taxRate;
    
    // Check if rate is active on the invoice date
    const effectiveFrom = new Date(rate.effectiveFromDate);
    const effectiveTo = rate.effectiveToDate ? new Date(rate.effectiveToDate) : null;
    
    if (invoiceDate >= effectiveFrom && (!effectiveTo || invoiceDate <= effectiveTo)) {
      if (rate.status === "active") {
        activeRates.push({ ...rate, displayOrder: tcr.displayOrder || 0 });
      }
    }
  }
  
  // Sort by display order
  return activeRates.sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Main tax calculation function - QuickBooks aligned
 * 
 * @param input - Tax calculation parameters
 * @returns TaxCalculationResult matching QB format
 */
export async function getQuickBooksSalesTax(
  input: TaxCalculationInput
): Promise<TaxCalculationResult> {
  const { productId, customerId, invoiceDate, taxableAmount, userId } = input;
  
  // Resolve which tax code to use (QB priority logic)
  const taxCode = await resolveTaxCode(customerId, productId, userId);
  
  // If no tax code found, return zero tax (non-taxable)
  if (!taxCode) {
    return {
      qbTaxCodeId: null,
      taxCodeId: "",
      taxCodeName: "No Tax",
      isTaxable: false,
      appliedTaxRates: [],
      taxPercentageTotal: "0.0000",
      taxAmount: "0.00",
      taxableAmount: taxableAmount.toFixed(2),
    };
  }
  
  // If tax code is not taxable, return zero tax
  if (!taxCode.isTaxable) {
    return {
      qbTaxCodeId: taxCode.qbTaxCodeId || null,
      taxCodeId: taxCode.id,
      taxCodeName: taxCode.taxCodeName,
      isTaxable: false,
      appliedTaxRates: [],
      taxPercentageTotal: "0.0000",
      taxAmount: "0.00",
      taxableAmount: taxableAmount.toFixed(2),
    };
  }
  
  // Get active tax rates for this tax code on the invoice date
  const activeRates = await getActiveTaxRatesForCode(taxCode.id, invoiceDate, userId);
  
  // Calculate tax using QB-style line-item tax calculation
  let totalTaxPercentage = 0;
  let totalTaxAmount = 0;
  const appliedTaxRates: TaxCalculationResult["appliedTaxRates"] = [];
  
  for (const rate of activeRates) {
    const percentage = parseFloat(rate.taxPercentage);
    const taxAmount = qbRound((taxableAmount * percentage) / 100, 2);
    
    totalTaxPercentage += percentage;
    totalTaxAmount += taxAmount;
    
    appliedTaxRates.push({
      taxRateId: rate.id,
      taxName: rate.taxName,
      percentage: percentage.toFixed(4),
      amount: taxAmount.toFixed(2),
      taxAgencyId: rate.taxAgencyId || undefined,
    });
  }
  
  return {
    qbTaxCodeId: taxCode.qbTaxCodeId || null,
    taxCodeId: taxCode.id,
    taxCodeName: taxCode.taxCodeName,
    isTaxable: true,
    appliedTaxRates,
    taxPercentageTotal: totalTaxPercentage.toFixed(4),
    taxAmount: totalTaxAmount.toFixed(2),
    taxableAmount: taxableAmount.toFixed(2),
  };
}

/**
 * Calculate tax for multiple line items in an invoice
 * Returns individual line taxes and total summary
 */
export async function calculateInvoiceTax(
  input: BatchTaxCalculationInput
): Promise<InvoiceTaxSummary> {
  const { customerId, invoiceDate, userId, lineItems } = input;
  
  const lineItemTaxes: TaxCalculationResult[] = [];
  let totalTaxAmount = 0;
  let totalTaxableAmount = 0;
  let allExempt = true;
  
  for (const item of lineItems) {
    const taxResult = await getQuickBooksSalesTax({
      productId: item.productId,
      customerId,
      invoiceDate,
      taxableAmount: item.taxableAmount,
      userId,
    });
    
    lineItemTaxes.push(taxResult);
    totalTaxAmount += parseFloat(taxResult.taxAmount);
    totalTaxableAmount += parseFloat(taxResult.taxableAmount);
    
    if (taxResult.isTaxable) {
      allExempt = false;
    }
  }
  
  return {
    lineItemTaxes,
    totalTaxAmount: totalTaxAmount.toFixed(2),
    totalTaxableAmount: totalTaxableAmount.toFixed(2),
    isFullyTaxExempt: allExempt,
  };
}

/**
 * Validate tax configuration before QB sync
 * Returns list of missing/invalid tax configurations
 */
export async function validateTaxConfigForSync(
  invoiceId: string,
  userId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  // Check if default tax code exists
  const defaultCode = await storage.getDefaultTaxCode(userId);
  if (!defaultCode) {
    errors.push("No default tax code configured. Please set a default tax code in Tax Settings.");
  }
  
  // Check if NON taxable code exists (for exempt customers)
  const nonTaxable = await storage.getNonTaxableTaxCode(userId);
  if (!nonTaxable) {
    errors.push("No NON-taxable tax code configured. Please create a tax code with isTaxable=false.");
  }
  
  // Get invoice tax details and verify they have QB IDs
  const taxDetails = await storage.getInvoiceTaxDetails(invoiceId);
  for (const detail of taxDetails) {
    const taxCode = await storage.getTaxCode(detail.taxCodeId);
    if (taxCode && !taxCode.qbTaxCodeId) {
      errors.push(`Tax code "${taxCode.taxCodeName}" is not linked to QuickBooks. Please sync tax codes first.`);
      break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Store calculated tax details for an invoice
 * Call this after calculating taxes to persist for QB sync
 */
export async function storeInvoiceTaxDetails(
  invoiceId: string,
  lineItemId: string | null,
  taxResult: TaxCalculationResult
): Promise<InvoiceTaxDetail> {
  return await storage.createInvoiceTaxDetail({
    invoiceId,
    lineItemId,
    taxCodeId: taxResult.taxCodeId,
    taxableAmount: taxResult.taxableAmount,
    taxAmount: taxResult.taxAmount,
    taxPercentageTotal: taxResult.taxPercentageTotal,
    appliedTaxRates: taxResult.appliedTaxRates,
  });
}

/**
 * Clear and recalculate all tax details for an invoice
 */
export async function recalculateInvoiceTaxDetails(
  invoiceId: string,
  customerId: string,
  invoiceDate: Date,
  lineItems: { id: string; productId: string; lineTotal: number }[],
  userId: string
): Promise<InvoiceTaxSummary> {
  // Clear existing tax details
  await storage.deleteInvoiceTaxDetailsByInvoiceId(invoiceId);
  
  // Calculate and store new tax details
  const results: TaxCalculationResult[] = [];
  
  for (const item of lineItems) {
    const taxResult = await getQuickBooksSalesTax({
      productId: item.productId,
      customerId,
      invoiceDate,
      taxableAmount: item.lineTotal,
      userId,
    });
    
    await storeInvoiceTaxDetails(invoiceId, item.id, taxResult);
    results.push(taxResult);
  }
  
  // Calculate summary
  let totalTax = 0;
  let totalTaxable = 0;
  let allExempt = true;
  
  for (const r of results) {
    totalTax += parseFloat(r.taxAmount);
    totalTaxable += parseFloat(r.taxableAmount);
    if (r.isTaxable) allExempt = false;
  }
  
  return {
    lineItemTaxes: results,
    totalTaxAmount: totalTax.toFixed(2),
    totalTaxableAmount: totalTaxable.toFixed(2),
    isFullyTaxExempt: allExempt,
  };
}
