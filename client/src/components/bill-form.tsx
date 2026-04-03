import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, NotebookPen, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const DEFAULT_NOTES = `1. All matters related to this invoice or the goods shall be governed by the laws of Pennsylvania, and all disputes related here to shall be adjudicated exclusively in the state or federal courts located in  Pennsylvania.
2. Overdue balances subject to finance charge of 2 %  per month.
3. I understand and accept that cheque image deposited through ACH debits are valid mode of payment.
4. Final Sale`;

const DEFAULT_BANK_DETAILS = ``;

const invoiceSchema = z
  .object({
    customerId: z.string().min(1, "Customer is required"),
    invoiceNumber: z.string(),
    purchaseOrder: z.string().optional().default(""),
    invoiceDate: z.string().min(1, "Invoice date is required"),
    paymentTerms: z
      .number()
      .min(0, "Payment terms must be non-negative")
      .default(30),
    invoiceType: z.enum(["receivable", "payable"], {
      required_error: "Please select invoice type",
    }),
    freight: z.number().min(0, "Freight must be non-negative").default(0),
    discount: z.number().min(0, "Discount must be non-negative").default(0),
    notes: z.string().optional(),
    bankDetails: z.string().optional(),
  })
  .refine(
    (data) => {
      // Invoice number is required for both AR and AP invoices
      if (!data.invoiceNumber || data.invoiceNumber.trim() === "") {
        return false;
      }
      return true;
    },
    {
      message: "Invoice number is required",
      path: ["invoiceNumber"],
    },
  );

const lineItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  variantId: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0.5, "Quantity must be at least 0.5"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
});

interface Props {
  bill?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BillForm({ bill, onClose, onSuccess }: Props) {
  const invoice = bill; // Alias for internal compatibility
  const isEditMode = !!invoice;
  const [lineItems, setLineItems] = useState([
    {
      productId: "",
      variantId: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      lineTotal: 0,
      productCode: "",
      cartoonBarcode: "",
      packingSize: "",
      grossWeightKgs: 0,
      netWeightKgs: 0,
      category: "", // added category field to initial state
      isSchemeDescription: false, // flag for scheme description line items
      schemeDescription: "", // text for scheme description
      stockQuantity: 0, // stock quantity for display
    },
  ]);
  const [showSchemeItems, setShowSchemeItems] = useState<{
    [key: number]: any[];
  }>({});
  const [manualFreeItems, setManualFreeItems] = useState<any[]>([]); // For total quantity-based schemes
  const [lineItemCategoryFilters, setLineItemCategoryFilters] = useState<string[]>([]);
  const [defaultCategoryFilter, setDefaultCategoryFilter] = useState<string>("all");
  const [schemePendingSelections, setSchemePendingSelections] = useState<{
    [schemeId: string]: { productId: string; quantity: number };
  }>({});
  const [productSearchTerm, setProductSearchTerm] = useState<string>("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>("");
  const [invoiceNumberError, setInvoiceNumberError] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof invoiceSchema>>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: isEditMode
      ? {
          customerId: invoice.customerId || "",
          invoiceNumber: invoice.invoiceNumber || "",
          purchaseOrder:
            invoice.purchaseOrder ||
            invoice.purchaseOrderNo ||
            invoice.poNumber ||
            "",
          invoiceDate: invoice.invoiceDate
            ? new Date(invoice.invoiceDate).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
          paymentTerms: 30,
          invoiceType: invoice.invoiceType || "payable",
          freight: parseFloat(invoice.freight || 0),
          discount: parseFloat(invoice.discount || 0),
          notes: invoice.notes || DEFAULT_NOTES,
          bankDetails: invoice.bankDetails || DEFAULT_BANK_DETAILS,
        }
      : {
          customerId: "",
          invoiceNumber: "", // Bill number will be entered manually
          purchaseOrder: "",
          invoiceDate: new Date().toISOString().split("T")[0],
          paymentTerms: 30,
          invoiceType: "payable",
          freight: 0,
          discount: 0,
          notes: DEFAULT_NOTES,
          bankDetails: DEFAULT_BANK_DETAILS,
        },
  });

