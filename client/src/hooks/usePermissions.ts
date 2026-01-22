import { useAuth } from "./useAuth";

export type UserRole = "super_admin" | "admin" | "poster" | "viewer";

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) || "viewer";

  return {
    role,
    // User Management
    canManageUsers: role === "super_admin",
    canViewUsers: true, // All can view
    canEditUsers: role === "super_admin",
    canResetPassword: role === "super_admin",
    
    // Customers
    canManageCustomers: role === "super_admin" || role === "admin",
    canViewCustomers: true,
    
    // Products/Inventory
    canManageProducts: role === "super_admin" || role === "admin",
    canViewProducts: true,
    
    // Product Schemes
    canManageSchemes: role === "super_admin" || role === "admin",
    canViewSchemes: true,
    
    // Invoices (AR)
    canCreateInvoice: role === "super_admin" || role === "admin",
    canEditInvoice: role === "super_admin" || role === "admin",
    canDeleteInvoice: role === "super_admin" || role === "admin",
    canPostToQuickBooks: role === "super_admin" || role === "admin" || role === "poster",
    canViewInvoices: true,
    canPrintInvoices: true, // All can print
    
    // Bills (AP)
    canCreateBill: role === "super_admin" || role === "admin",
    canEditBill: role === "super_admin" || role === "admin",
    canDeleteBill: role === "super_admin" || role === "admin",
    canViewBills: true,
    
    // Dashboard
    canViewDashboard: true,
    canManageDashboard: role === "super_admin" || role === "admin",
    
    // QuickBooks
    canManageQuickBooks: role === "super_admin" || role === "admin",
    
    // Profitability
    canViewProfitInvoice: role === "super_admin",
  };
}
