import { useEffect } from "react";
import { useLocation } from "wouter";
import { RefreshCw } from "lucide-react";

export default function ZohoCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log("=== Zoho Books Callback Debug ===");
        console.log("Full URL:", window.location.href);
        console.log("URL search:", window.location.search);
        console.log("URL hash:", window.location.hash);

        // Try search params first, then hash params
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

        console.log("Zoho callback params found:", { code: !!code, state: !!state });

        if (!code || !state) {
          setLocation("/auth/zoho#error=missing_params");
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

        console.log("Zoho callback response:", response.status);

        if (response.ok) {
          setLocation("/auth/zoho#success=true");
        } else {
          let errorType = "auth_failed";
          let errorMessage = "Unknown error";
          try {
            const errorData = await response.json();
            errorType = errorData.error || errorType;
            errorMessage = errorData.message || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          console.error("Zoho callback error:", { errorType, errorMessage });
          const encodedMessage = encodeURIComponent(errorMessage);
          setLocation(`/auth/zoho#error=${errorType}&message=${encodedMessage}`);
        }
      } catch (error) {
        console.error("Zoho callback error:", error);
        setLocation("/auth/zoho#error=auth_failed");
      }
    };

    handleCallback();
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <RefreshCw className="mx-auto h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Connecting to Zoho Books...</p>
      </div>
    </div>
  );
}
