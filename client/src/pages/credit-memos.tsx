import CreditMemoForm from "@/components/credit-memo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { INVOICE_STATUS_COLORS, INVOICE_STATUSES } from "@/lib/constants";
import { formatDateWithoutTimezone } from "@/lib/dateUtils";
import { apiRequest } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  Download,
  Edit,
  Eye,
  FileDown,
  FileText,
  Plus,
  Search,
  Trash2,
  Cloud,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DateRange } from "react-day-picker";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

type SortKey =
  | "creditMemoNumber"
  | "invoiceType"
  | "customer"
  | "creditMemoDate"
  | "amount"
  | "status"
  | "journalEntry";

type SortConfig = {
  key: SortKey;
  direction: "asc" | "desc";
};

type DateFilterOption =
  | "all"
  | "last_month"
  | "last_30_days"
  | "this_quarter"
  | "last_quarter"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "year_to_date"
  | "this_year"
  | "custom"
  | `year_${number}`;

type DateRangeSelection = {
  start: Date | null;
  end: Date | null;
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const parseYearFromOption = (option: DateFilterOption): number | null => {
  if (option.startsWith("year_")) {
    const value = Number(option.split("_")[1]);
    return Number.isNaN(value) ? null : value;
  }
  return null;
};

const getQuarterRange = (
  reference: Date,
  offset: number,
): DateRangeSelection => {
  let year = reference.getFullYear();
  let quarterIndex = Math.floor(reference.getMonth() / 3) + offset;

  while (quarterIndex < 0) {
    quarterIndex += 4;
    year -= 1;
  }

  while (quarterIndex > 3) {
    quarterIndex -= 4;
    year += 1;
  }

  const startMonth = quarterIndex * 3;
  const start = startOfDay(new Date(year, startMonth, 1));
  const end = endOfDay(new Date(year, startMonth + 3, 0));

  return { start, end };
};

const getYearRange = (year: number): DateRangeSelection => ({
  start: startOfDay(new Date(year, 0, 1)),
  end: endOfDay(new Date(year, 11, 31)),
});

const calculateDateRange = (
  option: DateFilterOption,
  customRange?: DateRange,
  referenceDate: Date = new Date(),
): DateRangeSelection => {
  const now = referenceDate;

  switch (option) {
    case "all":
      return { start: null, end: null };
    case "last_month": {
      const start = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
      );
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { start, end };
    }
    case "last_30_days": {
      const end = endOfDay(now);
      const start = startOfDay(new Date(now));
      start.setDate(start.getDate() - 29);
      return { start, end };
    }
    case "this_quarter":
      return getQuarterRange(now, 0);
    case "last_quarter":
      return getQuarterRange(now, -1);
    case "last_3_months": {
      const end = endOfDay(now);
      const start = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 2, 1),
      );
      return { start, end };
    }
    case "last_6_months": {
      const end = endOfDay(now);
      const start = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 5, 1),
      );
      return { start, end };
    }
    case "last_12_months": {
      const end = endOfDay(now);
      const start = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 11, 1),
      );
      return { start, end };
    }
    case "year_to_date": {
      const start = startOfDay(new Date(now.getFullYear(), 0, 1));
      const end = endOfDay(now);
      return { start, end };
    }
    case "this_year":
      return getYearRange(now.getFullYear());
    case "custom": {
      if (customRange?.from && customRange?.to) {
        return {
          start: startOfDay(customRange.from),
          end: endOfDay(customRange.to),
        };
      }
      return { start: null, end: null };
    }
    default: {
      const year = parseYearFromOption(option);
      if (year) {
        return getYearRange(year);
      }
      return { start: null, end: null };
    }
  }
};

const getDateFilterLabel = (
  option: DateFilterOption,
  options: { value: DateFilterOption; label: string }[],
  customRange?: DateRange,
) => {
  if (option === "custom" && customRange?.from && customRange?.to) {
    return `${formatDateWithoutTimezone(
      customRange.from,
    )} – ${formatDateWithoutTimezone(customRange.to)}`;
  }

  const preset = options.find((opt) => opt.value === option);
  if (preset) {
    return preset.label;
  }

  const year = parseYearFromOption(option);
  if (year) {
    return year.toString();
  }

  return "All dates";
};

const MS_IN_DAY = 1000 * 60 * 60 * 24;

