import CustomerVendorForm from "@/components/customer-vendor-form";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building,
  Download,
  Edit,
  FileText,
  Filter,
  Package,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

export default function Accounts() {
  const permissions = usePermissions();
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [customerCategoryFilter, setCustomerCategoryFilter] = useState("all");
  const [customerSortField, setCustomerSortField] = useState<"name" | "email" | "phone" | "status" | "openBalance" | null>(null);
  const [customerSortDir, setCustomerSortDir] = useState<"asc" | "desc">("asc");
  const [vendorSortField, setVendorSortField] = useState<"name" | "email" | "phone" | "status" | "openBalance" | null>(null);
  const [vendorSortDir, setVendorSortDir] = useState<"asc" | "desc">("asc");
  const customerFileInputRef = useRef<HTMLInputElement>(null);
  const vendorFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customers, isLoading: customersLoading } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    refetchOnMount: "always",
  });

  const { data: invoices } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: creditMemos } = useQuery<any[]>({
    queryKey: ["/api/credit-memos"],
  });

  // Fetch all line items for calculating quantities
  const { data: allLineItems } = useQuery({
    queryKey: ["/api/invoices/line-items"],
    queryFn: async () => {
      const invoiceList = invoices || [];
      if (invoiceList.length === 0) return [];

      const lineItemsPromises = invoiceList.map((inv: any) =>
        fetch(`/api/invoices/${inv.id}/line-items`)
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => []),
      );

      const lineItemsArrays = await Promise.all(lineItemsPromises);
      return lineItemsArrays.flat();
    },
    enabled: !!invoices && invoices.length > 0,
  });

  // Filter customers and vendors by type
  const customerList = (customers || []).filter(
    (c: any) => c.type === "customer",
  );
  const vendorList = (customers || []).filter((c: any) => c.type === "vendor");

  // Calculate customer stats
  const customerInvoices = (invoices || []).filter(
    (inv: any) => inv.invoiceType === "receivable",
  );
  const customerInvoiceCount = customerInvoices.length;
  const customerInvoiceValue = customerInvoices.reduce(
    (sum: number, inv: any) => sum + parseFloat(inv.total || 0),
    0,
  );
  const activeCustomers = customerList.filter(
    (c: any) => c.isActive !== false,
  ).length;

  // Calculate total quantity sold (from customer/AR invoices)
  const customerInvoiceIds = customerInvoices.map((inv: any) => inv.id);
  const customerLineItems = (allLineItems || []).filter((item: any) =>
    customerInvoiceIds.includes(item.invoiceId),
  );
  const totalQtySold = customerLineItems.reduce(
    (sum: number, item: any) => sum + parseInt(item.quantity || 0),
    0,
  );

  // Calculate vendor stats
  const vendorInvoices = (invoices || []).filter(
    (inv: any) => inv.invoiceType === "payable",
  );
  const vendorInvoiceCount = vendorInvoices.length;
  const vendorInvoiceValue = vendorInvoices.reduce(
    (sum: number, inv: any) => sum + parseFloat(inv.total || 0),
    0,
  );
  const activeVendors = vendorList.filter(
    (v: any) => v.isActive !== false,
  ).length;

  // Calculate total quantity purchased (from vendor/AP invoices)
  const vendorInvoiceIds = vendorInvoices.map((inv: any) => inv.id);
  const vendorLineItems = (allLineItems || []).filter((item: any) =>
    vendorInvoiceIds.includes(item.invoiceId),
  );
  const totalQtyPurchased = vendorLineItems.reduce(
    (sum: number, item: any) => sum + parseInt(item.quantity || 0),
    0,
  );

  // Helper function to get open balance total value for a customer/vendor
  const getOpenBalanceValue = (
    customerId: string,
    type: "customer" | "vendor",
  ) => {
    const invoiceType = type === "customer" ? "receivable" : "payable";

    // Sum of unpaid invoices
    const relevantInvoices = (invoices || []).filter(
      (inv: any) =>
        inv.customerId === customerId &&
        inv.invoiceType === invoiceType &&
        inv.status !== "paid",
    );
    const invoiceTotal = relevantInvoices.reduce(
      (sum: number, inv: any) => sum + parseFloat(inv.total || 0),
      0,
    );

    // Subtract credit memos (credit memos reduce the balance)
    const relevantCreditMemos = (creditMemos || []).filter(
      (cm: any) =>
        cm.customerId === customerId && cm.invoiceType === invoiceType,
    );
    const creditMemoTotal = relevantCreditMemos.reduce(
      (sum: number, cm: any) => sum + parseFloat(cm.total || 0),
      0,
    );

    // Open balance = invoices - credit memos
    const totalValue = invoiceTotal - creditMemoTotal;
    return Math.max(0, totalValue); // Ensure non-negative balance for display
  };

  const customerCategories = useMemo(() => {
    const cats = customerList
      .map((c: any) => c.customerCategory)
      .filter((cat: any) => cat && cat.trim() !== "");
    return Array.from(new Set(cats)) as string[];
  }, [customerList]);

  const filteredCustomerList = useMemo(() => {
    let list = [...customerList];
    const searchLower = customerSearch.toLowerCase().trim();
    if (searchLower) {
      list = list.filter((c: any) =>
        (c.name || "").toLowerCase().includes(searchLower) ||
        (c.email || "").toLowerCase().includes(searchLower) ||
        (c.phone || "").toLowerCase().includes(searchLower)
      );
    }
    if (customerCategoryFilter !== "all") {
      list = list.filter((c: any) => c.customerCategory === customerCategoryFilter);
    }
    if (customerSortField) {
      list.sort((a: any, b: any) => {
        let aVal: any, bVal: any;
        if (customerSortField === "openBalance") {
          aVal = getOpenBalanceValue(a.id, "customer");
          bVal = getOpenBalanceValue(b.id, "customer");
        } else if (customerSortField === "status") {
          aVal = a.isActive !== false ? "Active" : "Inactive";
          bVal = b.isActive !== false ? "Active" : "Inactive";
        } else {
          aVal = (a[customerSortField] || "").toLowerCase();
          bVal = (b[customerSortField] || "").toLowerCase();
        }
        if (aVal < bVal) return customerSortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return customerSortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [customerList, customerSearch, customerCategoryFilter, customerSortField, customerSortDir, invoices, creditMemos]);

  const filteredVendorList = useMemo(() => {
    let list = [...vendorList];
    const searchLower = vendorSearch.toLowerCase().trim();
    if (searchLower) {
      list = list.filter((v: any) =>
        (v.name || "").toLowerCase().includes(searchLower) ||
        (v.email || "").toLowerCase().includes(searchLower) ||
        (v.phone || "").toLowerCase().includes(searchLower)
      );
    }
    if (vendorSortField) {
      list.sort((a: any, b: any) => {
        let aVal: any, bVal: any;
        if (vendorSortField === "openBalance") {
          aVal = getOpenBalanceValue(a.id, "vendor");
          bVal = getOpenBalanceValue(b.id, "vendor");
        } else if (vendorSortField === "status") {
          aVal = a.isActive !== false ? "Active" : "Inactive";
          bVal = b.isActive !== false ? "Active" : "Inactive";
        } else {
          aVal = (a[vendorSortField] || "").toLowerCase();
          bVal = (b[vendorSortField] || "").toLowerCase();
        }
        if (aVal < bVal) return vendorSortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return vendorSortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [vendorList, vendorSearch, vendorSortField, vendorSortDir, invoices, creditMemos]);

  const handleCustomerSort = (field: "name" | "email" | "phone" | "status" | "openBalance") => {
    if (customerSortField === field) {
      setCustomerSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setCustomerSortField(field);
      setCustomerSortDir("asc");
    }
  };

  const handleVendorSort = (field: "name" | "email" | "phone" | "status" | "openBalance") => {
    if (vendorSortField === field) {
      setVendorSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setVendorSortField(field);
      setVendorSortDir("asc");
    }
  };

  const SortIcon = ({ field, currentField, currentDir }: { field: string; currentField: string | null; currentDir: "asc" | "desc" }) => {
    if (currentField !== field) return <ArrowUpDown size={14} className="ml-1 text-muted-foreground/50" />;
    return currentDir === "asc" ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
  };

  const isCustomerFiltered = customerSearch.trim() !== "" || customerCategoryFilter !== "all";
  const isVendorFiltered = vendorSearch.trim() !== "";

  // Export customers handler
  const handleExportCustomers = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/customers/export/customers-only`, { headers });
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "customers.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Customers exported successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export customers",
        variant: "destructive",
      });
    }
  };

  // Export vendors handler
  const handleExportVendors = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/customers/export/vendors-only`, { headers });
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vendors.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Vendors exported successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export vendors",
        variant: "destructive",
      });
    }
  };

  // Import customers mutation
  const importCustomersMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/customers/import/customers-only", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Import failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Import Complete",
        description: data.message,
      });
      if (data.errors && data.errors.length > 0) {
        console.log("Import errors:", data.errors);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import customers",
        variant: "destructive",
      });
    },
  });

  // Import vendors mutation
  const importVendorsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/customers/import/vendors-only", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Import failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Import Complete",
        description: data.message,
      });
      if (data.errors && data.errors.length > 0) {
        console.log("Import errors:", data.errors);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import vendors",
        variant: "destructive",
      });
    },
  });

  // Import customers handler
  const handleImportCustomers = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importCustomersMutation.mutate(file);
    }
    if (customerFileInputRef.current) {
      customerFileInputRef.current.value = "";
    }
  };

  // Import vendors handler
  const handleImportVendors = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importVendorsMutation.mutate(file);
    }
    if (vendorFileInputRef.current) {
      vendorFileInputRef.current.value = "";
    }
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/customers/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: "Delete failed" }));
        throw new Error(error.message || "Delete failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Account deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description:
          error.message === "Forbidden"
            ? "You don't have permission to delete accounts"
            : error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: "Update failed" }));
        throw new Error(error.message || "Update failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Account status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description:
          error.message === "Forbidden"
            ? "You don't have permission to update account status"
            : error.message || "Failed to update account status",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setShowCustomerForm(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (
      confirm(
        `Are you sure you want to delete ${name}? This action cannot be undone.`,
      )
    ) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    toggleActiveMutation.mutate({ id, isActive });
  };

  const handleCloseForm = () => {
    setShowCustomerForm(false);
    setShowVendorForm(false);
    setEditingCustomer(null);
  };

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const promises = ids.map((id) =>
        fetch(`/api/customers/${id}`, { method: "DELETE", headers }).then(
          async (res) => {
            if (!res.ok) {
              const error = await res
                .json()
                .catch(() => ({ message: "Delete failed" }));
              throw new Error(error.message || "Delete failed");
            }
            return res.json();
          },
        ),
      );
      const results = await Promise.allSettled(promises);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        const firstError =
          failed[0].status === "rejected"
            ? (failed[0].reason as Error).message
            : "Unknown error";
        if (firstError === "Forbidden") {
          throw new Error("You don't have permission to delete accounts");
        }
        throw new Error(`Failed to delete ${failed.length} account(s)`);
      }
      return results;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomers([]);
      setSelectedVendors([]);
      toast({
        title: "Success",
        description: `${ids.length} account(s) deleted successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete some accounts",
        variant: "destructive",
      });
    },
  });

  // Customer selection handlers
  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId],
    );
  };

  const handleSelectAllCustomers = () => {
    const visibleIds = filteredCustomerList.map((c: any) => c.id);
    if (visibleIds.every((id: string) => selectedCustomers.includes(id))) {
      setSelectedCustomers(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedCustomers(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDeleteCustomers = () => {
    if (selectedCustomers.length === 0) return;
    const confirmMessage = `Are you sure you want to delete ${selectedCustomers.length} customer(s)? This action cannot be undone.`;
    if (confirm(confirmMessage)) {
      bulkDeleteMutation.mutate(selectedCustomers);
    }
  };

  // Vendor selection handlers
  const handleSelectVendor = (vendorId: string) => {
    setSelectedVendors((prev) =>
      prev.includes(vendorId)
        ? prev.filter((id) => id !== vendorId)
        : [...prev, vendorId],
    );
  };

  const handleSelectAllVendors = () => {
    const visibleIds = filteredVendorList.map((v: any) => v.id);
    if (visibleIds.every((id: string) => selectedVendors.includes(id))) {
      setSelectedVendors(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedVendors(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDeleteVendors = () => {
    if (selectedVendors.length === 0) return;
    const confirmMessage = `Are you sure you want to delete ${selectedVendors.length} vendor(s)? This action cannot be undone.`;
    if (confirm(confirmMessage)) {
      bulkDeleteMutation.mutate(selectedVendors);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1
              className="text-3xl font-bold text-foreground"
              data-testid="page-title"
            >
              Accounts
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage customers, vendors, and account information
            </p>
          </div>

          <div className="flex items-center space-x-3 mt-4 lg:mt-0">
            <Button
              variant="outline"
              onClick={() => setShowCustomerForm(true)}
              disabled={!permissions.canManageCustomers}
              data-testid="button-create-customer"
            >
              <User className="mr-2" size={16} />
              Add Customer
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowVendorForm(true)}
              disabled={!permissions.canManageCustomers}
              data-testid="button-create-vendor"
            >
              <Building className="mr-2" size={16} />
              Add Vendor
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="customers" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="customers" data-testid="tab-customers">
            <User className="mr-2" size={16} />
            Customers
          </TabsTrigger>
          <TabsTrigger value="vendors" data-testid="tab-vendors">
            <Building className="mr-2" size={16} />
            Vendors
          </TabsTrigger>
        </TabsList>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-6">
          <Card data-testid="customers-card">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center">
                  <Users className="mr-2 text-primary" size={20} />
                  Customers ({isCustomerFiltered ? `${filteredCustomerList.length} of ${customerList.length}` : customerList.length})
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExportCustomers}
                    data-testid="button-export-customers"
                  >
                    <Download className="mr-2" size={14} />
                    Export Customers
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => customerFileInputRef.current?.click()}
                    disabled={importCustomersMutation.isPending || !permissions.canManageCustomers}
                    data-testid="button-import-customers"
                  >
                    <Upload className="mr-2" size={14} />
                    {importCustomersMutation.isPending ? "Importing..." : "Import Customers"}
                  </Button>
                  <input
                    ref={customerFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportCustomers}
                    style={{ display: "none" }}
                    data-testid="input-import-customers"
                  />
                  {selectedCustomers.length > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedCustomers.length} selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setSelectedCustomers([])}
                        data-testid="button-clear-customer-selection"
                        title="Clear selection"
                      >
                        <X size={14} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDeleteCustomers}
                        disabled={bulkDeleteMutation.isPending}
                        data-testid="button-bulk-delete-customers"
                      >
                        <Trash2 className="mr-2" size={14} />
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {customersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-muted/30 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : customerList.length > 0 ? (
                <>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                      placeholder="Search by name, email, or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-customer-search"
                    />
                  </div>
                  {customerCategories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-muted-foreground" />
                      <Select value={customerCategoryFilter} onValueChange={setCustomerCategoryFilter}>
                        <SelectTrigger className="w-[180px]" data-testid="select-customer-category">
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {customerCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-4 text-sm font-medium text-muted-foreground w-12">
                          <input
                            type="checkbox"
                            checked={
                              filteredCustomerList.length > 0 &&
                              filteredCustomerList.every((c: any) => selectedCustomers.includes(c.id))
                            }
                            onChange={handleSelectAllCustomers}
                            className="w-4 h-4 cursor-pointer"
                            data-testid="checkbox-select-all-customers"
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleCustomerSort("name")} data-testid="sort-customer-name">
                            Name <SortIcon field="name" currentField={customerSortField} currentDir={customerSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleCustomerSort("email")} data-testid="sort-customer-email">
                            Email <SortIcon field="email" currentField={customerSortField} currentDir={customerSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleCustomerSort("phone")} data-testid="sort-customer-phone">
                            Phone <SortIcon field="phone" currentField={customerSortField} currentDir={customerSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleCustomerSort("status")} data-testid="sort-customer-status">
                            Status <SortIcon field="status" currentField={customerSortField} currentDir={customerSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleCustomerSort("openBalance")} data-testid="sort-customer-openBalance">
                            Open Balance <SortIcon field="openBalance" currentField={customerSortField} currentDir={customerSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomerList.map((customer: any) => (
                        <tr
                          key={customer.id}
                          className="border-b border-border hover:bg-muted/20 transition-colors"
                          data-testid={`customer-row-${customer.id}`}
                        >
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedCustomers.includes(customer.id)}
                              onChange={() => handleSelectCustomer(customer.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 cursor-pointer"
                              data-testid={`checkbox-customer-${customer.id}`}
                            />
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-foreground">
                            {customer.name}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {customer.email || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {customer.phone || "N/A"}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                customer.isActive !== false
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
                              }`}
                            >
                              {customer.isActive !== false
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>
                          <td
                            className="py-3 px-4 text-sm font-medium text-foreground"
                            data-testid={`open-balance-customer-${customer.id}`}
                          >
                            {formatCurrency(
                              getOpenBalanceValue(customer.id, "customer"),
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleEdit(customer)}
                                disabled={!permissions.canManageCustomers}
                                data-testid={`button-edit-customer-${customer.id}`}
                                title="Edit"
                              >
                                <Edit size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${
                                  customer.isActive !== false
                                    ? "text-orange-600"
                                    : "text-green-600"
                                }`}
                                onClick={() =>
                                  handleToggleActive(
                                    customer.id,
                                    customer.isActive !== false,
                                  )
                                }
                                disabled={
                                  toggleActiveMutation.isPending ||
                                  !permissions.canManageCustomers
                                }
                                data-testid={`button-toggle-active-customer-${customer.id}`}
                                title={
                                  customer.isActive !== false
                                    ? "Mark as Inactive"
                                    : "Mark as Active"
                                }
                              >
                                <Power size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() =>
                                  handleDelete(customer.id, customer.name)
                                }
                                disabled={
                                  deleteMutation.isPending ||
                                  !permissions.canManageCustomers
                                }
                                data-testid={`button-delete-customer-${customer.id}`}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredCustomerList.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-customer-results">
                    No customers match your search criteria.
                  </div>
                )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">
                    No customers found
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first customer to get started.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setShowCustomerForm(true)}
                    disabled={!permissions.canManageCustomers}
                    data-testid="button-create-first-customer"
                  >
                    <Plus className="mr-2" size={16} />
                    Add Customer
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Data Sections for Customers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="customer-dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <Users className="mr-2 text-primary" size={18} />
                  Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Total Customers
                    </p>
                    <p
                      className="text-xl font-bold"
                      data-testid="total-customers"
                    >
                      {customerList.length}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Active Customers
                    </p>
                    <p
                      className="text-lg font-semibold text-accent"
                      data-testid="active-customers"
                    >
                      {activeCustomers}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="customer-invoices-card">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <FileText className="mr-2 text-primary" size={18} />
                  Invoices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Total AR Invoices
                    </p>
                    <p
                      className="text-xl font-bold"
                      data-testid="customer-invoice-count"
                    >
                      {customerInvoiceCount}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p
                      className="text-lg font-semibold text-chart-1"
                      data-testid="customer-invoice-value"
                    >
                      {formatCurrency(customerInvoiceValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="customer-inventory-card">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <Package className="mr-2 text-primary" size={18} />
                  Inventory
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Products Sold
                    </p>
                    <p
                      className="text-xl font-bold"
                      data-testid="customer-products-sold"
                    >
                      {totalQtySold}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Revenue Generated
                    </p>
                    <p
                      className="text-lg font-semibold text-chart-3"
                      data-testid="customer-revenue"
                    >
                      {formatCurrency(customerInvoiceValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="space-y-6">
          <Card data-testid="vendors-card">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center">
                  <Building className="mr-2 text-primary" size={20} />
                  Vendors ({isVendorFiltered ? `${filteredVendorList.length} of ${vendorList.length}` : vendorList.length})
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExportVendors}
                    data-testid="button-export-vendors"
                  >
                    <Download className="mr-2" size={14} />
                    Export Vendors
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => vendorFileInputRef.current?.click()}
                    disabled={importVendorsMutation.isPending || !permissions.canManageCustomers}
                    data-testid="button-import-vendors"
                  >
                    <Upload className="mr-2" size={14} />
                    {importVendorsMutation.isPending ? "Importing..." : "Import Vendors"}
                  </Button>
                  <input
                    ref={vendorFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportVendors}
                    style={{ display: "none" }}
                    data-testid="input-import-vendors"
                  />
                  {selectedVendors.length > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedVendors.length} selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setSelectedVendors([])}
                        data-testid="button-clear-vendor-selection"
                        title="Clear selection"
                      >
                        <X size={14} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDeleteVendors}
                        disabled={bulkDeleteMutation.isPending}
                        data-testid="button-bulk-delete-vendors"
                      >
                        <Trash2 className="mr-2" size={14} />
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {customersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-muted/30 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : vendorList.length > 0 ? (
                <>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                      placeholder="Search by name, email, or phone..."
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-vendor-search"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-4 text-sm font-medium text-muted-foreground w-12">
                          <input
                            type="checkbox"
                            checked={
                              filteredVendorList.length > 0 &&
                              filteredVendorList.every((v: any) => selectedVendors.includes(v.id))
                            }
                            onChange={handleSelectAllVendors}
                            className="w-4 h-4 cursor-pointer"
                            data-testid="checkbox-select-all-vendors"
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleVendorSort("name")} data-testid="sort-vendor-name">
                            Name <SortIcon field="name" currentField={vendorSortField} currentDir={vendorSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleVendorSort("email")} data-testid="sort-vendor-email">
                            Email <SortIcon field="email" currentField={vendorSortField} currentDir={vendorSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleVendorSort("phone")} data-testid="sort-vendor-phone">
                            Phone <SortIcon field="phone" currentField={vendorSortField} currentDir={vendorSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleVendorSort("status")} data-testid="sort-vendor-status">
                            Status <SortIcon field="status" currentField={vendorSortField} currentDir={vendorSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          <span className="flex items-center cursor-pointer select-none" onClick={() => handleVendorSort("openBalance")} data-testid="sort-vendor-openBalance">
                            Open Balance <SortIcon field="openBalance" currentField={vendorSortField} currentDir={vendorSortDir} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendorList.map((vendor: any) => (
                        <tr
                          key={vendor.id}
                          className="border-b border-border hover:bg-muted/20 transition-colors"
                          data-testid={`vendor-row-${vendor.id}`}
                        >
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedVendors.includes(vendor.id)}
                              onChange={() => handleSelectVendor(vendor.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 cursor-pointer"
                              data-testid={`checkbox-vendor-${vendor.id}`}
                            />
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-foreground">
                            {vendor.name}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {vendor.email || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {vendor.phone || "N/A"}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                vendor.isActive !== false
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
                              }`}
                            >
                              {vendor.isActive !== false
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>
                          <td
                            className="py-3 px-4 text-sm font-medium text-foreground"
                            data-testid={`open-balance-vendor-${vendor.id}`}
                          >
                            {formatCurrency(
                              getOpenBalanceValue(vendor.id, "vendor"),
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleEdit(vendor)}
                                disabled={!permissions.canManageCustomers}
                                data-testid={`button-edit-vendor-${vendor.id}`}
                                title="Edit"
                              >
                                <Edit size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${
                                  vendor.isActive !== false
                                    ? "text-orange-600"
                                    : "text-green-600"
                                }`}
                                onClick={() =>
                                  handleToggleActive(
                                    vendor.id,
                                    vendor.isActive !== false,
                                  )
                                }
                                disabled={
                                  toggleActiveMutation.isPending ||
                                  !permissions.canManageCustomers
                                }
                                data-testid={`button-toggle-active-vendor-${vendor.id}`}
                                title={
                                  vendor.isActive !== false
                                    ? "Mark as Inactive"
                                    : "Mark as Active"
                                }
                              >
                                <Power size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() =>
                                  handleDelete(vendor.id, vendor.name)
                                }
                                disabled={
                                  deleteMutation.isPending ||
                                  !permissions.canManageCustomers
                                }
                                data-testid={`button-delete-vendor-${vendor.id}`}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredVendorList.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-vendor-results">
                    No vendors match your search criteria.
                  </div>
                )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Building className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">
                    No vendors found
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first vendor to get started.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setShowVendorForm(true)}
                    disabled={!permissions.canManageCustomers}
                    data-testid="button-create-first-vendor"
                  >
                    <Plus className="mr-2" size={16} />
                    Add Vendor
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Data Sections for Vendors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="vendor-dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <Building className="mr-2 text-primary" size={18} />
                  Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Total Vendors
                    </p>
                    <p
                      className="text-xl font-bold"
                      data-testid="total-vendors"
                    >
                      {vendorList.length}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Active Vendors
                    </p>
                    <p
                      className="text-lg font-semibold text-accent"
                      data-testid="active-vendors"
                    >
                      {activeVendors}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="vendor-invoices-card">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <FileText className="mr-2 text-primary" size={18} />
                  Invoices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Total AP Invoices
                    </p>
                    <p
                      className="text-xl font-bold"
                      data-testid="vendor-invoice-count"
                    >
                      {vendorInvoiceCount}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p
                      className="text-lg font-semibold text-chart-1"
                      data-testid="vendor-invoice-value"
                    >
                      {formatCurrency(vendorInvoiceValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="vendor-inventory-card">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <Package className="mr-2 text-primary" size={18} />
                  Inventory
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Products Purchased
                    </p>
                    <p
                      className="text-xl font-bold"
                      data-testid="vendor-products-purchased"
                    >
                      {totalQtyPurchased}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Total Spent</p>
                    <p
                      className="text-lg font-semibold text-chart-3"
                      data-testid="vendor-spent"
                    >
                      {formatCurrency(vendorInvoiceValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <CustomerVendorForm
          type="customer"
          customer={editingCustomer}
          onClose={handleCloseForm}
          onSuccess={handleCloseForm}
        />
      )}

      {/* Vendor Form Modal */}
      {showVendorForm && (
        <CustomerVendorForm
          type="vendor"
          customer={editingCustomer}
          onClose={handleCloseForm}
          onSuccess={handleCloseForm}
        />
      )}
    </div>
  );
}
