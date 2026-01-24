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
import { Plus, Pencil, Trash2, Settings, Package, Users, UserPlus } from "lucide-react";

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
  const [selectedProductId, setSelectedProductId] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [status, setStatus] = useState("active");

  const { data: rules = [], isLoading } = useQuery<ProductPriceRuleData[]>({
    queryKey: ["/api/price-rules/products"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { productId: string; marginPercent: number; status: string }) => {
      return apiRequest("POST", "/api/price-rules/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/products"] });
      toast({ title: "Product price rule created" });
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
    setSelectedProductId("");
    setMarginPercent("");
    setStatus("active");
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    setSelectedProductId(rule.productId);
    setMarginPercent(rule.marginPercent);
    setStatus(rule.status);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      productId: selectedProductId,
      marginPercent: parseFloat(marginPercent),
      status,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Add"} Product Price Rule</DialogTitle>
              <DialogDescription>
                Set margin percentage for a specific product
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!!editingRule}>
                  <SelectTrigger data-testid="select-product">
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.itemCode || 'No code'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Button onClick={handleSubmit} disabled={!selectedProductId || !marginPercent} data-testid="button-submit-rule">
                {editingRule ? "Update" : "Create"}
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [effectiveFromDate, setEffectiveFromDate] = useState("");
  const [status, setStatus] = useState("active");

  const { data: rules = [], isLoading } = useQuery<CustomerPriceRuleData[]>({
    queryKey: ["/api/price-rules/customers"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { customerId: string; marginPercent: number; effectiveFromDate: string; status: string }) => {
      return apiRequest("POST", "/api/price-rules/customers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customers"] });
      toast({ title: "Customer price rule created" });
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
    setSelectedCustomerId("");
    setMarginPercent("");
    setEffectiveFromDate(new Date().toISOString().split('T')[0]);
    setStatus("active");
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    setSelectedCustomerId(rule.customerId);
    setMarginPercent(rule.marginPercent);
    setEffectiveFromDate(rule.effectiveFromDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setStatus(rule.status);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      customerId: selectedCustomerId,
      marginPercent: parseFloat(marginPercent),
      effectiveFromDate,
      status,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter to only show customers (not vendors)
  const customerList = customers.filter((c: any) => c.type === "customer");

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Customer Price Rules</CardTitle>
          <CardDescription>
            Default margin per customer for all products
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} data-testid="button-add-customer-rule">
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Add"} Customer Price Rule</DialogTitle>
              <DialogDescription>
                Set margin percentage for a specific customer
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} disabled={!!editingRule}>
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerList.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Button onClick={handleSubmit} disabled={!selectedCustomerId || !marginPercent || !effectiveFromDate} data-testid="button-submit-rule">
                {editingRule ? "Update" : "Create"}
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
                <TableHead>Customer</TableHead>
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [effectiveFromDate, setEffectiveFromDate] = useState("");
  const [status, setStatus] = useState("active");

  const { data: rules = [], isLoading } = useQuery<CustomerProductPriceRuleData[]>({
    queryKey: ["/api/price-rules/customer-products"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { customerId: string; productId: string; marginPercent: number; effectiveFromDate: string; status: string }) => {
      return apiRequest("POST", "/api/price-rules/customer-products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules/customer-products"] });
      toast({ title: "Customer+Product price rule created" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create rule", variant: "destructive" });
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
    setSelectedCustomerId("");
    setSelectedProductId("");
    setMarginPercent("");
    setEffectiveFromDate(new Date().toISOString().split('T')[0]);
    setStatus("active");
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    setSelectedCustomerId(rule.customerId);
    setSelectedProductId(rule.productId);
    setMarginPercent(rule.marginPercent);
    setEffectiveFromDate(rule.effectiveFromDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setStatus(rule.status);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      customerId: selectedCustomerId,
      productId: selectedProductId,
      marginPercent: parseFloat(marginPercent),
      effectiveFromDate,
      status,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter to only show customers (not vendors)
  const customerList = customers.filter((c: any) => c.type === "customer");

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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Add"} Customer + Product Price Rule</DialogTitle>
              <DialogDescription>
                Set margin percentage for a specific customer and product combination
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} disabled={!!editingRule}>
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerList.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!!editingRule}>
                  <SelectTrigger data-testid="select-product">
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.itemCode || 'No code'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Button onClick={handleSubmit} disabled={!selectedCustomerId || !selectedProductId || !marginPercent || !effectiveFromDate} data-testid="button-submit-rule">
                {editingRule ? "Update" : "Create"}
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
