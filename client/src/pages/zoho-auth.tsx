import { useState, useEffect } from "react";
import { Link as LinkIcon, CheckCircle, AlertCircle, RefreshCw, ExternalLink, Building2, ShieldCheck, XCircle } from "lucide-react";
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

  const { data: debugInfo } = useQuery<{
    clientIdSet: boolean;
    clientSecretSet: boolean;
    redirectUri: string;
    accountsUrl: string;
  }>({
    queryKey: ["/api/auth/zoho/debug"],
    staleTime: 60000,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/auth/zoho/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Disconnected", description: "Zoho Books account disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    },
  });

  const selectOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const r = await apiRequest("POST", "/api/auth/zoho/select-organization", { organizationId });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Success", description: "Organization selected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to select organization.", variant: "destructive" });
    },
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    setAuthError(null);
    try {
      const resp = await apiRequest("GET", "/api/auth/zoho");
      const data = await resp.json();
      if (!data.authUrl) throw new Error("Server did not return an auth URL");
      // Full-page navigation — works on desktop and mobile alike.
      window.location.href = data.authUrl;
    } catch (err: any) {
      console.error("Zoho connect error:", err);
      const msg = err?.message || "Unknown error";
      setAuthError(msg);
      setIsConnecting(false);
      toast({ title: "Connection Error", description: msg, variant: "destructive" });
    }
  };

  // Read result from URL hash after Zoho redirects back
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("success=true")) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/status"] });
      toast({ title: "Connected!", description: "Zoho Books connected successfully." });
      window.history.replaceState(null, "", window.location.pathname);
    } else if (hash.includes("error=")) {
      const msgMatch = hash.match(/message=([^&]*)/);
      const errMatch = hash.match(/error=([^&]*)/);
      const msg = msgMatch
        ? decodeURIComponent(msgMatch[1])
        : errMatch ? decodeURIComponent(errMatch[1]) : "Authentication failed";
      setAuthError(msg);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const isConnected = zohoStatus?.connected;
  const tokenExpiry = zohoStatus?.tokenExpiry ? new Date(zohoStatus.tokenExpiry) : null;
  const isTokenExpired = tokenExpiry ? tokenExpiry < new Date() : false;
  const organizations = zohoStatus?.organizations || [];

  const configOk = debugInfo?.clientIdSet && debugInfo?.clientSecretSet &&
    debugInfo?.redirectUri && debugInfo.redirectUri !== "(not set)";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Zoho Books Integration</h1>
        <p className="text-muted-foreground mt-1">Connect your Zoho Books account to sync invoices, customers, and inventory</p>
      </div>

      {/* ── Diagnostic panel ──────────────────────────────── */}
      {debugInfo && (
        <Card className={`mb-6 border-2 ${configOk ? "border-green-200" : "border-red-200"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck size={18} className={configOk ? "text-green-500" : "text-red-500"} />
              Server Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {debugInfo.clientIdSet
                  ? <CheckCircle size={15} className="text-green-500" />
                  : <XCircle size={15} className="text-red-500" />}
                <span>ZOHO_CLIENT_ID: {debugInfo.clientIdSet ? "✓ set" : "✗ NOT SET — add to Replit Secrets"}</span>
              </div>
              <div className="flex items-center gap-2">
                {debugInfo.clientSecretSet
                  ? <CheckCircle size={15} className="text-green-500" />
                  : <XCircle size={15} className="text-red-500" />}
                <span>ZOHO_CLIENT_SECRET: {debugInfo.clientSecretSet ? "✓ set" : "✗ NOT SET — add to Replit Secrets"}</span>
              </div>
              <div className="flex items-center gap-2">
                {debugInfo.redirectUri !== "(not set)"
                  ? <CheckCircle size={15} className="text-green-500" />
                  : <XCircle size={15} className="text-red-500" />}
                <span className="break-all">
                  ZOHO_REDIRECT_URI: <code className="bg-muted px-1 rounded">{debugInfo.redirectUri}</code>
                </span>
              </div>
            </div>
            {!configOk && (
              <Alert className="mt-3" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  One or more required environment variables are missing. The Connect button will not work until they are set.
                </AlertDescription>
              </Alert>
            )}
            {configOk && debugInfo.redirectUri !== "(not set)" && (
              <Alert className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Make sure <code className="bg-muted px-1 rounded">{debugInfo.redirectUri}</code> is registered as a Redirect URI in your{" "}
                  <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Zoho API Console</a>.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Connection status card ─────────────────────── */}
      <Card className="mb-6">
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
                    {isTokenExpired && <span className="text-destructive ml-1">(Expired — reconnect)</span>}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Badge className={isConnected && !isTokenExpired
                ? "bg-accent text-accent-foreground"
                : "bg-destructive text-destructive-foreground"}>
                {isConnected && !isTokenExpired ? "Connected" : "Disconnected"}
              </Badge>
              {isConnected ? (
                <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                  {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : (
                <Button onClick={handleConnect} disabled={isConnecting || !configOk} data-testid="button-connect">
                  {isConnecting
                    ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Redirecting to Zoho...</>
                    : "Connect"}
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

          {isConnecting && (
            <Alert className="mt-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Redirecting you to Zoho for authorization. Complete sign-in there, then you'll be brought back automatically.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Org selection ──────────────────────────────── */}
      {isConnected && organizations.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="mr-2 text-primary" size={20} />
              Select Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Currently using: <strong>{zohoStatus.organizationName}</strong></p>
            <div className="space-y-2">
              {organizations.map((org: any) => (
                <div key={org.organization_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.organization_id}</p>
                  </div>
                  {org.organization_id === zohoStatus.organizationId
                    ? <Badge className="bg-accent text-accent-foreground">Active</Badge>
                    : <Button size="sm" variant="outline" onClick={() => selectOrgMutation.mutate(org.organization_id)} disabled={selectOrgMutation.isPending}>Select</Button>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Setup checklist ────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Setup Steps</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="shrink-0 font-bold text-primary">1.</span>
              <span>Go to <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">api-console.zoho.com</a> → open your Server-based app → <strong>Edit</strong> → add this Redirect URI:
                <code className="block mt-1 p-2 bg-muted rounded font-mono text-xs break-all">
                  {debugInfo?.redirectUri && debugInfo.redirectUri !== "(not set)"
                    ? debugInfo.redirectUri
                    : "https://invoice-flow-2--njipjoshi.replit.app/zoho-callback"}
                </code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-bold text-primary">2.</span>
              <span>Confirm <strong>ZOHO_CLIENT_ID</strong> and <strong>ZOHO_CLIENT_SECRET</strong> are set in Replit Secrets (see panel above).</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-bold text-primary">3.</span>
              <span>Click <strong>Connect</strong> above — you'll be taken to Zoho to sign in, then redirected back automatically.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-bold text-primary">4.</span>
              <span>Once connected, the Zoho Sync page will work on <strong>both</strong> the Replit and Render sites (they share the same database).</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* ── Benefits ────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>What syncs to Zoho Books?</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["Invoices & Bills", "Post AR invoices and AP bills directly"],
              ["Customers & Vendors", "Contacts stay in sync by name"],
              ["Products / Inventory", "Items matched by SKU to prevent duplicates"],
              ["Credit Notes", "AR credit memos and AP vendor credits"],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-3">
                <CheckCircle className="text-accent mt-0.5 shrink-0" size={17} />
                <div>
                  <p className="font-medium text-sm">{t}</p>
                  <p className="text-xs text-muted-foreground">{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <a href="https://www.zoho.com/books/api/v3/" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
              <ExternalLink size={13} /> Zoho Books API documentation
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
