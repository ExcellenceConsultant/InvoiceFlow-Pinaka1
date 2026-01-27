// credit-memo-view.tsx
import { Button } from "@/components/ui/button";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { formatDateUS } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/utils";
import { CreditMemo, CreditMemoLineItem } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
function toNumber(v: any) {
  const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
  return Number.isFinite(n) ? n : 0;
}
function numberToWords(num: number): string {
  if (num === 0) return "zero";
  const a = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const b = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const thousand = ["", "thousand", "million", "billion"];
  function chunk(n: number) {
    const words: string[] = [];
    if (n >= 100) {
      words.push(a[Math.floor(n / 100)], "hundred");
      n = n % 100;
    }
    if (n >= 20) {
      words.push(b[Math.floor(n / 10)]);
      if (n % 10) words.push(a[n % 10]);
    } else if (n > 0) {
      words.push(a[n]);
    }
    return words.join(" ");
  }
  let wordParts: string[] = [];
  let i = 0;
  while (num > 0) {
    const rem = num % 1000;
    if (rem) {
      wordParts.unshift(chunk(rem) + (thousand[i] ? " " + thousand[i] : ""));
    }
    num = Math.floor(num / 1000);
    i++;
  }
  return wordParts.join(" ").replace(/\s+/g, " ").trim();
}

