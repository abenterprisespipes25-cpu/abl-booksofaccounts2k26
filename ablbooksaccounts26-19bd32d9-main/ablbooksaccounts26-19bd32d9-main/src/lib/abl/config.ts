// ABL v2.1 — shared types, account mappings, and module metadata
export type ModuleId = "cdb" | "purchase_book" | "sales_book" | "cash_receipts";

export interface ColumnDef {
  header: string;
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
  "CIB:BDO Dollar": "BDO-DOLLAR",
  "CIB:LBP": "LBP",
  "CIB:PCF-Michael": "PCF-MICHAEL",
  "CIB:PCF-Lemuel": "PCF-LEMUEL",
  "CIB:RF-Office": "RF-OFFICE",
  "CIB:BDO": "BDO",
};

export const FUND_TO_GL_ACCOUNT: Record<string, string> = {
  "BDO-ADMIN": "CIB - BDO Admin",
  "BDO-PLANT": "CIB - BDO Plant",
  "BDO-DOLLAR": "CIB - BDO Dollar",
  LBP: "CIB - LBP",
  "PCF-MICHAEL": "Petty Cash Fund - Michael",
  "PCF-LEMUEL": "Petty Cash Fund - Lemuel",
  "RF-OFFICE": "Revolving Fund - Office",
  BDO: "CIB - BDO",
};

export function mapFund(raw: string): string {
  if (!raw) return "";
  if (FUND_MAP[raw]) return FUND_MAP[raw];
  return raw.replace(/^CIB:/, "").toUpperCase();
}

export function fundToGLAccount(fund: string): string {
  return FUND_TO_GL_ACCOUNT[fund] || `CIB - ${fund}`;
}

// Widths in pixels (approx 7px per Excel char unit). Spec: char 8/10/25/30/35.
export const CDB_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 56 },
  { header: "PAYEE", field: "payee", type: "text", width: 175 },
  { header: "PARTICULARS", field: "particulars", type: "text", width: 210 },
  { header: "VOUCHER NO.", field: "check_voucher_no", type: "text", width: 70 },
  { header: "CHECK NO.", field: "check_no", type: "text", width: 70 },
  { header: "FUND", field: "fund", type: "text", width: 70 },
  { header: "PETTY CASH", field: "petty_cash_voucher", type: "text", width: 70 },
  { header: "CASH AMOUNT", field: "cash_amount", type: "currency", width: 70 },
  { header: "ACCOUNTS PAYABLE-TRADE", field: "accounts_payable_trade", type: "currency", width: 70 },
  { header: "VAT INPUT TAX", field: "vat_input_tax", type: "currency", width: 70 },
  { header: "DIRECT LABOR / BASIC", field: "direct_labor_basic", type: "currency", width: 70 },
  { header: "OVERHEAD LABOR / BASIC", field: "overhead_labor_basic", type: "currency", width: 70 },
  { header: "COMM., LIGHT & WATER-PLANT", field: "comm_light_water_plant", type: "currency", width: 70 },
  { header: "COMM., LIGHT & WATER-ADMIN", field: "comm_light_water_admin", type: "currency", width: 70 },
  { header: "COMM., LIGHT & WATER-SALES", field: "comm_light_water_sales", type: "currency", width: 70 },
  { header: "ITW TOP 10K CORP.", field: "itw_top_10k_corp", type: "currency", width: 70, creditCol: true },
  { header: "ITW COMPENSATION", field: "itw_compensation", type: "currency", width: 70, creditCol: true },
  { header: "ITW AT SOURCE", field: "itw_at_source", type: "currency", width: 70, creditCol: true },
  { header: "SSS, PHIC & HDMF PREM.PAYABLE", field: "sss_phic_hdmf_prem", type: "currency", width: 70 },
  { header: "SSS/HDMF LOAN PAYABLE", field: "sss_hdmf_loan", type: "currency", width: 70 },
  { header: "OUTSIDE SERVICES Construction", field: "outside_services_construction", type: "currency", width: 70 },
  { header: "TRAVEL & TRANSPORTATION ADMIN.", field: "travel_admin", type: "currency", width: 70 },
  { header: "TRAVEL & TRANSPORTATION SALES", field: "travel_sales", type: "currency", width: 70 },
  { header: "TRAVEL & TRANSPORTATION CONST.", field: "travel_construction", type: "currency", width: 70 },
  { header: "TRAVEL & TRANSPORTATION WATER", field: "travel_water", type: "currency", width: 70 },
  { header: "SALES COMM 3RD PARTY PAY", field: "sales_comm_3rd_party", type: "currency", width: 70 },
  { header: "Delivery Expenses", field: "delivery_expenses", type: "currency", width: 70 },
  { header: "ADVANCES TO OFFICERS/EMP.", field: "advances_officers_emp", type: "currency", width: 70 },
  { header: "SUNDRIES ACCT. TITLE", field: "sundries_acct_title", type: "text", width: 245 },
  { header: "SUNDRIES AMOUNT DR", field: "sundries_dr", type: "currency", width: 70 },
  { header: "SUNDRIES AMOUNT CR", field: "sundries_cr", type: "currency", width: 70 },
];

export const PB_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 80 },
  { header: "SUPPLIER", field: "supplier", type: "text", width: 200 },
  { header: "INVOICE NO.", field: "invoice_no", type: "text", width: 110 },
  { header: "A/P TRADE-CR", field: "ap_trade_cr", type: "currency", width: 110, creditCol: true },
  { header: "INPUT TAX", field: "input_tax", type: "currency", width: 95 },
  { header: "R&M-ADMIN", field: "repairs_admin", type: "currency", width: 95 },
  { header: "R&M-SALES", field: "repairs_sales", type: "currency", width: 95 },
  { header: "R&M-PLANT", field: "repairs_plant", type: "currency", width: 95 },
  { header: "FUEL-ADMIN", field: "fuel_admin", type: "currency", width: 95 },
  { header: "FUEL-PLANT", field: "fuel_plant", type: "currency", width: 95 },
  { header: "FUEL-SALES", field: "fuel_sales", type: "currency", width: 95 },
  { header: "FUEL-CONS", field: "fuel_construction", type: "currency", width: 95 },
  { header: "ITW TOP 10T", field: "itw_top_10t", type: "currency", width: 95, creditCol: true },
  { header: "SUNDRIES-ACCT TITLE", field: "sundries_acct_title", type: "text", width: 180 },
  { header: "SUNDRIES AMOUNT", field: "sundries_amount", type: "currency", width: 110 },
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
