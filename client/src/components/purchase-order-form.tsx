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
import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const orderSchema = z.object({
  customerId: z.string().min(1, "Vendor is required"),
  orderNumber: z.string().min(1, "Order number is required"),
  purchaseOrder: z.string().optional().default(""),
  orderDate: z.string().min(1, "Order date is required"),
  orderType: z.enum(["sales", "purchase"]).default("purchase"),
  status: z.enum(["draft", "approved", "finalized", "closed", "cancelled"]).default("draft"),
  freight: z.number().min(0, "Freight must be non-negative").default(0),
  discount: z.number().min(0, "Discount must be non-negative").default(0),
  notes: z.string().optional(),
});

interface Props {
  order?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PurchaseOrderForm({ order, onClose, onSuccess }: Props) {
  const isEditMode = !!order;
  const [lineItems, setLineItems] = useState<Array<{
    productId: string;
    variantId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    productCode: string;
    cartoonBarcode: string;
    packingSize: string;
    grossWeightKgs: number;
    netWeightKgs: number;
    category: string;
  }>>([]);
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const createEmptyLineItem = () => ({
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
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: "",
      orderNumber: "",
      purchaseOrder: "",
      orderDate: new Date().toISOString().split("T")[0],
      orderType: "purchase",
      status: "draft",
      freight: 0,
      discount: 0,
      notes: "",
    },
  });

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  // Filter vendors only (not customers)
  const activeVendors = customers?.filter(
    (c: any) => c.isActive !== false && c.type === "vendor"
  ) || [];

