import { useState } from "react";
import { CheckCircle, AlertCircle, Upload, Users, Package, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ZohoSync() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSyncResults, setShowSyncResults] = useState(false);
  const [syncResults, setSyncResults] = useState<{ failedCustomers: any[]; failedProducts: any[] }>({
    failedCustomers: [],
    failedProducts: [],
  });

  const { data: zohoStatus } = useQuery<any>({ queryKey: ["/api/auth/zoho/status"] });
  const { data: customers } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: products } = useQuery<any[]>({ queryKey: ["/api/products"] });
  const { data: invoices } = useQuery<any[]>({ queryKey: ["/api/invoices"] });

  const isConnected = zohoStatus?.connected;

  const customersOnly = customers?.filter((c) => c.type === "customer" || !c.type) || [];
  const vendorsOnly = customers?.filter((c) => c.type === "vendor") || [];
  const syncedCustomers = customersOnly.filter((c) => c.zohoBooksContactId);
  const syncedVendors = vendorsOnly.filter((v) => v.zohoBooksContactId);
  const syncedProducts = products?.filter((p) => p.zohoBooksItemId) || [];
  const syncedInvoices = invoices?.filter((i) => i.zohoBooksInvoiceId) || [];

  const syncCustomerMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      const endpoint = type === "vendor" ? `/api/vendors/${id}/sync-zoho` : `/api/customers/${id}/sync-zoho`;
      const response = await apiRequest("POST", endpoint, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to sync ${type}`);
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Success", description: `${variables.type === "vendor" ? "Vendor" : "Customer"} synced to Zoho Books successfully!` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to sync to Zoho Books", variant: "destructive" });
    },
  });

  const syncProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiRequest("POST", `/api/products/${productId}/sync-zoho`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to sync product");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Success", description: "Product synced to Zoho Books successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to sync product to Zoho Books", variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const unsyncedCustomers = customers?.filter((c) => !c.zohoBooksContactId) || [];
      const unsyncedProducts = products?.filter((p) => !p.zohoBooksItemId) || [];

      const failedCustomers: any[] = [];
      const failedProducts: any[] = [];

      const customerPromises = unsyncedCustomers.map(async (customer) => {
        try {
          const endpoint = customer.type === "vendor" ? `/api/vendors/${customer.id}/sync-zoho` : `/api/customers/${customer.id}/sync-zoho`;
          const response = await apiRequest("POST", endpoint, {});
          if (!response.ok) throw new Error("Failed to sync");
          return { success: true };
        } catch {
          failedCustomers.push(customer);
          return { success: false };
        }
      });

      const productPromises = unsyncedProducts.map(async (product) => {
        try {
          const response = await apiRequest("POST", `/api/products/${product.id}/sync-zoho`, {});
          if (!response.ok) throw new Error("Failed to sync");
          return { success: true };
        } catch {
          failedProducts.push(product);
          return { success: false };
        }
      });

      await Promise.all([...customerPromises, ...productPromises]);

      return { totalCustomers: unsyncedCustomers.length, totalProducts: unsyncedProducts.length, failedCustomers, failedProducts };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      const totalFailed = data.failedCustomers.length + data.failedProducts.length;
      if (totalFailed === 0) {
        toast({ title: "Success", description: "Everything synced to Zoho Books successfully!" });
      } else {
        setSyncResults({ failedCustomers: data.failedCustomers, failedProducts: data.failedProducts });
        setShowSyncResults(true);
        toast({ title: "Partial Sync", description: `${totalFailed} item(s) failed to sync.`, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to sync to Zoho Books", variant: "destructive" });
    },
  });

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please connect to Zoho Books first. Go to the <strong>Zoho Auth</strong> page to connect.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Zoho Books Sync Manager</h1>
            <p className="text-muted-foreground">
              Sync your customers, vendors, products, and invoices to Zoho Books.
              {zohoStatus?.organizationName && (
                <span className="ml-1 text-primary font-medium">Organization: {zohoStatus.organizationName}</span>
              )}
            </p>
          </div>
          <Button
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
            size="lg"
            className="bg-primary hover:bg-primary/90"
            data-testid="button-sync-all"
          >
            <RefreshCw className={`mr-2 h-5 w-5 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
            {syncAllMutation.isPending ? "Syncing..." : "Sync All"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Customers", synced: syncedCustomers.length, total: customersOnly.length, icon: Users },
          { label: "Vendors", synced: syncedVendors.length, total: vendorsOnly.length, icon: Users },
          { label: "Products", synced: syncedProducts.length, total: products?.length || 0, icon: Package },
          { label: "Invoices", synced: syncedInvoices.length, total: invoices?.length || 0, icon: FileText },
        ].map(({ label, synced, total, icon: Icon }) => (
          <Card key={label} data-testid={`card-${label.toLowerCase()}-summary`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Icon className="text-primary" size={20} />
                <Badge className={synced === total ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}>
                  {synced}/{total}
                </Badge>
              </div>
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{synced === total ? "All synced" : `${total - synced} pending`}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Customers */}
      <Card className="mb-6" data-testid="card-customers">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="mr-2 text-primary" size={20} />
            Customers ({syncedCustomers.length}/{customersOnly.length} synced)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {customersOnly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers found.</p>
            ) : (
              customersOnly.map((customer) => (
                <div key={customer.id} className="flex items-center justify-between p-2 rounded border" data-testid={`row-customer-${customer.id}`}>
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    {customer.zohoBooksContactId && (
                      <p className="text-xs text-muted-foreground">Zoho ID: {customer.zohoBooksContactId}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {customer.zohoBooksContactId ? (
                      <Badge className="bg-accent text-accent-foreground"><CheckCircle className="mr-1 h-3 w-3" />Synced</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncCustomerMutation.mutate({ id: customer.id, type: "customer" })}
                        disabled={syncCustomerMutation.isPending}
                        data-testid={`button-sync-customer-${customer.id}`}
                      >
                        <Upload className="mr-1 h-3 w-3" />Sync
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vendors */}
      <Card className="mb-6" data-testid="card-vendors">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="mr-2 text-primary" size={20} />
            Vendors ({syncedVendors.length}/{vendorsOnly.length} synced)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {vendorsOnly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vendors found.</p>
            ) : (
              vendorsOnly.map((vendor) => (
                <div key={vendor.id} className="flex items-center justify-between p-2 rounded border" data-testid={`row-vendor-${vendor.id}`}>
                  <div>
                    <p className="text-sm font-medium">{vendor.name}</p>
                    {vendor.zohoBooksContactId && (
                      <p className="text-xs text-muted-foreground">Zoho ID: {vendor.zohoBooksContactId}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {vendor.zohoBooksContactId ? (
                      <Badge className="bg-accent text-accent-foreground"><CheckCircle className="mr-1 h-3 w-3" />Synced</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncCustomerMutation.mutate({ id: vendor.id, type: "vendor" })}
                        disabled={syncCustomerMutation.isPending}
                        data-testid={`button-sync-vendor-${vendor.id}`}
                      >
                        <Upload className="mr-1 h-3 w-3" />Sync
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <Card className="mb-6" data-testid="card-products">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="mr-2 text-primary" size={20} />
            Products ({syncedProducts.length}/{products?.length || 0} synced)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(products || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No products found.</p>
            ) : (
              (products || []).map((product) => (
                <div key={product.id} className="flex items-center justify-between p-2 rounded border" data-testid={`row-product-${product.id}`}>
                  <div>
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">SKU: {product.itemCode || "—"}</p>
                    {product.zohoBooksItemId && (
                      <p className="text-xs text-muted-foreground">Zoho Item ID: {product.zohoBooksItemId}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {product.zohoBooksItemId ? (
                      <Badge className="bg-accent text-accent-foreground"><CheckCircle className="mr-1 h-3 w-3" />Synced</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncProductMutation.mutate(product.id)}
                        disabled={syncProductMutation.isPending}
                        data-testid={`button-sync-product-${product.id}`}
                      >
                        <Upload className="mr-1 h-3 w-3" />Sync
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices — info only; posting triggered from invoice view */}
      <Card data-testid="card-invoices">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 text-primary" size={20} />
            Invoices ({syncedInvoices.length}/{invoices?.length || 0} posted to Zoho)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To post an invoice or bill to Zoho Books, open the invoice detail page and click <strong>Post to Zoho Books</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Failed sync dialog */}
      <Dialog open={showSyncResults} onOpenChange={setShowSyncResults}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Results</DialogTitle>
            <DialogDescription>The following items failed to sync to Zoho Books.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {syncResults.failedCustomers.length > 0 && (
              <div>
                <p className="font-medium text-sm mb-2">Failed Customers/Vendors:</p>
                {syncResults.failedCustomers.map((c) => (
                  <p key={c.id} className="text-sm text-destructive">{c.name}</p>
                ))}
              </div>
            )}
            {syncResults.failedProducts.length > 0 && (
              <div>
                <p className="font-medium text-sm mb-2">Failed Products:</p>
                {syncResults.failedProducts.map((p) => (
                  <p key={p.id} className="text-sm text-destructive">{p.name}</p>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