  // Reset form when invoice data changes (for edit mode)
  useEffect(() => {
    if (isEditMode && invoice) {
      form.reset({
        customerId: invoice.customerId || "",
        invoiceNumber: invoice.invoiceNumber || "",
        purchaseOrder:
          invoice.purchaseOrder ||
          invoice.purchaseOrderNo ||
          invoice.poNumber ||
          "",
        invoiceDate: invoice.invoiceDate
          ? new Date(invoice.invoiceDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        paymentTerms: invoice.paymentTerms || 30,
        invoiceType: invoice.invoiceType || "payable",
        freight: parseFloat(invoice.freight || 0),
        discount: parseFloat(invoice.discount || 0),
        notes: invoice.notes || DEFAULT_NOTES,
        bankDetails: invoice.bankDetails || DEFAULT_BANK_DETAILS,
      });
    }
  }, [isEditMode, invoice, form]);

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  // Watch invoiceType to filter customers/vendors appropriately
  const watchedInvoiceType = form.watch("invoiceType");
  
  // Filter parties based on invoice type: customers for AR (receivable), vendors for AP (payable)
  const filteredParties = customers?.filter((c: any) => {
    if (c.isActive === false) return false;
    if (watchedInvoiceType === "receivable") {
      return c.type === "customer";
    } else if (watchedInvoiceType === "payable") {
      return c.type === "vendor";
    }
    return true;
  }) || [];

  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const { data: schemes } = useQuery<any[]>({
    queryKey: ["/api/schemes"],
  });

  const { data: existingLineItems } = useQuery({
    queryKey: [`/api/invoices/${invoice?.id || "placeholder"}/line-items`],
    enabled: isEditMode && !!invoice?.id,
  });

  // Fetch next AR invoice number (only when creating new AR invoice)
  const { data: nextInvoiceNumberData } = useQuery<{ nextNumber: string }>({
    queryKey: ["/api/invoices/next-number"],
    enabled: !isEditMode, // Only fetch when creating new invoice
  });

  // Fetch all invoices to check for duplicates
  const { data: allInvoices } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
  });

  // Set invoice number based on invoice type (only for new invoices)
  useEffect(() => {
    if (!isEditMode) {
      const invoiceType = form.watch("invoiceType");
      if (invoiceType === "receivable" && nextInvoiceNumberData?.nextNumber) {
        // Auto-populate with next sequential number for AR invoices
        form.setValue("invoiceNumber", nextInvoiceNumberData.nextNumber);
      } else if (invoiceType === "payable") {
        // Clear invoice number for AP invoices (manual entry)
        form.setValue("invoiceNumber", "");
      }
    }
  }, [isEditMode, nextInvoiceNumberData, form]);

  // Watch invoice type changes to update invoice number accordingly
  useEffect(() => {
    if (!isEditMode) {
      const subscription = form.watch((value, { name }) => {
        if (name === "invoiceType") {
          if (
            value.invoiceType === "receivable" &&
            nextInvoiceNumberData?.nextNumber
          ) {
            form.setValue("invoiceNumber", nextInvoiceNumberData.nextNumber);
            setInvoiceNumberError(""); // Clear error when switching to AR
          } else if (value.invoiceType === "payable") {
            form.setValue("invoiceNumber", "");
            setInvoiceNumberError(""); // Clear error when switching to AP
          }
        }
      });
      return () => subscription.unsubscribe();
    }
  }, [isEditMode, nextInvoiceNumberData, form]);

  // Watch invoice number for duplicate detection (AR invoices only)
  useEffect(() => {
    if (!isEditMode && allInvoices) {
      const subscription = form.watch((value, { name }) => {
        if (name === "invoiceNumber" || name === "invoiceType") {
          const invoiceType = value.invoiceType;
          const invoiceNumber = value.invoiceNumber?.trim() || "";

          // Only check duplicates for AR invoices
          if (invoiceType === "receivable" && invoiceNumber) {
            // Check if invoice number already exists in AR invoices
            const arInvoices = allInvoices.filter(
              (inv: any) => inv.invoiceType === "receivable",
            );
            const duplicate = arInvoices.find(
              (inv: any) => inv.invoiceNumber.trim() === invoiceNumber,
            );

            if (duplicate) {
              setInvoiceNumberError(
                "Invoice number already exists for AR invoice.",
              );
            } else {
              setInvoiceNumberError("");
            }
          } else {
            setInvoiceNumberError("");
          }
        }
      });
      return () => subscription.unsubscribe();
    }
  }, [isEditMode, allInvoices, form]);

  // Load existing line items when editing
  useEffect(() => {
    if (
      isEditMode &&
      Array.isArray(existingLineItems) &&
      existingLineItems.length > 0
    ) {
      const regularItems: any[] = [];
      const schemeItemsMap: { [key: number]: any[] } = {};
      const manualFreeItemsList: any[] = [];

      let currentRegularIndex = -1;

      existingLineItems.forEach((item: any, idx: number) => {
        // Format the item - IMPORTANT: Include id and marginPerCarton for margin immutability
        const formattedItem = {
          id: item.id,
          productId: item.productId || "",
          variantId: item.variantId || "",
          description: item.description || "",
          quantity: item.quantity || 0,
          unitPrice: parseFloat(item.unitPrice) || 0,
          lineTotal: parseFloat(item.lineTotal) || 0,
          productCode: item.productCode || "",
          cartoonBarcode: item.cartoonBarcode || "",
          packingSize: item.packingSize || "",
          grossWeightKgs: parseFloat(item.grossWeightKgs) || 0,
          netWeightKgs: parseFloat(item.netWeightKgs) || 0,
          category: item.category || "",
          marginPerCarton: item.marginPerCarton || "", // Preserve stored margin
          isFreeFromScheme: item.isFreeFromScheme || false,
          isSchemeDescription: item.isSchemeDescription || false,
          schemeDescription: item.description || "",
          schemeId: item.schemeId || "",
        };

        // Check if this is a scheme description line
        if (item.isSchemeDescription) {
          regularItems.push(formattedItem);
          currentRegularIndex++;
        }
        // Check if this is a free item from a product-specific scheme
        else if (item.isFreeFromScheme && item.schemeId) {
          // Check if this belongs to a product-specific scheme (associated with the previous regular item)
          const prevItem = existingLineItems[idx - 1];
          if (
            prevItem &&
            !prevItem.isFreeFromScheme &&
            !prevItem.isSchemeDescription &&
            prevItem.productId === item.productId
          ) {
            // This is a product-specific scheme free item - add to showSchemeItems
            if (!schemeItemsMap[currentRegularIndex]) {
              schemeItemsMap[currentRegularIndex] = [];
            }
            schemeItemsMap[currentRegularIndex].push({
              id: formattedItem.id, // Preserve line item ID for margin immutability
              description: formattedItem.description,
              quantity: formattedItem.quantity,
              unitPrice: formattedItem.unitPrice,
              lineTotal: formattedItem.lineTotal,
              marginPerCarton: formattedItem.marginPerCarton, // Preserve stored margin
              isFreeFromScheme: true,
              schemeId: formattedItem.schemeId,
              category: formattedItem.category,
            });
          } else {
            // This is a manual/total-quantity-based free item
            manualFreeItemsList.push(formattedItem);
          }
        }
        // Regular line item
        else {
          regularItems.push(formattedItem);
          currentRegularIndex++;
        }
      });

      setLineItems(regularItems);
      setShowSchemeItems(schemeItemsMap);
      setManualFreeItems(manualFreeItemsList);
    }
  }, [isEditMode, existingLineItems]);

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Submitting invoice data:", data);
      const response = await apiRequest("POST", "/api/invoices", data);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Invoice creation failed:", errorData);
        throw new Error(errorData.message || "Failed to create invoice");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Updating invoice data:", data);
      const response = await apiRequest(
        "PUT",
        `/api/invoices/${invoice.id}`,
        data,
      );
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Invoice update failed:", errorData);
        throw new Error(errorData.message || "Failed to update invoice");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (invoice?.id) {
        queryClient.invalidateQueries({
          queryKey: [`/api/invoices/${invoice.id}`],
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/invoices/${invoice.id}/line-items`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update invoice",
        variant: "destructive",
      });
    },
  });

  const syncToQuickBooksMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/invoices/${invoiceId}/sync-quickbooks`,
        {},
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice synced to QuickBooks successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync invoice to QuickBooks",
        variant: "destructive",
      });
    },
  });

  const updateLineItem = (index: number, field: string, value: any) => {
    const updatedItems = [...lineItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };

    // Calculate line total
    if (field === "quantity" || field === "unitPrice") {
      updatedItems[index].lineTotal =
        updatedItems[index].quantity * updatedItems[index].unitPrice;
    }

    // Check for applicable schemes when product or quantity changes
    if ((field === "productId" || field === "quantity") && schemes) {
      const productId = updatedItems[index].productId;
      const quantity = updatedItems[index].quantity;

      const applicableScheme = schemes.find(
        (scheme: any) =>
          scheme.productId === productId &&
          scheme.isActive &&
          quantity >= scheme.buyQuantity,
      );

      // If in edit mode and scheme items already exist for this line
      const hasExistingSchemeItems =
        showSchemeItems[index] && showSchemeItems[index].length > 0;

      if (applicableScheme) {
        const freeQuantity =
          Math.floor(quantity / applicableScheme.buyQuantity) *
          applicableScheme.freeQuantity;

        // Only update scheme items if:
        // 1. No existing scheme items (creating new), OR
        // 2. Quantity changed and needs recalculation
        if (!hasExistingSchemeItems && freeQuantity > 0) {
          // Create new scheme items
          setShowSchemeItems({
            ...showSchemeItems,
            [index]: [
              {
                description: `${updatedItems[index].description} & ${applicableScheme.name}`,
                quantity: freeQuantity,
                unitPrice: 0,
                lineTotal: 0,
                isFreeFromScheme: true,
                schemeId: applicableScheme.id,
                category: updatedItems[index].category,
              },
            ],
          });
        } else if (hasExistingSchemeItems && freeQuantity > 0) {
          // Update existing scheme item quantity if it changed
          const updatedSchemeItems = { ...showSchemeItems };
          if (updatedSchemeItems[index] && updatedSchemeItems[index][0]) {
            updatedSchemeItems[index][0].quantity = freeQuantity;
          }
          setShowSchemeItems(updatedSchemeItems);
        } else if (hasExistingSchemeItems && freeQuantity === 0) {
          // Remove scheme items if quantity dropped below threshold
          const updatedSchemeItems = { ...showSchemeItems };
          delete updatedSchemeItems[index];
          setShowSchemeItems(updatedSchemeItems);
        }
      } else {
        // No applicable scheme - remove any existing scheme items
        if (hasExistingSchemeItems) {
          const updatedSchemeItems = { ...showSchemeItems };
          delete updatedSchemeItems[index];
          setShowSchemeItems(updatedSchemeItems);
        }
      }
    }

    setLineItems(updatedItems);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        productId: "",
        variantId: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        productCode: "",
        cartoonBarcode: "",
        packingSize: "",
        grossWeightKgs: 0,
        netWeightKgs: 0,
        category: "",
        isSchemeDescription: false,
        schemeDescription: "",
        stockQuantity: 0,
      },
    ]);
    setLineItemCategoryFilters([...lineItemCategoryFilters, defaultCategoryFilter]);
    setProductSearchTerm("");
  };

  const removeLineItem = (index: number) => {
    const updatedItems = lineItems.filter((_, i) => i !== index);
    setLineItems(updatedItems);
    setLineItemCategoryFilters(lineItemCategoryFilters.filter((_, i) => i !== index));

    // Remove associated scheme items
    const updatedSchemeItems = { ...showSchemeItems };
    delete updatedSchemeItems[index];
    setShowSchemeItems(updatedSchemeItems);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  };

  const calculateTotalQuantity = () => {
    return lineItems.reduce((sum, item) => {
      if (!item.isSchemeDescription && item.productId) {
        return sum + (item.quantity || 0);
      }
      return sum;
    }, 0);
  };

  const getUsedFreeQuantity = (schemeId: string) => {
    return manualFreeItems
      .filter((item) => item.schemeId === schemeId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const addManualFreeItem = (
    productId: string,
    schemeId: string,
    quantity: number,
  ) => {
    const product = products?.find((p: any) => p.id === productId);
    if (!product) return;

    const newFreeItem = {
      productId: product.id,
      description: product.name,
      quantity: quantity,
      unitPrice: 0,
      lineTotal: 0,
      productCode: product.itemCode || "",
      cartoonBarcode: product.cartoonBarcode || "",
      packingSize: product.packingSize || "",
      grossWeightKgs: parseFloat(product.grossWeight || "0"),
      netWeightKgs: parseFloat(product.netWeight || "0"),
      category: product.category || "",
      schemeId: schemeId,
      isFreeFromScheme: true,
    };

    setManualFreeItems([...manualFreeItems, newFreeItem]);

    // Reset pending selection for this scheme
    setSchemePendingSelections((prev) => {
      const updated = { ...prev };
      delete updated[schemeId];
      return updated;
    });
  };

  const removeManualFreeItem = (index: number) => {
    setManualFreeItems(manualFreeItems.filter((_, i) => i !== index));
  };

  const onSubmit = (data: z.infer<typeof invoiceSchema>) => {
    const subtotal = calculateTotal();
    const freight = data.freight || 0;
    const discountPercent = data.discount || 0;
    const discountAmount = (subtotal * discountPercent) / 100;
    const total = subtotal + freight - discountAmount;

    console.log("Current line items on submit:", lineItems);

    // Validate that we have at least one valid line item
    const validLineItems = lineItems.filter(
      (item) =>
        item.productId &&
        item.productId.trim() !== "" &&
        item.description &&
        item.description.trim() !== "" &&
        (item.quantity > 0 || item.isSchemeDescription), // Allow scheme description with 0 quantity
    );

    console.log("Valid line items:", validLineItems);

    if (validLineItems.length === 0) {
      toast({
        title: "Invalid Line Items",
        description: "Please add at least one valid product line item",
        variant: "destructive",
      });
      return;
    }

    // Prepare all line items including scheme items
    // IMPORTANT: Include id and marginPerCarton for margin immutability
    const allLineItems: any[] = [];
    validLineItems.forEach((item, index) => {
      allLineItems.push({
        id: item.id || undefined, // Preserve line item ID for margin immutability
        productId: item.productId,
        variantId: item.variantId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
        productCode: item.productCode || null,
        cartoonBarcode: item.cartoonBarcode || null,
        packingSize: item.packingSize || null,
        grossWeightKgs: item.grossWeightKgs
          ? item.grossWeightKgs.toString()
          : null,
        netWeightKgs: item.netWeightKgs ? item.netWeightKgs.toString() : null,
        category: item.category || null,
        marginPerCarton: item.marginPerCarton || undefined, // Preserve stored margin
        isFreeFromScheme: false,
        isSchemeDescription: item.isSchemeDescription || false,
        schemeId: null,
      });

      // Add scheme items if any
      if (showSchemeItems[index]) {
        showSchemeItems[index].forEach((schemeItem) => {
          allLineItems.push({
            id: schemeItem.id || undefined, // Preserve line item ID for margin immutability
            productId: item.productId,
            variantId: item.variantId || null,
            description: schemeItem.description,
            quantity: schemeItem.quantity,
            unitPrice: schemeItem.unitPrice.toString(),
            lineTotal: schemeItem.lineTotal.toString(),
            productCode: item.productCode || null,
            cartoonBarcode: item.cartoonBarcode || null,
            packingSize: item.packingSize || null,
            grossWeightKgs: item.grossWeightKgs
              ? item.grossWeightKgs.toString()
              : null,
            netWeightKgs: item.netWeightKgs
              ? item.netWeightKgs.toString()
              : null,
            category: item.category || null,
            marginPerCarton: schemeItem.marginPerCarton || "0", // Free items always have 0 margin
            isFreeFromScheme: true,
            schemeId: schemeItem.schemeId,
          });
        });
      }
    });

    // Add manual free items (from total quantity-based schemes)
    manualFreeItems.forEach((freeItem) => {
      allLineItems.push({
        id: freeItem.id || undefined, // Preserve line item ID for margin immutability
        productId: freeItem.productId,
        variantId: null,
        description: freeItem.description,
        quantity: freeItem.quantity,
        unitPrice: "0",
        lineTotal: "0",
        productCode: freeItem.productCode || null,
        cartoonBarcode: freeItem.cartoonBarcode || null,
        packingSize: freeItem.packingSize || null,
        grossWeightKgs: freeItem.grossWeightKgs
          ? freeItem.grossWeightKgs.toString()
          : null,
        netWeightKgs: freeItem.netWeightKgs
          ? freeItem.netWeightKgs.toString()
          : null,
        category: freeItem.category || null,
        marginPerCarton: "0", // Free items always have 0 margin
        isFreeFromScheme: true,
        isSchemeDescription: false,
        schemeId: freeItem.schemeId || null,
      });
    });

    // Calculate due date based on invoice date + payment terms
    const invoiceDate = new Date(data.invoiceDate);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + data.paymentTerms);
    const dueDateString = dueDate.toISOString().split("T")[0];

    const { purchaseOrder, ...invoiceFormData } = data;
    const purchaseOrderValue = purchaseOrder?.trim() || null;

    const invoiceData = {
      invoice: {
        ...invoiceFormData,
        subtotal: subtotal.toString(),
        freight: freight.toString(),
        discount: discountPercent.toString(),
        total: total.toString(),
        status: isEditMode ? invoice.status : "draft",
        invoiceType: data.invoiceType,
        invoiceDate: data.invoiceDate,
        dueDate: dueDateString,
        purchaseOrder: purchaseOrderValue,
        notes: data.notes,
        bankDetails: data.bankDetails,
      },
      lineItems: allLineItems,
    };

    if (isEditMode) {
      updateInvoiceMutation.mutate(invoiceData);
    } else {
      createInvoiceMutation.mutate(invoiceData);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      data-testid="invoice-form-modal"
    >
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle
              className="flex items-center"
              data-testid="invoice-form-title"
            >
              <NotebookPen className="mr-2 text-primary" size={20} />
              {isEditMode ? "Edit" : "Create New"} Invoice
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="button-close-invoice-form"
            >
              <X size={20} />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Invoice Type Selection */}
              <div className="mb-6">
                <FormField
                  control={form.control}
                  name="invoiceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Invoice Type
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger
                            className="w-full md:w-64"
                            data-testid="select-invoice-type"
                          >
                            <SelectValue placeholder="Select Invoice Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem
                            value="receivable"
                            data-testid="option-ar-invoice"
                          >
                            <div className="flex items-center">
                              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                              Accounts Receivable (AR) - Customer Invoice
                            </div>
                          </SelectItem>
                          <SelectItem
                            value="payable"
                            data-testid="option-ap-invoice"
                          >
                            <div className="flex items-center">
                              <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                              Accounts Payable (AP) - Vendor Bill
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Customer/Vendor and Date Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{watchedInvoiceType === "payable" ? "Vendor" : "Customer"}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-customer">
                            <SelectValue placeholder={watchedInvoiceType === "payable" ? "Select Vendor" : "Select Customer"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <div className="px-2 pb-2">
                            <Input
                              placeholder={watchedInvoiceType === "payable" ? "Search vendor..." : "Search customer..."}
                              value={customerSearchTerm}
                              onChange={(e) =>
                                setCustomerSearchTerm(e.target.value)
                              }
                              className="h-8"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {filteredParties
                            .filter((party: any) =>
                              party.name
                                .toLowerCase()
                                .includes(customerSearchTerm.toLowerCase()),
                            )
                            .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                            .map((party: any) => (
                              <SelectItem
                                key={party.id}
                                value={party.id}
                                data-testid={`option-customer-${party.id}`}
                              >
                                {party.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoiceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-invoice-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => {
                    const invoiceType = form.watch("invoiceType");
                    const isARInvoice = invoiceType === "receivable";

                    return (
                      <FormItem>
                        <FormLabel>
                          Invoice Number
                          {!isEditMode && isARInvoice && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (Auto-generated, editable)
                            </span>
                          )}
                          {!isEditMode && !isARInvoice && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (Required)
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={
                              !isEditMode && !isARInvoice
                                ? "Enter invoice number"
                                : ""
                            }
                            className={
                              invoiceNumberError
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
                            data-testid="input-invoice-number"
                          />
                        </FormControl>
                        {invoiceNumberError && (
                          <p
                            className="text-sm text-red-500 mt-1"
                            data-testid="invoice-number-error"
                          >
                            {invoiceNumberError}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="purchaseOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Order</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter purchase order number"
                          data-testid="input-purchase-order"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms (days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          {...field}
                          value={field.value ?? 30}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            field.onChange(Number.isFinite(value) ? value : 30);
                          }}
                          data-testid="input-payment-terms"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="freight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Freight Amount ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          placeholder="0.00"
                          data-testid="input-freight"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount %</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          placeholder="2.00"
                          data-testid="input-discount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Notes</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentNotes = field.value || "";
                          const lines = currentNotes
                            .split("\n")
                            .filter((line) => line.trim());
                          const numberedLines = lines.map((line, index) => {
                            const cleanLine = line.replace(/^\d+\.\s*/, "");
                            return `${index + 1}. ${cleanLine}`;
                          });
                          field.onChange(numberedLines.join("\n"));
                        }}
                        data-testid="button-add-numbering"
                      >
                        Add Numbering
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Enter invoice notes..."
                        rows={6}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bankDetails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Details</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Enter bank details..."
                        rows={4}
                        data-testid="input-bank-details"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-medium text-foreground">
                    Invoice Items
                  </label>
                </div>

                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={index}>
                      {/* Scheme Description Line Item (merged row) */}
                      {item.isSchemeDescription ? (
                        <div
                          className="grid grid-cols-12 gap-3 items-end p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border-l-4 border-blue-400"
                          data-testid={`scheme-desc-item-${index}`}
                        >
                          <div className="col-span-11">
                            <label className="block text-xs text-muted-foreground mb-1">
                              Scheme Description (editable)
                            </label>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "description",
                                  e.target.value,
                                )
                              }
                              className="h-8"
                              data-testid={`input-scheme-description-${index}`}
                            />
                          </div>
                          <div className="col-span-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(index)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              data-testid={`button-remove-scheme-desc-${index}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Normal Product Line Item */
                        <div
                          className="grid grid-cols-12 gap-3 items-end p-3 bg-muted/50 rounded-lg"
                          data-testid={`line-item-${index}`}
                        >
                          <div className="col-span-3">
                            <label className="block text-xs text-muted-foreground mb-1">
                              Product
                            </label>
                            <Select
                              value={item.productId}
                              onValueChange={(value) => {
                                console.log("Product selected:", value);
                                const product = products?.find(
                                  (p: any) => p.id === value,
                                );
                                console.log("Found product:", product);

                                if (product) {
                                  let updatedItems = [...lineItems];
                                  // Use salesPrice for AR (receivable) invoices, basePrice for AP (payable) invoices
                                  const invoiceType =
                                    form.getValues("invoiceType");
                                  const unitPrice =
                                    invoiceType === "receivable"
                                      ? parseFloat(product.salesPrice) || 0
                                      : parseFloat(product.basePrice) || 0;
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    productId: value,
                                    description: product.name,
                                    unitPrice: unitPrice,
                                    productCode: product.itemCode || "",
                                    cartoonBarcode:
                                      product.cartoonBarcode || "",
                                    packingSize: product.packingSize || "",
                                    grossWeightKgs: parseFloat(
                                      product.grossWeight || "0",
                                    ),
                                    netWeightKgs: parseFloat(
                                      product.netWeight || "0",
                                    ),
                                    category:
                                      product.category ||
                                      updatedItems[index].category,
                                    lineTotal:
                                      updatedItems[index].quantity * unitPrice,
                                    isSchemeDescription: false,
                                    stockQuantity: parseInt(product.qty) || 0,
                                  };

                                  // Check if product has scheme description and add it as next line item
                                  if (
                                    product.schemeDescription &&
                                    product.schemeDescription.trim()
                                  ) {
                                    // Check if next item is already a scheme description for this product
                                    const nextItem = updatedItems[index + 1];
                                    const isNextItemSchemeDesc =
                                      nextItem?.isSchemeDescription &&
                                      nextItem?.productId === value;

                                    if (!isNextItemSchemeDesc) {
                                      // Insert scheme description line item after the product using array spread
                                      const schemeDescItem = {
                                        productId: value,
                                        variantId: "",
                                        description: product.schemeDescription,
                                        quantity: 0,
                                        unitPrice: 0,
                                        lineTotal: 0,
                                        productCode: "",
                                        cartoonBarcode: "",
                                        packingSize: "",
                                        grossWeightKgs: 0,
                                        netWeightKgs: 0,
                                        category: product.category || "",
                                        isSchemeDescription: true,
                                        schemeDescription:
                                          product.schemeDescription,
                                        stockQuantity: 0,
                                      };
                                      // Create new array with scheme description inserted
                                      updatedItems = [
                                        ...updatedItems.slice(0, index + 1),
                                        schemeDescItem,
                                        ...updatedItems.slice(index + 1),
                                      ];
                                    }
                                  }

                                  setLineItems(updatedItems);
                                  console.log(
                                    "Updated line items:",
                                    updatedItems,
                                  );
                                }
                              }}
                            >
                              <SelectTrigger
                                className="h-8"
                                data-testid={`select-product-${index}`}
                              >
                                <SelectValue placeholder="Select Product" />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="px-2 pb-2">
                                  <Input
                                    placeholder="Search product..."
                                    value={productSearchTerm}
                                    onChange={(e) =>
                                      setProductSearchTerm(e.target.value)
                                    }
                                    className="h-8"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  />
                                </div>
                                {productsLoading ? (
                                  <SelectItem value="loading" disabled>
                                    Loading products...
                                  </SelectItem>
                                ) : (
                                  (() => {
                                    const rowCatFilter = defaultCategoryFilter || "all";
                                    // Filter by category
                                    const categoryFiltered =
                                      rowCatFilter === "all"
                                        ? products
                                        : products?.filter(
                                            (product: any) =>
                                              product.category ===
                                              rowCatFilter,
                                          );

                                    // Filter by search term (case-insensitive substring match)
                                    const filteredProducts =
                                      categoryFiltered?.filter(
                                        (product: any) =>
                                          product.name
                                            .toLowerCase()
                                            .includes(
                                              productSearchTerm.toLowerCase(),
                                            ) ||
                                          (product.cartoonBarcode ?? "")
                                            .toLowerCase()
                                            .includes(
                                              productSearchTerm.toLowerCase(),
                                            ) ||
                                          (product.category ?? "")
                                            .toLowerCase()
                                            .includes(
                                              productSearchTerm.toLowerCase(),
                                            ),
                                      );

                                    // always include the currently selected product if not in filtered list
                                    const currentProduct =
                                      products?.find(
                                        (p: any) => p.id === item.productId,
                                      ) || null;

                                    const displayProducts =
                                      (filteredProducts || []).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

                                    if (
                                      currentProduct &&
                                      !displayProducts.some(
                                        (p: any) => p.id === currentProduct.id,
                                      )
                                    ) {
                                      displayProducts.unshift(currentProduct);
                                    }

                                    return displayProducts.length > 0 ? (
                                      displayProducts.map((product: any) => (
                                        <SelectItem
                                          key={product.id}
                                          value={product.id}
                                          data-testid={`option-product-${product.id}`}
                                        >
                                          {product.name} -{" "}
                                          {product.itemCode || "No Code"} (
                                          {product.category})
                                        </SelectItem>
                                      ))
                                    ) : (
                                      <SelectItem value="no-products" disabled>
                                        No products available
                                      </SelectItem>
                                    );
                                  })()
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-2">
                            <label className="block text-xs text-muted-foreground mb-1">
                              Description
                            </label>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "description",
                                  e.target.value,
                                )
                              }
                              className="h-8"
                              data-testid={`input-description-${index}`}
                            />
                          </div>

                          <div className="col-span-2">
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs text-muted-foreground">
                                Qty
                              </label>
                              {item.productId && (
                                <span
                                  className="text-xs font-semibold text-green-600 dark:text-green-400"
                                  data-testid={`stock-quantity-${index}`}
                                >
                                  Stock: {item.stockQuantity}
                                </span>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "quantity",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-8"
                              data-testid={`input-quantity-${index}`}
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="block text-xs text-muted-foreground mb-1">
                              Rate
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "unitPrice",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-8"
                              data-testid={`input-unit-price-${index}`}
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="block text-xs text-muted-foreground mb-1">
                              Amount
                            </label>
                            <Input
                              value={formatCurrency(item.lineTotal)}
                              readOnly
                              className="h-8"
                              data-testid={`input-line-total-${index}`}
                            />
                          </div>

                          <div className="col-span-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(index)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              data-testid={`button-remove-line-item-${index}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      )}

                      {!item.isSchemeDescription && showSchemeItems[index] && (
                        <div className="ml-4 mt-2 space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <Gift className="text-accent" size={16} />
                            <span className="text-sm font-medium text-accent">
                              Promotional Items Added
                            </span>
                          </div>
                          {showSchemeItems[index].map(
                            (schemeItem, schemeIndex) => (
                              <div
                                key={schemeIndex}
                                className="grid grid-cols-12 gap-3 items-end p-3 bg-accent/10 rounded-lg border border-accent/20"
                                data-testid={`scheme-item-${index}-${schemeIndex}`}
                              >
                                <div className="col-span-3">
                                  <span className="text-xs text-accent font-semibold">
                                    🎁 FREE ITEM
                                  </span>
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    value={schemeItem.description}
                                    readOnly
                                    className="h-8 text-xs bg-accent/5 border-accent/30"
                                    data-testid={`scheme-description-${index}-${schemeIndex}`}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    value={schemeItem.quantity}
                                    readOnly
                                    className="h-8 bg-accent/5 border-accent/30"
                                    data-testid={`scheme-quantity-${index}-${schemeIndex}`}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    value="FREE"
                                    readOnly
                                    className="h-8 bg-accent/5 border-accent/30 text-accent font-semibold"
                                    data-testid={`scheme-price-${index}-${schemeIndex}`}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    value="FREE"
                                    readOnly
                                    className="h-8 bg-accent/5 border-accent/30 text-accent font-semibold"
                                    data-testid={`scheme-total-${index}-${schemeIndex}`}
                                  />
                                </div>
                                <div className="col-span-1">
                                  <Gift
                                    className="text-accent animate-pulse"
                                    size={16}
                                  />
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Item Button */}
                <div className="mt-3 flex items-center gap-2">
                  <Select value={defaultCategoryFilter} onValueChange={setDefaultCategoryFilter}>
                    <SelectTrigger className="h-9 w-40 text-sm" data-testid="select-default-category">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Array.from(new Set(products?.map((p: any) => p.category).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b)).map((cat: any) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLineItem}
                    data-testid="button-add-line-item"
                  >
                    <Plus className="mr-1" size={14} />
                    Add Item
                  </Button>
                </div>

                {/* Scheme Summary */}
                {Object.keys(showSchemeItems).length > 0 && (
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Gift className="text-accent" size={20} />
                      <h3 className="text-lg font-semibold text-accent">
                        Promotional Schemes Applied
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(showSchemeItems).map(
                        ([lineIndex, schemeItems]: [string, any[]]) => (
                          <div key={lineIndex} className="text-sm">
                            <span className="font-medium text-foreground">
                              {lineItems[parseInt(lineIndex)]?.description}:
                            </span>
                            <span className="text-accent ml-2">
                              +
                              {schemeItems.reduce(
                                (total, item) => total + item.quantity,
                                0,
                              )}{" "}
                              free items
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Free items are automatically added when you meet scheme
                      requirements
                    </div>
                  </div>
                )}

                {/* Total Quantity-Based Schemes */}
                {schemes &&
                  schemes.filter((s: any) => s.isActive && !s.productId)
                    .length > 0 && (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Gift className="text-primary" size={20} />
                        <h3 className="text-lg font-semibold text-primary">
                          Quantity-Based Promotional Schemes
                        </h3>
                      </div>
                      <div className="mb-3 text-sm">
                        <span className="font-medium text-foreground">
                          Total Quantity:{" "}
                        </span>
                        <span className="text-lg font-bold text-primary">
                          {calculateTotalQuantity()}
                        </span>
                      </div>

                      {schemes
                        .filter((s: any) => s.isActive && !s.productId)
                        .map((scheme: any) => {
                          const totalQty = calculateTotalQuantity();
                          const timesTriggered = Math.floor(
                            totalQty / scheme.buyQuantity,
                          );
                          const freeQuantityEarned =
                            timesTriggered * scheme.freeQuantity;
                          const isTriggered = timesTriggered > 0;

                          return (
                            <div
                              key={scheme.id}
                              className="border border-border rounded-lg p-3 mb-3 bg-background"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <div className="font-semibold text-foreground">
                                    {scheme.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Buy {scheme.buyQuantity} Get{" "}
                                    {scheme.freeQuantity} Free
                                  </div>
                                </div>
                                {isTriggered && (
                                  <div className="text-accent font-bold">
                                    {freeQuantityEarned} Free Items Available
                                  </div>
                                )}
                              </div>

                              {isTriggered && (
                                <div className="mt-3 space-y-3">
                                  {/* Show remaining quantity */}
                                  <div className="text-xs text-muted-foreground">
                                    Available:{" "}
                                    {freeQuantityEarned -
                                      getUsedFreeQuantity(scheme.id)}{" "}
                                    of {freeQuantityEarned} free items
                                  </div>

                                  {/* Only show selector if there are remaining free items */}
                                  {freeQuantityEarned -
                                    getUsedFreeQuantity(scheme.id) >
                                    0 && (
                                    <div className="grid grid-cols-12 gap-2">
                                      <div className="col-span-5">
                                        <Select
                                          value={
                                            schemePendingSelections[scheme.id]
                                              ?.productId || ""
                                          }
                                          onValueChange={(productId) => {
                                            setSchemePendingSelections(
                                              (prev) => ({
                                                ...prev,
                                                [scheme.id]: {
                                                  productId,
                                                  quantity:
                                                    prev[scheme.id]?.quantity ||
                                                    1,
                                                },
                                              }),
                                            );
                                          }}
                                          data-testid={`select-free-product-${scheme.id}`}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue placeholder="Select Product" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {products
                                              ?.filter((product: any) => {
                                                // If scheme has specific products, only show those
                                                if (
                                                  scheme.productIds &&
                                                  scheme.productIds.length > 0
                                                ) {
                                                  return scheme.productIds.includes(
                                                    product.id,
                                                  );
                                                }
                                                // Otherwise show all products
                                                return true;
                                              })
                                              ?.map((product: any) => (
                                                <SelectItem
                                                  key={product.id}
                                                  value={product.id}
                                                >
                                                  {product.name}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="col-span-3">
                                        <Input
                                          type="number"
                                          min="1"
                                          max={
                                            freeQuantityEarned -
                                            getUsedFreeQuantity(scheme.id)
                                          }
                                          value={
                                            schemePendingSelections[scheme.id]
                                              ?.quantity || 1
                                          }
                                          onChange={(e) => {
                                            const quantity =
                                              parseInt(e.target.value) || 1;
                                            setSchemePendingSelections(
                                              (prev) => ({
                                                ...prev,
                                                [scheme.id]: {
                                                  productId:
                                                    prev[scheme.id]
                                                      ?.productId || "",
                                                  quantity,
                                                },
                                              }),
                                            );
                                          }}
                                          placeholder="Qty"
                                          className="h-8"
                                          data-testid={`input-free-quantity-${scheme.id}`}
                                        />
                                      </div>
                                      <div className="col-span-4">
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() => {
                                            const pending =
                                              schemePendingSelections[
                                                scheme.id
                                              ];
                                            if (
                                              pending?.productId &&
                                              pending?.quantity > 0
                                            ) {
                                              const remaining =
                                                freeQuantityEarned -
                                                getUsedFreeQuantity(scheme.id);
                                              if (
                                                pending.quantity <= remaining
                                              ) {
                                                addManualFreeItem(
                                                  pending.productId,
                                                  scheme.id,
                                                  pending.quantity,
                                                );
                                              } else {
                                                toast({
                                                  title: "Invalid Quantity",
                                                  description: `Only ${remaining} items remaining`,
                                                  variant: "destructive",
                                                });
                                              }
                                            }
                                          }}
                                          className="h-8 w-full"
                                          data-testid={`button-add-free-item-${scheme.id}`}
                                        >
                                          <Plus size={14} className="mr-1" />{" "}
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Show added items for this scheme */}
                                  {manualFreeItems.filter(
                                    (item) => item.schemeId === scheme.id,
                                  ).length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-xs font-medium text-foreground">
                                        Selected Free Items:
                                      </div>
                                      {manualFreeItems
                                        .map((item, index) => ({ item, index }))
                                        .filter(
                                          ({ item }) =>
                                            item.schemeId === scheme.id,
                                        )
                                        .map(({ item, index }) => (
                                          <div
                                            key={index}
                                            className="flex items-center justify-between bg-accent/10 rounded px-2 py-1.5"
                                          >
                                            <div className="flex items-center gap-2">
                                              <Gift
                                                className="text-accent"
                                                size={14}
                                              />
                                              <span className="text-xs font-medium">
                                                {item.description}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                x{item.quantity}
                                              </span>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                removeManualFreeItem(index)
                                              }
                                              className="h-5 px-1"
                                              data-testid={`button-remove-free-item-${index}`}
                                            >
                                              <Trash2 size={12} />
                                            </Button>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {!isTriggered && (
                                <div className="text-xs text-muted-foreground mt-2">
                                  Add{" "}
                                  {scheme.buyQuantity -
                                    (totalQty % scheme.buyQuantity)}{" "}
                                  more items to trigger this scheme
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}

                {/* Invoice Total */}
                <div className="border-t border-border pt-4 mt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span
                        className="font-medium"
                        data-testid="invoice-subtotal"
                      >
                        {formatCurrency(calculateTotal())}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Freight:</span>
                      <span
                        className="font-medium"
                        data-testid="invoice-freight-display"
                      >
                        {formatCurrency(form.watch("freight") || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        Discount ({(form.watch("discount") || 0).toFixed(2)}%):
                      </span>
                      <span
                        className="font-medium text-red-600"
                        data-testid="invoice-discount-display"
                      >
                        -
                        {formatCurrency(
                          (calculateTotal() * (form.watch("discount") || 0)) /
                            100,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-lg font-semibold text-foreground">
                        Total Amount:
                      </span>
                      <span
                        className="text-2xl font-bold text-primary"
                        data-testid="invoice-total"
                      >
                        {formatCurrency(
                          calculateTotal() +
                            (form.watch("freight") || 0) -
                            (calculateTotal() * (form.watch("discount") || 0)) /
                              100,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-6">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={
                      createInvoiceMutation.isPending || !!invoiceNumberError
                    }
                    data-testid="button-save-draft"
                  >
                    <Save className="mr-2" size={16} />
                    {createInvoiceMutation.isPending
                      ? "Saving..."
                      : invoiceNumberError
                        ? "Duplicate Invoice Number"
                        : "Save Draft"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    data-testid="button-cancel-invoice"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