const getInvoiceDueDate = (invoice: any): Date | null => {
  const dueDateSource = invoice.dueDate ?? invoice.due_date;
  if (dueDateSource) {
    const dueDateParsed = new Date(dueDateSource);
    if (!Number.isNaN(dueDateParsed.getTime())) {
      return startOfDay(dueDateParsed);
    }
  }

  if (!invoice.invoiceDate) {
    return null;
  }

  const invoiceDate = new Date(invoice.invoiceDate);
  if (Number.isNaN(invoiceDate.getTime())) {
    return null;
  }

  invoiceDate.setDate(invoiceDate.getDate() + 30);
  return startOfDay(invoiceDate);
};

const formatDayCount = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

const getDisplayStatus = (creditMemo: any) => {
  // Credit memos don't have due dates, so just return the status
  if (creditMemo.status === "paid" || creditMemo.status === "overdue") {
    return creditMemo.status;
  }
  return creditMemo.status;
};

const getDueStatusMessage = (invoice: any, statusOverride?: string) => {
  const displayStatus = statusOverride ?? getDisplayStatus(invoice);
  if (displayStatus !== "sent" && displayStatus !== "overdue") {
    return null;
  }

  const dueDate = getInvoiceDueDate(invoice);
  if (!dueDate) {
    return null;
  }

  const today = startOfDay(new Date());

  if (displayStatus === "sent") {
    const diffMs = dueDate.getTime() - today.getTime();
    if (diffMs === 0) {
      return "Due today";
    }
    if (diffMs > 0) {
      const daysUntilDue = Math.ceil(diffMs / MS_IN_DAY);
      return `Due in ${formatDayCount(daysUntilDue)}`;
    }

    const overdueDays = Math.ceil(Math.abs(diffMs) / MS_IN_DAY);
    return `Overdue by ${formatDayCount(overdueDays)}`;
  }

  const overdueMs = today.getTime() - dueDate.getTime();
  if (overdueMs <= 0) {
    return "Overdue today";
  }

  const overdueDays = Math.ceil(overdueMs / MS_IN_DAY);
  return `Overdue by ${formatDayCount(overdueDays)}`;
};

