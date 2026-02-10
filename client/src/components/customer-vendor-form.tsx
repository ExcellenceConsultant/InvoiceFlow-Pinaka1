import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Save, User, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DEFAULT_USER_ID } from "@/lib/constants";

const customerVendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  customerCategory: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  type: "customer" | "vendor";
  customer?: any;
}

export default function CustomerVendorForm({ onClose, onSuccess, type, customer }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!customer;

  const form = useForm<z.infer<typeof customerVendorSchema>>({
    resolver: zodResolver(customerVendorSchema),
    defaultValues: {
      name: customer?.name || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      customerCategory: customer?.customerCategory || "",
      address: {
        street: customer?.address?.street || "",
        city: customer?.address?.city || "",
        state: customer?.address?.state || "",
        zipCode: customer?.address?.zipCode || "",
        country: customer?.address?.country || "USA",
      },
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/customers", {
        ...data,
        type: type,
        userId: DEFAULT_USER_ID,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: `${type === "customer" ? "Customer" : "Vendor"} created successfully`,
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to create ${type}`,
        variant: "destructive",
      });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/customers/${customer.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: `${type === "customer" ? "Customer" : "Vendor"} updated successfully`,
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to update ${type}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof customerVendorSchema>) => {
    // Clean up empty address fields
    const cleanedData = {
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      customerCategory: data.customerCategory || undefined,
      address: data.address && Object.values(data.address).some(value => value && value.trim()) 
        ? data.address 
        : undefined,
    };

    if (isEditing) {
      updateCustomerMutation.mutate(cleanedData);
    } else {
      createCustomerMutation.mutate(cleanedData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid={`${type}-form-modal`}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center" data-testid={`${type}-form-title`}>
              {type === "customer" ? <User className="mr-2 text-primary" size={20} /> : <Building className="mr-2 text-primary" size={20} />}
              {isEditing ? "Edit" : "Create New"} {type === "customer" ? "Customer" : "Vendor"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid={`button-close-${type}-form`}>
              <X size={20} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{type === "customer" ? "Customer" : "Vendor"} Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid={`input-${type}-name`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid={`input-${type}-email`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid={`input-${type}-phone`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Category</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid={`input-${type}-customer-category`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address Information */}
              <div>
                <h3 className="text-lg font-medium mb-4">Address Information</h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="address.street"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid={`input-${type}-street`} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="address.city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid={`input-${type}-city`} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="address.state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid={`input-${type}-state`} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="address.zipCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid={`input-${type}-zipcode`} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="address.country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid={`select-${type}-country`}>
                              <SelectValue placeholder="Select Country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="USA">United States</SelectItem>
                            <SelectItem value="Canada">Canada</SelectItem>
                            <SelectItem value="Mexico">Mexico</SelectItem>
                            <SelectItem value="UK">United Kingdom</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-6">
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={createCustomerMutation.isPending || updateCustomerMutation.isPending}
                  data-testid={`button-save-${type}`}
                >
                  <Save className="mr-2" size={16} />
                  {(createCustomerMutation.isPending || updateCustomerMutation.isPending) 
                    ? "Saving..." 
                    : isEditing 
                      ? `Update ${type === "customer" ? "Customer" : "Vendor"}` 
                      : `Create ${type === "customer" ? "Customer" : "Vendor"}`}
                </Button>
                <Button 
                  type="button" 
                  variant="secondary"
                  onClick={onClose}
                  data-testid={`button-cancel-${type}`}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}