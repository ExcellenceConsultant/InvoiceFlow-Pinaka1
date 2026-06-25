import { useState, useEffect } from "react";
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

  const { data: zohoStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/zoho/status"],
    staleTime: 30000,
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

  const handleConnect = async () => {
    setIsConnecting(true);
    setAuthError(null);
    try {
      const resp = await apiRequest("GET", "/api/auth/zoho");
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${resp.status}`);
      }
      const data = await resp.json();
      if (!data.authUrl) throw new Error("No auth URL returned from server");

      // Standard full-page navigation — works on all devices including mobile.
      // Tries window.top first to escape any iframe (Replit preview pane),
      // falls back to current window if cross-origin top is blocked.
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = data.authUrl;
        } else {
          window.location.href = data.authUrl;
        }
      } catch {
        window.location.href = data.authUrl;
      }
    } catch (err: any) {
      console.error("Zoho auth error:", err);
      const msg = err?.message || "Unknown error";
      setAuthError(msg);
      setIsConnecting(false);
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleDisconnect = () => {
    if (confirm("Are you sure you want to disconnect your Zoho Books account?")) {
      disconnectMutation.mutate();
    }
  };

  // Read success/error from URL hash after Zoho redirects back
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("success=true")) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Connected!", description: "Zoho Books connected successfully." });
      window.history.replaceState(null, "", window.location.pathname);
    } else if (hash.includes("error=")) {
      const match = hash.match(/error=([^&]*)/);
      const msgMatch = hash.match(/message=([^&]*)/);
      const msg = msgMatch
        ? decodeURIComponent(msgMatch[1])
        : match ? decodeURIComponent(match[1]) : "Authentication failed";
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
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Zoho Books Integration</h1>
        <p className="text-muted-foreground mt-1">Connect your Zoho Books account to sync invoices, customers, and inventory</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            <LinkIcon className="mr-2 text-primary" size={20} />
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg flex-wrap gap-3">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">ZB</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {isConnected ? `Zoho Books — ${zohoStatus.organizationName}` : "Zoho Books"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isConnected ? `Organization ID: ${zohoStatus.organizationId}` : "Not connected"}
                </p>
                {isConnected && tokenExpiry && (
                  <p className="text-xs text-muted-foreground">
                    Token expires: {tokenExpiry.toLocaleDateString()}
                    {isTokenExpired && <span className="text-destructive ml-1">(Expired)</span>}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Badge className={isConnected && !isTokenExpired ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}>
                {isConnected && !isTokenExpired ? "Connected" : "Disconnected"}
              </Badge>
              {isConnected ? (
                <Button variant="outline" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                  {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : (
                <Button onClick={handleConnect} disabled={isConnecting} data-testid="button-connect">
                  {isConnecting ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Connecting...</> : "Connect"}
                </Button>
              )}
            </div>
          </div>

          {authError && (
            <Alert className="mt-4" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {isConnected && organizations.length > 1 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="mr-2 text-primary" size={20} />
              Select Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Currently using: <strong>{zohoStatus.organizationName}</strong>
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
                    <Button size="sm" variant="outline" onClick={() => selectOrgMutation.mutate(org.organization_id)} disabled={selectOrgMutation.isPending}>
                      Select
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Setup Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Register both Redirect URIs</strong> in your{" "}
              <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Zoho API Console</a>:
              <ul className="mt-2 space-y-1 text-xs font-mono">
                <li className="p-1 bg-muted rounded">https://invoice-flow-2--njipjoshi.replit.app/zoho-callback</li>
                <li className="p-1 bg-muted rounded">https://invoiceflow-pinaka1.onrender.com/zoho-callback</li>
              </ul>
            </AlertDescription>
          </Alert>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-1">
            <li>Go to <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">api-console.zoho.com</a> → open your app → <strong>Edit</strong> → add both URIs above</li>
            <li>Ensure <code>ZOHO_CLIENT_ID</code> and <code>ZOHO_CLIENT_SECRET</code> are set in Replit Secrets (and in Render environment variables)</li>
            <li>Click <strong>Connect</strong> above — you'll be taken to Zoho to sign in, then redirected back automatically</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader><CardTitle>Why Connect Zoho Books?</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["Invoice Sync", "Post AR invoices and AP bills directly to Zoho Books"],
              ["Customer & Vendor Sync", "Keep contacts synchronized between both platforms"],
              ["Item / Inventory Sync", "Products synced by SKU to prevent duplicates"],
              ["Credit Note Sync", "AR credit memos and AP vendor credits both supported"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start space-x-3">
                <CheckCircle className="text-accent mt-1 shrink-0" size={18} />
                <div>
                  <h4 className="font-medium text-foreground text-sm">{title}</h4>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Security &amp; Privacy</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              "OAuth 2.0 — industry standard for secure API access",
              "Your Zoho credentials are never stored on our servers",
              "Access tokens are automatically refreshed before expiry",
              "Disconnect at any time to revoke access immediately",
            ].map((text) => (
              <div key={text} className="flex items-start space-x-3">
                <CheckCircle className="text-accent mt-0.5 shrink-0" size={15} />
                <p className="text-sm text-foreground">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <ExternalLink className="inline mr-1" size={13} />
              <a href="https://www.zoho.com/books/api/v3/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Zoho Books API documentation</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
