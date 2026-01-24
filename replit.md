# InvoiceFlow - Invoice Management System

## Overview
InvoiceFlow is a comprehensive invoice management application designed for businesses to manage customers, products, invoices (both AR and AP), and promotional schemes. It integrates seamlessly with QuickBooks for accounting workflows through direct invoice/bill posting. The system supports detailed inventory reporting and a full CARTOON BARCODE tracking system from inventory import to packing list display. It aims to streamline invoicing, inventory, and accounting processes, providing robust data integrity and efficient operations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
Built with React 18 and TypeScript, using Wouter for routing, shadcn/ui (on Radix UI) for components, and Tailwind CSS for styling. State management is handled by TanStack Query, and forms use React Hook Form with Zod validation. Vite is used for fast development and optimized builds, maintaining a modular, component-based structure.

### Backend Architecture
A RESTful API built with Express.js and TypeScript. It uses PostgreSQL as the database with Drizzle ORM for type-safe operations. Authentication is session-based with QuickBooks OAuth integration. The server employs a modular structure with clear separation of concerns for route handlers, business logic, and data access layers.

### Database Design
The PostgreSQL database supports multi-tenant functionality with user-scoped data. Key tables include Users, Customers (with JSONB address data), Products (with categories, pricing, and `cartoonBarcode`), Product Variants (SKU-based tracking), Product Schemes, Invoices, and Invoice Line Items (detailed product references, including `cartoonBarcode`). All tables use UUID primary keys and audit timestamps.

### Authentication & Authorization
Implements OAuth 2.0 integration with QuickBooks for accessing APIs, including secure storage and automatic refresh of access tokens. User accounts are linked to specific QuickBooks company IDs, and session management uses Express sessions with PostgreSQL storage.

### Core Features and Implementations
- **Invoice Management**: Supports both AR (receivable) and AP (payable) invoice types with status tracking, detailed line items, editable discount fields (0% default), and automated total calculations (Subtotal + Freight - Discount). Invoices are displayed in sequential order sorted by invoice number. **Invoice Numbering**: AR invoices auto-populate with sequential numbers (e.g., 1189, 1190, 1191) but are editable to allow manual override, while AP invoices require manual entry for vendor invoice numbers.
- **Invoice PDF/Print**: A4-sized PDF generation with specific pagination logic (13 items per page, minimum 2 pages for summary), white backgrounds, and print-only elements for summary and footer. Displays Item Code on invoices.
- **Inventory Management**: Automatic stock quantity updates based on AR (reduces) and AP (increases) invoices.
- **CARTOON BARCODE System**: Full barcode tracking from Excel import/manual entry to invoice line items. Displays `CARTOON BARCODE` on packing lists and `Item Code` on invoices.
- **Manual Price Control**: Product prices (Base Price and Sales Price) are manually set in the inventory and are NOT automatically updated by invoices. This ensures price stability and allows complete control over pricing in the inventory management system.
- **Advanced Price Rule System**: Automatic sales price calculation based on latest purchase price + margin percentage. When adding products to Sales Orders or Sales Invoices (AR), prices are auto-calculated using:
  - **Formula**: `sales_price = latest_purchase_price × (1 + margin_percentage / 100)`
  - **Margin Priority** (first match wins, not combined):
    1. Customer + Product specific margin (`customer_product_margins` table)
    2. Customer default margin (`customers.default_margin_percent`)
    3. Product default margin (`products.margin_per_carton`)
    4. Global default margin (system settings)
  - **Latest Purchase Price**: Determined by highest purchase_date from AP invoices (bills) on or before the document date
  - **Manual Override**: Users can always manually edit the auto-populated price
  - **API Endpoints**: `/api/pricing/calculate`, `/api/pricing/calculate-batch`, `/api/pricing/global-margin`, `/api/pricing/customer-product-margins`
- **QuickBooks Integration**: 
  - **Inventory Sync**: Products sync by SKU (item code) first for accurate matching, then by name as fallback. When item code exists, products are created as Inventory items with SKU tracking in QuickBooks. Products without item codes are created as Service items. This prevents duplicates and ensures proper inventory tracking.
  - **Direct Invoice/Bill Posting**: Endpoint `/api/invoices/:id/post-to-quickbooks` posts actual QB invoices (AR) or bills (AP) with all line items, automatically syncing products by item code first. AR invoices use `SalesItemLineDetail` and AP bills use `ItemBasedExpenseLineDetail` to properly reference inventory items.
  - **Automatic Customer/Vendor Sync**: Finds existing customers/vendors by name or creates new ones as needed.
  - **Note**: Journal Entry integration has been deprecated and removed. Only direct invoice/bill posting is supported.
- **Reporting**: Excel reporting for both inventory and invoices. Invoice reports include two sheets: Invoice Summary (invoice details, totals, status, journal entry info) and Line Items (detailed product information for each invoice). **Inventory Movement Report**: Tracks all product movements showing invoice transactions by product, with negative quantities for sales (AR) and positive for purchases (AP).
- **Packing List Generation**: PDF generation displaying CARTOON BARCODE, with smart pagination (25 rows per page, category headers duplicated).
- **Promotional Schemes**: Buy X get Y free functionality with intelligent edit-mode preservation. When editing invoices, promotional free items remain exactly where they were saved. Free items are automatically removed if main product quantity falls below scheme threshold (e.g., changing from 20 to 19 items). Users can manually change or remove free items at any time.
- **Role-Based Account Management**: Restrictions on delete and inactive operations for `super_admin` and `admin` roles.

## External Dependencies

### Core Libraries
- **@neondatabase/serverless**: PostgreSQL database driver
- **drizzle-orm**: Type-safe ORM for PostgreSQL
- **@tanstack/react-query**: Server state management
- **axios**: HTTP client
- **wouter**: Lightweight React router

### UI/Styling
- **@radix-ui/***: Unstyled, accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **clsx**: Conditional className utility

### Form Handling
- **react-hook-form**: Performant forms
- **@hookform/resolvers**: Validation library integration
- **zod**: TypeScript-first schema validation

### QuickBooks Integration
- **QuickBooks OAuth API**: Authentication and authorization
- **QuickBooks Accounting API**: Data synchronization

### Development Tools
- **vite**: Build tool and development server
- **esbuild**: Fast JavaScript bundler
- **typescript**: Static type checking
- **drizzle-kit**: Database schema management
- **connect-pg-simple**: PostgreSQL session store for Express