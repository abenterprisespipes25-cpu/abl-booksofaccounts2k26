// ABL v2.1 — shared types, account mappings, and module metadata
export type ModuleId = "cdb" | "purchase_book" | "sales_book" | "cash_receipts";

export interface ColumnDef {
  header: string; // fallback or single header
  header1?: string;
  header2?: string;
  field: string;
  type: "date" | "text" | "currency";
  width?: number;
  creditCol?: boolean;
}

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  tableName:
    | "cdb_entries"
    | "purchase_book_entries"
    | "sales_book_entries"
    | "cash_receipts_entries";
  glSource: "CDB" | "PB" | "SB" | "CR";
  folioPrefix: string;
  uploadHint: string;
  columns: ColumnDef[];
  sheetName: string;
}

export const FUND_MAP: Record<string, string> = {
  "CIB:BDO Admin": "BDO-ADMIN",
  "CIB:BDO Plant": "BDO-PLANT",
  "CIB:BDO ATSA": "BDO ATSA",
  "CIB:LBP": "LBP",
  "CIB:BDO Dollar Savings": "BDO-DOLLAR",
  "COH:Petty Cash Fund - ASTL Plant": "PCF-PLANT",
  "COH:Petty Cash Fund - Leonilo Acuña": "PCF-LEONILO",
  "COH:Petty Cash Fund - Michael White": "PCF-MICHAEL",
  "COH:Revolving Fund - Office": "RF-OFFICE",
  "CIB:Eastwest": "EASTWEST",
  "CIB:Eastwest Dollar Savings": "EASTWEST-DOLLAR",
  "CIB:LBP DOST": "LBP-DOST",
  "COH:Petty Cash Fund- Vanessa Anne Duce": "PCF-VANESSA",
  "COH:Petty Cash Fund - ASTL Construction": "PCF-CONST",
};

export const FUND_TO_GL_ACCOUNT: Record<string, string> = {
  "BDO-ADMIN": "CIB - BDO Admin",
  "BDO-PLANT": "CIB - BDO Plant",
  "BDO-ATSA": "CIB - BDO ATSA",
  "LBP": "CIB - LBP",
  "BDO-DOLLAR-SAV": "CIB - BDO Dollar Savings",
  "PCF-PLANT": "Petty Cash Fund - ASTL Plant",
  "PCF-LEONILO": "Petty Cash Fund - Leonilo Acuña",
  "PCF-MICHAEL": "Petty Cash Fund - Michael White",
  "RF-OFFICE": "Revolving Fund - Office",
  "EASTWEST": "CIB - Eastwest",
  "EASTWEST-DOLLAR": "CIB - Eastwest Dollar Savings",
  "LBP-DOST": "CIB - LBP DOST",
  "PCF-VANESSA": "Petty Cash Fund- Vanessa Anne Duce",
  "PCF-CONST": "Petty Cash Fund - ASTL Construction",
};


export function mapFund(raw: string): string {
  if (!raw) return "";
  if (FUND_MAP[raw]) return FUND_MAP[raw];
  return raw.replace(/^CIB:/, "").toUpperCase();
}

export function fundToGLAccount(fund: string): string {
  return FUND_TO_GL_ACCOUNT[fund] || `CIB - ${fund}`;
}

