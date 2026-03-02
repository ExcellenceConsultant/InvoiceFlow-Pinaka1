import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  customer?: { name: string; customerCategory?: string } | null;
  product?: { name: string; itemCode?: string; category?: string } | null;
  createdAt: string;
}

export default function PriceRules() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("global");
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<PriceRuleData | null>(null);

  const [formRuleType, setFormRuleType] = useState("global");
  const [formMarginPercent, setFormMarginPercent] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formCustomerCategory, setFormCustomerCategory] = useState("");
  const [formMatchMode, setFormMatchMode] = useState<"customer" | "category">("customer");
  const [formProductId, setFormProductId] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formProductCategoryFilter, setFormProductCategoryFilter] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  const { data: rules = [], isLoading } = useQuery<PriceRuleData[]>({
    queryKey: ["/api/price-rules"],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const activeCustomers = customers.filter((c: any) => c.type === "customer" && c.isActive !== false);
  const categories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b));
  const customerCategories = Array.from(new Set(customers.filter((c: any) => c.customerCategory).map((c: any) => c.customerCategory))).sort((a: any, b: any) => a.localeCompare(b));

  const filteredFormProducts = formProductCategoryFilter && formProductCategoryFilter !== "all_categories"
    ? products.filter((p: any) => p.category === formProductCategoryFilter)
    : products;

  const globalRules = rules.filter((r) => r.ruleType === "global");
  const productRules = rules.filter((r) => r.ruleType === "product");
  const customerRules = rules.filter((r) => r.ruleType === "customer");
  const customerProductRules = rules.filter((r) => r.ruleType === "customer_product");

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
    setCustomerSearchTerm("");
  };

  const openCreateForm = (type: string) => {
    setFormRuleType(type);
    setFormMarginPercent("");
    setFormCustomerId("");
    setFormCustomerCategory("");
    setFormMatchMode("customer");
    setFormProductId("");
    setFormIsActive(true);
    setFormProductCategoryFilter("");
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

  const getFormTitle = () => {
    const action = editingRule ? "Edit" : "Create";
    switch (formRuleType) {
      case "global": return `${action} Global Rule`;
      case "product": return `${action} Product Rule`;
      case "customer": return `${action} Customer Rule`;
      case "customer_product": return `${action} Customer + Product Rule`;
      default: return `${action} Rule`;
    }
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

        {/* Global Rules Tab */}
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
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {globalRules.map((rule) => (
                      <TableRow key={rule.id} data-testid={`global-rule-${rule.id}`}>
                        <TableCell className="font-medium">{rule.marginPercent}%</TableCell>
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

        {/* Product Rules Tab */}
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

        {/* Customer Rules Tab */}
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
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerRules.map((rule) => (
                      <TableRow key={rule.id} data-testid={`customer-rule-${rule.id}`}>
                        <TableCell className="font-medium">{getCustomerOrCategoryLabel(rule)}</TableCell>
                        <TableCell>{rule.marginPercent}%</TableCell>
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

        {/* Customer + Product Rules Tab */}
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

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg" data-testid="price-rule-form-dialog">
          <DialogHeader>
            <DialogTitle data-testid="form-title">{getFormTitle()}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer Selection (for customer and customer_product types) */}
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
                          .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
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

            {/* Product Selection (for product and customer_product types) */}
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

            {/* Margin Percent */}
            <div>
              <label className="text-sm font-medium mb-2 block">Margin Percentage (%)</label>
              <Input
                type="number"
                step="0.01"
                value={formMarginPercent}
                onChange={(e) => setFormMarginPercent(e.target.value)}
                placeholder="Enter margin %"
                data-testid="input-margin-percent"
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Active</label>
              <Select value={formIsActive ? "active" : "inactive"} onValueChange={(val) => setFormIsActive(val === "active")} data-testid="select-status">
                <SelectTrigger className="w-32">
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
    </div>
  );
}