  // Get unique categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const cats = products
      .map((p: any) => p.category)
      .filter((c: string) => c && c.trim() !== "");
    return Array.from(new Set(cats)).sort();
  }, [products]);

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (categoryFilter === "all") return products;
    return products.filter((p: any) => p.category === categoryFilter);
  }, [products, categoryFilter]);

  useEffect(() => {
    if (order && isEditMode) {
      form.reset({
        customerId: order.customerId || "",
        orderNumber: order.orderNumber || "",
        purchaseOrder: order.purchaseOrder || "",
        orderDate: order.orderDate
          ? new Date(order.orderDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        orderType: order.orderType || "purchase",
        status: order.status || "draft",
        freight: parseFloat(order.freight || 0),
        discount: parseFloat(order.discount || 0),
        notes: order.notes || "",
      });

      // Load line items from API
      if (order.id) {
        console.log("PO: Fetching line items for order:", order.id);
        const token = localStorage.getItem("token");
        fetch(`/api/orders/${order.id}/line-items`, {
          credentials: 'include',
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        })
          .then((res) => {
            console.log("PO: Line items response status:", res.status);
            return res.json();
          })
          .then((items) => {
            console.log("PO: Line items received:", items);
            if (items && Array.isArray(items) && items.length > 0) {
              const mappedItems = items.map((item: any) => ({
                productId: item.productId || "",
                variantId: item.variantId || "",
                description: item.description || "",
                quantity: item.quantity || 1,
                unitPrice: parseFloat(item.unitPrice) || 0,
                lineTotal: parseFloat(item.lineTotal) || 0,
                productCode: item.productCode || "",
                cartoonBarcode: item.cartoonBarcode || "",
                packingSize: item.packingSize || "",
                grossWeightKgs: parseFloat(item.grossWeightKgs) || 0,
                netWeightKgs: parseFloat(item.netWeightKgs) || 0,
                category: item.category || "",
              }));
              console.log("PO: Setting mapped line items:", mappedItems);
              setLineItems(mappedItems);
            } else {
              console.log("PO: No items found, adding default empty row");
              setLineItems([createEmptyLineItem()]);
            }
            setLineItemsLoaded(true);
          })
          .catch((err) => {
            console.error("PO: Error fetching line items:", err);
            setLineItems([createEmptyLineItem()]);
            setLineItemsLoaded(true);
          });
      } else {
        console.log("PO: No order ID, adding default empty row");
        setLineItems([createEmptyLineItem()]);
        setLineItemsLoaded(true);
      }
    } else if (!isEditMode) {
      console.log("PO: Not edit mode, adding default empty row");
      setLineItems([createEmptyLineItem()]);
      setLineItemsLoaded(true);
    }
  }, [order, isEditMode, form]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/orders", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Success",
        description: "Purchase order created successfully",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/orders/${order.id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Success",
        description: "Purchase order updated successfully",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive",
      });
    },
  });

  const handleProductChange = (index: number, productId: string) => {
    const product = products?.find((p: any) => p.id === productId);
    if (product) {
      const newLineItems = [...lineItems];
      newLineItems[index] = {
        ...newLineItems[index],
        productId,
        description: product.name,
        unitPrice: parseFloat(product.basePrice || 0),
        productCode: product.itemCode || "",
        cartoonBarcode: product.cartoonBarcode || "",
        packingSize: product.packingSize || "",
        grossWeightKgs: parseFloat(product.grossWeight || 0),
        netWeightKgs: parseFloat(product.netWeight || 0),
        category: product.category || "",
        lineTotal:
          newLineItems[index].quantity *
          parseFloat(product.basePrice || 0),
      };
      setLineItems(newLineItems);
    }
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const newLineItems = [...lineItems];
    newLineItems[index] = {
      ...newLineItems[index],
      quantity,
      lineTotal: quantity * newLineItems[index].unitPrice,
    };
    setLineItems(newLineItems);
  };

  const handleUnitPriceChange = (index: number, unitPrice: number) => {
    const newLineItems = [...lineItems];
    newLineItems[index] = {
      ...newLineItems[index],
      unitPrice,
      lineTotal: newLineItems[index].quantity * unitPrice,
    };
    setLineItems(newLineItems);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, createEmptyLineItem()]);
  };

  const removeLineItem = (index: number) => {
    const newLineItems = lineItems.filter((_, i) => i !== index);
    // Keep at least one empty line item if removing the last one
    if (newLineItems.length === 0) {
      setLineItems([createEmptyLineItem()]);
    } else {
      setLineItems(newLineItems);
    }
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const freight = form.watch("freight") || 0;
  const discount = form.watch("discount") || 0;
  const total = subtotal + freight - discount;

  const onSubmit = async (data: z.infer<typeof orderSchema>) => {
    const validLineItems = lineItems.filter(
      (item) => item.productId && item.productId.trim() !== ""
    );

    if (validLineItems.length === 0) {
      toast({
        title: "Error",
        description: "At least one line item is required",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      order: {
        ...data,
        orderType: "purchase",
        freight: data.freight.toString(),
        discount: data.discount.toString(),
        subtotal: subtotal.toString(),
        total: total.toString(),
        status: data.status,
      },
      lineItems: validLineItems.map((item) => ({
        ...item,
        variantId: item.variantId || null,
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
        grossWeightKgs: item.grossWeightKgs?.toString() || "0",
        netWeightKgs: item.netWeightKgs?.toString() || "0",
      })),
    };

    if (isEditMode) {
      updateMutation.mutate(orderData);
    } else {
      createMutation.mutate(orderData);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-4">
      <Card className="w-full max-w-6xl mx-4" data-testid="purchase-order-form">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle data-testid="text-form-title">
            {isEditMode ? "Edit Purchase Order" : "Create Purchase Order"}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-form"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-vendor">
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeVendors.map((vendor: any) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.name}
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
                  name="orderNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="PO-XXXX"
                          data-testid="input-order-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orderDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-order-date"
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
                  name="purchaseOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Internal reference (optional)"
                          data-testid="input-reference"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="finalized">Finalized</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-lg font-semibold">Line Items</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Filter by Category:</span>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category: string) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 mb-2 text-sm font-medium text-muted-foreground border-b pb-2">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Rate</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-5">
                        <Select
                          value={item.productId}
                          onValueChange={(value) =>
                            handleProductChange(index, value)
                          }
                        >
                          <SelectTrigger data-testid={`select-product-${index}`}>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredProducts?.map((product: any) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} ({product.itemCode || "No code"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleQuantityChange(
                              index,
                              parseInt(e.target.value) || 1
                            )
                          }
                          data-testid={`input-quantity-${index}`}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleUnitPriceChange(
                              index,
                              parseFloat(e.target.value) || 0
                            )
                          }
                          data-testid={`input-price-${index}`}
                        />
                      </div>
                      <div className="col-span-2 text-right font-medium">
                        {formatCurrency(item.lineTotal)}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLineItem(index)}
                          data-testid={`button-remove-item-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Item button below products */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLineItem}
                  data-testid="button-add-line-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="freight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Freight</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
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
                      <FormLabel>Discount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          data-testid="input-discount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Freight:</span>
                  <span>{formatCurrency(freight)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Additional notes..."
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isEditMode ? "Update" : "Create"} Purchase Order
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
