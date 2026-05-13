export interface ColumnDef {
  header: string;
  header1?: string; // Top row for grouped headers
  header2?: string; // Bottom row
  field: string;
  type: "text" | "currency" | "date" | "formula";
  width?: number;
}

export const CDB_COLUMNS: ColumnDef[] = [
  { header: "DATE", header1: "DATE", header2: "[MONTH YEAR]", field: "entry_date", type: "date", width: 8 },
  { header: "PAYEE", header1: "", header2: "PAYEE", field: "payee", type: "text", width: 25 },
  { header: "PARTICULARS", header1: "", header2: "PARTICULARS", field: "particulars", type: "text", width: 30 },
  { header: "PETTY CASH VOUCHER NO.", header1: "PETTY CASH", header2: "VOUCHER NO.", field: "petty_cash_vno", type: "text", width: 10 },
  { header: "CHECK VOUCHER NO.", header1: "CHECK", header2: "VOUCHER NO.", field: "check_vno", type: "text", width: 10 },
  { header: "CHECK NO.", header1: "", header2: "CHECK NO.", field: "check_no", type: "text", width: 10 },
  { header: "FUND", header1: "", header2: "FUND", field: "fund_label", type: "text", width: 12 },
  { header: "CASH AMOUNT", header1: "CASH", header2: "AMOUNT", field: "cash_amount", type: "formula", width: 12 },
  
  // Distribution Columns
  { header: "ACCOUNTS PAYABLE-TRADE", header1: "ACCOUNTS", header2: "PAYABLE-TRADE", field: "accounts_payable", type: "currency", width: 12 },
  { header: "VAT INPUT TAX", header1: "VAT", header2: "INPUT TAX", field: "vat_input_tax", type: "currency", width: 12 },
  { header: "DIRECT LABOR / BASIC", header1: "DIRECT", header2: "LABOR / BASIC", field: "direct_labor", type: "currency", width: 12 },
  { header: "OVERHEAD LABOR / BASIC", header1: "OVERHEAD", header2: "LABOR / BASIC", field: "overhead_labor", type: "currency", width: 12 },
  { header: "COMM. LIGHT & WATER-PLANT", header1: "COMM., LIGHT &", header2: "WATER-PLANT", field: "clw_plant", type: "currency", width: 12 },
  { header: "COMM. LIGHT & WATER-ADMIN", header1: "COMM., LIGHT &", header2: "WATER-ADMIN", field: "clw_admin", type: "currency", width: 12 },
  { header: "COMM. LIGHT & WATER-SALES", header1: "COMM., LIGHT &", header2: "WATER-SALES", field: "clw_sales", type: "currency", width: 12 },
  { header: "ITW TOP 10K CORP.", header1: "ITW", header2: "TOP 10K CORP.", field: "itw_top10k", type: "currency", width: 12 },
  { header: "ITW COMPENSATION", header1: "ITW", header2: "COMPENSATION", field: "itw_compensation", type: "currency", width: 12 },
  { header: "ITW AT SOURCE", header1: "ITW", header2: "AT SOURCE", field: "itw_at_source", type: "currency", width: 12 },
  { header: "SSS, PHIC & HDMF PREM.", header1: "SSS, PHIC & HDMF", header2: "PREM. PAYABLE", field: "sss_prem", type: "currency", width: 12 },
  { header: "SSS/HDMF LOAN PAYABLE", header1: "SSS/HDMF", header2: "LOAN PAYABLE", field: "sss_loan", type: "currency", width: 12 },
  { header: "OUTSIDE SERVICES Construction", header1: "OUTSIDE SERVICES", header2: "Construction", field: "outside_services", type: "currency", width: 12 },
  { header: "TRAVEL & TRANS ADMIN.", header1: "TRAVEL & TRANSPORTATION", header2: "ADMIN.", field: "travel_admin", type: "currency", width: 12 },
  { header: "TRAVEL & TRANS SALES", header1: "", header2: "SALES", field: "travel_sales", type: "currency", width: 12 },
  { header: "TRAVEL & TRANS CONSTRUCTION", header1: "TRAVEL & TRANSPORTATION", header2: "CONSTRUCTION", field: "travel_const", type: "currency", width: 12 },
  { header: "TRAVEL & TRANS WATER", header1: "", header2: "WATER", field: "travel_water", type: "currency", width: 12 },
  { header: "SALES COMM 3RD PARTY", header1: "SALES COMM", header2: "3RD PARTY PAY", field: "sales_comm", type: "currency", width: 12 },
  { header: "DELIVERY EXPENSES", header1: "Delivery", header2: "Expenses", field: "delivery_exp", type: "currency", width: 12 },
  { header: "ADVANCES TO OFFICERS/EMP.", header1: "ADVANCES TO", header2: "OFFICERS/EMP.", field: "advances", type: "currency", width: 12 },
  
  // Sundries
  { header: "SUNDRIES ACCT TITLE", header1: "S  U  N  D  R  I  E  S", header2: "ACCT. TITLE", field: "sundries_title", type: "text", width: 35 },
  { header: "SUNDRIES AMOUNT DR", header1: "A M O U N T", header2: "DR", field: "sundries_dr", type: "currency", width: 12 },
  { header: "SUNDRIES AMOUNT CR", header1: "", header2: "CR.", field: "sundries_cr", type: "currency", width: 12 },
];