export const CDB_COLUMNS: ColumnDef[] = [
  { header: "DATE", header1: "", header2: "DATE", field: "entry_date", type: "date", width: 8 },
  { header: "PAYEE", header1: "", header2: "PAYEE", field: "payee", type: "text", width: 25 },
  { header: "PARTICULARS", header1: "", header2: "PARTICULARS", field: "particulars", type: "text", width: 30 },
  { header: "PETTY CASH VOUCHER", header1: "PETTY CASH", header2: "VOUCHER NO.", field: "petty_cash_voucher", type: "text", width: 10 },
  { header: "CHECK VOUCHER NO.", header1: "CHECK", header2: "VOUCHER NO.", field: "check_voucher_no", type: "text", width: 10 },
  { header: "CHECK NO.", header1: "", header2: "CHECK NO.", field: "check_no", type: "text", width: 10 },
  { header: "FUND", header1: "", header2: "FUND", field: "fund", type: "text", width: 10 },
  { header: "CASH AMOUNT", header1: "CASH", header2: "AMOUNT", field: "cash_amount", type: "currency", width: 12 },
  { header: "A/P TRADE", header1: "ACCOUNTS", header2: "PAYABLE-TRADE", field: "ap_trade_dr", type: "currency", width: 12 },
  { header: "VAT INPUT TAX", header1: "VAT", header2: "INPUT TAX", field: "vat_input_tax", type: "currency", width: 12 },
  { header: "DIRECT LABOR", header1: "DIRECT", header2: "LABOR / BASIC", field: "direct_labor_basic", type: "currency", width: 12 },
  { header: "OVERHEAD LABOR", header1: "OVERHEAD", header2: "LABOR / BASIC", field: "overhead_labor_basic", type: "currency", width: 12 },
  { header: "COMM LIGHT WATER PLANT", header1: "COMM., LIGHT &", header2: "WATER-PLANT", field: "comm_light_water_plant", type: "currency", width: 12 },
  { header: "COMM LIGHT WATER ADMIN", header1: "COMM., LIGHT &", header2: "WATER-ADMIN", field: "comm_light_water_admin", type: "currency", width: 12 },
  { header: "COMM LIGHT WATER SALES", header1: "COMM., LIGHT &", header2: "WATER-SALES", field: "comm_light_water_sales", type: "currency", width: 12 },
  { header: "ITW TOP 10K", header1: "ITW", header2: "TOP 10K CORP.", field: "itw_top_10k_corp", type: "currency", width: 12 },
  { header: "ITW COMPENSATION", header1: "ITW", header2: "COMPENSATION", field: "itw_compensation", type: "currency", width: 12 },
  { header: "ITW AT SOURCE", header1: "ITW", header2: "AT SOURCE", field: "itw_at_source", type: "currency", width: 12 },
  { header: "SSS PHIC HDMF PREM", header1: "SSS, PHIC & HDMF", header2: "PREM. PAYABLE", field: "sss_phic_hdmf_prem", type: "currency", width: 12 },
  { header: "SSS HDMF LOAN", header1: "SSS/HDMF", header2: "LOAN PAYABLE", field: "sss_hdmf_loan", type: "currency", width: 12 },
  { header: "OUTSIDE SERVICES", header1: "OUTSIDE SERVICES", header2: "Construction", field: "outside_services_construction", type: "currency", width: 12 },
  { header: "TRAVEL ADMIN", header1: "TRAVEL &", header2: "TRANSPORTATION ADMIN.", field: "travel_admin", type: "currency", width: 12 },
  { header: "TRAVEL SALES", header1: "TRAVEL &", header2: "TRANSPORTATION SALES", field: "travel_sales", type: "currency", width: 12 },
  { header: "TRAVEL CONST", header1: "TRAVEL &", header2: "TRANSPORTATION CONST.", field: "travel_construction", type: "currency", width: 12 },
  { header: "TRAVEL WATER", header1: "TRAVEL &", header2: "TRANSPORTATION WATER", field: "travel_water", type: "currency", width: 12 },
  { header: "SALES COMM", header1: "SALES COMM", header2: "3RD PARTY PAY", field: "sales_comm_3rd_party", type: "currency", width: 12 },
  { header: "DELIVERY EXPENSES", header1: "Delivery", header2: "Expenses", field: "delivery_expenses", type: "currency", width: 12 },
  { header: "ADVANCES OFFICERS/EMP", header1: "ADVANCES TO", header2: "OFFICERS/EMP.", field: "advances_officers_emp", type: "currency", width: 12 },
  { header: "SUNDRIES ACCT", header1: "S  U  N  D  R  I  E  S", header2: "ACCT. TITLE", field: "sundries_acct_title", type: "text", width: 36 },
  { header: "SUNDRIES DR", header1: "AMOUNT", header2: "DR", field: "sundries_dr", type: "currency", width: 12 },
  { header: "SUNDRIES CR", header1: "AMOUNT", header2: "CR.", field: "sundries_cr", type: "currency", width: 12 },
];


