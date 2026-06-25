import axios from "axios";

// ============================================================
// Zoho Books Service — mirrors QuickBooks service architecture
// ============================================================

export interface ZohoBooksTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  organizationId: string;
  organizationName?: string;
}

export interface ZohoContact {
  contact_name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  contact_type: "customer" | "vendor";
  billing_address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  shipping_address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export interface ZohoItem {
  name: string;
  item_type: "sales_and_purchases" | "sales" | "purchases" | "inventory";
  sku?: string;
  description?: string;
  rate?: number;
  purchase_rate?: number;
  unit?: string;
  tax_id?: string;
  initial_stock?: number;
}

export interface ZohoInvoice {
  customer_id: string;
  invoice_number?: string;
  date?: string;
  due_date?: string;
  line_items: ZohoLineItem[];
  notes?: string;
  discount?: number;
  discount_type?: "entity_level";
  adjustment?: number;
  adjustment_description?: string;
}

export interface ZohoBill {
  vendor_id: string;
  bill_number?: string;
  date?: string;
  due_date?: string;
  line_items: ZohoBillLineItem[];
  notes?: string;
}

export interface ZohoLineItem {
  item_id?: string;
  name?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  tax_id?: string;
  discount?: number;
}

export interface ZohoBillLineItem {
  item_id?: string;
  account_id?: string;
  name?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  tax_id?: string;
}

export interface ZohoCreditNote {
  customer_id: string;
  creditnote_number?: string;
  date?: string;
  line_items: ZohoLineItem[];
  notes?: string;
}

export interface ZohoVendorCredit {
  vendor_id: string;
  vendor_credit_number?: string;
  date?: string;
  line_items: ZohoBillLineItem[];
  notes?: string;
}

export class ZohoBooksService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly accountsUrl: string;
  private readonly apiBaseUrl: string;

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID || "";
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET || "";
    this.redirectUri = process.env.ZOHO_REDIRECT_URI || "";
    this.accountsUrl = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";
    this.apiBaseUrl = process.env.ZOHO_API_BASE_URL || "https://www.zohoapis.com/books/v3";
  }

  // ─── OAuth ────────────────────────────────────────────────────

  getAuthorizationUrl(state: string, redirectUri?: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: "ZohoBooks.fullaccess.all",
      redirect_uri: redirectUri || this.redirectUri,
      access_type: "offline",
      state,
    });
    return `${this.accountsUrl}/oauth/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri?: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    try {
      const response = await axios.post(
        `${this.accountsUrl}/oauth/v2/token`,
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri || this.redirectUri,
          code,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in || 3600,
      };
    } catch (error: any) {
      console.error("Zoho Books token exchange failed:", error.response?.data || error.message);
      throw new Error(error.response?.data?.error || error.message || "Failed to exchange code for tokens");
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const response = await axios.post(
        `${this.accountsUrl}/oauth/v2/token`,
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
      };
    } catch (error: any) {
      console.error("Zoho Books token refresh failed:", error.response?.data || error.message);
      throw new Error("Failed to refresh Zoho Books access token");
    }
  }

  // ─── Organizations ────────────────────────────────────────────

  async getOrganizations(accessToken: string): Promise<any[]> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/organizations`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      return response.data.organizations || [];
    } catch (error: any) {
      console.error("Zoho get organizations failed:", error.response?.data || error.message);
      throw new Error("Failed to fetch Zoho organizations");
    }
  }

  // ─── Contacts (Customers & Vendors) ──────────────────────────

  async findContactByName(
    accessToken: string,
    organizationId: string,
    name: string,
    contactType: "customer" | "vendor",
  ): Promise<any | null> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/contacts`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { organization_id: organizationId, contact_name: name, contact_type: contactType },
      });
      const contacts = response.data.contacts || [];
      return contacts.find((c: any) =>
        c.contact_name.toLowerCase() === name.toLowerCase() && c.contact_type === contactType
      ) || null;
    } catch (error: any) {
      console.error("Zoho find contact failed:", error.response?.data || error.message);
      return null;
    }
  }

  async createCustomer(
    accessToken: string,
    organizationId: string,
    contactData: ZohoContact,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/contacts`,
        { ...contactData, contact_type: "customer" },
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.contact;
    } catch (error: any) {
      console.error("Zoho create customer failed:", error.response?.data || error.message);
      throw new Error("Failed to create customer in Zoho Books");
    }
  }

  async updateCustomer(
    accessToken: string,
    organizationId: string,
    contactId: string,
    contactData: Partial<ZohoContact>,
  ): Promise<any> {
    try {
      const response = await axios.put(
        `${this.apiBaseUrl}/contacts/${contactId}`,
        contactData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.contact;
    } catch (error: any) {
      console.error("Zoho update customer failed:", error.response?.data || error.message);
      throw new Error("Failed to update customer in Zoho Books");
    }
  }

  async createVendor(
    accessToken: string,
    organizationId: string,
    contactData: ZohoContact,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/contacts`,
        { ...contactData, contact_type: "vendor" },
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.contact;
    } catch (error: any) {
      console.error("Zoho create vendor failed:", error.response?.data || error.message);
      throw new Error("Failed to create vendor in Zoho Books");
    }
  }

  async updateVendor(
    accessToken: string,
    organizationId: string,
    contactId: string,
    contactData: Partial<ZohoContact>,
  ): Promise<any> {
    return this.updateCustomer(accessToken, organizationId, contactId, contactData);
  }

  // ─── Items / Inventory ────────────────────────────────────────

  async findItemBySKU(
    accessToken: string,
    organizationId: string,
    sku: string,
  ): Promise<any | null> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/items`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { organization_id: organizationId, sku },
      });
      const items = response.data.items || [];
      return items.find((i: any) => i.sku === sku) || null;
    } catch (error: any) {
      console.error("Zoho find item by SKU failed:", error.response?.data || error.message);
      return null;
    }
  }

  async createItem(
    accessToken: string,
    organizationId: string,
    itemData: ZohoItem,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/items`,
        itemData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.item;
    } catch (error: any) {
      console.error("Zoho create item failed:", error.response?.data || error.message);
      throw new Error(`Failed to create item in Zoho Books: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateItem(
    accessToken: string,
    organizationId: string,
    itemId: string,
    itemData: Partial<ZohoItem>,
  ): Promise<any> {
    try {
      const response = await axios.put(
        `${this.apiBaseUrl}/items/${itemId}`,
        itemData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.item;
    } catch (error: any) {
      console.error("Zoho update item failed:", error.response?.data || error.message);
      throw new Error("Failed to update item in Zoho Books");
    }
  }

  // ─── Invoices (AR) ────────────────────────────────────────────

  async createInvoice(
    accessToken: string,
    organizationId: string,
    invoiceData: ZohoInvoice,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/invoices`,
        invoiceData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.invoice;
    } catch (error: any) {
      console.error("Zoho create invoice failed:", error.response?.data || error.message);
      throw new Error(`Failed to create invoice in Zoho Books: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateInvoice(
    accessToken: string,
    organizationId: string,
    invoiceId: string,
    invoiceData: Partial<ZohoInvoice>,
  ): Promise<any> {
    try {
      const response = await axios.put(
        `${this.apiBaseUrl}/invoices/${invoiceId}`,
        invoiceData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.invoice;
    } catch (error: any) {
      console.error("Zoho update invoice failed:", error.response?.data || error.message);
      throw new Error("Failed to update invoice in Zoho Books");
    }
  }

  // ─── Bills (AP) ───────────────────────────────────────────────

  async createBill(
    accessToken: string,
    organizationId: string,
    billData: ZohoBill,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/bills`,
        billData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.bill;
    } catch (error: any) {
      console.error("Zoho create bill failed:", error.response?.data || error.message);
      throw new Error(`Failed to create bill in Zoho Books: ${error.response?.data?.message || error.message}`);
    }
  }

  // ─── Credit Notes (AR Credit Memos) ──────────────────────────

  async createCreditNote(
    accessToken: string,
    organizationId: string,
    creditNoteData: ZohoCreditNote,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/creditnotes`,
        creditNoteData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.creditnote;
    } catch (error: any) {
      console.error("Zoho create credit note failed:", error.response?.data || error.message);
      throw new Error(`Failed to create credit note in Zoho Books: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateCreditNote(
    accessToken: string,
    organizationId: string,
    creditNoteId: string,
    creditNoteData: Partial<ZohoCreditNote>,
  ): Promise<any> {
    try {
      const response = await axios.put(
        `${this.apiBaseUrl}/creditnotes/${creditNoteId}`,
        creditNoteData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.creditnote;
    } catch (error: any) {
      console.error("Zoho update credit note failed:", error.response?.data || error.message);
      throw new Error("Failed to update credit note in Zoho Books");
    }
  }

  // ─── Vendor Credits (AP Credit Memos) ────────────────────────

  async createVendorCredit(
    accessToken: string,
    organizationId: string,
    vendorCreditData: ZohoVendorCredit,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/vendorcredits`,
        vendorCreditData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.vendor_credit;
    } catch (error: any) {
      console.error("Zoho create vendor credit failed:", error.response?.data || error.message);
      throw new Error(`Failed to create vendor credit in Zoho Books: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateVendorCredit(
    accessToken: string,
    organizationId: string,
    vendorCreditId: string,
    vendorCreditData: Partial<ZohoVendorCredit>,
  ): Promise<any> {
    try {
      const response = await axios.put(
        `${this.apiBaseUrl}/vendorcredits/${vendorCreditId}`,
        vendorCreditData,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
          params: { organization_id: organizationId },
        },
      );
      return response.data.vendor_credit;
    } catch (error: any) {
      console.error("Zoho update vendor credit failed:", error.response?.data || error.message);
      throw new Error("Failed to update vendor credit in Zoho Books");
    }
  }

  // ─── Taxes ────────────────────────────────────────────────────

  async getTaxes(accessToken: string, organizationId: string): Promise<any[]> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/settings/taxes`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { organization_id: organizationId },
      });
      return response.data.taxes || [];
    } catch (error: any) {
      console.error("Zoho get taxes failed:", error.response?.data || error.message);
      return [];
    }
  }
}

export const zohoBooksService = new ZohoBooksService();
