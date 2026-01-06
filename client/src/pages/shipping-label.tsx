import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { Link } from "wouter";

interface InvoiceLineItem {
  id: string;
  quantity: number;
  isSchemeDescription?: boolean;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: {
    name: string;
    address: any;
  };
  shipToName?: string;
  shipAddress?: any;
}

export default function ShippingLabel() {
  const { id } = useParams<{ id: string }>();
  const [palletCount, setPalletCount] = useState("");

  const { data: invoice } = useQuery<Invoice>({
    queryKey: [`/api/invoices/${id}`],
    enabled: !!id,
  });

  const { data: lineItems } = useQuery<InvoiceLineItem[]>({
    queryKey: [`/api/invoices/${id}/line-items`],
    enabled: !!id,
  });

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "shipping-label-print-styles";
    style.textContent = `
      @media print {
        @page { 
          size: A4 landscape; 
          margin: 6mm 10mm 6mm 10mm;
          background: white;
        }
        body { margin: 0; padding: 0; background: white !important; height: 100%; }
        html { background: white !important; height: 100%; }
        * { box-shadow: none !important; background-color: white !important; }
        .container { background: white !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; height: 100%; }
        .shipping-label-page { 
          box-shadow: none; 
          border: none; 
          margin: 0 !important; 
          padding: 0 !important; 
          width: 100%; 
          height: 100%;
          min-height: auto; 
          background: white !important; 
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .shipping-label-title {
          font-size: 36px !important;
          margin-bottom: 5mm !important;
          flex-shrink: 0;
        }
        .label-container {
          padding: 10mm 15mm !important;
          border-width: 5px !important;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-evenly;
        }
        .section-title {
          font-size: 40px !important;
          margin-bottom: 6mm !important;
        }
        .label-field {
          margin-bottom: 5mm !important;
        }
        .print-hide { display: none !important; }
      }

      .shipping-label-page {
        background: white;
        padding: 40px;
        font-family: Arial, sans-serif;
        font-size: 22px;
        line-height: 1.6;
        max-width: 100%;
        margin: 0 auto;
        position: relative;
      }

      .shipping-label-title {
        text-align: center;
        font-size: 38px;
        font-weight: bold;
        margin-bottom: 30px;
      }

      .label-container {
        border: 6px solid #000;
        padding: 40px 50px;
        background: white;
      }

      .section-title {
        font-weight: bold;
        font-size: 36px;
        margin-bottom: 35px;
      }

      .label-field {
        margin-bottom: 20px;
        display: flex;
        align-items: center;
      }

      .field-label {
        display: inline-block;
        width: 280px;
        font-size: 48px;
        flex-shrink: 0;
      }

      .field-value {
        display: inline-block;
        font-size: 48px;
      }

      .field-value-bold {
        display: inline-block;
        font-size: 48px;
        font-weight: bold;
      }

      .customer-name {
        font-size: 72px;
        font-weight: bold;
        margin-bottom: 20px;
      }

      @media print {
        .customer-name {
          font-size: 72px !important;
          margin-bottom: 6mm !important;
          line-height: 1.1 !important;
        }
        .field-label {
          font-size: 42px !important;
        }
        .field-value {
          font-size: 42px !important;
        }
        .field-value-bold {
          font-size: 42px !important;
        }
        input {
          border: none;
          background: white !important;
          font-size: 42px !important;
          outline: none;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("shipping-label-print-styles");
      if (el) document.head.removeChild(el);
    };
  }, []);

  const handlePrint = () => window.print();

  if (!invoice || !lineItems) {
    return <div>Loading...</div>;
  }

  const filteredLineItems = lineItems.filter(
    (item) => !item.isSchemeDescription,
  );
  const totalCartons = filteredLineItems.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0,
  );

  const shipAddress = invoice.shipAddress
    ? typeof invoice.shipAddress === "string"
      ? JSON.parse(invoice.shipAddress)
      : invoice.shipAddress
    : typeof invoice.customer?.address === "string"
      ? JSON.parse(invoice.customer.address)
      : invoice.customer?.address;

  const shipToName = invoice.shipToName || invoice.customer?.name || "";

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6 print-hide">
        <Link href={`/invoices/${id}`}>
          <Button variant="outline" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Invoice
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print-label">
          <Printer className="h-4 w-4 mr-2" />
          Print Shipping Label
        </Button>
      </div>

      <div className="shipping-label-page">
        <div className="shipping-label-title">Excellence Consultant</div>

        <div className="label-container">
          <div className="section-title">SHIP TO</div>

          <div className="customer-name">{shipToName}</div>

          {shipAddress && (
            <>
              {shipAddress.street && (
                <div className="label-field">
                  <span className="field-label">Address :</span>
                  <span className="field-value">{shipAddress.street}</span>
                </div>
              )}

              <div className="label-field">
                <span className="field-label"></span>
                <span className="field-value">
                  {shipAddress.city || ""}
                  {shipAddress.state ? `, ${shipAddress.state}` : ""}{" "}
                  {shipAddress.zipCode || ""}
                </span>
              </div>
            </>
          )}

          <div className="label-field">
            <span className="field-label">Total Cartons :</span>
            <span className="field-value-bold">{totalCartons}</span>
          </div>

          <div className="label-field">
            <span className="field-label">Total Pallets:</span>
            <span className="field-value" data-testid="label-pallet-count">
              {palletCount || ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
