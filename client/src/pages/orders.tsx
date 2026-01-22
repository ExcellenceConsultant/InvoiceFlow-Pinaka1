import SalesOrderForm from "@/components/sales-order-form";
import PurchaseOrderForm from "@/components/purchase-order-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Edit,
  FileText,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

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
  closed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const ORDER_STATUSES = ["draft", "approved", "closed", "cancelled"];

export default function Orders() {
  const permissions = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

      if (!normalizedSearch) {
        return matchesStatus;
      }

      const matchesSearch =
        order.orderNumber?.toLowerCase().includes(normalizedSearch) ||
        customerName.toLowerCase().includes(normalizedSearch) ||
        order.purchaseOrder?.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
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
  }, [orders, searchTerm, statusFilter, activeTab, sortConfig, customers]);

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
                          <div className="flex justify-end gap-2">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(order)}
                                data-testid={`button-edit-${order.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(order.id)}
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
