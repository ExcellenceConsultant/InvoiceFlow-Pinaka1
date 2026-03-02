import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Settings, Package, Users, UserPlus } from "lucide-react";

interface PriceRuleData {
  id: string;
  ruleType: string;
  customerId: string | null;
  customerCategory: string | null;
  productId: string | null;
  marginPercent: string;
  isActive: boolean;
  effectiveFromDate: string | null;
  customer?: { name: string; customerCategory?: string } | null;
  product?: { name: string; itemCode?: string; category?: string } | null;
  createdAt: string;
}

export default function PriceRules() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("global");
  const [showForm, setShowForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [editingRule, setEditingRule] = useState<PriceRuleData | null>(null);

  const [formRuleType, setFormRuleType] = useState("global");
  const [formMarginPercent, setFormMarginPercent] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formCustomerCategory, setFormCustomerCategory] = useState("");
  const [formMatchMode, setFormMatchMode] = useState<"customer" | "category">("customer");
  const [formProductId, setFormProductId] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formProductCategoryFilter, setFormProductCategoryFilter] = useState("");
  const [formEffectiveDate, setFormEffectiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  const [batchSelectedCustomerIds, setBatchSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [batchSelectedCategoryNames, setBatchSelectedCategoryNames] = useState<Set<string>>(new Set());
  const [batchSelectedProductIds, setBatchSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchMarginPercent, setBatchMarginPercent] = useState("");
  const [batchEffectiveDate, setBatchEffectiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [batchIsActive, setBatchIsActive] = useState(true);
  const [batchMatchMode, setBatchMatchMode] = useState<"customer" | "category">("customer");
  const [batchCustomerSearch, setBatchCustomerSearch] = useState("");
  const [batchProductSearch, setBatchProductSearch] = useState("");
  const [batchProductCategoryFilter, setBatchProductCategoryFilter] = useState("");
  const [batchCreating, setBatchCreating] = useState(false);

  const { data: rules = [], isLoading } = useQuery<PriceRuleData[]>({
    queryKey: ["/api/price-rules"],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const activeCustomers = customers
    .filter((c: any) => c.type === "customer" && c.isActive !== false)
    .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  const categories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b));
  const customerCategories = Array.from(new Set(
    activeCustomers.filter((c: any) => c.customerCategory).map((c: any) => c.customerCategory)
  )).sort((a: any, b: any) => a.localeCompare(b));

  const filteredFormProducts = formProductCategoryFilter && formProductCategoryFilter !== "all_categories"
    ? products.filter((p: any) => p.category === formProductCategoryFilter)
    : products;

  const globalRules = rules.filter((r) => r.ruleType === "global");
  const productRules = rules.filter((r) => r.ruleType === "product");
  const customerRules = rules.filter((r) => r.ruleType === "customer");
  const customerProductRules = rules.filter((r) => r.ruleType === "customer_product");

  const batchFilteredCustomers = activeCustomers.filter((c: any) =>
    c.name.toLowerCase().includes(batchCustomerSearch.toLowerCase())
  );
  const batchFilteredCategories = customerCategories.filter((cat: any) =>
    cat.toLowerCase().includes(batchCustomerSearch.toLowerCase())
  );
  const batchFilteredProducts = (batchProductCategoryFilter && batchProductCategoryFilter !== "all_categories"
    ? products.filter((p: any) => p.category === batchProductCategoryFilter)
    : products
  )
    .filter((p: any) => {
      const searchLower = batchProductSearch.toLowerCase();
      return (p.name || "").toLowerCase().includes(searchLower) ||
        (p.itemCode || "").toLowerCase().includes(searchLower);
    })
    .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

  const batchRuleCount = batchMatchMode === "customer"
    ? batchSelectedCustomerIds.size * batchSelectedProductIds.size
    : batchSelectedCategoryNames.size * batchSelectedProductIds.size;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/price-rules", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      toast({ title: "Success", description: "Price rule created" });
      closeForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create price rule", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiRequest("PATCH", `/api/price-rules/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      toast({ title: "Success", description: "Price rule updated" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update price rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/price-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      toast({ title: "Success", description: "Price rule deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete price rule", variant: "destructive" });
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingRule(null);
    setFormRuleType("global");
    setFormMarginPercent("");
    setFormCustomerId("");
    setFormCustomerCategory("");
    setFormMatchMode("customer");
    setFormProductId("");
    setFormIsActive(true);
    setFormProductCategoryFilter("");
    setFormEffectiveDate(new Date().toISOString().split("T")[0]);
    setCustomerSearchTerm("");
  };

  const closeBatchForm = () => {
    setShowBatchForm(false);
    setBatchSelectedCustomerIds(new Set());
    setBatchSelectedCategoryNames(new Set());
    setBatchSelectedProductIds(new Set());
    setBatchMarginPercent("");
    setBatchEffectiveDate(new Date().toISOString().split("T")[0]);
    setBatchIsActive(true);
    setBatchMatchMode("customer");
    setBatchCustomerSearch("");
    setBatchProductSearch("");
    setBatchProductCategoryFilter("");
  };

  const openCreateForm = (type: string) => {
    if (type === "customer_product") {
      closeBatchForm();
      setShowBatchForm(true);
      return;
    }
    setFormRuleType(type);
    setFormMarginPercent("");
    setFormCustomerId("");
    setFormCustomerCategory("");
    setFormMatchMode("customer");
    setFormProductId("");
    setFormIsActive(true);
    setFormProductCategoryFilter("");
    setFormEffectiveDate(new Date().toISOString().split("T")[0]);
    setCustomerSearchTerm("");
    setEditingRule(null);
    setShowForm(true);
  };

  const openEditForm = (rule: PriceRuleData) => {
    setFormRuleType(rule.ruleType);
    setFormMarginPercent(rule.marginPercent);
    setFormCustomerId(rule.customerId || "");
    setFormCustomerCategory(rule.customerCategory || "");
    setFormMatchMode(rule.customerCategory ? "category" : "customer");
    setFormProductId(rule.productId || "");
    setFormIsActive(rule.isActive);
    setFormProductCategoryFilter("");
    setFormEffectiveDate(rule.effectiveFromDate ? new Date(rule.effectiveFromDate).toISOString().split("T")[0] : "");
    setCustomerSearchTerm("");
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formMarginPercent || isNaN(parseFloat(formMarginPercent))) {
      toast({ title: "Error", description: "Please enter a valid margin percentage", variant: "destructive" });
      return;
    }

    if (formRuleType === "product" && !formProductId) {
      toast({ title: "Error", description: "Please select a product", variant: "destructive" });
      return;
    }

    if (formRuleType === "customer" && !formCustomerId && !formCustomerCategory) {
      toast({ title: "Error", description: "Please select a customer or customer category", variant: "destructive" });
      return;
    }

    if (formRuleType === "customer_product") {
      if (!formProductId) {
        toast({ title: "Error", description: "Please select a product", variant: "destructive" });
        return;
      }
      if (!formCustomerId && !formCustomerCategory) {
        toast({ title: "Error", description: "Please select a customer or customer category", variant: "destructive" });
        return;
      }
    }

    const data: any = {
      ruleType: formRuleType,
      marginPercent: parseFloat(formMarginPercent),
      isActive: formIsActive,
      effectiveFromDate: formEffectiveDate || null,
      customerId: formCustomerId || null,
      customerCategory: formCustomerCategory || null,
      productId: formProductId || null,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleBatchCreate = async () => {
    if (!batchMarginPercent || isNaN(parseFloat(batchMarginPercent))) {
      toast({ title: "Error", description: "Please enter a valid margin percentage", variant: "destructive" });
      return;
    }

    if (batchSelectedProductIds.size === 0) {
      toast({ title: "Error", description: "Please select at least one product", variant: "destructive" });
      return;
    }

    if (batchMatchMode === "customer" && batchSelectedCustomerIds.size === 0) {
      toast({ title: "Error", description: "Please select at least one customer", variant: "destructive" });
      return;
    }

    if (batchMatchMode === "category" && batchSelectedCategoryNames.size === 0) {
      toast({ title: "Error", description: "Please select at least one customer category", variant: "destructive" });
      return;
    }

    setBatchCreating(true);
    try {
      const productIds = Array.from(batchSelectedProductIds);
      const margin = parseFloat(batchMarginPercent);
      let created = 0;

      if (batchMatchMode === "customer") {
        const customerIds = Array.from(batchSelectedCustomerIds);
        for (const custId of customerIds) {
          for (const prodId of productIds) {
            await apiRequest("POST", "/api/price-rules", {
              ruleType: "customer_product",
              customerId: custId,
              customerCategory: null,
              productId: prodId,
              marginPercent: margin,
              isActive: batchIsActive,
              effectiveFromDate: batchEffectiveDate || null,
            });
            created++;
          }
        }
      } else {
        const catNames = Array.from(batchSelectedCategoryNames);
        for (const catName of catNames) {
          for (const prodId of productIds) {
            await apiRequest("POST", "/api/price-rules", {
              ruleType: "customer_product",
              customerId: null,
              customerCategory: catName,
              productId: prodId,
              marginPercent: margin,
              isActive: batchIsActive,
              effectiveFromDate: batchEffectiveDate || null,
            });
            created++;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      toast({ title: "Success", description: `${created} price rule(s) created` });
      closeBatchForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create price rules", variant: "destructive" });
    } finally {
      setBatchCreating(false);
    }
  };

  const toggleCustomerId = (id: string) => {
    setBatchSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategoryName = (name: string) => {
    setBatchSelectedCategoryNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleProductId = (id: string) => {
    setBatchSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getFormTitle = () => {
    const action = editingRule ? "Edit" : "Add";
    switch (formRuleType) {
      case "global": return `${action} Global Rule`;
      case "product": return `${action} Product Rule`;
      case "customer": return `${action} Customer Rule`;
      case "customer_product": return `${action} Customer + Product Rule`;
      default: return `${action} Rule`;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
  };

  const getCustomerOrCategoryLabel = (rule: PriceRuleData) => {
    if (rule.customerId && rule.customer) return rule.customer.name;
    if (rule.customerCategory) return `Category: ${rule.customerCategory}`;
    return "N/A";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="page-title">
              Price Rules
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage margin-based pricing rules
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6" data-testid="price-rule-tabs">
          <TabsTrigger value="global" data-testid="tab-global">
            <Settings className="mr-2" size={16} />
            Global
          </TabsTrigger>
          <TabsTrigger value="product" data-testid="tab-product">
            <Package className="mr-2" size={16} />
            Product
          </TabsTrigger>
          <TabsTrigger value="customer" data-testid="tab-customer">
            <Users className="mr-2" size={16} />
            Customer
          </TabsTrigger>
          <TabsTrigger value="customer_product" data-testid="tab-customer-product">
            <UserPlus className="mr-2" size={16} />
            Customer + Product
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Settings className="mr-2 text-primary" size={20} />
                  Global Rule
                </CardTitle>
                {globalRules.length === 0 && (
                  <Button onClick={() => openCreateForm("global")} data-testid="button-create-global-rule">
                    <Plus className="mr-2" size={16} />
                    Set Global Margin
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : globalRules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No global rule set. This is the fallback margin when no other rule matches.
                </div>
              ) : (
                <Table data-testid="global-rules-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Margin %</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {globalRules.map((rule) => (
                      <TableRow key={rule.id} data-testid={`global-rule-${rule.id}`}>
                        <TableCell className="font-medium">{rule.marginPercent}%</TableCell>
                        <TableCell>{formatDate(rule.effectiveFromDate)}</TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditForm(rule)} data-testid={`button-edit-${rule.id}`}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="product">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Package className="mr-2 text-primary" size={20} />
                  Product Rules ({productRules.length})
                </CardTitle>
                <Button onClick={() => openCreateForm("product")} data-testid="button-create-product-rule">
                  <Plus className="mr-2" size={16} />
                  Add Product Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : productRules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No product rules yet. Product rules set default margins for specific products.
                </div>
              ) : (
                <Table data-testid="product-rules-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Margin %</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productRules.map((rule) => (
                      <TableRow key={rule.id} data-testid={`product-rule-${rule.id}`}>
                        <TableCell className="font-medium">{rule.product?.name || "Unknown"}</TableCell>
                        <TableCell>{rule.product?.itemCode || "-"}</TableCell>
                        <TableCell>{rule.marginPercent}%</TableCell>
                        <TableCell>{formatDate(rule.effectiveFromDate)}</TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditForm(rule)} data-testid={`button-edit-${rule.id}`}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customer">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Users className="mr-2 text-primary" size={20} />
                  Customer Rules ({customerRules.length})
                </CardTitle>
                <Button onClick={() => openCreateForm("customer")} data-testid="button-create-customer-rule">
                  <Plus className="mr-2" size={16} />
                  Add Customer Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : customerRules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No customer rules yet. Customer rules set margins for specific customers or customer categories.
                </div>
              ) : (
                <Table data-testid="customer-rules-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer / Category</TableHead>
                      <TableHead>Margin %</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerRules.map((rule) => (
                      <TableRow key={rule.id} data-testid={`customer-rule-${rule.id}`}>
                        <TableCell className="font-medium">{getCustomerOrCategoryLabel(rule)}</TableCell>
                        <TableCell>{rule.marginPercent}%</TableCell>
                        <TableCell>{formatDate(rule.effectiveFromDate)}</TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditForm(rule)} data-testid={`button-edit-${rule.id}`}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customer_product">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <UserPlus className="mr-2 text-primary" size={20} />
                  Customer + Product Rules ({customerProductRules.length})
                </CardTitle>
                <Button onClick={() => openCreateForm("customer_product")} data-testid="button-create-customer-product-rule">
                  <Plus className="mr-2" size={16} />
                  Add Customer + Product Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : customerProductRules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No customer + product rules yet. These are the highest priority rules for specific customer-product pairs.
                </div>
              ) : (
                <Table data-testid="customer-product-rules-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer / Category</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Margin %</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerProductRules.map((rule) => (
                      <TableRow key={rule.id} data-testid={`customer-product-rule-${rule.id}`}>
                        <TableCell className="font-medium">{getCustomerOrCategoryLabel(rule)}</TableCell>
                        <TableCell>{rule.product?.name || "Unknown"}</TableCell>
                        <TableCell>{rule.product?.itemCode || "-"}</TableCell>
                        <TableCell>{rule.marginPercent}%</TableCell>
                        <TableCell>{formatDate(rule.effectiveFromDate)}</TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditForm(rule)} data-testid={`button-edit-${rule.id}`}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simple Create/Edit Dialog (Global, Product, Customer) */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg" data-testid="price-rule-form-dialog">
          <DialogHeader>
            <DialogTitle data-testid="form-title">{getFormTitle()}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {(formRuleType === "customer" || formRuleType === "customer_product") && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Match By</label>
                  <Select
                    value={formMatchMode}
                    onValueChange={(val: "customer" | "category") => {
                      setFormMatchMode(val);
                      if (val === "customer") {
                        setFormCustomerCategory("");
                      } else {
                        setFormCustomerId("");
                      }
                    }}
                    data-testid="select-match-type"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select match type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Individual Customer</SelectItem>
                      <SelectItem value="category">Customer Category</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formMatchMode === "customer" && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Customer</label>
                    <Select value={formCustomerId} onValueChange={setFormCustomerId} data-testid="select-customer">
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 pb-2">
                          <Input
                            placeholder="Search customer..."
                            value={customerSearchTerm}
                            onChange={(e) => setCustomerSearchTerm(e.target.value)}
                            className="h-8"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        {activeCustomers
                          .filter((c: any) => c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()))
                          .map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formMatchMode === "category" && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Customer Category</label>
                    <Select value={formCustomerCategory} onValueChange={setFormCustomerCategory} data-testid="select-customer-category">
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {customerCategories.map((cat: any) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {(formRuleType === "product" || formRuleType === "customer_product") && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Product Category (Filter Only)</label>
                  <Select value={formProductCategoryFilter} onValueChange={setFormProductCategoryFilter} data-testid="select-product-category-filter">
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_categories">All Categories</SelectItem>
                      {categories.map((cat: any) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Product</label>
                  <Select value={formProductId} onValueChange={setFormProductId} data-testid="select-product">
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredFormProducts
                        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                        .map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.itemCode ? `[${p.itemCode}] ` : ""}{p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Margin Percent (%)</label>
              <Input
                type="number"
                step="0.01"
                value={formMarginPercent}
                onChange={(e) => setFormMarginPercent(e.target.value)}
                placeholder="Enter margin %"
                data-testid="input-margin-percent"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Effective From Date</label>
              <Input
                type="date"
                value={formEffectiveDate}
                onChange={(e) => setFormEffectiveDate(e.target.value)}
                data-testid="input-effective-date"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={formIsActive ? "active" : "inactive"} onValueChange={(val) => setFormIsActive(val === "active")} data-testid="select-status">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-rule"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Create Dialog for Customer + Product Rules */}
      <Dialog open={showBatchForm} onOpenChange={(open) => !open && closeBatchForm()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="batch-rule-form-dialog">
          <DialogHeader>
            <DialogTitle data-testid="batch-form-title">Add Customer + Product Price Rule</DialogTitle>
            <DialogDescription>
              Select {batchMatchMode === "customer" ? "customers" : "customer categories"} and products to create combinations ({batchRuleCount} rule{batchRuleCount !== 1 ? "s" : ""} will be created)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-2 block">Match By</label>
              <Select
                value={batchMatchMode}
                onValueChange={(val: "customer" | "category") => {
                  setBatchMatchMode(val);
                  setBatchSelectedCustomerIds(new Set());
                  setBatchSelectedCategoryNames(new Set());
                  setBatchCustomerSearch("");
                }}
                data-testid="batch-select-match-mode"
              >
                <SelectTrigger className="w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Individual Customer</SelectItem>
                  <SelectItem value="category">Customer Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Left column: Customers or Categories */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">
                    {batchMatchMode === "customer"
                      ? `Customers (${batchSelectedCustomerIds.size})`
                      : `Categories (${batchSelectedCategoryNames.size})`}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        if (batchMatchMode === "customer") {
                          setBatchSelectedCustomerIds(prev => {
                            const next = new Set(prev);
                            batchFilteredCustomers.forEach((c: any) => next.add(c.id));
                            return next;
                          });
                        } else {
                          setBatchSelectedCategoryNames(prev => {
                            const next = new Set(prev);
                            batchFilteredCategories.forEach((cat: any) => next.add(cat));
                            return next;
                          });
                        }
                      }}
                      data-testid="batch-select-all-customers"
                    >
                      All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        if (batchMatchMode === "customer") {
                          setBatchSelectedCustomerIds(new Set());
                        } else {
                          setBatchSelectedCategoryNames(new Set());
                        }
                      }}
                      data-testid="batch-clear-customers"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <Input
                  placeholder={batchMatchMode === "customer" ? "Search customers..." : "Search categories..."}
                  value={batchCustomerSearch}
                  onChange={(e) => setBatchCustomerSearch(e.target.value)}
                  className="mb-2 h-9"
                  data-testid="batch-customer-search"
                />
                <div className="border rounded-md h-52 overflow-y-auto">
                  {batchMatchMode === "customer" ? (
                    batchFilteredCustomers.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">No customers found</div>
                    ) : (
                      batchFilteredCustomers.map((c: any) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                          data-testid={`batch-customer-${c.id}`}
                        >
                          <Checkbox
                            checked={batchSelectedCustomerIds.has(c.id)}
                            onCheckedChange={() => toggleCustomerId(c.id)}
                          />
                          <span className="text-sm truncate">{c.name}</span>
                        </label>
                      ))
                    )
                  ) : (
                    batchFilteredCategories.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">No categories found</div>
                    ) : (
                      batchFilteredCategories.map((cat: any) => (
                        <label
                          key={cat}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                          data-testid={`batch-category-${cat}`}
                        >
                          <Checkbox
                            checked={batchSelectedCategoryNames.has(cat)}
                            onCheckedChange={() => toggleCategoryName(cat)}
                          />
                          <span className="text-sm truncate">{cat}</span>
                        </label>
                      ))
                    )
                  )}
                </div>
              </div>

              {/* Right column: Products */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Products ({batchSelectedProductIds.size})</span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setBatchSelectedProductIds(prev => {
                        const next = new Set(prev);
                        batchFilteredProducts.forEach((p: any) => next.add(p.id));
                        return next;
                      })}
                      data-testid="batch-select-all-products"
                    >
                      All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setBatchSelectedProductIds(new Set())}
                      data-testid="batch-clear-products"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="Search products..."
                    value={batchProductSearch}
                    onChange={(e) => setBatchProductSearch(e.target.value)}
                    className="h-9"
                    data-testid="batch-product-search"
                  />
                  <Select value={batchProductCategoryFilter || "all_categories"} onValueChange={(v) => setBatchProductCategoryFilter(v === "all_categories" ? "" : v)}>
                    <SelectTrigger className="w-44 h-9" data-testid="batch-product-category-filter">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_categories">All Categories</SelectItem>
                      {categories.map((cat: any) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="border rounded-md h-52 overflow-y-auto">
                  {batchFilteredProducts.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">No products found</div>
                  ) : (
                    batchFilteredProducts.map((p: any) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        data-testid={`batch-product-${p.id}`}
                      >
                        <Checkbox
                          checked={batchSelectedProductIds.has(p.id)}
                          onCheckedChange={() => toggleProductId(p.id)}
                        />
                        <span className="text-sm truncate">
                          {p.name}{p.itemCode ? ` (${p.itemCode})` : ""}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold mb-2 block">Margin Percent (%)</label>
              <Input
                type="number"
                step="0.01"
                value={batchMarginPercent}
                onChange={(e) => setBatchMarginPercent(e.target.value)}
                placeholder="Enter margin %"
                data-testid="batch-input-margin"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-2 block">Effective From Date</label>
              <Input
                type="date"
                value={batchEffectiveDate}
                onChange={(e) => setBatchEffectiveDate(e.target.value)}
                data-testid="batch-input-effective-date"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-2 block">Status</label>
              <Select value={batchIsActive ? "active" : "inactive"} onValueChange={(val) => setBatchIsActive(val === "active")} data-testid="batch-select-status">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeBatchForm} data-testid="batch-button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleBatchCreate}
              disabled={batchCreating || batchRuleCount === 0}
              data-testid="batch-button-create"
            >
              {batchCreating ? "Creating..." : `Create ${batchRuleCount} Rule${batchRuleCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
