import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function ZohoCallback() {
  useEffect(() => {
    const handleCallback = async () => {
      try {
        let urlParams = new URLSearchParams(window.location.search);
        let code = urlParams.get("code");
        let state = urlParams.get("state");

        if (!code || !state) {
          const hash = window.location.hash;
          if (hash.includes("?")) {
            const hashParams = hash.split("?")[1];
            urlParams = new URLSearchParams(hashParams);
            code = urlParams.get("code");
            state = urlParams.get("state");
          }
        }

        const sendResult = (type: string, message?: string) => {
          const payload = { type, message };
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(payload, window.location.origin);
              setTimeout(() => window.close(), 300);
              return;
            } catch {
              // opener is cross-origin or blocked — fall through to redirect
            }
          }
          const redirectPath = type === "zoho_auth_success"
            ? "/auth/zoho#success=true"
            : `/auth/zoho#error=${message || "auth_failed"}`;
          window.location.replace(redirectPath);
        };

        if (!code || !state) {
          sendResult("zoho_auth_error", "missing_params");
          return;
        }

        const token = localStorage.getItem("token");
        const headers: Record<string, string> = {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `/api/auth/zoho/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
          { headers, credentials: "include" },
        );

        if (response.ok) {
          sendResult("zoho_auth_success");
        } else {
          let errorMessage = "auth_failed";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}`;
          }
          sendResult("zoho_auth_error", errorMessage);
        }
      } catch (error: any) {
        console.error("Zoho callback error:", error);
        const sendResult = (type: string, message?: string) => {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage({ type, message }, window.location.origin);
              setTimeout(() => window.close(), 300);
              return;
            } catch { /* ignore */ }
          }
          window.location.replace(`/auth/zoho#error=${message || "auth_failed"}`);
        };
        sendResult("zoho_auth_error", error?.message || "auth_failed");
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <RefreshCw className="mx-auto h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Connecting to Zoho Books...</p>
        <p className="mt-2 text-sm text-muted-foreground">This window will close automatically</p>
      </div>
    </div>
  );
}
