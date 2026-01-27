import InventoryModal from "@/components/inventory-modal";
import InvoiceForm from "@/components/invoice-form";
import StatsCards from "@/components/stats-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { INVOICE_STATUS_COLORS } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { Invoice, User } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, History, Link as LinkIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const permissions = usePermissions();

  // Use default queryFn which includes auth headers from queryClient
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  // Fetch all invoices from API
  const { data: allInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  // Fetch customers to map customer names
  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  // Create customer name map
  const customerNameMap = useMemo(() => {
    if (!customers) return {};
    return customers.reduce(
      (acc: Record<string, string>, customer: any) => {
        const name =
          customer.name ||
          customer.companyName ||
          customer.displayName ||
          customer.businessName ||
          customer.contactName ||
          "";
        if (customer.id) {
          acc[customer.id] = name;
        }
        return acc;
      },
      {} as Record<string, string>,
    );
  }, [customers]);

  // Get only the 3 most recent AR invoices (sorted by invoice number descending)
  const recentInvoices = useMemo(() => {
    if (!allInvoices) return [];

    // Filter for AR invoices only
    const arInvoices = allInvoices.filter(
      (inv) => inv.invoiceType === "receivable"
    );

    // Sort by invoice number (descending) - extract numeric part for proper sorting
    const sorted = [...arInvoices].sort((a, b) => {
      const numA = parseInt(a.invoiceNumber.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.invoiceNumber.replace(/\D/g, ""), 10) || 0;
      return numB - numA;
    });

    // Return top 3
    return sorted.slice(0, 3);
  }, [allInvoices]);

  const isQuickBooksConnected = !!user?.quickbooksCompanyId;

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");

      await apiRequest("PATCH", `/api/users/${user.id}`, {
        quickbooksAccessToken: null,
        quickbooksRefreshToken: null,
        quickbooksCompanyId: null,
        quickbooksCompanyName: null,
        quickbooksTokenExpiry: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Success",
        description: "QuickBooks account disconnected successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect QuickBooks account",
        variant: "destructive",
      });
    },
  });

  const handleConnectQuickBooks = () => {
    setLocation("/auth/quickbooks");
  };

  const handleDisconnectQuickBooks = () => {
    if (
      confirm(
        "Are you sure you want to disconnect your QuickBooks account? This will stop all synchronization.",
      )
    ) {
      disconnectMutation.mutate();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div>
          <h1
            className="text-3xl font-bold text-foreground"
            data-testid="page-title"
          >
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage invoices, inventory, and product schemes
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCards />

      <div className="space-y-8">
        {/* QuickBooks Status */}
        <Card data-testid="quickbooks-integration-card">
          <CardHeader>
            <CardTitle className="flex items-center">
              <LinkIcon className="mr-2 text-primary" size={18} />
              QuickBooks Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">QB</span>
                </div>
                <div>
                  <p
                    className="font-medium text-foreground"
                    data-testid="quickbooks-company-name"
                  >
                    {isQuickBooksConnected
                      ? user?.quickbooksCompanyName || "Connected"
                      : "Not Connected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Company ID:{" "}
                    <span data-testid="quickbooks-company-id">
                      {user?.quickbooksCompanyId || "Not Available"}
                    </span>
                  </p>
                </div>
              </div>
              {isQuickBooksConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive hover:bg-destructive/10"
                  data-testid="button-disconnect-quickbooks"
                  onClick={handleDisconnectQuickBooks}
                  disabled={!permissions.canManageDashboard}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  data-testid="button-connect-quickbooks"
                  onClick={handleConnectQuickBooks}
                  disabled={!permissions.canManageDashboard}
                >
                  Connect
                </Button>
              )}
            </div>

            <div className="text-center p-3 bg-primary/5 rounded-lg">
              <p
                className="text-2xl font-bold text-primary"
                data-testid="quickbooks-connection-status"
              >
                {isQuickBooksConnected ? "Connected" : "Not Connected"}
              </p>
              <p className="text-sm text-muted-foreground">Connection Status</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card data-testid="recent-invoices-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <History className="mr-2 text-primary" size={18} />
                Recent Invoices
              </CardTitle>
              <Button
                variant="link"
                size="sm"
                data-testid="button-view-all-invoices"
                onClick={() => setLocation("/invoices")}
                disabled={!permissions.canManageDashboard}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentInvoices?.length ? (
                recentInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`invoice-item-${invoice.invoiceNumber}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <DollarSign className="text-primary" size={14} />
                      </div>
                      <div>
                        <p
                          className="font-medium text-foreground"
                          data-testid={`invoice-number-${invoice.invoiceNumber}`}
                        >
                          #{invoice.invoiceNumber}
                        </p>
                        <p
                          className="text-sm text-muted-foreground"
                          data-testid={`invoice-customer-${invoice.invoiceNumber}`}
                        >
                          {invoice.customerId
                            ? customerNameMap[invoice.customerId] || `Customer #${invoice.customerId}`
                            : "No Customer"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="font-medium text-foreground"
                        data-testid={`invoice-total-${invoice.invoiceNumber}`}
                      >
                        {formatCurrency(invoice.total)}
                      </p>
                      <Badge
                        className={
                          INVOICE_STATUS_COLORS[
                            invoice.status as keyof typeof INVOICE_STATUS_COLORS
                          ]
                        }
                        data-testid={`invoice-status-${invoice.invoiceNumber}`}
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">
                    No invoices yet
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first invoice to get started.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setShowInvoiceForm(true)}
                    disabled={!permissions.canCreateInvoice}
                    data-testid="button-create-first-invoice"
                  >
                    <Plus className="mr-2" size={16} />
                    Create Invoice
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      {showInvoiceForm && (
        <InvoiceForm
          onClose={() => setShowInvoiceForm(false)}
          onSuccess={() => setShowInvoiceForm(false)}
        />
      )}

      {showInventoryModal && (
        <InventoryModal onClose={() => setShowInventoryModal(false)} />
      )}
    </div>
  );
}
