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
  unitPrice: number;
  lineTotal: number;
  category: string;
  isSchemeDescription?: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  purchaseOrder?: string;
  notes?: string;
  subtotal: string;
  freight: string;
  discount: string;
  total: string;
}

interface Customer {
  id: string;
  name: string;
  address: any;
}

export default function PurchaseOrderView() {
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

  const vendor = customers?.find((c) => c.id === order?.customerId);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "po-view-print-styles";
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
        .po-page { box-shadow: none; border: none; margin: 0 !important; padding: 0 !important; width: 100%; min-height: auto; background: white !important; }
        .po-table { margin: 0 !important; padding: 0 !important; }
        .page-break { page-break-after: always; }
        .print-hide { display: none !important; }
        .print-hide-content { display: none !important; }

        .category-header {
          background-color: #f9f9f9 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .po-table th {
          background-color: #f5f5f5 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }

      .po-page {
        background: white;
        padding: 20px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        max-width: 210mm;
        margin: 0 auto;
        position: relative;
      }

      .po-header {
        text-align: center;
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 20px;
      }

      .po-info-grid {
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

      .po-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 13px;
        border: 1px solid #ddd;
      }

      .po-table th {
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

      .po-table td {
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

      .totals-section {
        margin-top: 12px;
        font-size: 13px;
      }

      .totals-row {
        display: flex;
        justify-content: flex-end;
        padding: 3px 0;
      }

      .totals-label {
        width: 120px;
        text-align: right;
        padding-right: 15px;
      }

      .totals-value {
        width: 100px;
        text-align: right;
      }

      .totals-grand {
        font-weight: 700;
        font-size: 14px;
        border-top: 2px solid #333;
        padding-top: 5px;
        margin-top: 3px;
      }

      .totals-cartons-row {
        display: flex;
        justify-content: flex-start;
        padding: 3px 0;
        font-weight: 700;
        font-size: 13px;
      }

      .letter-footer {
        text-align: center;
        font-size: 16px;
        margin-top: 30px;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("po-view-print-styles");
      if (el) document.head.removeChild(el);
    };
  }, []);

  const handlePrint = () => window.print();

  if (!order || !lineItems) {
    return <div>Loading...</div>;
  }

  const filteredLineItems = lineItems.filter(
    (item) => !item.isSchemeDescription,
  );

  const groupedItems: { [category: string]: OrderLineItem[] } = {};
  let totalCartons = 0;

  filteredLineItems.forEach((item: OrderLineItem) => {
    const category = item.category || "Uncategorized";
    if (!groupedItems[category]) {
      groupedItems[category] = [];
    }
    groupedItems[category].push(item);
    totalCartons += parseFloat(String(item.quantity || 0));
  });

  const vendorAddress =
    typeof vendor?.address === "string"
      ? JSON.parse(vendor.address)
      : vendor?.address;

  Object.keys(groupedItems).forEach((cat) => {
    groupedItems[cat].sort((a, b) => {
      const nameA = (a.description || "").toLowerCase();
      const nameB = (b.description || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  const sortedCategories = Object.keys(groupedItems).sort((a, b) =>
    a.localeCompare(b),
  );

  type PORow =
    | { type: "category"; category: string }
    | { type: "item"; item: OrderLineItem; srNo: number };
  const allRows: PORow[] = [];
  let serialNumber = 1;

  sortedCategories.forEach((category) => {
    const items = groupedItems[category];
    allRows.push({ type: "category", category });
    items.forEach((item) => {
      allRows.push({ type: "item", item, srNo: serialNumber++ });
    });
  });

  const ROWS_PER_PAGE = 22;
  const MAX_ROWS_SINGLE_PAGE = 22;
  const totalRows = allRows.length;

  const pages: {
    rows: PORow[];
    emptyCount: number;
    showSummary: boolean;
  }[] = [];

  if (totalRows <= MAX_ROWS_SINGLE_PAGE) {
    pages.push({ rows: allRows, emptyCount: 0, showSummary: true });
  } else {
    let currentIndex = 0;
    let currentCategory: string | null = null;

    while (currentIndex < totalRows) {
      let pageEndIndex = Math.min(currentIndex + ROWS_PER_PAGE, totalRows);
      let pageRows: PORow[] = [];

      if (
        pageEndIndex < totalRows &&
        allRows[pageEndIndex - 1].type === "category"
      ) {
        pageEndIndex--;
      }

      const slicedRows = allRows.slice(currentIndex, pageEndIndex);

      if (
        slicedRows.length > 0 &&
        slicedRows[0].type === "item" &&
        currentCategory
      ) {
        pageRows.push({ type: "category", category: currentCategory });
      }

      pageRows.push(...slicedRows);

      for (let i = pageRows.length - 1; i >= 0; i--) {
        const row = pageRows[i];
        if (row.type === "category") {
          currentCategory = row.category;
          break;
        }
      }

      const isLastPage = pageEndIndex >= totalRows;

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

  if (pages.length === 0) {
    pages.push({ rows: [], emptyCount: 0, showSummary: true });
  }

  const formatCurrency = (val: number) =>
    `$${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const subtotal = parseFloat(order.subtotal) || 0;
  const freight = parseFloat(order.freight) || 0;
  const discount = parseFloat(order.discount) || 0;
  const total = parseFloat(order.total) || 0;

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6 print-hide">
        <Link href="/orders">
          <Button variant="outline" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="h-4 w-4 mr-2" />
          Print Purchase Order
        </Button>
      </div>

      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className={`po-page ${
            pageIndex < pages.length - 1 ? "page-break" : ""
          }`}
        >
          <div className="po-header">PURCHASE ORDER</div>

          <div className="po-info-grid">
            <div className="info-section">
              <div className="info-label">VENDOR:</div>
              <div className="info-company">
                {vendor?.name || "—"}
              </div>
              {vendorAddress && (
                <>
                  {vendorAddress.street && (
                    <div className="info-detail">{vendorAddress.street}</div>
                  )}
                  {vendorAddress.city && (
                    <div className="info-detail">
                      {vendorAddress.city}
                      {vendorAddress.state ? `, ${vendorAddress.state}` : ""}{" "}
                      {vendorAddress.zipCode || ""}
                    </div>
                  )}
                  {vendorAddress.country && (
                    <div className="info-detail">{vendorAddress.country}</div>
                  )}
                </>
              )}
            </div>

            <div className="info-section">
              <div className="info-label">SHIP TO:</div>
              <div className="info-company">Pinaka Foods, Inc.</div>
              <div className="info-detail">140 Ethel Road West, Unit # H,</div>
              <div className="info-detail">Piscataway, NJ 08854</div>
              <div className="info-detail">USA</div>
            </div>

            <div className="info-section">
              <div className="info-detail">
                <strong>PO No.</strong> : {order.orderNumber}
              </div>
              <div className="info-detail">
                <strong>PO Date</strong> :{" "}
                {order.orderDate
                  ? formatDateWithoutTimezone(order.orderDate)
                  : "—"}
              </div>
              {order.purchaseOrder && (
                <div className="info-detail">
                  <strong>Reference</strong> : {order.purchaseOrder}
                </div>
              )}
            </div>
          </div>

          <table className="po-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>Sr No.</th>
                <th style={{ width: "12%" }}>Item Code</th>
                <th style={{ width: "35%" }}>Product Description</th>
                <th style={{ width: "13%" }}>Packing Size</th>
                <th style={{ width: "10%", textAlign: "center" }}>Qty</th>
                <th style={{ width: "12%", textAlign: "right" }}>Unit Price</th>
                <th style={{ width: "12%", textAlign: "right" }}>Amount</th>
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
                      <td colSpan={7} className="category-header">
                        {row.category}
                      </td>
                    </tr>
                  );
                } else {
                  const unitPrice = parseFloat(String(row.item.unitPrice)) || 0;
                  const lineTotal = parseFloat(String(row.item.lineTotal)) || 0;
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
                      <td style={{ textAlign: "right" }}>
                        {formatCurrency(unitPrice)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>

          {page.showSummary && (
            <div className="totals-section">
              <div className="totals-cartons-row">
                Total Cartons: {totalCartons}
              </div>
              <div className="totals-row">
                <div className="totals-label">Subtotal:</div>
                <div className="totals-value">{formatCurrency(subtotal)}</div>
              </div>
              {freight > 0 && (
                <div className="totals-row">
                  <div className="totals-label">Freight:</div>
                  <div className="totals-value">{formatCurrency(freight)}</div>
                </div>
              )}
              {discount > 0 && (
                <div className="totals-row">
                  <div className="totals-label">Discount:</div>
                  <div className="totals-value">-{formatCurrency(discount)}</div>
                </div>
              )}
              <div className="totals-row totals-grand">
                <div className="totals-label">Total Amount:</div>
                <div className="totals-value">{formatCurrency(total)}</div>
              </div>
            </div>
          )}

          {order.notes && page.showSummary && (
            <div style={{ marginTop: "15px", fontSize: "12px", color: "#666" }}>
              <strong>Notes:</strong> {order.notes}
            </div>
          )}

          <div className="letter-footer print-hide-content">
            <strong>Letter Head Footer</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
