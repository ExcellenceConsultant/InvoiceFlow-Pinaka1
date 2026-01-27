import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Business from "@/pages/business";
import Orders from "@/pages/orders";
import InvoiceView from "@/pages/invoice-view";
import PackingList from "@/pages/packing-list";
import OrderPackingSlip from "@/pages/order-packing-slip";
import ShippingLabel from "@/pages/shipping-label";
import CreditMemos from "@/pages/credit-memos";
import CreditMemoView from "@/pages/credit-memo-view";
import Inventory from "@/pages/inventory";
import Accounts from "@/pages/accounts";
import QuickBooksAuth from "@/pages/quickbooks-auth";
import QuickBooksCallback from "@/pages/quickbooks-callback";
import QuickBooksSync from "@/pages/quickbooks-sync";
import UserManagement from "@/pages/user-management";
import PriceRules from "@/pages/price-rules";
import SalesTax from "@/pages/sales-tax";
import Navbar from "@/components/layout/navbar";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, ...rest }: { component: any }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return <Component {...rest} />;
}

function Router() {
  const [location] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const isInvoiceView =
    location.startsWith("/invoices/") && location !== "/invoices";
  const isCreditMemoView =
    location.startsWith("/credit-memos/") && location !== "/credit-memos";
  const isOrderPackingSlip = location.includes("/packing-slip");

  // Show loading state
  if (isLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-secondary/20">
      {isAuthenticated && !isInvoiceView && !isCreditMemoView && !isOrderPackingSlip && <Navbar />}
      <Switch>
        <Route path="/login">
          {isAuthenticated ? <Dashboard /> : <Login />}
        </Route>
        <Route path="/">{isAuthenticated ? <Dashboard /> : <Landing />}</Route>
        <Route path="/business">
          <ProtectedRoute component={Business} />
        </Route>
        <Route path="/orders">
          <ProtectedRoute component={Orders} />
        </Route>
        <Route path="/orders/:id/packing-slip">
          {(params) => <ProtectedRoute component={OrderPackingSlip} {...params} />}
        </Route>
        <Route path="/invoices/:id">
          {(params) => <ProtectedRoute component={InvoiceView} {...params} />}
        </Route>
        <Route path="/invoices/:id/packing-list">
          {(params) => <ProtectedRoute component={PackingList} {...params} />}
        </Route>
        <Route path="/invoices/:id/shipping-label">
          {(params) => <ProtectedRoute component={ShippingLabel} {...params} />}
        </Route>
        <Route path="/credit-memos">
          <ProtectedRoute component={CreditMemos} />
        </Route>
        <Route path="/credit-memos/:id">
          {(params) => (
            <ProtectedRoute component={CreditMemoView} {...params} />
          )}
        </Route>
        <Route path="/inventory">
          <ProtectedRoute component={Inventory} />
        </Route>
        <Route path="/accounts">
          <ProtectedRoute component={Accounts} />
        </Route>
        <Route path="/auth/quickbooks">
          <ProtectedRoute component={QuickBooksAuth} />
        </Route>
        <Route path="/callback">
          <ProtectedRoute component={QuickBooksCallback} />
        </Route>
        <Route path="/price-rules">
          <ProtectedRoute component={PriceRules} />
        </Route>
        <Route path="/sales-tax">
          <ProtectedRoute component={SalesTax} />
        </Route>
        <Route path="/quickbooks/sync">
          <ProtectedRoute component={QuickBooksSync} />
        </Route>
        <Route path="/users">
          <ProtectedRoute component={UserManagement} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