export const CDB_DISTRIBUTION_FIELDS = [
  "accounts_payable", "vat_input_tax", "direct_labor", "overhead_labor",
  "clw_plant", "clw_admin", "clw_sales", "itw_top10k", "itw_compensation",
  "itw_at_source", "sss_prem", "sss_loan", "outside_services",
  "travel_admin", "travel_sales", "travel_const", "travel_water",
  "sales_comm", "delivery_exp", "advances", "sundries_dr", "sundries_cr"
];

export const FUND_LABEL_MAP: Record<string, string> = {
  "CIB:BDO Admin":                          "BDO-ADMIN",
  "CIB:BDO Plant":                          "BDO-PLANT",
  "CIB:BDO ATSA":                           "BDO-ATSA",
  "CIB:BDO Dollar Savings":                 "BDO-DOLLAR",
  "CIB:Eastwest":                           "EASTWEST",
  "CIB:Eastwest Dollar Savings":            "EW-DOLLAR",
  "CIB:LBP":                                "LBP",
  "CIB:LBP DOST":                           "LBP-DOST",
  "COH:Petty Cash Fund - ASTL Plant":       "PCF-PLANT",
  "COH:Petty Cash Fund - ASTL Construction":"PCF-CONST",
  "COH:Petty Cash Fund - Leonilo Acuña":    "PCF-ACUÑA",
  "COH:Petty Cash Fund - Michael White":    "PCF-WHITE",
  "COH:Petty Cash Fund - Vanessa Anne Duce":"PCF-DUCE",
  "COH:Revolving Fund - Office":            "REV-OFFICE"
};

export const mapFund = (raw: string) => FUND_LABEL_MAP[raw] || raw;

export const PB_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 10 },
  { header: "SUPPLIER", field: "supplier", type: "text", width: 25 },
  { header: "INVOICE NO.", field: "invoice_no", type: "text", width: 12 },
  { header: "A/P TRADE-CR", field: "ap_trade_cr", type: "currency", width: 12 },
  { header: "INPUT VAT", field: "input_tax", type: "currency", width: 10 },
  { header: "REPAIRS-ADMIN", field: "repairs_admin", type: "currency", width: 12 },
  { header: "REPAIRS-SALES", field: "repairs_sales", type: "currency", width: 12 },
  { header: "REPAIRS-PLANT", field: "repairs_plant", type: "currency", width: 12 },
  { header: "FUEL-ADMIN", field: "fuel_admin", type: "currency", width: 12 },
  { header: "FUEL-PLANT", field: "fuel_plant", type: "currency", width: 12 },
  { header: "FUEL-SALES", field: "fuel_sales", type: "currency", width: 12 },
  { header: "FUEL-CONST.", field: "fuel_construction", type: "currency", width: 12 },
  { header: "ITW TOP 10T", field: "itw_top_10t", type: "currency", width: 12 },
  { header: "SUNDRIES TITLE", field: "sundries_acct_title", type: "text", width: 20 },
  { header: "SUNDRIES AMT", field: "sundries_amount", type: "currency", width: 12 },
];