function CreditMemoView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: creditMemo, isLoading: creditMemoLoading } =
    useQuery<CreditMemo>({
      queryKey: [`/api/credit-memos/${id}`],
      enabled: !!id,
    });

  const { data: lineItemsRaw, isLoading: lineItemsLoading } = useQuery<
    CreditMemoLineItem[]
  >({ queryKey: [`/api/credit-memos/${id}/line-items`], enabled: !!id });

  const { data: schemes } = useQuery<any[]>({
    queryKey: ["/api/schemes"],
    queryFn: async () => {
      const response = await fetch(`/api/schemes?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error("Failed to fetch schemes");
      return response.json();
    },
  });

  const isLoading = creditMemoLoading || lineItemsLoading;
  const rawLineItems = (lineItemsRaw || []).map((item) => ({
    ...item,
    quantity: toNumber((item as any).quantity),
    unitPrice: toNumber((item as any).unitPrice),
    lineTotal: toNumber((item as any).lineTotal),
    packingSize: (item as any).packingSize || "",
    productCode: (item as any).productCode || "",
    netWeightKgs: toNumber((item as any).netWeightKgs),
    grossWeightKgs: toNumber((item as any).grossWeightKgs),
    category: (item as any).category || "",
    isFreeFromScheme: (item as any).isFreeFromScheme || false,
    schemeId: (item as any).schemeId || null,
    isSchemeDescription: (item as any).isSchemeDescription || false,
    schemeDescription: (item as any).schemeDescription || "",
  }));

  // fix Uncategorized by inheriting from matching product
  for (const item of rawLineItems) {
    if (!item.category || String(item.category).trim() === "") {
      const match = rawLineItems.find(
        (other) =>
          other.productCode &&
          other.productCode === item.productCode &&
          other.category,
      );
      if (match) {
        item.category = match.category;
      }
    }
  }

  // merge duplicates (like freebies showing multiple times)
  // BUT: exclude scheme description items from merging as they need unique productId associations
  const itemMap = new Map<string, any>();
  const schemeDescriptionItems: any[] = [];

  for (const item of rawLineItems) {
    // Don't merge scheme description items - they need to maintain their productId associations
    if (item.isSchemeDescription) {
      schemeDescriptionItems.push(item);
      continue;
    }

    const key = `${item.productCode || item.description}::${item.unitPrice}`;
    if (itemMap.has(key)) {
      const acc = itemMap.get(key);
      acc.quantity = toNumber(acc.quantity) + toNumber(item.quantity);
      acc.lineTotal = toNumber(acc.lineTotal) + toNumber(item.lineTotal);
    } else {
      itemMap.set(key, { ...item });
    }
  }

  // Combine merged items with unmerged scheme descriptions
  const lineItems = [
    ...Array.from(itemMap.values()),
    ...schemeDescriptionItems,
  ];
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "credit-memo-print-styles";
    style.textContent = `
    @media print {
  @page { 
    size: A4; 
    margin: 40mm 10mm 30mm 10mm;
    background: white;
  }
  body { margin: 0; padding: 0; background: white !important; }
  html { background: white !important; }
  * { box-shadow: none !important; background-color: inherit; }
  .container { background: white !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
  .credit-memo-page { box-shadow: none; border: none; margin: 0 !important; padding: 0 !important; width: 100%; min-height: auto; background: white !important; }
  .credit-memo-header { margin: 0 !important; padding: 0 !important; margin-bottom: 5px !important; }
  .credit-memo-info-grid { margin: 0 !important; padding: 0 !important; margin-bottom: 5px !important; }
  .credit-memo-table { margin: 0 !important; padding: 0 !important; }
  .summary-section { margin: 0 !important; padding: 5px 0 !important; }
  .notes-section { margin: 0 !important; padding: 5px 0 !important; margin-bottom: 10px !important; }
  .footer-section { margin: 0 !important; padding: 0 !important; }
  .page-break { page-break-after: always; }
  .print-hide { display: none !important; }
}

.credit-memo-page {
  background: white;
  padding: 20px;
  font-family: Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  max-width: 210mm;
  margin: 0 auto;
  position: relative;
}

.credit-memo-header {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
}

.credit-memo-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
  font-size: 11px;
}

.info-section {
  line-height: 1.6;
}

.info-label {
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 5px;
  font-size: 11px;
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

.credit-memo-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 15px;
  font-size: 11px;
  border: 1px solid #ddd;
}

.credit-memo-table th {
  background-color: #f5f5f5;
  padding: 8px 6px;
  text-align: left;
  font-weight: 600;
  border-top: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  border-left: none;
  border-right: none;
  font-size: 11px;
}

.credit-memo-table td {
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

.scheme-info {
  font-size: 10px;
  color: #666;
  margin-top: 2px;
  font-style: italic;
}

.summary-section {
  display: grid;
  grid-template-columns: 74% auto;
  gap: 0;
  margin-bottom: 15px;
}

.summary-left {
  font-size: 11px;
  line-height: 1.8;
}

.summary-right {
  font-size: 11px;
  line-height: 1.8;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.summary-total {
  color: #000;
}

.notes-section {
  margin-bottom: 30px;
}

.notes-label {
  font-weight: bold;
  margin-bottom: 5px;
  font-size: 11px;
}

.notes-box {
  padding: 0;
  min-height: 40px;
  font-size: 11px;
  color: #000;
  line-height: 1.6;
}

.notes-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.notes-number {
  font-weight: bold;
  min-width: 18px;
}

.footer-section {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;
  font-size: 11px;
}

.footer-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-company {
  text-align: right;
  font-weight: 600;
}

@media print {
  .summary-total {
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .category-header {
    background-color: #f9f9f9 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .credit-memo-table th {
    background-color: #f5f5f5 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .notes-box {
    background-color: white !important;
    background: white !important;
    margin-left: 18px !important;
    border: none !important;
    padding: 0 !important;
    min-height: 0 !important;
  }

  .notes-line {
    display: flex !important;
    align-items: flex-start !important;
    gap: 8px !important;
    margin-bottom: 8px !important;
  }

  .notes-number {
    font-weight: bold !important;
    color: #000 !important;
    min-width: 18px !important;
  }
}
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("credit-memo-print-styles");
      if (el) document.head.removeChild(el);
    };
  }, []);

  if (isLoading || !creditMemo) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div>Loading credit memo...</div>
      </div>
    );
  }

  // Calculate totals
  const netAmount = lineItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
  const totalCartons = lineItems.reduce((s, it) => s + (it.quantity || 0), 0);
  const netWeightLbs = lineItems.reduce(
    (s, it) => s + (it.netWeightKgs || 0) * (it.quantity || 0),
    0,
  );
  const grossWeightLbs = lineItems.reduce(
    (s, it) => s + (it.grossWeightKgs || 0) * (it.quantity || 0),
    0,
  );
  const freight = toNumber(
    (creditMemo as any).freight || (creditMemo as any).freightAmount || 0,
  );
  const discountPercent = toNumber((creditMemo as any).discount || 0);
  const discountAmount = (netAmount * discountPercent) / 100;
  const totalCreditMemoAmount = netAmount + freight - discountAmount;

  const billAddress =
    (creditMemo as any).customer?.address || (creditMemo as any).billToAddress;
  const shipAddress = (creditMemo as any).shipToAddress || billAddress;

  const handlePrint = () => window.print();

  // Create scheme lookup map
  const schemeMap = new Map<string, string>();
  if (schemes) {
    schemes.forEach((scheme: any) => {
      schemeMap.set(scheme.id, scheme.name || "");
    });
  }

  // Separate regular items, scheme items, and scheme description items
  const regularItems = lineItems.filter(
    (item) => !item.isFreeFromScheme && !item.isSchemeDescription,
  );
  const schemeItems = lineItems.filter((item) => item.isFreeFromScheme);
  const schemeDescItems = lineItems.filter((item) => item.isSchemeDescription);

  // Build flat list of rows (category headers + items)
  const categorizedItems: { [key: string]: any[] } = {};
  regularItems.forEach((item) => {
    const cat = item.category || "Uncategorized";
    if (!categorizedItems[cat]) {
      categorizedItems[cat] = [];
    }
    categorizedItems[cat].push(item);
  });

  // Sort items alphabetically within each category
  Object.keys(categorizedItems).forEach((cat) => {
    categorizedItems[cat].sort((a, b) => {
      const nameA = (a.description || "").toLowerCase();
      const nameB = (b.description || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  // Define category order for credit memo: Frozen Vegetable first, Frozen Fruit second, Frozen Bulk third
  const categoryOrder = ["Frozen Vegetable", "Frozen Fruit", "Frozen Bulk"];

  // Sort categories based on the defined order
  const sortedCategories = Object.keys(categorizedItems).sort((a, b) => {
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

  type TableRow =
    | { type: "category"; category: string }
    | { type: "item"; item: any; srNo: number; isScheme: boolean }
    | { type: "schemeDesc"; item: any }
    | { type: "schemeName"; schemeName: string };

  // Build all rows first (category headers + items + scheme descriptions in order)
  const allRows: TableRow[] = [];
  let srCounter = 0;

  // Add regular items with their categories and scheme descriptions
  sortedCategories.forEach((category) => {
    const items = categorizedItems[category];
    allRows.push({ type: "category", category });
    items.forEach((item) => {
      srCounter++;
      allRows.push({ type: "item", item, srNo: srCounter, isScheme: false });

      // Add scheme description right after the product if it exists
      const relatedSchemeDesc = schemeDescItems.find(
        (sd) => sd.productId === item.productId,
      );
      if (relatedSchemeDesc) {
        allRows.push({ type: "schemeDesc", item: relatedSchemeDesc });
      }
    });
  });

  // Add promotional scheme items at the end if any exist (without Sr. No.)
  if (schemeItems.length > 0) {
    allRows.push({ type: "category", category: "Promotional Schemes" });
    schemeItems.forEach((item) => {
      allRows.push({ type: "item", item, srNo: 0, isScheme: true });

      // Add scheme name row below the promotional scheme item if schemeId exists
      if (item.schemeId && schemeMap.has(item.schemeId)) {
        const schemeName = schemeMap.get(item.schemeId) || "";
        allRows.push({ type: "schemeName", schemeName });
      }
    });
  }

  // Dynamic Pagination: Fit summary on same page if possible, otherwise paginate with 22 rows per page
  const ROWS_PER_PAGE = 22;
  const MAX_ROWS_WITH_SUMMARY = 12; // If <= 12 rows, fit everything on one page with summary
  const totalRows = allRows.length;

  const pages: {
    rows: TableRow[];
    emptyCount: number;
    showSummary: boolean;
  }[] = [];

  // If total rows fit on one page with summary, create single page
  if (totalRows <= MAX_ROWS_WITH_SUMMARY) {
    pages.push({ rows: allRows, emptyCount: 0, showSummary: true });
  } else {
    // Otherwise, paginate with 22 rows per page
    let currentPageRows: TableRow[] = [];
    let rowCountOnCurrentPage = 0;

    allRows.forEach((row) => {
      currentPageRows.push(row);
      rowCountOnCurrentPage++;

      // If we've reached 22 total rows, create a page
      if (rowCountOnCurrentPage === ROWS_PER_PAGE) {
        pages.push({
          rows: currentPageRows,
          emptyCount: 0,
          showSummary: false,
        });
        currentPageRows = [];
        rowCountOnCurrentPage = 0;
      }
    });

    // Add remaining items as last page with summary
    if (currentPageRows.length > 0) {
      pages.push({ rows: currentPageRows, emptyCount: 0, showSummary: true });
    }

    // If no remaining items, add a page just for summary
    if (currentPageRows.length === 0 && pages.length > 0) {
      pages.push({ rows: [], emptyCount: 0, showSummary: true });
    }
  }

  // If no items at all, create one page with summary
  if (pages.length === 0) {
    pages.push({ rows: [], emptyCount: 0, showSummary: true });
  }

  const totalPages = pages.length;

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6 print-hide">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/credit-memos")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Returns
        </Button>
        <div className="flex gap-2">
          <Button onClick={handlePrint} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            {(creditMemo as any).invoiceType === "payable" ? "Print Vendor Credit" : "Print Credit Memo"}
          </Button>
        </div>
      </div>

      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className={`credit-memo-page ${
            pageIndex < pages.length - 1 ? "page-break" : ""
          }`}
        >
          {/* Header */}
          <div className="credit-memo-header">
            {(creditMemo as any).invoiceType === "payable" ? "VENDOR CREDIT" : "CREDIT MEMO"}
          </div>

          {/* Info Grid */}
          <div className="credit-memo-info-grid">
            {/* Billed To */}
            <div className="info-section">
              <div className="info-label">BILLED TO:</div>
              <div className="info-company">
                {(creditMemo as any).customer?.name ||
                  (creditMemo as any).billToName ||
                  "Client Company LLC"}
              </div>
              {billAddress && (
                <>
                  {billAddress.street && (
                    <div className="info-detail">{billAddress.street}</div>
                  )}
                  {billAddress.city && (
                    <div className="info-detail">
                      {billAddress.city}
                      {billAddress.state ? `, ${billAddress.state}` : ""}{" "}
                      {billAddress.zipCode || ""}
                    </div>
                  )}
                  {billAddress.country && (
                    <div className="info-detail">{billAddress.country}</div>
                  )}
                </>
              )}
            </div>

            {/* Ship To */}
            <div className="info-section">
              <div className="info-label">SHIP TO:</div>
              <div className="info-company">
                {(creditMemo as any).shipToName ||
                  (creditMemo as any).customer?.name ||
                  "Client Company LLC"}
              </div>
              {shipAddress && (
                <>
                  {typeof shipAddress === "string" ? (
                    <div className="info-detail">{shipAddress}</div>
                  ) : (
                    <>
                      {shipAddress.street && (
                        <div className="info-detail">{shipAddress.street}</div>
                      )}
                      {shipAddress.city && (
                        <div className="info-detail">
                          {shipAddress.city}
                          {shipAddress.state
                            ? `, ${shipAddress.state}`
                            : ""}{" "}
                          {shipAddress.zipCode || ""}
                        </div>
                      )}
                      {shipAddress.country && (
                        <div className="info-detail">{shipAddress.country}</div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Credit Memo Details */}
            <div className="info-section">
              <div className="info-detail">
                <strong>Credit Memo No.</strong> : {creditMemo.creditMemoNumber}
              </div>
              <div className="info-detail">
                <strong>Credit Memo Date</strong> :{" "}
                {creditMemo.creditMemoDate
                  ? formatDateUS(creditMemo.creditMemoDate)
                  : "—"}
              </div>
            </div>
          </div>

          {/* Table - only show if page 1 OR if there are items on this page */}
          {(pageIndex === 0 || page.rows.length > 0 || page.emptyCount > 0) && (
            <table className="credit-memo-table">
              <thead>
                <tr>
                  <th style={{ width: "5%", textAlign: "center" }}>Sr. No.</th>
                  <th style={{ width: "12%" }}>Product Code</th>
                  <th style={{ width: "12%" }}>Packing Size</th>
                  <th style={{ width: "35%" }}>Product Description</th>
                  <th style={{ width: "10%", textAlign: "center" }}>
                    Qty
                    <br />
                    (Carton)
                  </th>
                  <th style={{ width: "13%", textAlign: "center" }}>
                    Rate per Carton
                  </th>
                  <th style={{ width: "13%", textAlign: "center" }}>
                    Total
                    <br />
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, idx) => {
                  if (row.type === "category") {
                    return (
                      <tr key={`cat-${pageIndex}-${idx}`}>
                        <td colSpan={7} className="category-header">
                          {row.category}
                        </td>
                      </tr>
                    );
                  } else if (row.type === "schemeDesc") {
                    // Scheme description row (starts from Product Code column)
                    return (
                      <tr
                        key={`scheme-desc-${pageIndex}-${idx}`}
                        className="scheme-description-row"
                      >
                        <td style={{ border: "none" }}></td>
                        <td style={{ border: "none" }}></td>
                        <td
                          colSpan={5}
                          style={{
                            backgroundColor: "white",
                            fontSize: "inherit",
                            color: "inherit",
                            textAlign: "left",
                          }}
                        >
                          {row.item.description}
                        </td>
                      </tr>
                    );
                  } else if (row.type === "schemeName") {
                    // Scheme name row (starts from Packing Size column)
                    return (
                      <tr
                        key={`scheme-name-${pageIndex}-${idx}`}
                        className="scheme-name-row"
                      >
                        <td style={{ border: "none" }}></td>
                        <td style={{ border: "none" }}></td>
                        <td style={{ border: "none" }}></td>
                        <td
                          colSpan={4}
                          style={{
                            backgroundColor: "white",
                            fontSize: "inherit",
                            color: "inherit",
                            textAlign: "left",
                          }}
                        >
                          {row.schemeName}
                        </td>
                      </tr>
                    );
                  } else {
                    const item = row.item;
                    const qty = toNumber(item.quantity);
                    const rate = toNumber(item.unitPrice);
                    const lineTotal = toNumber(item.lineTotal);

                    return (
                      <tr key={`item-${pageIndex}-${idx}`}>
                        <td style={{ textAlign: "center" }}>
                          {row.isScheme ? "" : row.srNo}
                        </td>
                        <td>{item.productCode || (row.isScheme ? "" : "—")}</td>
                        <td>
                          {item.packingSize
                            ? item.packingSize.replace(/GM/g, "G")
                            : row.isScheme
                              ? ""
                              : "—"}
                        </td>
                        <td>{item.description}</td>
                        <td style={{ textAlign: "center" }}>{qty || "—"}</td>
                        <td style={{ textAlign: "center" }}>
                          {formatCurrency(rate)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  }
                })}

                {/* Empty rows to fill page */}
                {Array.from({ length: page.emptyCount }).map((_, idx) => (
                  <tr key={`empty-${pageIndex}-${idx}`}>
                    <td style={{ textAlign: "center" }}>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td style={{ textAlign: "center" }}>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Summary, Notes, Footer on the last page or single page */}
          {page.showSummary && (
            <>
              {/* Summary Section */}
              <div className="summary-section">
                {/* Left side - Weights and Amount in words */}
                <div className="summary-left">
                  <div>
                    <strong>Total Carton:</strong> {totalCartons}
                  </div>
                  <div>
                    <strong>Net Weight LBS:</strong> {netWeightLbs.toFixed(0)}{" "}
                    LBS
                  </div>
                  <div>
                    <strong>Gross Weight LBS:</strong>{" "}
                    {grossWeightLbs.toFixed(0)} LBS
                  </div>
                  <div style={{ marginTop: "10px" }}>
                    <strong>Amount in Words:</strong>
                  </div>
                  <div>
                    {numberToWords(Math.floor(totalCreditMemoAmount))
                      .split(" ")
                      .map(
                        (word) => word.charAt(0).toUpperCase() + word.slice(1),
                      )
                      .join(" ")}{" "}
                    Dollars
                    {totalCreditMemoAmount % 1 > 0
                      ? ` and ${numberToWords(
                          Math.round((totalCreditMemoAmount % 1) * 100),
                        )
                          .split(" ")
                          .map(
                            (word) =>
                              word.charAt(0).toUpperCase() + word.slice(1),
                          )
                          .join(" ")} Cents`
                      : ""}
                  </div>
                </div>

                {/* Right side - Financial summary */}
                <div className="summary-right">
                  <div>
                    <strong>Subtotal:</strong>{" "}
                    <span style={{ float: "right" }}>
                      {formatCurrency(netAmount)}
                    </span>
                  </div>
                  <div>
                    <strong>Freight:</strong>{" "}
                    <span style={{ float: "right" }}>
                      {formatCurrency(freight)}
                    </span>
                  </div>
                  <div>
                    <strong>Discount ({discountPercent.toFixed(2)}%):</strong>{" "}
                    <span style={{ float: "right", color: "#dc2626" }}>
                      -{formatCurrency(discountAmount)}
                    </span>
                  </div>
                  <div className="summary-total">
                    <strong>Total Amount:</strong>{" "}
                    <span style={{ float: "right" }}>
                      {formatCurrency(totalCreditMemoAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Terms and Conditions Section */}
              <div className="notes-section">
                <div className="notes-label">Terms and Conditions:</div>
                <div className="notes-box">
                  {((creditMemo as any).notes || "")
                    .split("\n")
                    .filter((line: string) => line.trim())
                    .map((line: string, idx: number) => {
                      const cleanLine = line.replace(/^\d+\.\s*/, "").trim();
                      return (
                        <div className="notes-line" key={idx}>
                          <span className="notes-number">{idx + 1}.</span>
                          <span>{cleanLine}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Footer */}
              <div className="footer-section">
                <div className="footer-item">
                  <span>Received By:</span>
                  <span>___________________</span>
                </div>
                <div className="footer-item" style={{ textAlign: "center" }}>
                  <span>Total Pallet:</span>
                  <span></span>
                </div>
                <div className="footer-company">
                  Kitchen Express Overseas Inc
                </div>
              </div>
            </>
          )}

          {/* Page Number */}
          <div
            style={{
              position: "absolute",
              top: "5px",
              right: "20px",
              fontSize: "11px",
              fontFamily: "Arial, sans-serif",
            }}
          >
            Page {pageIndex + 1} of {totalPages}
          </div>
        </div>
      ))}
    </div>
  );
}
export default CreditMemoView;
