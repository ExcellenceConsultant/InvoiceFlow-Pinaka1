import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Settings, Package, Users, UserPlus, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GlobalPriceRuleData {
  id?: string;
  enableAutoPriceRule: boolean;
  defaultMarginPercent: string | null;
}

interface ProductPriceRuleData {
  id: string;
  productId: string;
  marginPercent: string;
  status: string;
  product?: { name: string; itemCode: string };
}

interface CustomerPriceRuleData {
  id: string;
  customerId: string;
  marginPercent: string;
  effectiveFromDate: string;
  status: string;
  customer?: { name: string };
}

interface CustomerProductPriceRuleData {
  id: string;
  customerId: string;
  productId: string;
  marginPercent: string;
  effectiveFromDate: string;
  status: string;
  customer?: { name: string };
  product?: { name: string; itemCode: string };
}

interface Product {
  id: string;
  name: string;
  itemCode: string | null;
}

interface Customer {
  id: string;
  name: string;
  type: string;
  customerCategory?: string;
}

export default function PriceRules() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("global");

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Price Rules</h1>
        <p className="text-muted-foreground">
          Manage margin-based pricing logic for sales orders and invoices
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="global" className="flex items-center gap-2" data-testid="tab-global">
            <Settings className="h-4 w-4" />
            Global
          </TabsTrigger>
          <TabsTrigger value="product" className="flex items-center gap-2" data-testid="tab-product">
            <Package className="h-4 w-4" />
            Product
          </TabsTrigger>
          <TabsTrigger value="customer" className="flex items-center gap-2" data-testid="tab-customer">
            <Users className="h-4 w-4" />
            Customer
          </TabsTrigger>
          <TabsTrigger value="customer-product" className="flex items-center gap-2" data-testid="tab-customer-product">
            <UserPlus className="h-4 w-4" />
            Customer + Product
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <GlobalPriceRuleTab />
        </TabsContent>

        <TabsContent value="product">
          <ProductPriceRuleTab />
        </TabsContent>

        <TabsContent value="customer">
          <CustomerPriceRuleTab />
        </TabsContent>

        <TabsContent value="customer-product">
          <CustomerProductPriceRuleTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GlobalPriceRuleTab() {
  const { toast } = useToast();
  const [enableAutoPriceRule, setEnableAutoPriceRule] = useState(true);
  const [defaultMarginPercent, setDefaultMarginPercent] = useState("");

  const { data: globalRule, isLoading } = useQuery<GlobalPriceRuleData | null>({
    queryKey: ["/api/price-rules/global"],
  });

  useEffect(() => {
    if (globalRule) {
      setEnableAutoPriceRule(globalRule.enableAutoPriceRule ?? true);
      setDefaultMarginPercent(globalRule.defaultMarginPercent ?? "");
    }
  }, [globalRule]);

  const saveMutation = useMutation({
    mutationFn: async (data: { enableAutoPriceRule: boolean; defaultMarginPercent: number }) => {
      return apiRequest("POST", "/api/price-rules/global", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/global"] });
      toast({ title: "Global price rule saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save global price rule", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      enableAutoPriceRule,
      defaultMarginPercent: parseFloat(defaultMarginPercent) || 0,
    });
  };

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global Price Rule</CardTitle>
        <CardDescription>
          Fallback margin when no other rule applies. Only one global rule can be active.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-auto-price">Enable Auto Price Rule</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, prices are automatically calculated using margin rules
            </p>
          </div>
          <Switch
            id="enable-auto-price"
            checked={enableAutoPriceRule}
            onCheckedChange={setEnableAutoPriceRule}
            data-testid="switch-enable-auto-price"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-margin">Default Margin Percent (%)</Label>
          <Input
            id="default-margin"
            type="number"
            step="0.01"
            value={defaultMarginPercent}
            onChange={(e) => setDefaultMarginPercent(e.target.value)}
            placeholder="25"
            className="max-w-xs"
            data-testid="input-default-margin"
          />
          <p className="text-sm text-muted-foreground">
            Formula: sales_price = purchase_price × (1 + margin / 100)
          </p>
        </div>

        <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-global">
          {saveMutation.isPending ? "Saving..." : "Save Global Rule"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProductPriceRuleTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ProductPriceRuleData | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [marginPercent, setMarginPercent] = useState("");
  const [status, setStatus] = useState("active");
  const [productSearch, setProductSearch] = useState("");

  const { data: rules = [], isLoading } = useQuery<ProductPriceRuleData[]>({
    queryKey: ["/api/price-rules/products"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const existingProductIds = new Set(rules.map(r => r.productId));
  const availableProducts = products.filter(p => !existingProductIds.has(p.id));
  const filteredProducts = availableProducts.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.itemCode && p.itemCode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const createMutation = useMutation({
    mutationFn: async (data: { productIds: string[]; marginPercent: number; status: string }) => {
      const promises = data.productIds.map(productId => 
        apiRequest("POST", "/api/price-rules/products", { productId, marginPercent: data.marginPercent, status: data.status })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/products"] });
      toast({ title: `${selectedProductIds.length} product price rule(s) created` });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create rule", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { marginPercent?: number; status?: string } }) => {
      return apiRequest("PATCH", `/api/price-rules/products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/products"] });
      toast({ title: "Product price rule updated" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/price-rules/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/products"] });
      toast({ title: "Product price rule deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setSelectedProductIds([]);
    setMarginPercent("");
    setStatus("active");
    setProductSearch("");
  };

  const handleEdit = (rule: ProductPriceRuleData) => {
    setEditingRule(rule);
    setSelectedProductIds([rule.productId]);
    setMarginPercent(rule.marginPercent);
    setStatus(rule.status);
    setIsDialogOpen(true);
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    setSelectedProductIds(filteredProducts.map(p => p.id));
  };

  const clearAllProducts = () => {
    setSelectedProductIds([]);
  };

  const handleSubmit = () => {
    if (editingRule) {
      updateMutation.mutate({ 
        id: editingRule.id, 
        data: { marginPercent: parseFloat(marginPercent), status } 
      });
    } else {
      createMutation.mutate({
        productIds: selectedProductIds,
        marginPercent: parseFloat(marginPercent),
        status,
      });
    }
  };

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Product Price Rules</CardTitle>
          <CardDescription>
            Default margin per product (applies to all customers unless overridden)
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} data-testid="button-add-product-rule">
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Add"} Product Price Rule</DialogTitle>
              <DialogDescription>
                {editingRule ? "Update margin percentage for this product" : "Select multiple products and set margin percentage"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!editingRule && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Products ({selectedProductIds.length} selected)</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllProducts} data-testid="button-select-all-products">
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={clearAllProducts} data-testid="button-clear-products">
                        Clear
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    data-testid="input-product-search"
                  />
                  <ScrollArea className="h-48 border rounded-md p-2">
                    {filteredProducts.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4 text-sm">No available products</p>
                    ) : (
                      <div className="space-y-2">
                        {filteredProducts.map((p) => (
                          <div key={p.id} className="flex items-center space-x-2 py-1">
                            <Checkbox
                              id={`product-${p.id}`}
                              checked={selectedProductIds.includes(p.id)}
                              onCheckedChange={() => toggleProduct(p.id)}
                              data-testid={`checkbox-product-${p.id}`}
                            />
                            <label htmlFor={`product-${p.id}`} className="text-sm flex-1 cursor-pointer">
                              {p.name} {p.itemCode && <span className="text-muted-foreground">({p.itemCode})</span>}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
              {editingRule && (
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Input value={editingRule.product?.name || 'Unknown'} disabled />
                </div>
              )}
              <div className="space-y-2">
                <Label>Margin Percent (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(e.target.value)}
                  placeholder="25"
                  data-testid="input-margin-percent"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-status">
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
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={(editingRule ? false : selectedProductIds.length === 0) || !marginPercent || createMutation.isPending} 
                data-testid="button-submit-rule"
              >
                {createMutation.isPending ? "Creating..." : editingRule ? "Update" : `Create ${selectedProductIds.length} Rule(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No product price rules defined</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Item Code</TableHead>
                <TableHead>Margin %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule: any) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.product?.name || 'Unknown'}</TableCell>
                  <TableCell>{rule.product?.itemCode || '-'}</TableCell>
                  <TableCell>{rule.marginPercent}%</TableCell>
                  <TableCell>
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                      {rule.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(rule)} data-testid={`button-edit-${rule.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                        <Trash2 className="h-4 w-4" />
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
  );
}

function CustomerPriceRuleTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomerPriceRuleData | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [ruleMode, setRuleMode] = useState<"individual" | "category">("individual");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [effectiveFromDate, setEffectiveFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState("active");
  const [customerSearch, setCustomerSearch] = useState("");

  const { data: rules = [], isLoading } = useQuery<CustomerPriceRuleData[]>({
    queryKey: ["/api/price-rules/customers"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerList = customers.filter((c) => c.type === "customer");
  const filteredCustomers = customerList.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const uniqueCategories = Array.from(
    new Set(customerList.map(c => c.customerCategory).filter((c): c is string => !!c && c.trim() !== ""))
  ).sort();

  const createMutation = useMutation({
    mutationFn: async (data: { customerIds?: string[]; customerCategory?: string; marginPercent: number; effectiveFromDate: string; status: string }) => {
      if (data.customerCategory) {
        return apiRequest("POST", "/api/price-rules/customers", { 
          customerCategory: data.customerCategory, 
          marginPercent: data.marginPercent, 
          effectiveFromDate: data.effectiveFromDate, 
          status: data.status 
        });
      }
      const promises = (data.customerIds || []).map(customerId => 
        apiRequest("POST", "/api/price-rules/customers", { customerId, marginPercent: data.marginPercent, effectiveFromDate: data.effectiveFromDate, status: data.status })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customers"] });
      if (ruleMode === "category") {
        toast({ title: `Category price rule created for "${selectedCategory}"` });
      } else {
        toast({ title: `${selectedCustomerIds.length} customer price rule(s) created` });
      }
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create rule", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { marginPercent?: number; effectiveFromDate?: string; status?: string } }) => {
      return apiRequest("PATCH", `/api/price-rules/customers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customers"] });
      toast({ title: "Customer price rule updated" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/price-rules/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customers"] });
      toast({ title: "Customer price rule deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setSelectedCustomerIds([]);
    setRuleMode("individual");
    setSelectedCategory("");
    setMarginPercent("");
    setEffectiveFromDate(new Date().toISOString().split('T')[0]);
    setStatus("active");
    setCustomerSearch("");
  };

  const handleEdit = (rule: CustomerPriceRuleData) => {
    setEditingRule(rule);
    setSelectedCustomerIds(rule.customerId ? [rule.customerId] : []);
    setMarginPercent(rule.marginPercent);
    setEffectiveFromDate(rule.effectiveFromDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setStatus(rule.status);
    setIsDialogOpen(true);
  };

  const toggleCustomer = (customerId: string) => {
    setSelectedCustomerIds(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const selectAllCustomers = () => {
    setSelectedCustomerIds(filteredCustomers.map(c => c.id));
  };

  const clearAllCustomers = () => {
    setSelectedCustomerIds([]);
  };

  const handleSubmit = () => {
    if (editingRule) {
      updateMutation.mutate({ 
        id: editingRule.id, 
        data: { marginPercent: parseFloat(marginPercent), effectiveFromDate, status } 
      });
    } else if (ruleMode === "category") {
      createMutation.mutate({
        customerCategory: selectedCategory,
        marginPercent: parseFloat(marginPercent),
        effectiveFromDate,
        status,
      });
    } else {
      createMutation.mutate({
        customerIds: selectedCustomerIds,
        marginPercent: parseFloat(marginPercent),
        effectiveFromDate,
        status,
      });
    }
  };

  const isSubmitDisabled = () => {
    if (!marginPercent || !effectiveFromDate || createMutation.isPending) return true;
    if (editingRule) return false;
    if (ruleMode === "category") return !selectedCategory;
    return selectedCustomerIds.length === 0;
  };

  const getSubmitLabel = () => {
    if (createMutation.isPending) return "Creating...";
    if (editingRule) return "Update";
    if (ruleMode === "category") return "Create Category Rule";
    return `Create ${selectedCustomerIds.length} Rule(s)`;
  };

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Customer Price Rules</CardTitle>
          <CardDescription>
            Default margin per customer or customer category for all products
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} data-testid="button-add-customer-rule">
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Add"} Customer Price Rule</DialogTitle>
              <DialogDescription>
                {editingRule 
                  ? "Update margin percentage for this rule" 
                  : "Select individual customers or a customer category and set margin percentage"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!editingRule && (
                <>
                  <div className="space-y-2">
                    <Label>Rule Type</Label>
                    <Select value={ruleMode} onValueChange={(v) => { setRuleMode(v as "individual" | "category"); setSelectedCustomerIds([]); setSelectedCategory(""); }}>
                      <SelectTrigger data-testid="select-rule-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual Customers</SelectItem>
                        <SelectItem value="category">By Customer Category</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {ruleMode === "individual" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Customers ({selectedCustomerIds.length} selected)</Label>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={selectAllCustomers} data-testid="button-select-all-customers">
                            Select All
                          </Button>
                          <Button variant="outline" size="sm" onClick={clearAllCustomers} data-testid="button-clear-customers">
                            Clear
                          </Button>
                        </div>
                      </div>
                      <Input
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        data-testid="input-customer-search"
                      />
                      <ScrollArea className="h-48 border rounded-md p-2">
                        {filteredCustomers.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4 text-sm">No customers found</p>
                        ) : (
                          <div className="space-y-2">
                            {filteredCustomers.map((c) => (
                              <div key={c.id} className="flex items-center space-x-2 py-1">
                                <Checkbox
                                  id={`customer-${c.id}`}
                                  checked={selectedCustomerIds.includes(c.id)}
                                  onCheckedChange={() => toggleCustomer(c.id)}
                                  data-testid={`checkbox-customer-${c.id}`}
                                />
                                <label htmlFor={`customer-${c.id}`} className="text-sm flex-1 cursor-pointer">
                                  {c.name}
                                  {c.customerCategory && <span className="text-muted-foreground ml-1">({c.customerCategory})</span>}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  )}

                  {ruleMode === "category" && (
                    <div className="space-y-2">
                      <Label>Customer Category</Label>
                      {uniqueCategories.length > 0 ? (
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger data-testid="select-customer-category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {uniqueCategories.map((cat) => {
                              const count = customerList.filter(c => c.customerCategory === cat).length;
                              return (
                                <SelectItem key={cat} value={cat}>
                                  {cat} ({count} customer{count !== 1 ? "s" : ""})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground border rounded-md p-3">
                          No customer categories found. Please assign categories to customers first.
                        </p>
                      )}
                      {selectedCategory && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Applies to: {customerList.filter(c => c.customerCategory === selectedCategory).map(c => c.name).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {editingRule && (
                <div className="space-y-2">
                  <Label>{(editingRule as any).customerCategory ? "Customer Category" : "Customer"}</Label>
                  <Input value={(editingRule as any).customerCategory || editingRule.customer?.name || 'Unknown'} disabled />
                </div>
              )}
              <div className="space-y-2">
                <Label>Margin Percent (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(e.target.value)}
                  placeholder="25"
                  data-testid="input-margin-percent"
                />
              </div>
              <div className="space-y-2">
                <Label>Effective From Date</Label>
                <Input
                  type="date"
                  value={effectiveFromDate}
                  onChange={(e) => setEffectiveFromDate(e.target.value)}
                  data-testid="input-effective-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-status">
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
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitDisabled()} 
                data-testid="button-submit-rule"
              >
                {getSubmitLabel()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No customer price rules defined</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer / Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Margin %</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule: any) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    {rule.customerCategory 
                      ? rule.customerCategory
                      : rule.customer?.name || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.customerCategory ? "secondary" : "outline"}>
                      {rule.customerCategory ? "Category" : "Individual"}
                    </Badge>
                  </TableCell>
                  <TableCell>{rule.marginPercent}%</TableCell>
                  <TableCell>{new Date(rule.effectiveFromDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                      {rule.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(rule)} data-testid={`button-edit-${rule.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                        <Trash2 className="h-4 w-4" />
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
  );
}

function CustomerProductPriceRuleTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomerProductPriceRuleData | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [marginPercent, setMarginPercent] = useState("");
  const [effectiveFromDate, setEffectiveFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState("active");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const { data: rules = [], isLoading } = useQuery<CustomerProductPriceRuleData[]>({
    queryKey: ["/api/price-rules/customer-products"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const customerList = customers.filter((c) => c.type === "customer");
  const filteredCustomers = customerList.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.itemCode && p.itemCode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const createMutation = useMutation({
    mutationFn: async (data: { customerIds: string[]; productIds: string[]; marginPercent: number; effectiveFromDate: string; status: string }) => {
      const combinations: { customerId: string; productId: string }[] = [];
      data.customerIds.forEach(customerId => {
        data.productIds.forEach(productId => {
          combinations.push({ customerId, productId });
        });
      });
      const promises = combinations.map(combo => 
        apiRequest("POST", "/api/price-rules/customer-products", { 
          customerId: combo.customerId, 
          productId: combo.productId, 
          marginPercent: data.marginPercent, 
          effectiveFromDate: data.effectiveFromDate, 
          status: data.status 
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customer-products"] });
      const count = selectedCustomerIds.length * selectedProductIds.length;
      toast({ title: `${count} customer+product price rule(s) created` });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create rules (some combinations may already exist)", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { marginPercent?: number; effectiveFromDate?: string; status?: string } }) => {
      return apiRequest("PATCH", `/api/price-rules/customer-products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customer-products"] });
      toast({ title: "Customer+Product price rule updated" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/price-rules/customer-products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customer-products"] });
      toast({ title: "Customer+Product price rule deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setSelectedCustomerIds([]);
    setSelectedProductIds([]);
    setMarginPercent("");
    setEffectiveFromDate(new Date().toISOString().split('T')[0]);
    setStatus("active");
    setCustomerSearch("");
    setProductSearch("");
  };

  const handleEdit = (rule: CustomerProductPriceRuleData) => {
    setEditingRule(rule);
    setSelectedCustomerIds([rule.customerId]);
    setSelectedProductIds([rule.productId]);
    setMarginPercent(rule.marginPercent);
    setEffectiveFromDate(rule.effectiveFromDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setStatus(rule.status);
    setIsDialogOpen(true);
  };

  const toggleCustomer = (customerId: string) => {
    setSelectedCustomerIds(prev => 
      prev.includes(customerId) ? prev.filter(id => id !== customerId) : [...prev, customerId]
    );
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const selectAllCustomers = () => setSelectedCustomerIds(filteredCustomers.map(c => c.id));
  const clearAllCustomers = () => setSelectedCustomerIds([]);
  const selectAllProducts = () => setSelectedProductIds(filteredProducts.map(p => p.id));
  const clearAllProducts = () => setSelectedProductIds([]);

  const handleSubmit = () => {
    if (editingRule) {
      updateMutation.mutate({ 
        id: editingRule.id, 
        data: { marginPercent: parseFloat(marginPercent), effectiveFromDate, status } 
      });
    } else {
      createMutation.mutate({
        customerIds: selectedCustomerIds,
        productIds: selectedProductIds,
        marginPercent: parseFloat(marginPercent),
        effectiveFromDate,
        status,
      });
    }
  };

  const combinationsCount = selectedCustomerIds.length * selectedProductIds.length;

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Customer + Product Price Rules</CardTitle>
          <CardDescription>
            Highest-priority margin for specific customer and product combinations
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} data-testid="button-add-customer-product-rule">
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Add"} Customer + Product Price Rule</DialogTitle>
              <DialogDescription>
                {editingRule 
                  ? "Update margin percentage for this combination" 
                  : `Select customers and products to create combinations (${combinationsCount} rule${combinationsCount !== 1 ? 's' : ''} will be created)`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!editingRule && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Customers ({selectedCustomerIds.length})</Label>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={selectAllCustomers}>All</Button>
                          <Button variant="outline" size="sm" onClick={clearAllCustomers}>Clear</Button>
                        </div>
                      </div>
                      <Input
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                      <ScrollArea className="h-40 border rounded-md p-2">
                        {filteredCustomers.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4 text-sm">No customers found</p>
                        ) : (
                          <div className="space-y-1">
                            {filteredCustomers.map((c) => (
                              <div key={c.id} className="flex items-center space-x-2 py-1">
                                <Checkbox
                                  id={`cp-customer-${c.id}`}
                                  checked={selectedCustomerIds.includes(c.id)}
                                  onCheckedChange={() => toggleCustomer(c.id)}
                                />
                                <label htmlFor={`cp-customer-${c.id}`} className="text-sm flex-1 cursor-pointer truncate">
                                  {c.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Products ({selectedProductIds.length})</Label>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={selectAllProducts}>All</Button>
                          <Button variant="outline" size="sm" onClick={clearAllProducts}>Clear</Button>
                        </div>
                      </div>
                      <Input
                        placeholder="Search products..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      <ScrollArea className="h-40 border rounded-md p-2">
                        {filteredProducts.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4 text-sm">No products found</p>
                        ) : (
                          <div className="space-y-1">
                            {filteredProducts.map((p) => (
                              <div key={p.id} className="flex items-center space-x-2 py-1">
                                <Checkbox
                                  id={`cp-product-${p.id}`}
                                  checked={selectedProductIds.includes(p.id)}
                                  onCheckedChange={() => toggleProduct(p.id)}
                                />
                                <label htmlFor={`cp-product-${p.id}`} className="text-sm flex-1 cursor-pointer truncate">
                                  {p.name} {p.itemCode && <span className="text-muted-foreground">({p.itemCode})</span>}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </>
              )}
              {editingRule && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Input value={editingRule.customer?.name || 'Unknown'} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Input value={editingRule.product?.name || 'Unknown'} disabled />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Margin Percent (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(e.target.value)}
                  placeholder="25"
                  data-testid="input-margin-percent"
                />
              </div>
              <div className="space-y-2">
                <Label>Effective From Date</Label>
                <Input
                  type="date"
                  value={effectiveFromDate}
                  onChange={(e) => setEffectiveFromDate(e.target.value)}
                  data-testid="input-effective-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-status">
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
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={(editingRule ? false : (selectedCustomerIds.length === 0 || selectedProductIds.length === 0)) || !marginPercent || !effectiveFromDate || createMutation.isPending} 
                data-testid="button-submit-rule"
              >
                {createMutation.isPending ? "Creating..." : editingRule ? "Update" : `Create ${combinationsCount} Rule(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No customer+product price rules defined</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Margin %</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule: any) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.customer?.name || 'Unknown'}</TableCell>
                  <TableCell>{rule.product?.name || 'Unknown'}</TableCell>
                  <TableCell>{rule.marginPercent}%</TableCell>
                  <TableCell>{new Date(rule.effectiveFromDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                      {rule.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(rule)} data-testid={`button-edit-${rule.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-${rule.id}`}>
                        <Trash2 className="h-4 w-4" />
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
  );
}
