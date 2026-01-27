import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  basePrice: z.number().min(0, "Price must be positive"),
  salesPrice: z.number().min(0, "Sales price must be positive").optional(),
  category: z.string().optional(),
  itemCode: z.string().optional(),
  packingSize: z.string().optional(),
  schemeDescription: z.string().optional(),
  grossWeight: z.number().min(0, "Gross weight must be positive").optional(),
  netWeight: z.number().min(0, "Net weight must be positive").optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  onClose: () => void;
  product?: any;
}

export function ProductForm({ onClose, product }: ProductFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name || "",
      description: product?.description || "",
      basePrice: product ? parseFloat(product.basePrice) : 0,
      salesPrice: product?.salesPrice ? parseFloat(product.salesPrice) : 0,
      category: product?.category || "",
      itemCode: product?.itemCode || "",
      packingSize: product?.packingSize || "",
      schemeDescription: product?.schemeDescription || "",
      grossWeight: product?.grossWeight ? parseFloat(product.grossWeight) : 0,
      netWeight: product?.netWeight ? parseFloat(product.netWeight) : 0,
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const endpoint = product ? `/api/products/${product.id}` : '/api/products';
      const method = product ? 'PUT' : 'POST';
      
      const payload = {
        ...data,
        basePrice: data.basePrice.toString(),
        salesPrice: data.salesPrice?.toString() || null,
        grossWeight: data.grossWeight?.toString() || null,
        netWeight: data.netWeight?.toString() || null,
      };
      
      // Only add date for new products
      if (!product) {
        (payload as any).date = new Date().toISOString();
      }
      
      const response = await apiRequest(method, endpoint, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Success",
        description: `Product ${product ? 'updated' : 'created'} successfully`,
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    createProductMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="product-form-modal">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center" data-testid="product-form-title">
              <Package className="mr-2 text-primary" size={20} />
              {product ? 'Edit Product' : 'Add New Product'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-product-form">
              <X size={20} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter product name"
                    data-testid="input-product-name"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    placeholder="Enter category"
                    data-testid="input-product-category"
                    {...form.register("category")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter product description"
                  data-testid="input-product-description"
                  {...form.register("description")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="basePrice">Base Price (USD) *</Label>
                  <Input
                    id="basePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    data-testid="input-product-price"
                    {...form.register("basePrice", { valueAsNumber: true })}
                  />
                  {form.formState.errors.basePrice && (
                    <p className="text-sm text-red-500">{form.formState.errors.basePrice.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salesPrice">Sales Price (USD)</Label>
                  <Input
                    id="salesPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    data-testid="input-sales-price"
                    {...form.register("salesPrice", { valueAsNumber: true })}
                  />
                  {form.formState.errors.salesPrice && (
                    <p className="text-sm text-red-500">{form.formState.errors.salesPrice.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schemeDescription">Scheme Description</Label>
                <Textarea
                  id="schemeDescription"
                  placeholder="Enter scheme description"
                  data-testid="input-scheme-description"
                  {...form.register("schemeDescription")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="itemCode">Item Code</Label>
                  <Input
                    id="itemCode"
                    placeholder="Enter item code"
                    data-testid="input-item-code"
                    {...form.register("itemCode")}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="packingSize">Packing Size</Label>
                  <Input
                    id="packingSize"
                    placeholder="Enter packing size"
                    data-testid="input-packing-size"
                    {...form.register("packingSize")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="grossWeight">Gross Weight (LBS)</Label>
                  <Input
                    id="grossWeight"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0.000"
                    data-testid="input-gross-weight"
                    {...form.register("grossWeight", { valueAsNumber: true })}
                  />
                  {form.formState.errors.grossWeight && (
                    <p className="text-sm text-red-500">{form.formState.errors.grossWeight.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="netWeight">Net Weight (LBS)</Label>
                  <Input
                    id="netWeight"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0.000"
                    data-testid="input-net-weight"
                    {...form.register("netWeight", { valueAsNumber: true })}
                  />
                  {form.formState.errors.netWeight && (
                    <p className="text-sm text-red-500">{form.formState.errors.netWeight.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-6">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-product">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createProductMutation.isPending}
                data-testid="button-save-product"
              >
                {createProductMutation.isPending ? "Saving..." : (product ? "Update Product" : "Create Product")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}