export const PB_COLUMNS: ColumnDef[] = [
  { header: "DATE", header1: "", header2: "DATE", field: "entry_date", type: "date", width: 8 },
  { header: "SUPPLIER", header1: "", header2: "SUPPLIER", field: "supplier", type: "text", width: 35 },
  { header: "INVOICE NO.", header1: "", header2: "INVOICE NO.", field: "invoice_no", type: "text", width: 12 },
  { header: "A/P TRADE-CR", header1: "A/P - Trade", header2: "Cr.", field: "ap_trade_cr", type: "currency", width: 12, creditCol: true },
  { header: "INPUT TAX", header1: "", header2: "INPUT TAX", field: "input_tax", type: "currency", width: 12 },
  { header: "R&M-ADMIN", header1: "Repairs & maintenance", header2: "Admin", field: "repairs_admin", type: "currency", width: 12 },
  { header: "R&M-SALES", header1: "Repairs & maintenance", header2: "Sales", field: "repairs_sales", type: "currency", width: 12 },
  { header: "R&M-PLANT", header1: "Repairs & maintenance", header2: "Plant", field: "repairs_plant", type: "currency", width: 12 },
  { header: "FUEL-ADMIN", header1: "Fuel & oil", header2: "Adm.", field: "fuel_admin", type: "currency", width: 12 },
  { header: "FUEL-PLANT", header1: "Fuel & oil", header2: "Plant", field: "fuel_plant", type: "currency", width: 12 },
  { header: "FUEL-SALES", header1: "Fuel & oil", header2: "Sales", field: "fuel_sales", type: "currency", width: 12 },
  { header: "FUEL-CONS", header1: "Fuel & oil", header2: "Construction", field: "fuel_construction", type: "currency", width: 12 },
  { header: "ITW TOP 10T", header1: "", header2: "ITW - Top 10T", field: "itw_top_10t", type: "currency", width: 12, creditCol: true },
  { header: "SUNDRIES-ACCT TITLE", header1: "S U N D R I E S", header2: "Account Title", field: "sundries_acct_title", type: "text", width: 30 },
  { header: "SUNDRIES AMOUNT", header1: "S U N D R I E S", header2: "Amount", field: "sundries_amount", type: "currency", width: 14.45 },
];

export const SB_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 80 },
  { header: "INVOICE NO.", field: "invoice_no", type: "text", width: 120 },
  { header: "NAME", field: "customer_name", type: "text", width: 240 },
  { header: "CASH", field: "cash_amount", type: "currency", width: 120 },
  { header: "A/R - TRADE", field: "ar_trade", type: "currency", width: 120 },
  { header: "C. DEPOSITS", field: "c_deposits", type: "currency", width: 100 },
  { header: "NET SALES", field: "net_sales", type: "currency", width: 130 },
  { header: "OUTPUT TAX", field: "output_tax", type: "currency", width: 120 },
  { header: "GROSS SALES", field: "gross_sales", type: "currency", width: 130 },
];

export const CR_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 80 },
  { header: "OR/PR NO.", field: "or_pr_no", type: "text", width: 140 },
  { header: "REFERENCE", field: "reference", type: "text", width: 180 },
  { header: "CUSTOMERS", field: "customers", type: "text", width: 240 },
  { header: "ACCOUNT", field: "account", type: "text", width: 180 },
  { header: "AMOUNT", field: "amount", type: "currency", width: 140 },
];

export const MODULES: Record<ModuleId, ModuleMeta> = {
  cdb: {
    id: "cdb",
    label: "Cash Disbursements Book",
    tableName: "cdb_entries",
    glSource: "CDB",
    folioPrefix: "CDB",
    uploadHint: "Upload QuickBooks CASH_DISBURSEMENTS_-_DETAIL.xlsx",
    columns: CDB_COLUMNS,
    sheetName: "Transaction List with Splits",
  },
  purchase_book: {
    id: "purchase_book",
    label: "Purchase Book",
    tableName: "purchase_book_entries",
    glSource: "PB",
    folioPrefix: "PB",
    uploadHint: "Upload QuickBooks Purchase_Book.xlsx",
    columns: PB_COLUMNS,
    sheetName: "Transaction List with Splits",
  },
  sales_book: {
    id: "sales_book",
    label: "Sales Book",
    tableName: "sales_book_entries",
    glSource: "SB",
    folioPrefix: "SB",
    uploadHint: "Upload QuickBooks SALES_BOOK.xlsx",
    columns: SB_COLUMNS,
    sheetName: "Transaction Report",
  },
  cash_receipts: {
    id: "cash_receipts",
    label: "Cash Receipts Book",
    tableName: "cash_receipts_entries",
    glSource: "CR",
    folioPrefix: "CR",
    uploadHint: "Upload QuickBooks Monthly_Detailed_Payment_Receipts.xlsx",
    columns: CR_COLUMNS,
    sheetName: "Transaction Report",
  },
};

export const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
export const MONTH_FULL = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];
