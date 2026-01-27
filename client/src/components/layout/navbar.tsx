import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Bell, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import pinakaLogo from "@/assets/pinaka-logo.jpg";

export default function Navbar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isQuickBooksConnected = !!user?.quickbooksCompanyId;

  return (
    <nav
      className="bg-card/80 glass-effect border-b border-border backdrop-blur-lg sticky top-0 z-50"
      data-testid="navbar"
    >
      <div className="w-full px-4">
        <div className="flex items-center h-14 gap-4">
          {/* Logo - Left */}
          <Link
            href="/"
            className="flex items-center flex-shrink-0 gap-2"
            data-testid="link-home"
          >
            <img src={pinakaLogo} alt="Pinaka Foods Inc" className="h-9 w-9 object-contain" />
            <span className="text-base font-bold text-foreground whitespace-nowrap hidden xl:block">
              InvoiceFlow
            </span>
          </Link>

          {/* Navigation - After logo */}
          <div className="flex-1 flex justify-start">
            <div className="hidden md:flex items-center space-x-0.5">
              <Link href="/">
                <Button
                  variant={location === "/" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-dashboard"
                >
                  Dashboard
                </Button>
              </Link>
              <Link href="/business">
                <Button
                  variant={location === "/business" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-business"
                >
                  Business
                </Button>
              </Link>
              <Link href="/orders">
                <Button
                  variant={location === "/orders" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-orders"
                >
                  Orders
                </Button>
              </Link>
              <Link href="/credit-memos">
                <Button
                  variant={location === "/credit-memos" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-returns"
                >
                  Returns
                </Button>
              </Link>
              <Link href="/accounts">
                <Button
                  variant={location === "/accounts" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-accounts"
                >
                  Accounts
                </Button>
              </Link>
              <Link href="/inventory">
                <Button
                  variant={location === "/inventory" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-inventory"
                >
                  Inventory
                </Button>
              </Link>
              <Link href="/schemes">
                <Button
                  variant={location === "/schemes" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-schemes"
                >
                  Schemes
                </Button>
              </Link>
              <Link href="/price-rules">
                <Button
                  variant={location === "/price-rules" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-price-rules"
                >
                  Price Rule
                </Button>
              </Link>
              <Link href="/sales-tax">
                <Button
                  variant={location === "/sales-tax" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-sales-tax"
                >
                  Sales Tax
                </Button>
              </Link>
              <Link href="/quickbooks/sync">
                <Button
                  variant={
                    location === "/quickbooks/sync" ? "default" : "ghost"
                  }
                  size="sm"
                  data-testid="link-quickbooks-sync"
                >
                  QB Sync
                </Button>
              </Link>
              <Link href="/users">
                <Button
                  variant={location === "/users" ? "default" : "ghost"}
                  size="sm"
                  data-testid="link-users"
                >
                  Users
                </Button>
              </Link>
            </div>
          </div>

          {/* Right side - User actions */}
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {/* QuickBooks Connection Status */}
            <div
              className={`hidden sm:flex items-center space-x-1.5 px-2 py-1 rounded-md ${
                isQuickBooksConnected
                  ? "bg-accent/10 text-accent-foreground"
                  : "bg-destructive/10 text-destructive-foreground"
              }`}
              data-testid="quickbooks-status"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isQuickBooksConnected
                    ? "bg-accent animate-pulse"
                    : "bg-destructive"
                }`}
              />
              <span className="text-xs font-medium whitespace-nowrap">
                {isQuickBooksConnected ? "QB" : "QB Off"}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              data-testid="button-notifications"
            >
              <Bell size={18} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut size={18} />
            </Button>

            <div
              className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-full flex items-center justify-center flex-shrink-0"
              data-testid="user-avatar"
            >
              <span className="text-xs font-medium text-white">
                {user?.username?.[0]?.toUpperCase() ||
                  user?.email?.[0]?.toUpperCase() ||
                  "U"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
