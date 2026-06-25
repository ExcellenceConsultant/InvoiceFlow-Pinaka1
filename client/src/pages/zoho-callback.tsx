import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

export default function ZohoCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse code and state from query string
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");

        if (!code || !state) {
          setStatus("error");
          setErrorMsg("Missing authorization code. Please try connecting again.");
          setTimeout(() => {
            window.location.replace("/auth/zoho#error=missing_params");
          }, 2000);
          return;
        }

        const token = localStorage.getItem("token");
        const headers: Record<string, string> = {
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(
          `/api/auth/zoho/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
          { headers, credentials: "include" },
        );

        if (response.ok) {
          setStatus("success");
          setTimeout(() => {
            window.location.replace("/auth/zoho#success=true");
          }, 1000);
        } else {
          let msg = `HTTP ${response.status}`;
          try {
            const body = await response.json();
            msg = body.message || body.error || msg;
          } catch { /* ignore */ }
          setStatus("error");
          setErrorMsg(msg);
          setTimeout(() => {
            window.location.replace(`/auth/zoho#error=${encodeURIComponent(msg)}`);
          }, 2000);
        }
      } catch (err: any) {
        const msg = err?.message || "Network error";
        setStatus("error");
        setErrorMsg(msg);
        setTimeout(() => {
          window.location.replace(`/auth/zoho#error=${encodeURIComponent(msg)}`);
        }, 2000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center p-8 max-w-sm">
        {status === "processing" && (
          <>
            <RefreshCw className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Connecting to Zoho Books...</p>
            <p className="mt-2 text-sm text-muted-foreground">Please wait while we complete authorization.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">Connected!</p>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting you back...</p>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium">Connection Failed</p>
            <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
            <p className="mt-1 text-xs text-muted-foreground">Redirecting you back...</p>
          </>
        )}
      </div>
    </div>
  );
}
