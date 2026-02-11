import SalesOrderForm from "@/components/sales-order-form";
import PurchaseOrderForm from "@/components/purchase-order-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDateWithoutTimezone } from "@/lib/dateUtils";
import { apiRequest } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Edit,
  Eye,
  FileText,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

type SortKey =
  | "orderNumber"
  | "orderType"
  | "customer"
  | "orderDate"
  | "totalCartons"
  | "amount"
  | "status";

type SortConfig = {
  key: SortKey;
  direction: "asc" | "desc";
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  approved: "bg-blue-100 text-blue-800",
  finalized: "bg-purple-100 text-purple-800",
  closed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const ORDER_STATUSES = ["draft", "approved", "finalized", "closed", "cancelled"];

export default function Orders() {
  const permissions = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"SO" | "PO">("SO");
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const categories = useMemo(() => {
    if (!products) return [];
    const cats = products
      .map((p: any) => p.category)
      .filter((c: string) => c && c.trim() !== "");
    return Array.from(new Set(cats)).sort();
  }, [products]);

  const handleCategoryClick = (category: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((c) => c !== category);
      }
      return [...prev, category];
    });
  };

  const handleAllCategoriesClick = () => {
    if (selectedCategories.length === 0 || selectedCategories.length === categories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories([]);
    }
  };

  const [, setLocation] = useLocation();

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest("DELETE", `/api/orders/${orderId}`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Success",
        description: "Order deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete order",
        variant: "destructive",
      });
    },
  });

  const convertOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/convert`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to convert order");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: data.message,
      });
      // Redirect to Business module with appropriate tab
      setLocation("/business");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to convert order",
        variant: "destructive",
      });
    },
  });

  const getCustomerName = (customerId: string) => {
    const customer = customers?.find((c: any) => c.id === customerId);
    return customer?.name || "Unknown";
  };

  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = orders.filter((order: any) => {
      const orderTypeFromTab = activeTab === "SO" ? "sales" : "purchase";
      const matchesTab = order.orderType === orderTypeFromTab;
      if (!matchesTab) return false;

      const customerName = getCustomerName(order.customerId);
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      const matchesCategory =
        selectedCategories.length === 0 ||
        (order.lineItems &&
          order.lineItems.some((item: any) =>
            selectedCategories.includes(item.category)
          ));

      if (!normalizedSearch) {
        return matchesStatus && matchesCategory;
      }

      const matchesSearch =
        order.orderNumber?.toLowerCase().includes(normalizedSearch) ||
        customerName.toLowerCase().includes(normalizedSearch) ||
        order.purchaseOrder?.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch && matchesCategory;
    });

    // Sort orders
    if (sortConfig) {
      filtered.sort((a: any, b: any) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case "orderNumber":
            aValue = a.orderNumber?.toLowerCase() || "";
            bValue = b.orderNumber?.toLowerCase() || "";
            break;
          case "customer":
            aValue = getCustomerName(a.customerId).toLowerCase();
            bValue = getCustomerName(b.customerId).toLowerCase();
            break;
          case "orderDate":
            aValue = new Date(a.orderDate).getTime();
            bValue = new Date(b.orderDate).getTime();
            break;
          case "totalCartons":
            aValue = a.totalCartons || 0;
            bValue = b.totalCartons || 0;
            break;
          case "amount":
            aValue = parseFloat(a.total) || 0;
            bValue = parseFloat(b.total) || 0;
            break;
          case "status":
            aValue = a.status || "";
            bValue = b.status || "";
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [orders, searchTerm, statusFilter, activeTab, sortConfig, customers, selectedCategories]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig?.key !== key) {
      return <ArrowUpDown className="h-4 w-4 ml-1" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  const handleEdit = async (order: any) => {
    setEditingOrder(order);
    setShowOrderForm(true);
  };

  const handleDelete = async (orderId: string) => {
    if (window.confirm("Are you sure you want to delete this order?")) {
      deleteOrderMutation.mutate(orderId);
    }
  };

  const handleFormSuccess = () => {
    setShowOrderForm(false);
    setEditingOrder(null);
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  };

  const handleFormClose = () => {
    setShowOrderForm(false);
    setEditingOrder(null);
  };

  const canCreate =
    activeTab === "SO"
      ? permissions.canCreateSalesOrder
      : permissions.canCreatePurchaseOrder;

  const canEdit =
    activeTab === "SO"
      ? permissions.canEditSalesOrder
      : permissions.canEditPurchaseOrder;

  const canDelete =
    activeTab === "SO"
      ? permissions.canDeleteSalesOrder
      : permissions.canDeletePurchaseOrder;

  const renderOrderForm = () => {
    if (!showOrderForm) return null;

    // When editing, check the order type to show correct form
    if (editingOrder) {
      if (editingOrder.orderType === "purchase") {
        return (
          <PurchaseOrderForm
            order={editingOrder}
            onClose={handleFormClose}
            onSuccess={handleFormSuccess}
          />
        );
      }
      return (
        <SalesOrderForm
          order={editingOrder}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      );
    }

    // When creating, use active tab to determine form
    if (activeTab === "PO") {
      return (
        <PurchaseOrderForm
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      );
    }
    return (
      <SalesOrderForm
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    );
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <Card data-testid="orders-page">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle data-testid="text-page-title">Orders</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Manage sales orders and purchase orders
            </p>
          </div>
          {canCreate && (
            <Button
              onClick={() => setShowOrderForm(true)}
              data-testid="button-create-order"
            >
              <Plus className="h-4 w-4 mr-2" />
              {activeTab === "SO" ? "Create Sales Order" : "Create Purchase Order"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as "SO" | "PO")}
            >
              <TabsList data-testid="tabs-order-type">
                <TabsTrigger value="SO" data-testid="tab-sales-orders">
                  Sales Orders
                </TabsTrigger>
                <TabsTrigger value="PO" data-testid="tab-purchase-orders">
                  Purchase Orders
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  className="w-full md:w-[180px]"
                  data-testid="select-status-filter"
                >
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {ORDER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover open={categoryDropdownOpen} onOpenChange={setCategoryDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryDropdownOpen}
                    className="w-full md:w-[200px] justify-between font-normal"
                    data-testid="select-category-filter"
                  >
                    <span className="truncate">
                      {selectedCategories.length === 0 || selectedCategories.length === categories.length
                        ? "All Categories"
                        : selectedCategories.length === 1
                        ? selectedCategories[0]
                        : `${selectedCategories.slice(0, 2).join(", ")}${selectedCategories.length > 2 ? ` (+${selectedCategories.length - 2})` : ""}`}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="max-h-[300px] overflow-y-auto p-2">
                    <div
                      className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted rounded-md"
                      onClick={handleAllCategoriesClick}
                      data-testid="category-option-all"
                    >
                      <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${selectedCategories.length === 0 || selectedCategories.length === categories.length ? "bg-primary border-primary" : "border-input"}`}>
                        {(selectedCategories.length === 0 || selectedCategories.length === categories.length) && <Check size={12} className="text-primary-foreground" />}
                      </div>
                      <span className="text-sm">All Categories</span>
                    </div>
                    {(categories as string[]).map((category: string) => (
                      <div
                        key={category}
                        className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted rounded-md"
                        onClick={() => handleCategoryClick(category)}
                        data-testid={`category-option-${category.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${selectedCategories.includes(category) ? "bg-primary border-primary" : "border-input"}`}>
                          {selectedCategories.includes(category) && <Check size={12} className="text-primary-foreground" />}
                        </div>
                        <span className="text-sm">{category}</span>
                      </div>
                    ))}
                  </div>
                  {selectedCategories.length > 0 && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setSelectedCategories([])}
                        data-testid="button-clear-categories"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading orders...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>
                  No {activeTab === "SO" ? "sales orders" : "purchase orders"}{" "}
                  found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="table-orders">
                  <thead>
                    <tr className="border-b">
                      <th
                        className="text-left py-3 px-4 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("orderNumber")}
                      >
                        <div className="flex items-center">
                          Order #
                          {getSortIcon("orderNumber")}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("customer")}
                      >
                        <div className="flex items-center">
                          {activeTab === "SO" ? "Customer" : "Vendor"}
                          {getSortIcon("customer")}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("orderDate")}
                      >
                        <div className="flex items-center">
                          Date
                          {getSortIcon("orderDate")}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-4 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("totalCartons")}
                      >
                        <div className="flex items-center justify-end">
                          Cartons
                          {getSortIcon("totalCartons")}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-4 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("amount")}
                      >
                        <div className="flex items-center justify-end">
                          Amount
                          {getSortIcon("amount")}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center">
                          Status
                          {getSortIcon("status")}
                        </div>
                      </th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order: any) => (
                      <tr
                        key={order.id}
                        className="border-b hover:bg-muted/50"
                        data-testid={`row-order-${order.id}`}
                      >
                        <td className="py-3 px-4 font-medium">
                          {order.orderNumber}
                        </td>
                        <td className="py-3 px-4">
                          {getCustomerName(order.customerId)}
                        </td>
                        <td className="py-3 px-4">
                          {formatDateWithoutTimezone(new Date(order.orderDate))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {order.totalCartons || 0}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatCurrency(parseFloat(order.total) || 0)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={cn(
                              ORDER_STATUS_COLORS[order.status] ||
                                "bg-gray-100 text-gray-800"
                            )}
                          >
                            {order.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-1">
                            {canEdit && !order.isConverted && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(order)}
                                title="Edit"
                                data-testid={`button-edit-${order.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {order.orderType === "sales" && permissions.canViewPackingSlip && (order.status === "approved" || order.status === "finalized" || order.isConverted) && (
                              <Link href={`/orders/${order.id}/packing-slip`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="View Packing Slip"
                                  data-testid={`button-packing-slip-${order.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            {order.orderType === "purchase" && (order.status === "approved" || order.status === "finalized" || order.isConverted) && (
                              <Link href={`/orders/${order.id}/purchase-order-view`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="View Purchase Order"
                                  data-testid={`button-view-po-${order.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            {(order.status === "approved" || order.status === "finalized") && !order.isConverted && (
                              order.orderType === "sales" ? (
                                permissions.canSendSalesOrderToInvoice && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => convertOrderMutation.mutate(order.id)}
                                    disabled={convertOrderMutation.isPending}
                                    title="Send to Invoice"
                                    data-testid={`button-send-to-invoice-${order.id}`}
                                  >
                                    <Send className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )
                              ) : (
                                permissions.canSendPurchaseOrderToBill && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => convertOrderMutation.mutate(order.id)}
                                    disabled={convertOrderMutation.isPending}
                                    title="Send to Bill"
                                    data-testid={`button-send-to-bill-${order.id}`}
                                  >
                                    <Send className="h-4 w-4 text-green-600" />
                                  </Button>
                                )
                              )
                            )}
                            {order.isConverted && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled
                                title="Already Converted"
                                data-testid={`button-converted-${order.id}`}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {canDelete && !order.isConverted && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(order.id)}
                                title="Delete"
                                data-testid={`button-delete-${order.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {renderOrderForm()}
    </div>
  );
}