export default function CreditMemos() {
  const permissions = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"AR" | "AP">("AR");
  const [showCreditMemoForm, setShowCreditMemoForm] = useState(false);
  const [editingCreditMemo, setEditingCreditMemo] = useState<any>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [dateFilterOption, setDateFilterOption] =
    useState<DateFilterOption>("last_12_months");
  const [customDateRange, setCustomDateRange] = useState<
    DateRange | undefined
  >();
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
  const [pendingCustomRange, setPendingCustomRange] = useState<
    DateRange | undefined
  >();
  const [lastNonCustomDateOption, setLastNonCustomDateOption] =
    useState<DateFilterOption>("last_12_months");
  const customDialogCloseActionRef = useRef<"apply" | "cancel" | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const currentYear = new Date().getFullYear();
  const dateFilterOptions = useMemo(() => {
    const previousYear = currentYear - 1;

    const options: { value: DateFilterOption; label: string }[] = [
      { value: "all", label: "All dates" },
      { value: "last_month", label: "Last month" },
      { value: "last_30_days", label: "Last 30 days" },
      { value: "this_quarter", label: "This quarter" },
      { value: "last_quarter", label: "Last quarter" },
      { value: "last_3_months", label: "Last 3 months" },
      { value: "last_6_months", label: "Last 6 months" },
      { value: "last_12_months", label: "Last 12 months" },
      { value: "year_to_date", label: "Year to date" },
      { value: "this_year", label: "This year" },
      {
        value: `year_${previousYear}` as DateFilterOption,
        label: previousYear.toString(),
      },
      { value: "custom", label: "Custom" },
    ];

    return options;
  }, [currentYear]);

  const selectedDateRange = useMemo(
    () => calculateDateRange(dateFilterOption, customDateRange),
    [dateFilterOption, customDateRange],
  );

  const dateFilterLabel = useMemo(
    () =>
      getDateFilterLabel(dateFilterOption, dateFilterOptions, customDateRange),
    [dateFilterOption, dateFilterOptions, customDateRange],
  );

  const { data: creditMemos, isLoading } = useQuery<any[]>({
    queryKey: ["/api/credit-memos"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const postToQuickBooksMutation = useMutation({
    mutationFn: async (creditMemoId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/credit-memos/${creditMemoId}/post-to-quickbooks`,
        {},
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      toast({
        title: "Credit Memo Posted to QuickBooks",
        description: `${data.message} (Doc #${data.docNumber})`,
      });
    },
    onError: (error: any) => {
      console.error("Credit memo post error:", error);
      const errorData = error.response?.data || error;
      toast({
        title: "Failed to Post Credit Memo",
        description:
          errorData.message || "Failed to post credit memo to QuickBooks",
        variant: "destructive",
      });
    },
  });

  const postToZohoMutation = useMutation({
    mutationFn: async (creditMemoId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/credit-memos/${creditMemoId}/post-to-zoho`,
        {},
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      toast({
        title: "Credit Memo Posted to Zoho Books",
        description: data.message || "Credit memo posted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Zoho credit memo post error:", error);
      const errorData = error.response?.data || error;
      toast({
        title: "Failed to Post Credit Memo",
        description:
          errorData.message || "Failed to post credit memo to Zoho Books",
        variant: "destructive",
      });
    },
  });

  const deleteCreditMemoMutation = useMutation({
    mutationFn: async (creditMemoId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/credit-memos/${creditMemoId}`,
        {},
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete credit memo");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      toast({
        title: "Success",
        description: "Credit memo deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete credit memo",
        variant: "destructive",
      });
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async (creditMemoId: string) => {
      const response = await apiRequest(
        "PATCH",
        `/api/credit-memos/${creditMemoId}/status`,
        { status: "paid" },
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to mark credit memo as paid",
        );
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      toast({
        title: "Success",
        description: "Credit memo marked as paid",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark credit memo as paid",
        variant: "destructive",
      });
    },
  });

  const handlePostToQuickBooks = (
    creditMemoId: string,
    event?: React.MouseEvent,
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    console.log("Posting credit memo to QuickBooks:", creditMemoId);
    postToQuickBooksMutation.mutate(creditMemoId);
  };

  const handlePostToZoho = (creditMemoId: string, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    console.log("Posting credit memo to Zoho Books:", creditMemoId);
    postToZohoMutation.mutate(creditMemoId);
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers?.find((c: any) => c.id === customerId);
    return customer?.name || "Unknown Customer";
  };

  const filteredCreditMemos = useMemo(() => {
    if (!creditMemos) return [];

    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = creditMemos.filter((creditMemo: any) => {
      // Filter by credit memo type based on active tab
      // Database stores "receivable" and "payable", tabs use "AR" and "AP"
      const invoiceTypeFromTab = activeTab === "AR" ? "receivable" : "payable";
      const matchesTab = creditMemo.invoiceType === invoiceTypeFromTab;
      if (!matchesTab) return false;

      const customerName = getCustomerName(creditMemo.customerId);
      const displayStatus = getDisplayStatus(creditMemo);
      const matchesStatus =
        statusFilter === "all" || displayStatus === statusFilter;

      const creditMemoDateValue = creditMemo.creditMemoDate
        ? new Date(creditMemo.creditMemoDate)
        : null;
      const matchesDate = (() => {
        if (!selectedDateRange.start || !selectedDateRange.end) {
          return true;
        }

        if (
          !creditMemoDateValue ||
          Number.isNaN(creditMemoDateValue.getTime())
        ) {
          return false;
        }

        const normalized = new Date(creditMemoDateValue);
        normalized.setHours(0, 0, 0, 0);
        return (
          normalized >= selectedDateRange.start &&
          normalized <= selectedDateRange.end
        );
      })();

      if (!normalizedSearch) {
        return matchesStatus && matchesDate;
      }

      const amountRaw =
        creditMemo.total ?? creditMemo.totalAmount ?? creditMemo.amount ?? 0;
      const amountNumber =
        typeof amountRaw === "string"
          ? Number.parseFloat(amountRaw)
          : Number(amountRaw);
      const amountString = Number.isNaN(amountNumber)
        ? ""
        : amountNumber.toFixed(2);
      let invoiceTypeLabel = creditMemo.invoiceType;
      if (invoiceTypeLabel === "payable") {
        invoiceTypeLabel = "ap";
      } else if (invoiceTypeLabel === "receivable") {
        invoiceTypeLabel = "ar";
      }
      const quickbooksStatus = creditMemo.quickbooksCreditMemoId
        ? "journal entry posted"
        : "no journal entry";

      const creditMemoNumber = creditMemo.creditMemoNumber;
      const creditMemoDateFormatted = creditMemoDateValue
        ? formatDateWithoutTimezone(creditMemoDateValue)
        : "";
      const searchableValues = [
        creditMemoNumber,
        creditMemo.invoiceType,
        invoiceTypeLabel,
        customerName,
        creditMemoDateFormatted,
        amountString,
        displayStatus,
        quickbooksStatus,
        creditMemo.quickbooksCreditMemoId,
        creditMemo.subtotal,
        creditMemo.freight,
        creditMemo.discount,
      ]
        .filter(Boolean)
        .map((value: any) => value.toString().toLowerCase());

      const matchesSearch = searchableValues.some((value: string) =>
        value.includes(normalizedSearch),
      );

      return matchesStatus && matchesSearch && matchesDate;
    });

    if (!sortConfig) {
      return filtered;
    }

    const getSortableValue = (creditMemo: any) => {
      switch (sortConfig.key) {
        case "creditMemoNumber":
          return creditMemo.creditMemoNumber || "";
        case "invoiceType":
          return creditMemo.invoiceType || "";
        case "customer":
          return getCustomerName(creditMemo.customerId) || "";
        case "creditMemoDate":
          const creditMemoDate = creditMemo.creditMemoDate;
          return creditMemoDate ? new Date(creditMemoDate).getTime() : 0;
        case "amount": {
          const amountRaw =
            creditMemo.total ??
            creditMemo.totalAmount ??
            creditMemo.amount ??
            0;
          const amountNumber =
            typeof amountRaw === "string"
              ? Number.parseFloat(amountRaw)
              : Number(amountRaw);
          return Number.isNaN(amountNumber) ? 0 : amountNumber;
        }
        case "status":
          return getDisplayStatus(creditMemo) || "";
        case "journalEntry":
          return creditMemo.quickbooksCreditMemoId ? 1 : 0;
        default:
          return "";
      }
    };

    const sorted = [...filtered].sort((a, b) => {
      const aValue = getSortableValue(a);
      const bValue = getSortableValue(b);

      if (aValue === bValue) return 0;

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.direction === "asc"
          ? aValue - bValue
          : bValue - aValue;
      }

      const aString = aValue?.toString().toLowerCase() ?? "";
      const bString = bValue?.toString().toLowerCase() ?? "";

      if (aString === bString) return 0;

      return sortConfig.direction === "asc"
        ? aString < bString
          ? -1
          : 1
        : aString > bString
          ? -1
          : 1;
    });

    return sorted;
  }, [
    creditMemos,
    searchTerm,
    statusFilter,
    activeTab,
    sortConfig,
    customers,
    selectedDateRange,
  ]);

  const handleSort = (columnKey: SortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === columnKey) {
        if (prev.direction === "asc") {
          return { key: columnKey, direction: "desc" };
        }
        return null;
      }
      return { key: columnKey, direction: "asc" };
    });
  };

  const renderSortIcon = (columnKey: SortKey) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-muted-foreground" />
    ) : (
      <ArrowDown className="h-3 w-3 text-muted-foreground" />
    );
  };

  const handleDateFilterChange = (option: DateFilterOption) => {
    if (option === "custom") {
      setLastNonCustomDateOption(dateFilterOption);
      const today = new Date();
      const initialRange =
        customDateRange?.from && customDateRange?.to
          ? customDateRange
          : { from: today, to: today };
      setPendingCustomRange(initialRange);
      customDialogCloseActionRef.current = null;
      setIsDateFilterOpen(false);
      setIsCustomDialogOpen(true);
      return;
    }

    setDateFilterOption(option);
    setLastNonCustomDateOption(option);
    setIsDateFilterOpen(false);
    setPendingCustomRange(undefined);
  };

  const handleCustomApply = () => {
    if (!pendingCustomRange?.from || !pendingCustomRange?.to) {
      return;
    }
    setCustomDateRange(pendingCustomRange);
    setDateFilterOption("custom");
    customDialogCloseActionRef.current = "apply";
    setIsCustomDialogOpen(false);
    setPendingCustomRange(undefined);
  };

  const handleCustomCancel = () => {
    customDialogCloseActionRef.current = "cancel";
    setPendingCustomRange(undefined);
    setIsCustomDialogOpen(false);
  };

  const handleDatePopoverOpenChange = (open: boolean) => {
    setIsDateFilterOpen(open);
  };

  const handleCustomDialogOpenChange = (open: boolean) => {
    if (open) {
      customDialogCloseActionRef.current = null;
      setIsCustomDialogOpen(true);
      return;
    }

    setIsCustomDialogOpen(false);
    const action = customDialogCloseActionRef.current;
    customDialogCloseActionRef.current = null;

    if (action === "apply") {
      return;
    }

    setDateFilterOption(lastNonCustomDateOption);
    setPendingCustomRange(undefined);
  };

  // Check if credit memo can be edited based on 24-hour rule
  const canEditCreditMemo = (creditMemo: any): boolean => {
    // Super admin can always edit
    if (permissions.role === "super_admin") {
      return true;
    }

    // If user doesn't have general edit permission, return false
    if (!permissions.canEditInvoice) {
      return false;
    }

    // Check if credit memo is within 24 hours of creation
    const creditMemoDate = new Date(creditMemo.creditMemoDate);
    const now = new Date();
    const hoursDifference =
      (now.getTime() - creditMemoDate.getTime()) / (1000 * 60 * 60);

    // Admin can edit within 24 hours, super_admin can always edit
    return hoursDifference <= 24;
  };

  // Check if credit memo can be deleted based on 24-hour rule
  const canDeleteCreditMemo = (creditMemo: any): boolean => {
    // Super admin can always delete
    if (permissions.role === "super_admin") {
      return true;
    }

    // If user doesn't have general delete permission, return false
    if (!permissions.canDeleteInvoice) {
      return false;
    }

    // Check if credit memo is within 24 hours of creation
    const creditMemoDate = new Date(creditMemo.creditMemoDate);
    const now = new Date();
    const hoursDifference =
      (now.getTime() - creditMemoDate.getTime()) / (1000 * 60 * 60);

    // Admin can delete within 24 hours, super_admin can always delete
    return hoursDifference <= 24;
  };

  const handleMarkAsPaid = (creditMemoId: string, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    markAsPaidMutation.mutate(creditMemoId);
  };

  const handleEditCreditMemo = (creditMemo: any, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setEditingCreditMemo(creditMemo);
    setShowCreditMemoForm(true);
  };

  const handleCloseCreditMemoForm = () => {
    setShowCreditMemoForm(false);
    setEditingCreditMemo(null);
  };

  // QuickBooks handlers - not implemented for credit memos yet

  const handleBulkSync = () => {
    // QuickBooks sync not yet implemented for credit memos
    toast({
      title: "Not Available",
      description: "QuickBooks sync for credit memos is not yet implemented",
    });
  };

  const handleDeleteCreditMemo = (
    creditMemoId: string,
    event?: React.MouseEvent,
  ) => {
    // Prevent event propagation
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (
      confirm(
        "Are you sure you want to delete this credit memo? This action cannot be undone.",
      )
    ) {
      deleteCreditMemoMutation.mutate(creditMemoId);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (creditMemoIds: string[]) => {
      const promises = creditMemoIds.map((id) =>
        apiRequest("DELETE", `/api/credit-memos/${id}`, {}),
      );
      const results = await Promise.allSettled(promises);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`Failed to delete ${failed} credit memo(s)`);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-memos"] });
      setSelectedInvoices([]);
      toast({
        title: "Success",
        description: `${selectedInvoices.length} credit memo(s) deleted successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete some credit memos",
        variant: "destructive",
      });
    },
  });

  const handleSelectCreditMemo = (creditMemoId: string) => {
    setSelectedInvoices((prev) =>
      prev.includes(creditMemoId)
        ? prev.filter((id) => id !== creditMemoId)
        : [...prev, creditMemoId],
    );
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === filteredCreditMemos.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(filteredCreditMemos.map((inv: any) => inv.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedInvoices.length === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedInvoices.length} credit memo(s)? This action cannot be undone.`;
    if (confirm(confirmMessage)) {
      bulkDeleteMutation.mutate(selectedInvoices);
    }
  };

  // Generate Excel Report Function
  const handleExportCreditMemos = async () => {
    if (!creditMemos || creditMemos.length === 0) {
      toast({
        title: "No Data",
        description: "No credit memos available to export",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Generating Report",
        description: "Please wait while we prepare your invoice report...",
      });

      // Prepare summary data
      const summaryData = creditMemos.map((creditMemo: any) => {
        const customer = customers?.find(
          (c: any) => c.id === creditMemo.customerId,
        );
        const displayStatus = getDisplayStatus(creditMemo);

        return {
          "Credit Memo Date": creditMemo.creditMemoDate
            ? formatDateWithoutTimezone(creditMemo.creditMemoDate)
            : "",
          "Credit Memo #": creditMemo.creditMemoNumber || "",
          Type: creditMemo.invoiceType === "receivable" ? "AR" : "AP",
          "Customer/Vendor": customer?.name || "Unknown",
          Subtotal: parseFloat(creditMemo.subtotal || 0).toFixed(2),
          Freight: parseFloat(creditMemo.freight || 0).toFixed(2),
          Discount: parseFloat(creditMemo.discount || 0).toFixed(2),
          "Total Amount": parseFloat(creditMemo.total || 0).toFixed(2),
          Status: displayStatus,
          "Credit Memo Post": creditMemo.quickbooksCreditMemoId
            ? "Posted"
            : "Not Posted",
          "QB Credit Memo ID": creditMemo.quickbooksCreditMemoId || "",
        };
      });

      // Fetch line items for all credit memos and prepare data
      const lineItemsData: any[] = [];

      for (const creditMemo of creditMemos) {
        try {
          // Fetch line items for this credit memo
          const lineItems = await queryClient.fetchQuery({
            queryKey: [`/api/credit-memos/${creditMemo.id}/line-items`],
          });

          // Get customer/vendor name for this credit memo
          const customer = customers?.find(
            (c: any) => c.id === creditMemo.customerId,
          );
          const customerVendorName = customer?.name || "Unknown";

          if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
            lineItems.forEach((item: any) => {
              lineItemsData.push({
                "Credit Memo Number": creditMemo.creditMemoNumber || "",
                "Customer/Vendor": customerVendorName,
                "Credit Memo Date": creditMemo.creditMemoDate
                  ? formatDateWithoutTimezone(creditMemo.creditMemoDate)
                  : "",
                "Product Name": item.description || "",
                Category: item.category || "",
                Quantity: item.quantity || 0,
                Rate: parseFloat(item.unitPrice || 0).toFixed(2),
                "Promotional Product": item.isFreeFromScheme ? "Yes" : "",
              });
            });
          }
        } catch (error) {
          console.error(
            `Failed to fetch line items for credit memo ${creditMemo.id}:`,
            error,
          );
        }
      }

      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Add summary sheet
      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(
        workbook,
        summaryWorksheet,
        "Credit Memo Summary",
      );

      // Add line items sheet if there are any
      if (lineItemsData.length > 0) {
        const lineItemsWorksheet = XLSX.utils.json_to_sheet(lineItemsData);
        XLSX.utils.book_append_sheet(
          workbook,
          lineItemsWorksheet,
          "Line Items",
        );
      }

      // Generate filename with current date
      const currentDate = new Date().toISOString().split("T")[0];
      const filename = `Credit_Memos_Report_${currentDate}.xlsx`;

      // Save file
      XLSX.writeFile(workbook, filename);

      toast({
        title: "Report Generated",
        description: `Credit memo report exported successfully as ${filename}`,
      });
    } catch (error) {
      console.error("Excel export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to generate invoice report. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1
              className="text-3xl font-bold text-foreground"
              data-testid="page-title"
            >
              Returns
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage credit memos and vendor credits
            </p>
          </div>

          <div className="flex items-center space-x-3 mt-4 lg:mt-0">
            {selectedInvoices.length > 0 && (
              <div className="flex items-center space-x-2 mr-2 px-3 py-2 bg-muted rounded-lg">
                <span className="text-sm text-muted-foreground">
                  {selectedInvoices.length} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setSelectedInvoices([])}
                  data-testid="button-clear-selection"
                  title="Clear selection"
                >
                  <X size={14} />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={
                    bulkDeleteMutation.isPending ||
                    !permissions.canDeleteInvoice
                  }
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="mr-2" size={14} />
                  Delete Selected
                </Button>
              </div>
            )}
            <Button
              variant="secondary"
              onClick={handleExportCreditMemos}
              data-testid="button-export-credit-memos"
            >
              <Download className="mr-2" size={16} />
              Export
            </Button>
            {/* QuickBooks sync not yet implemented for credit memos */}
            <Button
              onClick={() => setShowCreditMemoForm(true)}
              disabled={!permissions.canCreateInvoice}
              data-testid="button-create-credit-memo"
            >
              <Plus className="mr-2" size={16} />
              {activeTab === "AR" ? "Create Credit Memo" : "Create Vendor Credit"}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6" data-testid="invoice-filters-card">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <Input
                  placeholder="Search credit memos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-credit-memos"
                />
              </div>
            </div>

            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value={INVOICE_STATUSES.DRAFT}>Draft</SelectItem>
                  <SelectItem value={INVOICE_STATUSES.SENT}>Sent</SelectItem>
                  <SelectItem value={INVOICE_STATUSES.PAID}>Paid</SelectItem>
                  <SelectItem value={INVOICE_STATUSES.OVERDUE}>
                    Overdue
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-56">
              <Popover
                open={isDateFilterOpen}
                onOpenChange={handleDatePopoverOpenChange}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    data-testid="button-date-filter"
                  >
                    <span>{dateFilterLabel}</span>
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <div className="p-2">
                    <div className="max-h-64 overflow-y-auto">
                      {dateFilterOptions.map((option) => {
                        const isActive = dateFilterOption === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleDateFilterChange(option.value)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                              isActive && "bg-muted text-foreground",
                            )}
                          >
                            <span>{option.label}</span>
                            {isActive && <Check className="h-4 w-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as "AR" | "AP");
          setSelectedInvoices([]); // Clear selection when switching tabs
        }}
        data-testid="invoice-tabs"
      >
        <Card data-testid="invoices-list-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <FileText className="mr-2 text-primary" size={20} />
                {activeTab === "AR" ? "Credit Memos" : "Vendor Credits"} (
                {filteredCreditMemos.length})
              </CardTitle>
              <TabsList data-testid="tabs-list">
                <TabsTrigger value="AR" data-testid="tab-ar-credit-memos">
                  Credit Memos
                </TabsTrigger>
                <TabsTrigger value="AP" data-testid="tab-ap-credit-memos">
                  Vendor Credits
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-20 bg-muted/30 rounded-lg animate-pulse"
                    data-testid={`invoice-skeleton-${i}`}
                  />
                ))}
              </div>
            ) : filteredCreditMemos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="invoices-table">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-3 px-4 text-sm font-medium text-muted-foreground w-12">
                        <input
                          type="checkbox"
                          checked={
                            filteredCreditMemos.length > 0 &&
                            selectedInvoices.length ===
                              filteredCreditMemos.length
                          }
                          onChange={handleSelectAll}
                          className="w-4 h-4 cursor-pointer"
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("creditMemoDate")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Date</span>
                          {renderSortIcon("creditMemoDate")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("creditMemoNumber")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Credit Memo #</span>
                          {renderSortIcon("creditMemoNumber")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("invoiceType")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Type</span>
                          {renderSortIcon("invoiceType")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("customer")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Customer</span>
                          {renderSortIcon("customer")}
                        </button>
                      </th>

                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("amount")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Amount</span>
                          {renderSortIcon("amount")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("status")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Status</span>
                          {renderSortIcon("status")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleSort("journalEntry")}
                          className="flex items-center gap-1 text-left text-sm font-medium text-muted-foreground focus:outline-none"
                        >
                          <span>Invoice Post</span>
                          {renderSortIcon("journalEntry")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCreditMemos.map((invoice: any) => {
                      const displayStatus = getDisplayStatus(invoice);
                      const creditMemoDate =
                        invoice.creditMemoDate || invoice.invoiceDate;
                      const creditMemoNumber =
                        invoice.creditMemoNumber || invoice.invoiceNumber;

                      return (
                        <tr
                          key={invoice.id}
                          className="border-b border-border hover:bg-muted/20 transition-colors"
                          data-testid={`credit-memo-row-${invoice.id}`}
                        >
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedInvoices.includes(invoice.id)}
                              onChange={() =>
                                handleSelectCreditMemo(invoice.id)
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 cursor-pointer"
                              data-testid={`checkbox-credit-memo-${invoice.id}`}
                            />
                          </td>
                          <td
                            className="py-3 px-4 text-sm text-muted-foreground"
                            data-testid={`credit-memo-date-${invoice.id}`}
                          >
                            {creditMemoDate
                              ? formatDateWithoutTimezone(creditMemoDate)
                              : ""}
                          </td>
                          <td
                            className="py-3 px-4 text-sm font-medium text-foreground"
                            data-testid={`credit-memo-number-${invoice.id}`}
                          >
                            {creditMemoNumber}
                          </td>
                          <td
                            className="py-3 px-4"
                            data-testid={`invoice-type-${invoice.id}`}
                          >
                            <Badge
                              className={
                                invoice.invoiceType === "payable"
                                  ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100"
                                  : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                              }
                            >
                              <div className="flex items-center">
                                <div
                                  className={`w-2 h-2 rounded-full mr-2 ${
                                    invoice.invoiceType === "payable"
                                      ? "bg-orange-500"
                                      : "bg-green-500"
                                  }`}
                                ></div>
                                {invoice.invoiceType === "payable"
                                  ? "AP"
                                  : "AR"}
                              </div>
                            </Badge>
                          </td>
                          <td
                            className="py-3 px-4 text-sm text-foreground"
                            data-testid={`invoice-customer-${invoice.id}`}
                          >
                            {getCustomerName(invoice.customerId)}
                          </td>
                          <td
                            className="py-3 px-4 text-sm font-medium text-foreground"
                            data-testid={`invoice-amount-${invoice.id}`}
                          >
                            {formatCurrency(invoice.total)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col items-center">
                              <Badge
                                className={
                                  INVOICE_STATUS_COLORS[
                                    displayStatus as keyof typeof INVOICE_STATUS_COLORS
                                  ]
                                }
                                data-testid={`credit-memo-status-${invoice.id}`}
                              >
                                {displayStatus.charAt(0).toUpperCase() +
                                  displayStatus.slice(1)}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {invoice.quickbooksCreditMemoId ? (
                              <Badge
                                className="bg-accent text-accent-foreground"
                                data-testid={`quickbooks-synced-${invoice.id}`}
                              >
                                Credit Memo Posted
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                data-testid={`quickbooks-not-synced-${invoice.id}`}
                              >
                                No Credit Memo Post
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  setLocation(`/credit-memos/${invoice.id}`)
                                }
                                data-testid={`button-view-credit-memo-${invoice.id}`}
                              >
                                <Eye size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleEditCreditMemo(invoice, e);
                                }}
                                disabled={!canEditCreditMemo(invoice)}
                                data-testid={`button-edit-credit-memo-${invoice.id}`}
                              >
                                <Edit size={14} />
                              </Button>
                              {invoice.status !== "paid" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-green-600 hover:text-green-600 dark:text-green-400 dark:hover:text-green-400"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMarkAsPaid(invoice.id, e);
                                  }}
                                  disabled={
                                    markAsPaidMutation.isPending ||
                                    !permissions.canEditInvoice
                                  }
                                  data-testid={`button-mark-paid-${invoice.id}`}
                                  title="Mark as Paid"
                                >
                                  <Check size={14} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handlePostToQuickBooks(invoice.id, e);
                                }}
                                disabled={
                                  postToQuickBooksMutation.isPending ||
                                  !permissions.canPostToQuickBooks
                                }
                                data-testid={`button-post-to-quickbooks-${invoice.id}`}
                                title="Post credit memo to QuickBooks"
                              >
                                <FileDown size={14} />
                              </Button>
                              {!invoice.zohoCreditNoteId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-orange-600 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-400"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handlePostToZoho(invoice.id, e);
                                  }}
                                  disabled={
                                    postToZohoMutation.isPending ||
                                    !permissions.canPostToQuickBooks
                                  }
                                  data-testid={`button-post-to-zoho-${invoice.id}`}
                                  title="Post credit memo to Zoho Books"
                                >
                                  <Cloud size={14} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteCreditMemo(invoice.id, e);
                                }}
                                disabled={
                                  deleteCreditMemoMutation.isPending ||
                                  !permissions.canDeleteInvoice
                                }
                                data-testid={`button-delete-credit-memo-${invoice.id}`}
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
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-2 text-sm font-medium text-foreground">
                  No credit memos found
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {searchTerm || statusFilter !== "all"
                    ? "Try adjusting your search or filter criteria."
                    : "Create your first credit memo to get started."}
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setShowCreditMemoForm(true)}
                  disabled={!permissions.canCreateInvoice}
                  data-testid="button-create-first-credit-memo"
                >
                  <Plus className="mr-2" size={16} />
                  {activeTab === "AR" ? "Create Credit Memo" : "Create Vendor Credit"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* Credit Memo Form Modal */}
      {showCreditMemoForm && (
        <CreditMemoForm
          creditMemo={editingCreditMemo}
          onClose={handleCloseCreditMemoForm}
          onSuccess={handleCloseCreditMemoForm}
        />
      )}

      <Dialog
        open={isCustomDialogOpen}
        onOpenChange={handleCustomDialogOpenChange}
      >
        <DialogContent className="w-auto max-w-none p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Select date range</DialogTitle>
          </DialogHeader>
          <div className="px-6">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={pendingCustomRange}
              onSelect={(range) => setPendingCustomRange(range)}
              defaultMonth={
                pendingCustomRange?.from ?? customDateRange?.from ?? new Date()
              }
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2 px-6 pb-6">
            <Button variant="ghost" type="button" onClick={handleCustomCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCustomApply}
              disabled={!pendingCustomRange?.from || !pendingCustomRange?.to}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
