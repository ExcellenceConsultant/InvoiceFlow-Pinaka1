import { useState, useRef } from "react";
import { Plus, Search, Package, Edit, Trash2, AlertTriangle, TrendingUp, BarChart3, Upload, X, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Check } from "lucide-react";
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatDateWithoutTimezone } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { ProductForm } from "@/components/product-form";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/utils";

type SortKey = "name" | "itemCode" | "qty" | "category" | null;
type SortOrder = "asc" | "desc";

export default function Inventory() {
  const permissions = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState("all");
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortKey(null);
        setSortOrder("asc");
      }
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className="ml-1 text-muted-foreground" />;
    if (sortOrder === "asc") return <ArrowUp size={14} className="ml-1 text-primary" />;
    return <ArrowDown size={14} className="ml-1 text-primary" />;
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const selectAllCategories = () => {
    setSelectedCategories([]);
  };

  const { data: products, isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const isLoading = productsLoading;

  const getStockStatus = (variant: any) => {
    if (variant.stockQuantity <= 0) {
      return { 
        label: "Out of Stock", 
        className: "bg-destructive text-destructive-foreground",
        priority: 3 
      };
    } else if (variant.stockQuantity <= variant.lowStockThreshold) {
      return { 
        label: "Low Stock", 
        className: "bg-yellow-500 text-white",
        priority: 2 
      };
    } else {
      return { 
        label: "In Stock", 
        className: "bg-accent text-accent-foreground",
        priority: 1 
      };
    }
  };

  const filteredAndSortedProducts = (() => {
    let result = products?.filter((product: any) => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.itemCode && product.itemCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(product.category);
      
      const matchesStock = 
        stockFilter === "all" ||
        (stockFilter === "in" && product.qty > 0) ||
        (stockFilter === "out" && product.qty === 0);
      
      return matchesSearch && matchesCategory && matchesStock;
    }) || [];

    if (sortKey) {
      result = [...result].sort((a, b) => {
        let aVal: any, bVal: any;
        
        if (sortKey === "name") {
          aVal = (a.name || "").toLowerCase();
          bVal = (b.name || "").toLowerCase();
        } else if (sortKey === "qty") {
          aVal = a.qty || 0;
          bVal = b.qty || 0;
        } else if (sortKey === "itemCode") {
          aVal = (a.itemCode || "").toLowerCase();
          bVal = (b.itemCode || "").toLowerCase();
        } else if (sortKey === "category") {
          aVal = (a.category || "").toLowerCase();
          bVal = (b.category || "").toLowerCase();
        }

        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  })();

  const filteredProducts = filteredAndSortedProducts;

  // Calculate inventory stats
  const totalProducts = products?.length || 0;
  const totalValue = products?.reduce((sum: number, product: any) => 
    sum + (parseFloat(product.basePrice || 0) * (product.qty || 0)), 0) || 0;

  // Excel import mutation
  const importExcelMutation = useMutation({
    mutationFn: async (products: any[]) => {
      console.log('Starting import of', products.length, 'products');
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      
      for (const product of products) {
        try {
          const response = await apiRequest('POST', '/api/products', product);
          const result = await response.json();
          results.push(result);
          successCount++;
          console.log('Successfully created product:', result.name);
        } catch (error) {
          console.error('Failed to create product:', product.name, error);
          errorCount++;
        }
      }
      
      return { results, successCount, errorCount, totalAttempted: products.length };
    },
    onSuccess: (data) => {
      console.log('Import completed:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      
      if (data.errorCount > 0) {
        toast({
          title: "Partial Import",
          description: `Imported ${data.successCount} of ${data.totalAttempted} products. ${data.errorCount} failed.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import Successful!",
          description: `Successfully imported ${data.successCount} products to inventory`,
        });
      }
    },
    onError: (error) => {
      console.error('Import mutation error:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import products. Please check your file format and try again.",
        variant: "destructive",
      });
    },
  });

  const handleExcelImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a valid Excel file (.xlsx, .xls, or .csv)",
        variant: "destructive",
      });
      return;
    }

    console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        console.log('File read successfully, size:', data.length);
        
        const workbook = XLSX.read(data, { type: 'array' });
        console.log('Workbook parsed. Sheet names:', workbook.SheetNames);
        
        // Get first worksheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        console.log('JSON data extracted:', jsonData.length, 'rows');
        console.log('First few rows:', jsonData.slice(0, 3));
        
        if (jsonData.length < 2) {
          toast({
            title: "Invalid File",
            description: `Excel file must contain header row and data rows. Found ${jsonData.length} rows.`,
            variant: "destructive",
          });
          return;
        }

        const headers = jsonData[0] as string[];
        console.log('Headers found:', headers);
        const products = [];
        let skippedRows = 0;

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          console.log(`Processing row ${i}:`, row);
          
          if (row && row.filter(cell => cell !== null && cell !== undefined && cell !== '').length >= 3) {
            // More flexible: require at least 3 non-empty columns instead of exactly 7
            const cleanString = (value: any) => {
              if (!value || value === undefined || value === null) return null;
              const str = String(value).trim();
              return str === '' ? null : str;
            };
            
            const cleanNumber = (value: any) => {
              if (!value || value === undefined || value === null) return '0.00';
              const num = String(value).trim();
              return isNaN(parseFloat(num)) ? '0.00' : num;
            };

            const cleanInteger = (value: any) => {
              if (!value || value === undefined || value === null) return 0;
              const num = parseInt(String(value).trim());
              return isNaN(num) ? 0 : num;
            };

            const convertExcelDate = (value: any) => {
              if (!value || value === undefined || value === null) {
                return new Date().toISOString().split('T')[0];
              }
              
              const strValue = String(value).trim();
              
              // Check if it's an Excel date serial number (like 45658)
              if (/^\d+$/.test(strValue)) {
                const excelDate = parseInt(strValue);
                // Excel date calculation: Excel epoch is Dec 30, 1899
                const excelEpoch = new Date(1899, 11, 30);
                const jsDate = new Date(excelEpoch.getTime() + excelDate * 24 * 60 * 60 * 1000);
                return jsDate.toISOString().split('T')[0];
              }
              
              // Try to parse as regular date
              const parsedDate = new Date(strValue);
              if (!isNaN(parsedDate.getTime())) {
                return parsedDate.toISOString().split('T')[0];
              }
              
              // Default to today's date
              return new Date().toISOString().split('T')[0];
            };

            const product = {
              name: cleanString(row[0]) || `Product ${i}`, // Product Name
              brand: cleanString(row[1]) || null, // Brand
              date: convertExcelDate(row[2]), // Date (converted from Excel format)
              itemCode: cleanString(row[3]) || null, // Item Code
              packingSize: cleanString(row[4]) || null, // Packing Size
              category: cleanString(row[5]) || 'Imported', // Category
              qty: cleanInteger(row[6]), // Qty (as integer)
              basePrice: cleanNumber(row[7]), // Base Price
              salesPrice: cleanNumber(row[8]), // Sales Price
              grossWeight: cleanString(row[9]) || null, // Gross Weight (LBS)
              netWeight: cleanString(row[10]) || null, // Net Weight (LBS)
              schemeDescription: cleanString(row[11]) || null, // Scheme Description
              cartoonBarcode: cleanString(row[12]) || null, // Cartoon Barcode
              description: 'Imported from Excel',
            };
            
            console.log(`Parsed product for row ${i}:`, product);
            
            // More lenient validation: just require a name and a valid price (including 0)
            if (product.name && product.name !== `Product ${i}` && !isNaN(parseFloat(product.basePrice))) {
              products.push(product);
            } else {
              console.log(`Skipping row ${i} - validation failed:`, {
                hasName: !!product.name && product.name !== `Product ${i}`,
                hasValidPrice: !isNaN(parseFloat(product.basePrice)),
                product
              });
              skippedRows++;
            }
          } else {
            console.log(`Skipping row ${i} - insufficient data:`, row);
            skippedRows++;
          }
        }

        console.log('Processing complete:', {
          totalRows: jsonData.length - 1,
          validProducts: products.length,
          skippedRows
        });
        
        if (products.length > 0) {
          toast({
            title: "Processing Import",
            description: `Found ${products.length} valid products${skippedRows > 0 ? `, skipped ${skippedRows} rows` : ''}. Starting import...`,
          });
          importExcelMutation.mutate(products);
        } else {
          toast({
            title: "No Valid Data",
            description: `No valid products found. Processed ${jsonData.length - 1} rows, skipped ${skippedRows}. Check that your file has: Product Name, Brand, Date, Item Code, Packing Size, Category, Qty, Base Price, Sales Price, Gross Weight(LBS), Net Weight(LBS), Scheme Description, CARTOON BARCODE`,
            variant: "destructive",
          });
        }
      } catch (error: any) {
        console.error('Excel parsing error:', error);
        toast({
          title: "Parse Error",
          description: `Failed to parse Excel file: ${error.message || 'Unknown error'}. Please ensure it's a valid Excel file.`,
          variant: "destructive",
        });
      }
    };
    
    reader.onerror = (error) => {
      console.error('File reading error:', error);
      toast({
        title: "File Read Error",
        description: "Failed to read the uploaded file. Please try again.",
        variant: "destructive",
      });
    };
    
    reader.readAsArrayBuffer(file);
    
    // Reset the file input
    event.target.value = '';
  };

  // Get unique categories
  const categories = (Array.from(new Set(products?.map((p: any) => p.category).filter(Boolean))) || []).sort((a: any, b: any) => a.localeCompare(b));

  // Generate Excel Report Function
  const generateInventoryReport = () => {
    if (!products || products.length === 0) {
      toast({
        title: "No Data",
        description: "No products available to export",
        variant: "destructive",
      });
      return;
    }

    try {
      // Prepare report data
      const reportData = products.map((product: any) => ({
        'Product Name': product.name || '',
        'Brand': product.brand || '',
        'Date': product.date ? formatDateWithoutTimezone(product.date) : '',
        'Item Code': product.itemCode || '',
        'Packing Size': product.packingSize || '',
        'Category': product.category || '',
        'Qty': product.qty || 0,
        'Base Price': parseFloat(product.basePrice || 0).toFixed(2),
        'Sales Price': parseFloat(product.salesPrice || 0).toFixed(2),
        'Gross Weight(LBS)': product.grossWeight || '',
        'Net Weight(LBS)': product.netWeight || '',
        'Scheme Description': product.schemeDescription || '',
        'CARTOON BARCODE': product.cartoonBarcode || ''
      }));

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(reportData);
      
      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Report');
      
      // Generate filename with current date
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `Inventory_Report_${currentDate}.xlsx`;
      
      // Save file
      XLSX.writeFile(workbook, filename);
      
      toast({
        title: "Report Generated",
        description: `Inventory report exported successfully as ${filename}`,
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate inventory report. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Individual delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/products/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Product deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const promises = ids.map(id => 
        apiRequest("DELETE", `/api/products/${id}`, {})
      );
      const results = await Promise.allSettled(promises);
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`Failed to delete ${failed} product(s)`);
      }
      return results;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelectedProducts([]);
      toast({
        title: "Success",
        description: `${ids.length} product(s) deleted successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete some products",
        variant: "destructive",
      });
    },
  });

  // Selection handlers
  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAllProducts = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map((p: any) => p.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedProducts.length === 0) return;
    const confirmMessage = `Are you sure you want to delete ${selectedProducts.length} product(s)? This action cannot be undone.`;
    if (confirm(confirmMessage)) {
      bulkDeleteMutation.mutate(selectedProducts);
    }
  };

  const handleDeleteProduct = (productId: string, productName: string) => {
    const confirmMessage = `Are you sure you want to delete "${productName}"? This action cannot be undone.`;
    if (confirm(confirmMessage)) {
      deleteMutation.mutate(productId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="page-title">Inventory Management</h1>
            <p className="text-muted-foreground mt-1">Track and manage your product inventory</p>
          </div>
          
          <div className="flex items-center space-x-3 mt-4 lg:mt-0">
            <Button 
              variant="secondary" 
              onClick={() => fileInputRef.current?.click()} 
              disabled={importExcelMutation.isPending || !permissions.canManageProducts}
              data-testid="button-import-excel"
            >
              <Upload className="mr-2" size={16} />
              {importExcelMutation.isPending ? 'Importing...' : 'Import Excel'}
            </Button>
            <Button 
              variant="secondary" 
              onClick={generateInventoryReport}
              data-testid="button-inventory-report"
            >
              <BarChart3 className="mr-2" size={16} />
              Generate Report
            </Button>
            <Button 
              variant="outline" 
              onClick={async () => {
                try {
                  toast({
                    title: "Syncing Inventory",
                    description: "Please wait while we sync quantities from invoices...",
                  });

                  const response = await apiRequest('POST', '/api/inventory/sync', {});
                  const result = await response.json();

                  toast({
                    title: "Success",
                    description: result.message || "Inventory synced successfully",
                  });

                  // Refresh the products list
                  queryClient.invalidateQueries({ queryKey: ['/api/products'] });
                } catch (error: any) {
                  console.error('Error syncing inventory:', error);
                  toast({
                    title: "Error",
                    description: error.message || "Failed to sync inventory",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="button-sync-inventory"
            >
              <RefreshCw className="mr-2" size={16} />
              Sync Inventory
            </Button>
            <Button 
              variant="secondary" 
              onClick={async () => {
                try {
                  if (!products || products.length === 0) {
                    toast({
                      title: "No Data",
                      description: "No products available",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Show loading message
                  toast({
                    title: "Generating Report",
                    description: "Please wait, downloading from server...",
                  });

                  // Download the report directly from the optimized backend API
                  const token = localStorage.getItem("token");
                  const headers: Record<string, string> = {};
                  if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                  }
                  
                  const response = await fetch('/api/reports/inventory-movement', {
                    headers,
                    credentials: 'include',
                  });
                  
                  if (!response.ok) {
                    throw new Error(`Failed to generate report: ${response.statusText}`);
                  }
                  
                  // Get the blob and download it
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Inventory_Movement_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  
                  toast({
                    title: "Success",
                    description: "Inventory movement report downloaded successfully",
                  });
                } catch (error) {
                  console.error('Error generating movement report:', error);
                  toast({
                    title: "Error",
                    description: `Failed to generate report: ${error}`,
                    variant: "destructive",
                  });
                }
              }}
              data-testid="button-movement-report"
            >
              <BarChart3 className="mr-2" size={16} />
              Movement Report
            </Button>
            <Button 
              onClick={() => {
                setEditingProduct(null);
                setShowProductForm(true);
              }}
              disabled={!permissions.canManageProducts}
              data-testid="button-add-product"
            >
              <Plus className="mr-2" size={16} />
              Add Product
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="stats-card" data-testid="stats-total-products">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Total Products</p>
                <p className="text-2xl font-bold text-foreground" data-testid="total-products-value">
                  {totalProducts}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Package className="text-primary" size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-muted-foreground">Active products</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stats-card" data-testid="stats-inventory-value">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Inventory Value</p>
                <p className="text-2xl font-bold text-foreground" data-testid="inventory-value">
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <div className="w-12 h-12 bg-chart-1/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-chart-1" size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-muted-foreground">Total inventory worth</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stats-card" data-testid="stats-avg-price">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Average Price</p>
                <p className="text-2xl font-bold text-foreground" data-testid="avg-price">
                  {formatCurrency(totalProducts > 0 ? totalValue / totalProducts : 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="text-yellow-500" size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-muted-foreground">Per product</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stats-card" data-testid="stats-categories">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Categories</p>
                <p className="text-2xl font-bold text-foreground" data-testid="categories-count">
                  {categories.length}
                </p>
              </div>
              <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                <BarChart3 className="text-chart-3" size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-muted-foreground">Active categories</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6" data-testid="inventory-filters-card">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Search products, variants, or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-inventory"
                />
              </div>
            </div>
            
            <div className="w-full md:w-56">
              <Popover open={categoryDropdownOpen} onOpenChange={setCategoryDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryDropdownOpen}
                    className="w-full justify-between font-normal"
                    data-testid="select-category-filter"
                  >
                    <span className="truncate">
                      {selectedCategories.length === 0 || selectedCategories.length === categories.length
                        ? "All Categories"
                        : selectedCategories.length === 1
                        ? selectedCategories[0]
                        : `${selectedCategories.slice(0, 2).join(", ")}${selectedCategories.length > 2 ? ` (+${selectedCategories.length - 2})` : ""}`}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="max-h-60 overflow-y-auto">
                    <div
                      className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted"
                      onClick={selectAllCategories}
                      data-testid="category-option-all"
                    >
                      <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${selectedCategories.length === 0 || selectedCategories.length === categories.length ? "bg-primary border-primary" : "border-input"}`}>
                        {(selectedCategories.length === 0 || selectedCategories.length === categories.length) && <Check size={12} className="text-primary-foreground" />}
                      </div>
                      <span className="text-sm">All Categories</span>
                    </div>
                    {(categories as string[]).map((category: string) => (
                      <div
                        key={category}
                        className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted"
                        onClick={() => toggleCategory(category)}
                        data-testid={`category-option-${category.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${selectedCategories.includes(category) ? "bg-primary border-primary" : "border-input"}`}>
                          {selectedCategories.includes(category) && <Check size={12} className="text-primary-foreground" />}
                        </div>
                        <span className="text-sm">{category}</span>
                      </div>
                    ))}
                  </div>
                  {selectedCategories.length > 0 && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={selectAllCategories}
                        data-testid="button-clear-categories"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <div className="w-full md:w-48">
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger data-testid="select-stock-filter">
                  <SelectValue placeholder="Filter by stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock Levels</SelectItem>
                  <SelectItem value="in">In Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card data-testid="inventory-table-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Package className="mr-2 text-chart-3" size={20} />
              Inventory Items ({filteredProducts.length})
            </CardTitle>
            {selectedProducts.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.length} selected
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setSelectedProducts([])}
                  data-testid="button-clear-product-selection"
                  title="Clear selection"
                >
                  <X size={14} />
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-bulk-delete-products"
                >
                  <Trash2 className="mr-2" size={14} />
                  Delete Selected
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" data-testid={`inventory-skeleton-${i}`} />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="overflow-x-auto relative mx-6">
              <table className="w-full" data-testid="inventory-table">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-3 px-4 text-sm font-medium text-muted-foreground w-12">
                      <input 
                        type="checkbox"
                        checked={filteredProducts.length > 0 && selectedProducts.length === filteredProducts.length}
                        onChange={handleSelectAllProducts}
                        className="w-4 h-4 cursor-pointer"
                        data-testid="checkbox-select-all-products"
                      />
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort("name")}
                      data-testid="sort-product-name"
                    >
                      <div className="flex items-center">
                        Product Name
                        {getSortIcon("name")}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th 
                      className="text-left py-3 px-4 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort("itemCode")}
                      data-testid="sort-item-code"
                    >
                      <div className="flex items-center">
                        Item Code
                        {getSortIcon("itemCode")}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Packing Size</th>
                    <th 
                      className="text-left py-3 px-4 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort("category")}
                      data-testid="sort-category"
                    >
                      <div className="flex items-center">
                        Category
                        {getSortIcon("category")}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort("qty")}
                      data-testid="sort-qty"
                    >
                      <div className="flex items-center">
                        Qty
                        {getSortIcon("qty")}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Base Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Sales Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Gross Weight(LBS)</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Net Weight(LBS)</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Scheme Description</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground sticky right-0 bg-card z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product: any) => {
                    return (
                      <tr 
                        key={product.id} 
                        className="border-b border-border hover:bg-muted/20 transition-colors"
                        data-testid={`inventory-row-${product.id}`}
                      >
                        <td className="py-3 px-4">
                          <input 
                            type="checkbox"
                            checked={selectedProducts.includes(product.id)}
                            onChange={() => handleSelectProduct(product.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 cursor-pointer"
                            data-testid={`checkbox-product-${product.id}`}
                          />
                        </td>
                        <td className="py-3 px-4 text-sm text-foreground" data-testid={`product-name-${product.id}`}>
                          <div className="font-medium">{product.name}</div>
                          {product.description && (
                            <div className="text-xs text-muted-foreground">{product.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground" data-testid={`product-date-${product.id}`}>
                          {product.date ? formatDateWithoutTimezone(product.date) : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm font-mono text-muted-foreground" data-testid={`product-item-code-${product.id}`}>
                          {product.itemCode || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground" data-testid={`product-packing-size-${product.id}`}>
                          {product.packingSize || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground" data-testid={`product-category-${product.id}`}>
                          {product.category || "Uncategorized"}
                        </td>
                        <td className="py-3 px-4 text-sm text-foreground" data-testid={`product-qty-${product.id}`}>
                          {product.qty || 0}
                        </td>
                        <td className="py-3 px-4 text-sm text-foreground" data-testid={`product-price-${product.id}`}>
                          ${parseFloat(product.basePrice || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-foreground" data-testid={`product-sales-price-${product.id}`}>
                          ${parseFloat(product.salesPrice || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground" data-testid={`product-gross-weight-${product.id}`}>
                          {product.grossWeight || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground" data-testid={`product-net-weight-${product.id}`}>
                          {product.netWeight || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground" data-testid={`product-scheme-description-${product.id}`}>
                          {product.schemeDescription || '-'}
                        </td>
                        <td className="py-3 px-4 sticky right-0 bg-card z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                          <div className="flex space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setEditingProduct(product);
                                setShowProductForm(true);
                              }}
                              disabled={!permissions.canManageProducts}
                              data-testid={`button-edit-product-${product.id}`}
                            >
                              <Edit size={14} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteProduct(product.id, product.name)}
                              disabled={!permissions.canManageProducts}
                              data-testid={`button-delete-product-${product.id}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No inventory items found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchTerm || selectedCategories.length > 0
                  ? "Try adjusting your search or filter criteria."
                  : "Add your first product to get started."
                }
              </p>
              <Button 
                className="mt-4" 
                onClick={() => {
                  setEditingProduct(null);
                  setShowProductForm(true);
                }}
                disabled={!permissions.canManageProducts}
                data-testid="button-add-first-product"
              >
                <Plus className="mr-2" size={16} />
                Add Product
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleExcelImport}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
      />

      {/* Product Form Modal */}
      {showProductForm && (
        <ProductForm
          product={editingProduct}
          onClose={() => {
            setShowProductForm(false);
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}
