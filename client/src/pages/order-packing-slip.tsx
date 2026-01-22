import { Button } from "@/components/ui/button";
import { formatDateWithoutTimezone } from "@/lib/dateUtils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "wouter";

interface OrderLineItem {
  id: string;
  productCode: string;
  cartoonBarcode: string;
  packingSize: string;
  description: string;
  quantity: number;
  category: string;
  netWeightKgs: number;
  grossWeightKgs: number;
}

interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
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
        .packing-slip-page { box-shadow: none; border: none; margin: 0 !important; padding: 0 !important; width: 100%; min-height: auto; background: white !important; }
        .packing-table { margin: 0 !important; padding: 0 !important; }
        .page-break { page-break-after: always; }
        .print-hide { display: none !important; }

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

      .packing-slip-page {
        background: white;
        padding: 20px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        max-width: 210mm;
        margin: 0 auto;
        position: relative;
      }

      .order-header {
        text-align: center;
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 20px;
      }

      .order-info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
      }

      .order-info-section {
        border: 1px solid #ccc;
        padding: 12px;
      }

      .order-info-section h3 {
        font-size: 14px;
        font-weight: bold;
        margin-bottom: 8px;
        border-bottom: 1px solid #ccc;
        padding-bottom: 4px;
      }

      .packing-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }

      .packing-table th,
      .packing-table td {
        border: 1px solid #ccc;
        padding: 8px;
        text-align: left;
        font-size: 12px;
      }

      .packing-table th {
        background-color: #f5f5f5;
        font-weight: bold;
      }

      .category-header {
        background-color: #f9f9f9;
        font-weight: bold;
      }

      .text-right {
        text-align: right;
      }

      .text-center {
        text-align: center;
      }

      .totals-row {
        font-weight: bold;
        background-color: #f5f5f5;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById("packing-slip-print-styles");
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (!order || !lineItems) {
    return (
      <div className="p-8 text-center">
        <p>Loading order packing slip...</p>
      </div>
    );
  }

  // Group items by category
  const itemsByCategory = lineItems.reduce(
    (acc, item) => {
      const category = item.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, OrderLineItem[]>
  );

  const categories = Object.keys(itemsByCategory).sort();

  // Calculate totals
  const totalCartons = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalNetWeight = lineItems.reduce(
    (sum, item) => sum + (item.netWeightKgs || 0) * item.quantity,
    0
  );
  const totalGrossWeight = lineItems.reduce(
    (sum, item) => sum + (item.grossWeightKgs || 0) * item.quantity,
    0
  );

  const formatAddress = (address: any) => {
    if (!address) return "";
    if (typeof address === "string") return address;
    const parts = [
      address.street,
      address.city,
      address.state,
      address.zipCode,
      address.country,
    ].filter(Boolean);
    return parts.join(", ");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="print-hide p-4 bg-white border-b flex items-center justify-between gap-4">
        <Link href="/orders">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="h-4 w-4 mr-2" />
          Print Packing Slip
        </Button>
      </div>

      <div className="container mx-auto py-8 px-4">
        <div className="packing-slip-page bg-white shadow-lg">
          <div className="order-header">PACKING SLIP</div>

          <div className="order-info-grid">
            <div className="order-info-section">
              <h3>Ship To</h3>
              <p>
                <strong>{customer?.name || "Unknown Customer"}</strong>
              </p>
              <p>{formatAddress(customer?.address)}</p>
            </div>
            <div className="order-info-section">
              <h3>Order Details</h3>
              <p>
                <strong>Order #:</strong> {order.orderNumber}
              </p>
              <p>
                <strong>Date:</strong>{" "}
                {formatDateWithoutTimezone(new Date(order.orderDate))}
              </p>
            </div>
          </div>

          <table className="packing-table">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>#</th>
                <th style={{ width: "15%" }}>Barcode</th>
                <th style={{ width: "35%" }}>Description</th>
                <th style={{ width: "15%" }}>Packing</th>
                <th style={{ width: "10%" }} className="text-right">
                  Qty
                </th>
                <th style={{ width: "10%" }} className="text-right">
                  Net Wt
                </th>
                <th style={{ width: "10%" }} className="text-right">
                  Gross Wt
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <>
                  <tr key={`cat-${category}`} className="category-header">
                    <td colSpan={7}>
                      <strong>{category}</strong>
                    </td>
                  </tr>
                  {itemsByCategory[category].map((item, index) => (
                    <tr key={item.id}>
                      <td className="text-center">{index + 1}</td>
                      <td>{item.cartoonBarcode || "-"}</td>
                      <td>{item.description}</td>
                      <td>{item.packingSize || "-"}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td className="text-right">
                        {((item.netWeightKgs || 0) * item.quantity).toFixed(2)}
                      </td>
                      <td className="text-right">
                        {((item.grossWeightKgs || 0) * item.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="totals-row">
                <td colSpan={4} className="text-right">
                  <strong>TOTALS:</strong>
                </td>
                <td className="text-right">
                  <strong>{totalCartons}</strong>
                </td>
                <td className="text-right">
                  <strong>{totalNetWeight.toFixed(2)}</strong>
                </td>
                <td className="text-right">
                  <strong>{totalGrossWeight.toFixed(2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          {order.notes && (
            <div className="order-info-section" style={{ marginTop: "20px" }}>
              <h3>Notes</h3>
              <p>{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
