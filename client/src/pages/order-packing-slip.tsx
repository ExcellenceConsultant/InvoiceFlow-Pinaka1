import { Button } from "@/components/ui/button";
import { formatDateWithoutTimezone } from "@/lib/dateUtils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "wouter";

interface OrderLineItem {
  id: string;
  productCode: string;
  packingSize: string;
  description: string;
  quantity: number;
  category: string;
  netWeightKgs: number;
  grossWeightKgs: number;
  isSchemeDescription?: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  purchaseOrder?: string;
  notes?: string;
}

interface Customer {
  id: string;
  name: string;
  address: any;
}

export default function OrderPackingSlip() {
  const { id } = useParams<{ id: string }>();

  const { data: order } = useQuery<Order>({
    queryKey: [`/api/orders/${id}`],
    enabled: !!id,
  });

  const { data: lineItems } = useQuery<OrderLineItem[]>({
    queryKey: [`/api/orders/${id}/line-items`],
    enabled: !!id,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: !!order,
  });

  const customer = customers?.find((c) => c.id === order?.customerId);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "packing-slip-print-styles";
    style.textContent = `
      @media print {
        @page { 
          size: A4; 
          margin: 10mm 10mm 10mm 10mm;
          background: white;
        }
        body { margin: 0; padding: 0; background: white !important; }
        html { background: white !important; }
        * { box-shadow: none !important; background-color: inherit; }
        .container { background: white !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
        .packing-list-page { box-shadow: none; border: none; margin: 0 !important; padding: 0 !important; width: 100%; min-height: auto; background: white !important; }
        .packing-table { margin: 0 !important; padding: 0 !important; }
        .page-break { page-break-after: always; }
        .print-hide { display: none !important; }
        .print-hide-content { display: none !important; }

        .category-header {
          background-color: #f9f9f9 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .packing-table th {
          background-color: #f5f5f5 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }

      .packing-list-page {
        background: white;
        padding: 20px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        max-width: 210mm;
        margin: 0 auto;
        position: relative;
      }

      .invoice-header {
        text-align: center;
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 20px;
      }

      .invoice-info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
        font-size: 13px;
      }

      .info-section {
        line-height: 1.6;
      }

      .info-label {
        font-weight: bold;
        text-transform: uppercase;
        margin-bottom: 5px;
        font-size: 13px;
        color: #333;
      }

      .info-company {
        font-weight: 600;
        margin-bottom: 2px;
      }

      .info-detail {
        color: #555;
        margin: 1px 0;
      }

      .packing-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 13px;
        border: 1px solid #ddd;
      }

      .packing-table th {
        background-color: #f5f5f5;
        padding: 8px 6px;
        text-align: left;
        font-weight: 600;
        border-top: 1px solid #ddd;
        border-bottom: 1px solid #ddd;
        border-left: none;
        border-right: none;
        font-size: 13px;
      }

      .packing-table td {
        padding: 6px;
        border-top: 1px solid #ddd;
        border-bottom: 1px solid #ddd;
        border-left: none;
        border-right: none;
        vertical-align: top;
      }

      .category-header {
        background-color: #f9f9f9;
        font-weight: 600;
        text-align: center;
        padding: 6px;
        border-top: 1px solid #ddd;
        border-bottom: 1px solid #ddd;
        border-left: none;
        border-right: none;
      }

      .totals-row { 
        font-weight: 600; 
        margin-top: 12px; 
      }

      .letter-head {
        text-align: center;
        font-size: 16px;
        margin-bottom: 20px;
      }

      .letter-footer {
        text-align: center;
        font-size: 16px;
        margin-top: 30px;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("packing-slip-print-styles");
      if (el) document.head.removeChild(el);
    };
  }, []);

  const handlePrint = () => window.print();

  if (!order || !lineItems) {
    return <div>Loading...</div>;
  }

  // Filter out scheme description items - they are only for invoice format, not packing list
  const filteredLineItems = lineItems.filter(
    (item) => !item.isSchemeDescription,
  );

  // Group line items by category
  const groupedItems: { [category: string]: OrderLineItem[] } = {};
  let totalCartons = 0;

  filteredLineItems.forEach((item: OrderLineItem) => {
    const category = item.category || "Uncategorized";
    if (!groupedItems[category]) {
      groupedItems[category] = [];
    }
    groupedItems[category].push(item);
    totalCartons += item.quantity;
  });

  // Parse customer address
  const customerAddress =
    typeof customer?.address === "string"
      ? JSON.parse(customer.address)
      : customer?.address;

  // Sort items alphabetically within each category
  Object.keys(groupedItems).forEach((cat) => {
    groupedItems[cat].sort((a, b) => {
      const nameA = (a.description || "").toLowerCase();
      const nameB = (b.description || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  // Define category order: Frozen Bulk first, Frozen Vegetable second, Frozen Fruit last
  const categoryOrder = ["Frozen Bulk", "Frozen Vegetable", "Frozen Fruit"];

  // Sort categories based on the defined order
  const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);

    // If both categories are in the order array, sort by their index
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only A is in the order array, it comes first
    if (indexA !== -1) return -1;
    // If only B is in the order array, it comes first
    if (indexB !== -1) return 1;
    // If neither is in the order array, sort alphabetically
    return a.localeCompare(b);
  });

  // Build flat list of rows (category + items)
  type PackingRow =
    | { type: "category"; category: string }
    | { type: "item"; item: OrderLineItem; srNo: number };
  const allRows: PackingRow[] = [];
  let serialNumber = 1;

  sortedCategories.forEach((category) => {
    const items = groupedItems[category];
    allRows.push({ type: "category", category });
    items.forEach((item) => {
      allRows.push({ type: "item", item, srNo: serialNumber++ });
    });
  });

  // Dynamic Pagination: Optimized for A4 with 10mm margins
  // Set rows per page to 25 for optimal viewing and printing (prevents overflow)
  const ROWS_PER_PAGE = 25;
  const MAX_ROWS_SINGLE_PAGE = 25; // Max rows that fit on one page with summary
  const totalRows = allRows.length;

  const pages: {
    rows: PackingRow[];
    emptyCount: number;
    showSummary: boolean;
  }[] = [];

  // If total rows fit on one page with summary, create single page
  if (totalRows <= MAX_ROWS_SINGLE_PAGE) {
    pages.push({ rows: allRows, emptyCount: 0, showSummary: true });
  } else {
    // Smart pagination: keep category headers with their items across pages
    let currentIndex = 0;
    let currentCategory: string | null = null;

    while (currentIndex < totalRows) {
      let pageEndIndex = Math.min(currentIndex + ROWS_PER_PAGE, totalRows);
      let pageRows: PackingRow[] = [];

      // Check if the last row on this page would be a category header
      // If so, move it to the next page to keep it with its items
      if (
        pageEndIndex < totalRows &&
        allRows[pageEndIndex - 1].type === "category"
      ) {
        pageEndIndex--;
      }

      // Get the slice for this page
      const slicedRows = allRows.slice(currentIndex, pageEndIndex);

      // Check if we're starting mid-category (first row is an item, not a category)
      if (
        slicedRows.length > 0 &&
        slicedRows[0].type === "item" &&
        currentCategory
      ) {
        // Prepend the current category header to maintain context
        pageRows.push({ type: "category", category: currentCategory });
      }

      // Add all rows from the slice
      pageRows.push(...slicedRows);

      // Update current category by finding the last category header on this page
      for (let i = pageRows.length - 1; i >= 0; i--) {
        const row = pageRows[i];
        if (row.type === "category") {
          currentCategory = row.category;
          break;
        }
      }

      const isLastPage = pageEndIndex >= totalRows;

      // Only add page if it has rows
      if (pageRows.length > 0) {
        pages.push({
          rows: pageRows,
          emptyCount: 0,
          showSummary: isLastPage,
        });
      }

      currentIndex = pageEndIndex;
    }
  }

  // Ensure we always have at least one page
  if (pages.length === 0) {
    pages.push({ rows: [], emptyCount: 0, showSummary: true });
  }

  return (
    <div className="container max-w-6xl mx-auto p-6">
      {/* Header with Back and Print buttons */}
      <div className="flex items-center justify-between mb-6 print-hide">
        <Link href="/orders">
          <Button variant="outline" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="h-4 w-4 mr-2" />
          Print Packing Slip
        </Button>
      </div>

      {/* Packing List Content - Multiple Pages */}
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className={`packing-list-page ${
            pageIndex < pages.length - 1 ? "page-break" : ""
          }`}
        >
          {/* Header */}
          <div className="invoice-header">PACKING SLIP</div>

          {/* Info Grid */}
          <div className="invoice-info-grid">
            {/* Billed To */}
            <div className="info-section">
              <div className="info-label">BILLED TO:</div>
              <div className="info-company">
                {customer?.name || "—"}
              </div>
              {customerAddress && (
                <>
                  {customerAddress.street && (
                    <div className="info-detail">{customerAddress.street}</div>
                  )}
                  {customerAddress.city && (
                    <div className="info-detail">
                      {customerAddress.city}
                      {customerAddress.state ? `, ${customerAddress.state}` : ""}{" "}
                      {customerAddress.zipCode || ""}
                    </div>
                  )}
                  {customerAddress.country && (
                    <div className="info-detail">{customerAddress.country}</div>
                  )}
                </>
              )}
            </div>

            {/* Ship To */}
            <div className="info-section">
              <div className="info-label">SHIP TO:</div>
              <div className="info-company">
                {customer?.name || "—"}
              </div>
              {customerAddress && (
                <>
                  {customerAddress.street && (
                    <div className="info-detail">{customerAddress.street}</div>
                  )}
                  {customerAddress.city && (
                    <div className="info-detail">
                      {customerAddress.city}
                      {customerAddress.state ? `, ${customerAddress.state}` : ""}{" "}
                      {customerAddress.zipCode || ""}
                    </div>
                  )}
                  {customerAddress.country && (
                    <div className="info-detail">{customerAddress.country}</div>
                  )}
                </>
              )}
            </div>

            {/* Order Details */}
            <div className="info-section">
              <div className="info-detail">
                <strong>Order No.</strong> : {order.orderNumber}
              </div>
              <div className="info-detail">
                <strong>Order Date</strong> :{" "}
                {order.orderDate
                  ? formatDateWithoutTimezone(order.orderDate)
                  : "—"}
              </div>
              <div className="info-detail">
                <strong>PO Reference</strong> :{" "}
                {order.purchaseOrder || "—"}
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="packing-table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>Sr No.</th>
                <th style={{ width: "15%" }}>Item Code</th>
                <th style={{ width: "45%" }}>Product Description</th>
                <th style={{ width: "17%" }}>Packing Size</th>
                <th style={{ width: "15%" }}>Quantity (Carton)</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, idx) => {
                if (row.type === "category") {
                  return (
                    <tr
                      key={`cat-${pageIndex}-${idx}`}
                      className="category-row"
                    >
                      <td colSpan={5} className="category-header">
                        {row.category}
                      </td>
                    </tr>
                  );
                } else {
                  return (
                    <tr key={`item-${pageIndex}-${idx}`}>
                      <td className="text-center">{row.srNo}</td>
                      <td>{row.item.productCode || "—"}</td>
                      <td>{row.item.description}</td>
                      <td>
                        {row.item.packingSize
                          ? row.item.packingSize.replace(/GM/g, "G")
                          : "—"}
                      </td>
                      <td className="text-center">{row.item.quantity}</td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>

          {/* Total Summary - only show on pages with showSummary */}
          {page.showSummary && (
            <div className="text-right mt-4 space-y-1">
              <div>
                <strong>Total Carton: {totalCartons}</strong>
              </div>
            </div>
          )}

          {/* Letter Head Footer - hidden during print */}
          <div className="letter-footer print-hide-content">
            <strong>Letter Head Footer</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
