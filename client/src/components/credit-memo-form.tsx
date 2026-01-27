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
import { NotebookPen, Plus, Save, Trash2, X, Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const DEFAULT_NOTES = `1. No return accepted of Frozen & Milk products Items-Its an Final Sale
2. All returned checks are subject $50 surcharge
3. All matters related to this invoice or the goods shall be governed by the State laws of New Jersey, and all disputes related here to shall be adjudicated exclusively in the state or federal courts located in New Jersey.`;

const creditMemoSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  creditMemoNumber: z.string().min(1, "Credit memo number is required"),
  creditMemoDate: z.string().min(1, "Credit memo date is required"),
  invoiceType: z.enum(["receivable", "payable"], {
    required_error: "Please select credit memo type",
  }),
  freight: z.number().min(0, "Freight must be non-negative").default(0),
  discount: z.number().min(0, "Discount must be non-negative").default(0),
  notes: z.string().optional(),
});

const lineItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  variantId: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
});

interface Props {
  creditMemo?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreditMemoForm({
  creditMemo,
  onClose,
  onSuccess,
}: Props) {
  const isEditMode = !!creditMemo;
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
      category: "",
      isSchemeDescription: false,
      schemeDescription: "",
      stockQuantity: 0,
    },
  ]);
  const [showSchemeItems, setShowSchemeItems] = useState<{
    [key: number]: any[];
  }>({});
  const [manualFreeItems, setManualFreeItems] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [schemePendingSelections, setSchemePendingSelections] = useState<{
    [schemeId: string]: { productId: string; quantity: number };
  }>({});
  const [productSearchTerm, setProductSearchTerm] = useState<string>("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>("");
  const [creditMemoNumberError, setCreditMemoNumberError] =
    useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof creditMemoSchema>>({
    resolver: zodResolver(creditMemoSchema),
    defaultValues: isEditMode
      ? {
          customerId: creditMemo.customerId || "",
          creditMemoNumber:
            creditMemo.creditMemoNumber || creditMemo.invoiceNumber || "",
          creditMemoDate:
            creditMemo.creditMemoDate || creditMemo.invoiceDate
              ? new Date(creditMemo.creditMemoDate || creditMemo.invoiceDate)
                  .toISOString()
                  .split("T")[0]
              : new Date().toISOString().split("T")[0],
          invoiceType: creditMemo.invoiceType || "receivable",
          freight: parseFloat(creditMemo.freight || 0),
          discount: parseFloat(creditMemo.discount || 0),
          notes: creditMemo.notes || DEFAULT_NOTES,
        }
      : {
          customerId: "",
          creditMemoNumber: "",
          creditMemoDate: new Date().toISOString().split("T")[0],
          invoiceType: "receivable",
          freight: 0,
          discount: 0,
          notes: DEFAULT_NOTES,
        },
  });

  // Reset form when credit memo data changes (for edit mode)
  useEffect(() => {
    if (isEditMode && creditMemo) {
      form.reset({
        customerId: creditMemo.customerId || "",
        creditMemoNumber:
          creditMemo.creditMemoNumber || creditMemo.invoiceNumber || "",
        creditMemoDate:
          creditMemo.creditMemoDate || creditMemo.invoiceDate
            ? new Date(creditMemo.creditMemoDate || creditMemo.invoiceDate)
                .toISOString()
                .split("T")[0]
            : new Date().toISOString().split("T")[0],
        invoiceType: creditMemo.invoiceType || "receivable",
        freight: parseFloat(creditMemo.freight || 0),
        discount: parseFloat(creditMemo.discount || 0),
        notes: creditMemo.notes || DEFAULT_NOTES,
      });
    }
  }, [isEditMode, creditMemo, form]);

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  // Watch invoiceType to filter customers/vendors appropriately
  const watchedInvoiceType = form.watch("invoiceType");
  
  // Filter parties based on credit memo type: customers for receivable (Customer Credit), vendors for payable (Vendor Credit)
  const filteredParties = customers?.filter((c: any) => {
    if (c.isActive === false) return false;
    if (watchedInvoiceType === "receivable") {
      return c.type === "customer";
    } else if (watchedInvoiceType === "payable") {
      return c.type === "vendor";
    }
    return true;
  }) || [];

  const { data: products, isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const { data: schemes } = useQuery<any[]>({
    queryKey: ["/api/schemes"],
  });

  const { data: existingLineItems } = useQuery({
    queryKey: [
      `/api/credit-memos/${creditMemo?.id || "placeholder"}/line-items`,
    ],
    enabled: isEditMode && !!creditMemo?.id,
  });

  // Fetch all credit memos to check for duplicates
  const { data: allCreditMemos } = useQuery<any[]>({
    queryKey: ["/api/credit-memos"],
  });

  // Watch credit memo number for duplicate detection
  useEffect(() => {
    if (!isEditMode && allCreditMemos) {
      const subscription = form.watch((value, { name }) => {
        if (name === "creditMemoNumber") {
          const creditMemoNumber = value.creditMemoNumber?.trim() || "";
          if (creditMemoNumber) {
            // Check if credit memo number already exists
            const duplicate = allCreditMemos.find(
              (cm: any) => cm.creditMemoNumber?.trim() === creditMemoNumber,
            );
            if (duplicate) {
              setCreditMemoNumberError("Credit memo number already exists.");
            } else {
              setCreditMemoNumberError("");
            }
          } else {
            setCreditMemoNumberError("");
          }
        }
      });
      return () => subscription.unsubscribe();
    }
  }, [isEditMode, allCreditMemos, form]);

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
          isFreeFromScheme: item.isFreeFromScheme || false,
          isSchemeDescription: item.isSchemeDescription || false,
          schemeDescription: item.description || "",
          schemeId: item.schemeId || "",
        };

        if (item.isSchemeDescription) {
          regularItems.push(formattedItem);
          currentRegularIndex++;
        } else if (item.isFreeFromScheme && item.schemeId) {
          const prevItem = existingLineItems[idx - 1];
          if (
            prevItem &&
            !prevItem.isFreeFromScheme &&
            !prevItem.isSchemeDescription &&
            prevItem.productId === item.productId
          ) {
            if (!schemeItemsMap[currentRegularIndex]) {
              schemeItemsMap[currentRegularIndex] = [];
            }
            schemeItemsMap[currentRegularIndex].push({
              description: formattedItem.description,
              quantity: formattedItem.quantity,
              unitPrice: formattedItem.unitPrice,
              lineTotal: formattedItem.lineTotal,
              isFreeFromScheme: true,
              schemeId: formattedItem.schemeId,
              category: formattedItem.category,
            });
          } else {
            manualFreeItemsList.push(formattedItem);
          }
        } else {
          regularItems.push(formattedItem);
          currentRegularIndex++;
        }
      });

      setLineItems(regularItems);
      setShowSchemeItems(schemeItemsMap);
      setManualFreeItems(manualFreeItemsList);
    }
  }, [isEditMode, existingLineItems]);

  const createCreditMemoMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Submitting credit memo data:", data);
      const response = await apiRequest("POST", "/api/credit-memos", data);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Credit memo creation failed:", errorData);
        throw new Error(errorData.message || "Failed to create credit memo");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Credit memo created successfully",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create credit memo",
        variant: "destructive",
      });
    },
  });

  const updateCreditMemoMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Updating credit memo data:", data);
      const response = await apiRequest(
        "PUT",
        `/api/credit-memos/${creditMemo.id}`,
        data,
      );
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Credit memo update failed:", errorData);
        throw new Error(errorData.message || "Failed to update credit memo");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      if (creditMemo?.id) {
        queryClient.invalidateQueries({
          queryKey: [`/api/credit-memos/${creditMemo.id}`],
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/credit-memos/${creditMemo.id}/line-items`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Credit memo updated successfully",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update credit memo",
        variant: "destructive",
      });
    },
  });

  const updateLineItem = (index: number, field: string, value: any) => {
    const updatedItems = [...lineItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };

    if (field === "quantity" || field === "unitPrice") {
      updatedItems[index].lineTotal =
        updatedItems[index].quantity * updatedItems[index].unitPrice;
    }

    if ((field === "productId" || field === "quantity") && schemes) {
      const productId = updatedItems[index].productId;
      const quantity = updatedItems[index].quantity;

      const applicableScheme = schemes.find(
        (scheme: any) =>
          scheme.productId === productId &&
          scheme.isActive &&
          quantity >= scheme.buyQuantity,
      );

      const hasExistingSchemeItems =
        showSchemeItems[index] && showSchemeItems[index].length > 0;

      if (applicableScheme) {
        const freeQuantity =
          Math.floor(quantity / applicableScheme.buyQuantity) *
          applicableScheme.freeQuantity;

        if (!hasExistingSchemeItems && freeQuantity > 0) {
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
          const updatedSchemeItems = { ...showSchemeItems };
          if (updatedSchemeItems[index] && updatedSchemeItems[index][0]) {
            updatedSchemeItems[index][0].quantity = freeQuantity;
          }
          setShowSchemeItems(updatedSchemeItems);
        } else if (hasExistingSchemeItems && freeQuantity === 0) {
          const updatedSchemeItems = { ...showSchemeItems };
          delete updatedSchemeItems[index];
          setShowSchemeItems(updatedSchemeItems);
        }
      } else {
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
    setProductSearchTerm("");
  };

  const removeLineItem = (index: number) => {
    const updatedItems = lineItems.filter((_, i) => i !== index);
    setLineItems(updatedItems);

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
      productCode: product.cartoonBarcode || "",
      cartoonBarcode: product.cartoonBarcode || "",
      packingSize: product.packingSize || "",
      grossWeightKgs: parseFloat(product.grossWeight || "0"),
      netWeightKgs: parseFloat(product.netWeight || "0"),
      category: product.category || "",
      schemeId: schemeId,
      isFreeFromScheme: true,
    };

    setManualFreeItems([...manualFreeItems, newFreeItem]);

    setSchemePendingSelections((prev) => {
      const updated = { ...prev };
      delete updated[schemeId];
      return updated;
    });
  };

  const removeManualFreeItem = (index: number) => {
    setManualFreeItems(manualFreeItems.filter((_, i) => i !== index));
  };

  const onSubmit = (data: z.infer<typeof creditMemoSchema>) => {
    const subtotal = calculateTotal();
    const freight = data.freight || 0;
    const discountPercent = data.discount || 0;
    const discountAmount = (subtotal * discountPercent) / 100;
    const total = subtotal + freight - discountAmount;

    const validLineItems = lineItems.filter(
      (item) =>
        item.productId &&
        item.productId.trim() !== "" &&
        item.description &&
        item.description.trim() !== "" &&
        (item.quantity > 0 || item.isSchemeDescription),
    );

    if (validLineItems.length === 0) {
      toast({
        title: "Invalid Line Items",
        description: "Please add at least one valid product line item",
        variant: "destructive",
      });
      return;
    }

    // Prepare all line items including scheme items
    const allLineItems: any[] = [];
    validLineItems.forEach((item, index) => {
      allLineItems.push({
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
        isFreeFromScheme: false,
        isSchemeDescription: item.isSchemeDescription || false,
        schemeId: null,
      });

      if (showSchemeItems[index]) {
        showSchemeItems[index].forEach((schemeItem) => {
          allLineItems.push({
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
            isFreeFromScheme: true,
            schemeId: schemeItem.schemeId,
          });
        });
      }
    });

    manualFreeItems.forEach((freeItem) => {
      allLineItems.push({
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
        isFreeFromScheme: true,
        isSchemeDescription: false,
        schemeId: freeItem.schemeId || null,
      });
    });

    // Credit memo data
    const creditMemoData = {
      creditMemo: {
        customerId: data.customerId,
        creditMemoNumber: data.creditMemoNumber,
        creditMemoDate: data.creditMemoDate,
        subtotal: subtotal.toString(),
        freight: freight.toString(),
        discount: discountPercent.toString(),
        total: total.toString(),
        status: isEditMode ? creditMemo.status : "draft",
        invoiceType: data.invoiceType,
        notes: data.notes || null,
      },
      lineItems: allLineItems,
    };

    if (isEditMode) {
      updateCreditMemoMutation.mutate(creditMemoData);
    } else {
      createCreditMemoMutation.mutate(creditMemoData);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      data-testid="credit-memo-form-modal"
    >
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle
              className="flex items-center"
              data-testid="credit-memo-form-title"
            >
              <NotebookPen className="mr-2 text-primary" size={20} />
              {isEditMode ? "Edit" : "Create New"} Credit Memo
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="button-close-credit-memo-form"
            >
              <X size={20} />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Credit Memo Type Selection */}
              <div className="mb-6">
                <FormField
                  control={form.control}
                  name="invoiceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Credit Memo Type
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger
                            className="w-full md:w-64"
                            data-testid="select-credit-memo-type"
                          >
                            <SelectValue placeholder="Select Credit Memo Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem
                            value="receivable"
                            data-testid="option-ar-credit-memo"
                          >
                            <div className="flex items-center">
                              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                              Accounts Receivable (AR) - Customer Credit Memo
                            </div>
                          </SelectItem>
                          <SelectItem
                            value="payable"
                            data-testid="option-ap-credit-memo"
                          >
                            <div className="flex items-center">
                              <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                              Accounts Payable (AP) - Vendor Credit Memo
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Customer and Date Fields */}
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
                  name="creditMemoDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credit Memo Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-credit-memo-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="creditMemoNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Credit Memo Number
                        <span className="text-xs text-muted-foreground ml-2">
                          (Required)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter credit memo number"
                          className={
                            creditMemoNumberError
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
                          data-testid="input-credit-memo-number"
                        />
                      </FormControl>
                      {creditMemoNumberError && (
                        <p
                          className="text-sm text-red-500 mt-1"
                          data-testid="credit-memo-number-error"
                        >
                          {creditMemoNumberError}
                        </p>
                      )}
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
                        placeholder="Enter credit memo notes..."
                        rows={6}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Line Items - Similar to invoice form */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-medium text-foreground">
                    Credit Memo Items
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">
                      Filter by Category:
                    </label>
                    <Select
                      value={categoryFilter}
                      onValueChange={setCategoryFilter}
                    >
                      <SelectTrigger
                        className="w-32 h-8"
                        data-testid="select-category-filter"
                      >
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {Array.from(
                          new Set(
                            products
                              ?.map((p: any) => p.category)
                              .filter(Boolean),
                          ),
                        ).map((category) => (
                          <SelectItem
                            key={category as string}
                            value={category as string}
                          >
                            {category as string}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={index}>
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
                                const product = products?.find(
                                  (p: any) => p.id === value,
                                );

                                if (product) {
                                  let updatedItems = [...lineItems];
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
                                    productCode: product.cartoonBarcode || "",
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

                                  if (
                                    product.schemeDescription &&
                                    product.schemeDescription.trim()
                                  ) {
                                    const nextItem = updatedItems[index + 1];
                                    const isNextItemSchemeDesc =
                                      nextItem?.isSchemeDescription &&
                                      nextItem?.productId === value;

                                    if (!isNextItemSchemeDesc) {
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
                                      updatedItems = [
                                        ...updatedItems.slice(0, index + 1),
                                        schemeDescItem,
                                        ...updatedItems.slice(index + 1),
                                      ];
                                    }
                                  }

                                  setLineItems(updatedItems);
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
                                    const categoryFiltered =
                                      categoryFilter === "all"
                                        ? products
                                        : products?.filter(
                                            (product: any) =>
                                              product.category ===
                                              categoryFilter,
                                          );

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

                                    const currentProduct =
                                      products?.find(
                                        (p: any) => p.id === item.productId,
                                      ) || null;

                                    const displayProducts =
                                      filteredProducts || [];

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
                                          {product.cartoonBarcode || "No Code"} (
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
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "quantity",
                                  parseInt(e.target.value) || 0,
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

                <div className="mt-3">
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

                {/* Credit Memo Total */}
                <div className="border-t border-border pt-4 mt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span
                        className="font-medium"
                        data-testid="credit-memo-subtotal"
                      >
                        {formatCurrency(calculateTotal())}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Freight:</span>
                      <span
                        className="font-medium"
                        data-testid="credit-memo-freight-display"
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
                        data-testid="credit-memo-discount-display"
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
                        data-testid="credit-memo-total"
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
                      createCreditMemoMutation.isPending ||
                      !!creditMemoNumberError
                    }
                    data-testid="button-save-draft"
                  >
                    <Save className="mr-2" size={16} />
                    {createCreditMemoMutation.isPending
                      ? "Saving..."
                      : creditMemoNumberError
                        ? "Duplicate Credit Memo Number"
                        : "Save Draft"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    data-testid="button-cancel-credit-memo"
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
