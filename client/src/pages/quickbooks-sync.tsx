import { useState } from "react";
import { CheckCircle, AlertCircle, Upload, Users, Package, FileText, ArrowRight, Search, RefreshCw } from "lucide-react";
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
import { usePermissions } from "@/hooks/usePermissions";

export default function QuickBooksSync() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAccounts, setShowAccounts] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [showSyncResults, setShowSyncResults] = useState(false);
  const [syncResults, setSyncResults] = useState<{
    failedCustomers: any[];
    failedProducts: any[];
  }>({ failedCustomers: [], failedProducts: [] });
  const permissions = usePermissions();

  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
  });

  const { data: products } = useQuery({
    queryKey: ["/api/products"],
  });

  const { data: invoices } = useQuery({
    queryKey: ["/api/invoices"],
  });

  const syncCustomerMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      // Use appropriate endpoint based on type
      const endpoint = type === "vendor" 
        ? `/api/vendors/${id}/sync-quickbooks`
        : `/api/customers/${id}/sync-quickbooks`;
      const response = await apiRequest("POST", endpoint, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to sync ${type}`);
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: `${variables.type === "vendor" ? "Vendor" : "Customer"} synced to QuickBooks successfully!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sync to QuickBooks",
        variant: "destructive",
      });
    },
  });

  const syncProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiRequest("POST", `/api/products/${productId}/sync-quickbooks`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to sync product");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Product synced to QuickBooks successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sync product to QuickBooks",
        variant: "destructive",
      });
    },
  });

  const isConnected = !!(user as any)?.quickbooksCompanyId;
  
  // Separate customers and vendors
  const customersOnly = (customers as any[])?.filter((c: any) => c.type === "customer" || !c.type) || [];
  const vendorsOnly = (customers as any[])?.filter((c: any) => c.type === "vendor") || [];
  const syncedCustomers = customersOnly.filter((c: any) => c.quickbooksCustomerId);
  const syncedVendors = vendorsOnly.filter((v: any) => v.quickbooksCustomerId);
  const syncedProducts = (products as any[])?.filter((p: any) => p.quickbooksItemId) || [];
  const syncedInvoices = (invoices as any[])?.filter((i: any) => i.quickbooksInvoiceId) || [];
  
  const restrictedUsers = ["mananyadav", "sales"];
  const isRestrictedUser = restrictedUsers.includes((user as any)?.username || "");
  const canEditSync = !isRestrictedUser && permissions.canPostToQuickBooks;

  const checkAccountsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", '/api/quickbooks/accounts');
      return await response.json();
    },
    onSuccess: (data: any) => {
      setAccounts(data.accounts || []);
      setShowAccounts(true);
      toast({
        title: "Accounts Retrieved",
        description: `Found ${data.totalAccounts} QuickBooks accounts`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch QuickBooks accounts",
        variant: "destructive",
      });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const unsyncedCustomers = (customers as any[])?.filter((c: any) => !c.quickbooksCustomerId) || [];
      const unsyncedProducts = (products as any[])?.filter((p: any) => !p.quickbooksItemId) || [];

      const failedCustomers: any[] = [];
      const failedProducts: any[] = [];

      // Sync all customers/vendors using appropriate endpoint based on type
      const customerPromises = unsyncedCustomers.map(async (customer: any) => {
        try {
          const endpoint = customer.type === "vendor"
            ? `/api/vendors/${customer.id}/sync-quickbooks`
            : `/api/customers/${customer.id}/sync-quickbooks`;
          const response = await apiRequest("POST", endpoint, {});
          if (!response.ok) {
            throw new Error("Failed to sync");
          }
          return { success: true, item: customer };
        } catch (error) {
          failedCustomers.push(customer);
          return { success: false, item: customer };
        }
      });

      // Sync all products
      const productPromises = unsyncedProducts.map(async (product: any) => {
        try {
          const response = await apiRequest("POST", `/api/products/${product.id}/sync-quickbooks`, {});
          if (!response.ok) {
            throw new Error("Failed to sync");
          }
          return { success: true, item: product };
        } catch (error) {
          failedProducts.push(product);
          return { success: false, item: product };
        }
      });

      // Wait for all syncs to complete
      await Promise.all([...customerPromises, ...productPromises]);

      return {
        totalCustomers: unsyncedCustomers.length,
        totalProducts: unsyncedProducts.length,
        failedCustomers,
        failedProducts,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      const totalFailed = data.failedCustomers.length + data.failedProducts.length;
      const totalItems = data.totalCustomers + data.totalProducts;

      if (totalFailed === 0) {
        toast({
          title: "Success",
          description: "Everything synced successfully!",
        });
      } else {
        setSyncResults({
          failedCustomers: data.failedCustomers,
          failedProducts: data.failedProducts,
        });
        setShowSyncResults(true);
        toast({
          title: "Partial Sync Complete",
          description: `${totalItems - totalFailed} of ${totalItems} items synced. ${totalFailed} items failed.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sync items to QuickBooks",
        variant: "destructive",
      });
    },
  });

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please connect to QuickBooks first before syncing data. Go to QuickBooks Auth page to connect.
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
            <h1 className="text-3xl font-bold text-foreground mb-2">QuickBooks Sync Manager</h1>
            <p className="text-muted-foreground">
              Sync your customers, products, and invoices to QuickBooks in the correct order.
            </p>
          </div>
          <Button
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending || !canEditSync}
            size="lg"
            className="bg-primary hover:bg-primary/90"
            data-testid="button-sync-all"
          >
            <RefreshCw className={`mr-2 h-5 w-5 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
            {syncAllMutation.isPending ? "Syncing..." : "Sync All"}
          </Button>
        </div>
        
        {/* Restricted User Notice */}
        {isRestrictedUser && (
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have read-only access to this page. Contact an administrator to perform sync operations.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Debug: Check QuickBooks Accounts */}
        <div className="flex gap-4 mt-4">
          <Button 
            onClick={() => checkAccountsMutation.mutate()}
            disabled={checkAccountsMutation.isPending || !canEditSync}
            variant="outline"
            size="sm"
            data-testid="button-check-qb-accounts"
          >
            <Search className="mr-2 h-4 w-4" />
            {checkAccountsMutation.isPending ? "Loading..." : "Debug: Check QB Accounts"}
          </Button>
          {showAccounts && (
            <Button 
              onClick={() => setShowAccounts(false)}
              variant="ghost"
              size="sm"
              disabled={!canEditSync}
              data-testid="button-hide-accounts"
            >
              Hide Accounts
            </Button>
          )}
        </div>
      </div>

      {/* QuickBooks Accounts Display */}
      {showAccounts && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>QuickBooks Chart of Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Account ID</th>
                    <th className="text-left p-2">Account Name</th>
                    <th className="text-left p-2">Account Type</th>
                    <th className="text-left p-2">Sub Type</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account: any, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 font-mono">{account.id}</td>
                      <td className="p-2">{account.name}</td>
                      <td className="p-2">
                        <Badge variant={account.type === 'Accounts Receivable' || account.type === 'Income' ? 'default' : 'secondary'}>
                          {account.type}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">{account.subType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Customers Synced</p>
                <p className="text-2xl font-bold">{syncedCustomers.length}/{customersOnly.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendors Synced</p>
                <p className="text-2xl font-bold">{syncedVendors.length}/{vendorsOnly.length}</p>
              </div>
              <Users className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Products Synced</p>
                <p className="text-2xl font-bold">{syncedProducts.length}/{(products as any[])?.length || 0}</p>
              </div>
              <Package className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Invoices Synced</p>
                <p className="text-2xl font-bold">{syncedInvoices.length}/{(invoices as any[])?.length || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Workflow */}
      <div className="space-y-6">
        {/* Step 1: Customers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
              <Users className="h-5 w-5" />
              Sync Customers First
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Before creating invoices in QuickBooks, you must sync all customers first.
            </p>
            <div className="space-y-2">
              {/* Customers Section */}
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Customers</h4>
                {(customers as any[])?.filter((c: any) => c.type === "customer" || !c.type).map((customer: any) => (
                  <div key={customer.id} className="flex items-center justify-between p-3 border rounded-lg mb-2">
                    <div className="flex items-center gap-3">
                      {customer.quickbooksCustomerId ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {customer.quickbooksCustomerId ? (
                        <Badge className="bg-green-500">Synced</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => syncCustomerMutation.mutate({ id: customer.id, type: "customer" })}
                          disabled={syncCustomerMutation.isPending || !canEditSync}
                          data-testid={`button-sync-customer-${customer.id}`}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          Sync
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Vendors Section */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Vendors</h4>
                {(customers as any[])?.filter((c: any) => c.type === "vendor").map((vendor: any) => (
                  <div key={vendor.id} className="flex items-center justify-between p-3 border rounded-lg mb-2">
                    <div className="flex items-center gap-3">
                      {vendor.quickbooksCustomerId ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                      <div>
                        <p className="font-medium">{vendor.name}</p>
                        <p className="text-sm text-muted-foreground">{vendor.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {vendor.quickbooksCustomerId ? (
                        <Badge className="bg-green-500">Synced</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => syncCustomerMutation.mutate({ id: vendor.id, type: "vendor" })}
                          disabled={syncCustomerMutation.isPending || !canEditSync}
                          data-testid={`button-sync-vendor-${vendor.id}`}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          Sync
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {(customers as any[])?.filter((c: any) => c.type === "vendor").length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No vendors found</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Arrow */}
        <div className="flex justify-center">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* Step 2: Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
              <Package className="h-5 w-5" />
              Sync Products Second
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              After customers, sync all products before creating invoices.
            </p>
            <div className="space-y-2">
              {(products as any[])?.map((product: any) => (
                <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {product.quickbooksItemId ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">${product.basePrice}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {product.quickbooksItemId ? (
                      <Badge className="bg-green-500">Synced</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => syncProductMutation.mutate(product.id)}
                        disabled={syncProductMutation.isPending || !canEditSync}
                        data-testid={`button-sync-product-${product.id}`}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Sync
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Arrow */}
        <div className="flex justify-center">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* Step 3: Invoices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">3</span>
              <FileText className="h-5 w-5" />
              Sync Invoices Last
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Once customers and products are synced, you can sync invoices from the Invoices page.
            </p>
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                After syncing customers and products, go to the Invoices page and click the sync button (📤) next to each invoice.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Sync Results Dialog */}
      <Dialog open={showSyncResults} onOpenChange={setShowSyncResults}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync Results - Failed Items</DialogTitle>
            <DialogDescription>
              The following items failed to sync to QuickBooks. Please try syncing them individually.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {syncResults.failedCustomers.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Users className="h-5 w-5 text-destructive" />
                  Failed Customers ({syncResults.failedCustomers.length})
                </h3>
                <div className="space-y-2">
                  {syncResults.failedCustomers.map((customer: any) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5"
                    >
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-sm text-muted-foreground">{customer.email}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          syncCustomerMutation.mutate(customer.id);
                          setShowSyncResults(false);
                        }}
                        disabled={syncCustomerMutation.isPending}
                        data-testid={`retry-sync-customer-${customer.id}`}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {syncResults.failedProducts.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5 text-destructive" />
                  Failed Products ({syncResults.failedProducts.length})
                </h3>
                <div className="space-y-2">
                  {syncResults.failedProducts.map((product: any) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5"
                    >
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">${product.basePrice}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          syncProductMutation.mutate(product.id);
                          setShowSyncResults(false);
                        }}
                        disabled={syncProductMutation.isPending}
                        data-testid={`retry-sync-product-${product.id}`}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => setShowSyncResults(false)}
              data-testid="button-close-sync-results"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}