import { useState, useEffect, useRef } from "react";
import { Link as LinkIcon, CheckCircle, AlertCircle, RefreshCw, ExternalLink, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ZohoAuth() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: zohoStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/zoho/status"],
    staleTime: 30000,
  });

  const fetchAuthUrlMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/zoho");
      const data = await response.json();
      if (!data.authUrl) throw new Error("No auth URL returned from server");
      return data as { authUrl: string };
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

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setAuthError(null);
    stopPolling();

    // Step 1: Pre-open the popup IMMEDIATELY on click (before any async work)
    // so the browser treats it as a direct user gesture.
    const popup = window.open("about:blank", "zoho_oauth", "width=640,height=720,scrollbars=yes,resizable=yes,noopener=no");
    popupRef.current = popup;

    if (!popup || popup.closed) {
      // Popup was blocked — fall back to same-window navigation
      try {
        const resp = await apiRequest("GET", "/api/auth/zoho");
        const data = await resp.json();
        window.location.href = data.authUrl;
      } catch {
        setAuthError("Could not open Zoho authorization. Please allow popups and try again.");
        setIsConnecting(false);
      }
      return;
    }

    // Step 2: Show a loading message in the popup while we fetch the URL
    try {
      popup.document.write(
        "<html><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5'>" +
        "<p style='color:#555'>Connecting to Zoho Books, please wait...</p></body></html>"
      );
    } catch {
      // cross-origin write blocked after navigation (safe to ignore)
    }

    // Step 3: Fetch the auth URL from our server
    try {
      const resp = await apiRequest("GET", "/api/auth/zoho");
      const data = await resp.json();
      if (!data.authUrl) throw new Error("No auth URL returned from server");

      // Step 4: Navigate the pre-opened popup to Zoho
      popup.location.href = data.authUrl;

      // Step 5: Poll every 500ms — if user closes popup without completing, reset state
      pollRef.current = setInterval(() => {
        if (popup.closed) {
          stopPolling();
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
        }
      }, 500);
    } catch (err: any) {
      console.error("Zoho auth init error:", err);
      popup.close();
      const msg = err?.message || "Unknown error";
      setAuthError(`Failed to initialize Zoho Books authentication: ${msg}`);
      setIsConnecting(false);
      toast({ title: "Error", description: `Failed to start Zoho Books authentication: ${msg}`, variant: "destructive" });
    }
  };

  const handleDisconnect = () => {
    if (confirm("Are you sure you want to disconnect your Zoho Books account?")) {
      disconnectMutation.mutate();
    }
  };

  // Listen for postMessage from the callback popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "zoho_auth_success") {
        stopPolling();
        queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
        toast({ title: "Success", description: "Zoho Books connected successfully!" });
        setIsConnecting(false);
        setAuthError(null);
        if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      } else if (event.data?.type === "zoho_auth_error") {
        stopPolling();
        const msg = event.data.message || "Zoho Books authentication failed";
        setAuthError(msg);
        setIsConnecting(false);
        toast({ title: "Connection Failed", description: msg, variant: "destructive" });
        if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      stopPolling();
    };
  }, [queryClient, toast]);

  // Handle hash-based success/error from same-window redirect fallback
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("success=true")) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Success", description: "Zoho Books connected successfully!" });
      window.history.replaceState(null, "", window.location.pathname);
    } else if (hash.includes("error=")) {
      const match = hash.match(/error=([^&]*)/);
      const msg = match ? decodeURIComponent(match[1]) : "Authentication failed";
      setAuthError(msg);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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
                  {isConnected ? `Organization ID: ${zohoStatus.organizationId}` : "Not connected"}
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
                  disabled={isConnecting}
                  data-testid="button-connect"
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
              )}
            </div>
          </div>

          {isConnecting && (
            <Alert className="mt-4" data-testid="connecting-alert">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <AlertDescription>
                A Zoho authorization window is open. Complete sign-in there, then return here.
                If you don't see it, check if your browser blocked a popup.
              </AlertDescription>
            </Alert>
          )}

          {authError && (
            <Alert className="mt-4" variant="destructive" data-testid="auth-error-alert">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

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

      <Card className="mb-8" data-testid="configuration-guide-card">
        <CardHeader>
          <CardTitle>Configuration Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Register <strong>both</strong> of these Redirect URIs in your{" "}
              <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Zoho API Console
              </a>:
              <ul className="mt-2 space-y-1">
                <li><code className="p-1 bg-muted rounded text-sm font-mono">https://invoice-flow-2--njipjoshi.replit.app/zoho-callback</code></li>
                <li><code className="p-1 bg-muted rounded text-sm font-mono">https://invoiceflow-pinaka1.onrender.com/zoho-callback</code></li>
              </ul>
            </AlertDescription>
          </Alert>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">To set up your Zoho Books app:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
              <li>Go to <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Zoho API Console</a></li>
              <li>Open your app → <strong>Edit</strong> → add both Redirect URIs above</li>
              <li>Make sure <code>ZOHO_CLIENT_ID</code> and <code>ZOHO_CLIENT_SECRET</code> are set in Replit Secrets</li>
              <li>Click <strong>Connect</strong> above to authorize</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="security-info-card">
        <CardHeader>
          <CardTitle>Security &amp; Privacy</CardTitle>
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
