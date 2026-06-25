import { useState, useEffect } from "react";
import { Link as LinkIcon, CheckCircle, AlertCircle, RefreshCw, ExternalLink, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function ZohoAuth() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: zohoStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/zoho/status"],
  });

  const initializeAuthMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/zoho");
      return await response.json();
    },
    onSuccess: (data: any) => {
      window.location.href = data.authUrl;
    },
    onError: () => {
      setAuthError("Failed to initialize Zoho Books authentication");
      setIsConnecting(false);
      toast({ title: "Error", description: "Failed to start Zoho Books authentication", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/zoho/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Success", description: "Zoho Books account disconnected successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Zoho Books account", variant: "destructive" });
    },
  });

  const selectOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const response = await apiRequest("POST", "/api/auth/zoho/select-organization", { organizationId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Success", description: "Organization selected successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to select organization", variant: "destructive" });
    },
  });

  const handleConnect = () => {
    setIsConnecting(true);
    setAuthError(null);
    initializeAuthMutation.mutate();
  };

  const handleDisconnect = () => {
    if (confirm("Are you sure you want to disconnect your Zoho Books account?")) {
      disconnectMutation.mutate();
    }
  };

  // Handle OAuth callback result from hash params
  useEffect(() => {
    const hash = window.location.hash;
    const lastHashIndex = hash.lastIndexOf("#");
    if (lastHashIndex > 0) {
      const params = hash.substring(lastHashIndex + 1);
      const urlParams = new URLSearchParams(params);
      const success = urlParams.get("success");
      const error = urlParams.get("error");
      const message = urlParams.get("message");

      if (success === "true") {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
        toast({ title: "Success", description: "Zoho Books connected successfully!" });
        setIsConnecting(false);
        window.location.hash = "/auth/zoho";
        return;
      }

      if (error) {
        const errorMessage = message ? decodeURIComponent(message) : "Zoho Books authentication failed";
        setAuthError(errorMessage);
        setIsConnecting(false);
        toast({ title: "Connection Failed", description: errorMessage, variant: "destructive" });
        window.location.hash = "/auth/zoho";
        return;
      }
    }
  }, [queryClient, toast]);

  const isConnected = zohoStatus?.connected;
  const tokenExpiry = zohoStatus?.tokenExpiry ? new Date(zohoStatus.tokenExpiry) : null;
  const isTokenExpired = tokenExpiry ? tokenExpiry < new Date() : false;
  const organizations = zohoStatus?.organizations || [];

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground" data-testid="page-title">Zoho Books Integration</h1>
        <p className="text-muted-foreground mt-1">Connect your Zoho Books account to sync invoices, customers, and inventory</p>
      </div>

      {/* Connection Status */}
      <Card className="mb-8" data-testid="connection-status-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <LinkIcon className="mr-2 text-primary" size={20} />
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">ZB</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground" data-testid="connection-status-title">
                  {isConnected ? `Zoho Books — ${zohoStatus.organizationName}` : "Zoho Books"}
                </h3>
                <p className="text-sm text-muted-foreground" data-testid="connection-status-description">
                  {isConnected
                    ? `Organization ID: ${zohoStatus.organizationId}`
                    : "Not connected"}
                </p>
                {isConnected && tokenExpiry && (
                  <p className="text-xs text-muted-foreground" data-testid="token-expiry">
                    Token expires: {tokenExpiry.toLocaleDateString()}
                    {isTokenExpired && <span className="text-destructive ml-1">(Expired)</span>}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Badge
                className={isConnected && !isTokenExpired
                  ? "bg-accent text-accent-foreground"
                  : "bg-destructive text-destructive-foreground"}
                data-testid="connection-badge"
              >
                {isConnected && !isTokenExpired ? "Connected" : "Disconnected"}
              </Badge>

              {isConnected ? (
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect"
                >
                  {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || initializeAuthMutation.isPending}
                  data-testid="button-connect"
                >
                  {isConnecting || initializeAuthMutation.isPending ? "Connecting..." : "Connect"}
                </Button>
              )}
            </div>
          </div>

          {authError && (
            <Alert className="mt-4" variant="destructive" data-testid="auth-error-alert">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Organization Selection (when multiple orgs) */}
      {isConnected && organizations.length > 1 && (
        <Card className="mb-8" data-testid="org-selection-card">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="mr-2 text-primary" size={20} />
              Select Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You have access to multiple Zoho Books organizations. Currently using: <strong>{zohoStatus.organizationName}</strong>
            </p>
            <div className="space-y-2">
              {organizations.map((org: any) => (
                <div key={org.organization_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.organization_id}</p>
                  </div>
                  {org.organization_id === zohoStatus.organizationId ? (
                    <Badge className="bg-accent text-accent-foreground">Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => selectOrgMutation.mutate(org.organization_id)}
                      disabled={selectOrgMutation.isPending}
                      data-testid={`button-select-org-${org.organization_id}`}
                    >
                      Select
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integration Benefits */}
      <Card className="mb-8" data-testid="integration-benefits-card">
        <CardHeader>
          <CardTitle>Why Connect Zoho Books?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              ["Invoice Sync", "Post AR invoices and AP bills directly to Zoho Books"],
              ["Customer & Vendor Sync", "Keep contacts synchronized between both platforms"],
              ["Item / Inventory Sync", "Products synced by SKU to prevent duplicates"],
              ["Credit Note Sync", "AR credit memos and AP vendor credits both supported"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start space-x-3">
                <CheckCircle className="text-accent mt-1" size={20} />
                <div>
                  <h4 className="font-medium text-foreground">{title}</h4>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Guide */}
      <Card className="mb-8" data-testid="configuration-guide-card">
        <CardHeader>
          <CardTitle>Configuration Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> The Redirect URI in your Zoho API Console must match exactly:
              <code className="block mt-2 p-2 bg-muted rounded text-sm">
                {window.location.origin}/zoho-callback
              </code>
            </AlertDescription>
          </Alert>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">To set up your Zoho Books app:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
              <li>Go to <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Zoho API Console</a></li>
              <li>Create a new Server-based application</li>
              <li>Add the Redirect URI shown above</li>
              <li>Copy the Client ID and Client Secret into environment variables: <code>ZOHO_CLIENT_ID</code>, <code>ZOHO_CLIENT_SECRET</code>, <code>ZOHO_REDIRECT_URI</code></li>
              <li>Save and connect</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card data-testid="security-info-card">
        <CardHeader>
          <CardTitle>Security & Privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              "OAuth 2.0 authentication — industry standard for secure API access",
              "Your Zoho credentials are never stored on our servers",
              "Access tokens are automatically refreshed before expiry",
              "Disconnect at any time to revoke access immediately",
            ].map((text) => (
              <div key={text} className="flex items-start space-x-3">
                <CheckCircle className="text-accent mt-1" size={16} />
                <p className="text-sm text-foreground">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <ExternalLink className="inline mr-1" size={14} />
              Learn more about{" "}
              <a href="https://www.zoho.com/books/api/v3/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Zoho Books API
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
