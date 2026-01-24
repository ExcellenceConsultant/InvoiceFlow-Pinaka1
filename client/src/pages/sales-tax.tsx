import { useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Building2, Percent, Tag, Package, Users, FileCheck } from "lucide-react";

interface TaxAgency {
  id: string;
  name: string;
  jurisdiction: string;
  jurisdictionType: string;
  status: string;
}

interface TaxRate {
  id: string;
  taxAgencyId: string;
  name: string;
  rate: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  agency?: TaxAgency;
}

interface TaxCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isTaxable: boolean;
  isDefault: boolean;
  qbTaxCodeId: string | null;
  status: string;
  rates?: TaxRate[];
}

interface ProductTaxCode {
  id: string;
  productId: string;
  taxCodeId: string;
  product?: { name: string; itemCode: string | null };
  taxCode?: TaxCode;
}

interface CustomerTaxSettings {
  id: string;
  customerId: string;
  isTaxExempt: boolean;
  exemptionCertificateNumber: string | null;
  exemptionReason: string | null;
  overrideTaxCodeId: string | null;
  customer?: { name: string };
  overrideTaxCode?: TaxCode;
}

export default function SalesTax() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("agencies");

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Sales Tax Center</h1>
        <p className="text-muted-foreground">
          Manage tax agencies, rates, codes, and customer tax settings aligned with QuickBooks
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="agencies" className="flex items-center gap-2" data-testid="tab-agencies">
            <Building2 className="h-4 w-4" />
            Agencies
          </TabsTrigger>
          <TabsTrigger value="rates" className="flex items-center gap-2" data-testid="tab-rates">
            <Percent className="h-4 w-4" />
            Rates
          </TabsTrigger>
          <TabsTrigger value="codes" className="flex items-center gap-2" data-testid="tab-codes">
            <Tag className="h-4 w-4" />
            Tax Codes
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2" data-testid="tab-products">
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2" data-testid="tab-customers">
            <Users className="h-4 w-4" />
            Customers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agencies">
          <TaxAgenciesTab />
        </TabsContent>
        <TabsContent value="rates">
          <TaxRatesTab />
        </TabsContent>
        <TabsContent value="codes">
          <TaxCodesTab />
        </TabsContent>
        <TabsContent value="products">
          <ProductTaxCodesTab />
        </TabsContent>
        <TabsContent value="customers">
          <CustomerTaxSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TaxAgenciesTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<TaxAgency | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    jurisdiction: "",
    jurisdictionType: "state",
    status: "active",
  });

  const { data: agencies = [], isLoading } = useQuery<TaxAgency[]>({
    queryKey: ["/api/tax/agencies"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tax/agencies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/agencies"] });
      toast({ title: "Tax agency created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/tax/agencies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/agencies"] });
      toast({ title: "Tax agency updated" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tax/agencies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/agencies"] });
      toast({ title: "Tax agency deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", jurisdiction: "", jurisdictionType: "state", status: "active" });
    setEditingAgency(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (agency: TaxAgency) => {
    setEditingAgency(agency);
    setFormData({
      name: agency.name,
      jurisdiction: agency.jurisdiction,
      jurisdictionType: agency.jurisdictionType,
      status: agency.status,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingAgency) {
      updateMutation.mutate({ id: editingAgency.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Tax Agencies</CardTitle>
          <CardDescription>Tax collection authorities by jurisdiction</CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-agency">
          <Plus className="h-4 w-4 mr-2" />
          Add Agency
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : agencies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No tax agencies configured</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencies.map((agency) => (
                <TableRow key={agency.id} data-testid={`row-agency-${agency.id}`}>
                  <TableCell className="font-medium">{agency.name}</TableCell>
                  <TableCell>{agency.jurisdiction}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{agency.jurisdictionType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={agency.status === "active" ? "default" : "secondary"}>
                      {agency.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(agency)} data-testid={`button-edit-agency-${agency.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(agency.id)} data-testid={`button-delete-agency-${agency.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAgency ? "Edit Tax Agency" : "Add Tax Agency"}</DialogTitle>
            <DialogDescription>Configure a tax collection authority</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., California State Tax"
                data-testid="input-agency-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Jurisdiction</Label>
              <Input
                value={formData.jurisdiction}
                onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                placeholder="e.g., California"
                data-testid="input-agency-jurisdiction"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.jurisdictionType} onValueChange={(v) => setFormData({ ...formData, jurisdictionType: v })}>
                <SelectTrigger data-testid="select-jurisdiction-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="state">State</SelectItem>
                  <SelectItem value="county">County</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                  <SelectItem value="district">District</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger data-testid="select-agency-status">
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
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-agency">
              {editingAgency ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TaxRatesTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [formData, setFormData] = useState({
    taxAgencyId: "",
    name: "",
    rate: "",
    effectiveFrom: "",
    effectiveTo: "",
    status: "active",
  });

  const { data: rates = [], isLoading } = useQuery<TaxRate[]>({
    queryKey: ["/api/tax/rates"],
  });

  const { data: agencies = [] } = useQuery<TaxAgency[]>({
    queryKey: ["/api/tax/agencies"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tax/rates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/rates"] });
      toast({ title: "Tax rate created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/tax/rates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/rates"] });
      toast({ title: "Tax rate updated" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tax/rates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/rates"] });
      toast({ title: "Tax rate deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ taxAgencyId: "", name: "", rate: "", effectiveFrom: "", effectiveTo: "", status: "active" });
    setEditingRate(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (rate: TaxRate) => {
    setEditingRate(rate);
    setFormData({
      taxAgencyId: rate.taxAgencyId,
      name: rate.name,
      rate: rate.rate,
      effectiveFrom: rate.effectiveFrom || "",
      effectiveTo: rate.effectiveTo || "",
      status: rate.status,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const submitData = {
      ...formData,
      effectiveFrom: formData.effectiveFrom || null,
      effectiveTo: formData.effectiveTo || null,
    };
    if (editingRate) {
      updateMutation.mutate({ id: editingRate.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Tax Rates</CardTitle>
          <CardDescription>Individual tax rates with effective date ranges</CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-rate">
          <Plus className="h-4 w-4 mr-2" />
          Add Rate
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : rates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No tax rates configured</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Agency</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => (
                <TableRow key={rate.id} data-testid={`row-rate-${rate.id}`}>
                  <TableCell className="font-medium">{rate.name}</TableCell>
                  <TableCell>{rate.agency?.name || "-"}</TableCell>
                  <TableCell>{rate.rate}%</TableCell>
                  <TableCell>{rate.effectiveFrom || "-"}</TableCell>
                  <TableCell>{rate.effectiveTo || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={rate.status === "active" ? "default" : "secondary"}>
                      {rate.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(rate)} data-testid={`button-edit-rate-${rate.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(rate.id)} data-testid={`button-delete-rate-${rate.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRate ? "Edit Tax Rate" : "Add Tax Rate"}</DialogTitle>
            <DialogDescription>Configure a tax rate with effective dates</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tax Agency</Label>
              <Select value={formData.taxAgencyId} onValueChange={(v) => setFormData({ ...formData, taxAgencyId: v })}>
                <SelectTrigger data-testid="select-rate-agency">
                  <SelectValue placeholder="Select agency" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., CA State Sales Tax"
                data-testid="input-rate-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Rate (%)</Label>
              <Input
                type="number"
                step="0.001"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                placeholder="e.g., 7.25"
                data-testid="input-rate-percent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective From</Label>
                <Input
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                  data-testid="input-effective-from"
                />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input
                  type="date"
                  value={formData.effectiveTo}
                  onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                  data-testid="input-effective-to"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger data-testid="select-rate-status">
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
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-rate">
              {editingRate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TaxCodesTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<TaxCode | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    isTaxable: true,
    isDefault: false,
    qbTaxCodeId: "",
    status: "active",
  });

  const { data: codes = [], isLoading } = useQuery<TaxCode[]>({
    queryKey: ["/api/tax/codes"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tax/codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/codes"] });
      toast({ title: "Tax code created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/tax/codes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/codes"] });
      toast({ title: "Tax code updated" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tax/codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/codes"] });
      toast({ title: "Tax code deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ code: "", name: "", description: "", isTaxable: true, isDefault: false, qbTaxCodeId: "", status: "active" });
    setEditingCode(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (code: TaxCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      name: code.name,
      description: code.description || "",
      isTaxable: code.isTaxable,
      isDefault: code.isDefault,
      qbTaxCodeId: code.qbTaxCodeId || "",
      status: code.status,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const submitData = {
      ...formData,
      description: formData.description || null,
      qbTaxCodeId: formData.qbTaxCodeId || null,
    };
    if (editingCode) {
      updateMutation.mutate({ id: editingCode.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Tax Codes</CardTitle>
          <CardDescription>QuickBooks-style combined tax codes (TAX, NON)</CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-code">
          <Plus className="h-4 w-4 mr-2" />
          Add Tax Code
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : codes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No tax codes configured</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Taxable</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>QB Tax Code ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => (
                <TableRow key={code.id} data-testid={`row-code-${code.id}`}>
                  <TableCell className="font-medium">{code.code}</TableCell>
                  <TableCell>{code.name}</TableCell>
                  <TableCell>
                    <Badge variant={code.isTaxable ? "default" : "secondary"}>
                      {code.isTaxable ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {code.isDefault && <Badge variant="outline">Default</Badge>}
                  </TableCell>
                  <TableCell>{code.qbTaxCodeId || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={code.status === "active" ? "default" : "secondary"}>
                      {code.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(code)} data-testid={`button-edit-code-${code.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(code.id)} data-testid={`button-delete-code-${code.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCode ? "Edit Tax Code" : "Add Tax Code"}</DialogTitle>
            <DialogDescription>Configure a QuickBooks-compatible tax code</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., TAX, NON"
                data-testid="input-code-code"
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Taxable Sales"
                data-testid="input-code-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-code-description"
              />
            </div>
            <div className="space-y-2">
              <Label>QuickBooks Tax Code ID</Label>
              <Input
                value={formData.qbTaxCodeId}
                onChange={(e) => setFormData({ ...formData, qbTaxCodeId: e.target.value })}
                placeholder="e.g., TAX or NON (from QuickBooks)"
                data-testid="input-qb-tax-code-id"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Taxable</Label>
              <Switch
                checked={formData.isTaxable}
                onCheckedChange={(v) => setFormData({ ...formData, isTaxable: v })}
                data-testid="switch-taxable"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Set as Default</Label>
              <Switch
                checked={formData.isDefault}
                onCheckedChange={(v) => setFormData({ ...formData, isDefault: v })}
                data-testid="switch-default"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger data-testid="select-code-status">
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
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-code">
              {editingCode ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ProductTaxCodesTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: "",
    taxCodeId: "",
  });

  const { data: productTaxCodes = [], isLoading } = useQuery<ProductTaxCode[]>({
    queryKey: ["/api/tax/product-tax-codes"],
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const { data: taxCodes = [] } = useQuery<TaxCode[]>({
    queryKey: ["/api/tax/codes"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tax/product-tax-codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/product-tax-codes"] });
      toast({ title: "Product tax code mapping created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tax/product-tax-codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/product-tax-codes"] });
      toast({ title: "Product tax code mapping deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ productId: "", taxCodeId: "" });
    setIsDialogOpen(false);
  };

  const handleSubmit = () => {
    createMutation.mutate(formData);
  };

  const assignedProductIds = new Set(productTaxCodes.map(ptc => ptc.productId));
  const unassignedProducts = products.filter(p => !assignedProductIds.has(p.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Product Tax Codes</CardTitle>
          <CardDescription>Default tax code mappings per product</CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-product-tax">
          <Plus className="h-4 w-4 mr-2" />
          Assign Tax Code
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : productTaxCodes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No product tax codes configured</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Item Code</TableHead>
                <TableHead>Tax Code</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productTaxCodes.map((ptc) => {
                const product = products.find(p => p.id === ptc.productId);
                const taxCode = taxCodes.find(tc => tc.id === ptc.taxCodeId);
                return (
                <TableRow key={ptc.id} data-testid={`row-product-tax-${ptc.id}`}>
                  <TableCell className="font-medium">{product?.name || "-"}</TableCell>
                  <TableCell>{product?.itemCode || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{taxCode?.code || "-"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(ptc.id)} data-testid={`button-delete-product-tax-${ptc.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Product Tax Code</DialogTitle>
            <DialogDescription>Map a product to a default tax code</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={formData.productId} onValueChange={(v) => setFormData({ ...formData, productId: v })}>
                <SelectTrigger data-testid="select-product">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} {product.itemCode ? `(${product.itemCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax Code</Label>
              <Select value={formData.taxCodeId} onValueChange={(v) => setFormData({ ...formData, taxCodeId: v })}>
                <SelectTrigger data-testid="select-tax-code">
                  <SelectValue placeholder="Select tax code" />
                </SelectTrigger>
                <SelectContent>
                  {taxCodes.filter(tc => tc.status === "active").map((code) => (
                    <SelectItem key={code.id} value={code.id}>
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-product-tax">
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CustomerTaxSettingsTab() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSettings, setEditingSettings] = useState<CustomerTaxSettings | null>(null);
  const [formData, setFormData] = useState({
    customerId: "",
    isTaxExempt: false,
    exemptionCertificateNumber: "",
    exemptionReason: "",
    overrideTaxCodeId: "",
  });

  const { data: customerSettings = [], isLoading } = useQuery<CustomerTaxSettings[]>({
    queryKey: ["/api/tax/customer-settings"],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: taxCodes = [] } = useQuery<TaxCode[]>({
    queryKey: ["/api/tax/codes"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tax/customer-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/customer-settings"] });
      toast({ title: "Customer tax settings created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/tax/customer-settings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/customer-settings"] });
      toast({ title: "Customer tax settings updated" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tax/customer-settings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax/customer-settings"] });
      toast({ title: "Customer tax settings deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ customerId: "", isTaxExempt: false, exemptionCertificateNumber: "", exemptionReason: "", overrideTaxCodeId: "" });
    setEditingSettings(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (settings: CustomerTaxSettings) => {
    setEditingSettings(settings);
    setFormData({
      customerId: settings.customerId,
      isTaxExempt: settings.isTaxExempt,
      exemptionCertificateNumber: settings.exemptionCertificateNumber || "",
      exemptionReason: settings.exemptionReason || "",
      overrideTaxCodeId: settings.overrideTaxCodeId || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const submitData = {
      ...formData,
      exemptionCertificateNumber: formData.exemptionCertificateNumber || null,
      exemptionReason: formData.exemptionReason || null,
      overrideTaxCodeId: formData.overrideTaxCodeId || null,
    };
    if (editingSettings) {
      updateMutation.mutate({ id: editingSettings.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const assignedCustomerIds = new Set(customerSettings.map(cs => cs.customerId));
  const unassignedCustomers = customers.filter(c => c.type === "customer" && !assignedCustomerIds.has(c.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Customer Tax Settings</CardTitle>
          <CardDescription>Tax exemptions and override settings per customer</CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-customer-tax">
          <Plus className="h-4 w-4 mr-2" />
          Add Customer Settings
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : customerSettings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No customer tax settings configured</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Tax Exempt</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead>Override Tax Code</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerSettings.map((settings) => (
                <TableRow key={settings.id} data-testid={`row-customer-tax-${settings.id}`}>
                  <TableCell className="font-medium">{settings.customer?.name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={settings.isTaxExempt ? "default" : "secondary"}>
                      {settings.isTaxExempt ? "Exempt" : "Taxable"}
                    </Badge>
                  </TableCell>
                  <TableCell>{settings.exemptionCertificateNumber || "-"}</TableCell>
                  <TableCell>
                    {settings.overrideTaxCode ? (
                      <Badge variant="outline">{settings.overrideTaxCode.code}</Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(settings)} data-testid={`button-edit-customer-tax-${settings.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(settings.id)} data-testid={`button-delete-customer-tax-${settings.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSettings ? "Edit Customer Tax Settings" : "Add Customer Tax Settings"}</DialogTitle>
            <DialogDescription>Configure tax exemption and override for a customer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingSettings && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={formData.customerId} onValueChange={(v) => setFormData({ ...formData, customerId: v })}>
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedCustomers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Tax Exempt</Label>
              <Switch
                checked={formData.isTaxExempt}
                onCheckedChange={(v) => setFormData({ ...formData, isTaxExempt: v })}
                data-testid="switch-tax-exempt"
              />
            </div>
            {formData.isTaxExempt && (
              <>
                <div className="space-y-2">
                  <Label>Exemption Certificate Number</Label>
                  <Input
                    value={formData.exemptionCertificateNumber}
                    onChange={(e) => setFormData({ ...formData, exemptionCertificateNumber: e.target.value })}
                    placeholder="Certificate number"
                    data-testid="input-certificate-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Exemption Reason</Label>
                  <Input
                    value={formData.exemptionReason}
                    onChange={(e) => setFormData({ ...formData, exemptionReason: e.target.value })}
                    placeholder="e.g., Resale, Government"
                    data-testid="input-exemption-reason"
                  />
                </div>
              </>
            )}
            {!formData.isTaxExempt && (
              <div className="space-y-2">
                <Label>Override Tax Code (optional)</Label>
                <Select value={formData.overrideTaxCodeId || "none"} onValueChange={(v) => setFormData({ ...formData, overrideTaxCodeId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-override-tax-code">
                    <SelectValue placeholder="Use default tax logic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use default tax logic</SelectItem>
                    {taxCodes.filter(tc => tc.status === "active").map((code) => (
                      <SelectItem key={code.id} value={code.id}>
                        {code.code} - {code.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-customer-tax">
              {editingSettings ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