export const SB_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 10 },
  { header: "INVOICE NO.", field: "invoice_no", type: "text", width: 12 },
  { header: "CUSTOMER", field: "customer_name", type: "text", width: 25 },
  { header: "TRANS TYPE", field: "transaction_type", type: "text", width: 15 },
  { header: "CASH", field: "cash_amount", type: "currency", width: 12 },
  { header: "A/R TRADE", field: "ar_trade", type: "currency", width: 12 },
  { header: "C. DEPOSITS", field: "c_deposits", type: "currency", width: 12 },
  { header: "NET SALES", field: "net_sales", type: "currency", width: 12 },
  { header: "OUTPUT VAT", field: "output_tax", type: "currency", width: 12 },
  { header: "GROSS SALES", field: "gross_sales", type: "currency", width: 12 },
];

export const CRB_COLUMNS: ColumnDef[] = [
  { header: "DATE", field: "entry_date", type: "date", width: 10 },
  { header: "OR NO.", field: "or_no", type: "text", width: 12 },
  { header: "NAME", field: "payee", type: "text", width: 25 },
  { header: "FUND", field: "fund_label", type: "text", width: 12 },
  { header: "CASH AMOUNT", field: "cash_amount", type: "currency", width: 12 },
  { header: "A/R TRADE", field: "ar_trade", type: "currency", width: 12 },
  { header: "SALES", field: "sales", type: "currency", width: 12 },
  { header: "OUTPUT TAX", field: "output_tax", type: "currency", width: 12 },
  { header: "SUNDRIES TITLE", field: "sundries_acct_title", type: "text", width: 20 },
  { header: "SUNDRIES DR", field: "sundries_dr", type: "currency", width: 12 },
  { header: "SUNDRIES CR", field: "sundries_cr", type: "currency", width: 12 },
];

export type ModuleId = "cdb" | "purchase_book" | "sales_book" | "cash_receipts";

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  tableName: string;
  glSource: string;
  columns: ColumnDef[];
  uploadHint: string;
}

export const MODULES: Record<ModuleId, ModuleMeta> = {
  cdb: {
    id: "cdb",
    label: "Cash Disbursements Book",
    tableName: "cdb_entries",
    glSource: "Cash Disbursements Book",
    columns: CDB_COLUMNS,
    uploadHint: "Upload 'Cash Disbursements - Detail' Excel file",
  },
  purchase_book: {
    id: "purchase_book",
    label: "Purchase Book",
    tableName: "purchase_book_entries",
    glSource: "Purchase Book",
    columns: PB_COLUMNS,
    uploadHint: "Upload 'Purchase Book - Detail' Excel file",
  },
  sales_book: {
    id: "sales_book",
    label: "Sales Book",
    tableName: "sales_book_entries",
    glSource: "Sales Book",
    columns: SB_COLUMNS,
    uploadHint: "Upload 'Sales Book - Detail' Excel file",
  },
  cash_receipts: {
    id: "cash_receipts",
    label: "Cash Receipts Book",
    tableName: "cash_receipts_entries",
    glSource: "Cash Receipts Book",
    columns: CRB_COLUMNS,
    uploadHint: "Upload 'Cash Receipts - Detail' Excel file",
  },
};

