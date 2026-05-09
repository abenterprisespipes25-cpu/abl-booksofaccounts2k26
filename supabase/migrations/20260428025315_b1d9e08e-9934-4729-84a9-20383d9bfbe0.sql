
CREATE TABLE IF NOT EXISTS public.uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  month_year TEXT NOT NULL,
  file_name TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cdb_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  entry_date DATE NOT NULL,
  payee TEXT,
  petty_cash_voucher TEXT,
  check_voucher_no TEXT,
  check_no TEXT,
  fund TEXT,
  cash_amount NUMERIC(15,2) DEFAULT 0,
  accounts_payable_trade NUMERIC(15,2) DEFAULT 0,
  vat_input_tax NUMERIC(15,2) DEFAULT 0,
  direct_labor_basic NUMERIC(15,2) DEFAULT 0,
  overhead_labor_basic NUMERIC(15,2) DEFAULT 0,
  comm_light_water_plant NUMERIC(15,2) DEFAULT 0,
  comm_light_water_admin NUMERIC(15,2) DEFAULT 0,
  comm_light_water_sales NUMERIC(15,2) DEFAULT 0,
  itw_top_10k_corp NUMERIC(15,2) DEFAULT 0,
  itw_compensation NUMERIC(15,2) DEFAULT 0,
  itw_at_source NUMERIC(15,2) DEFAULT 0,
  sss_phic_hdmf_prem NUMERIC(15,2) DEFAULT 0,
  sss_hdmf_loan NUMERIC(15,2) DEFAULT 0,
  outside_services_construction NUMERIC(15,2) DEFAULT 0,
  travel_admin NUMERIC(15,2) DEFAULT 0,
  travel_sales NUMERIC(15,2) DEFAULT 0,
  travel_construction NUMERIC(15,2) DEFAULT 0,
  travel_water NUMERIC(15,2) DEFAULT 0,
  sales_comm_3rd_party NUMERIC(15,2) DEFAULT 0,
  delivery_expenses NUMERIC(15,2) DEFAULT 0,
  advances_officers_emp NUMERIC(15,2) DEFAULT 0,
  sundries_acct_title TEXT,
  sundries_dr NUMERIC(15,2) DEFAULT 0,
  sundries_cr NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  entry_date DATE NOT NULL,
  supplier TEXT,
  invoice_no TEXT,
  ap_trade_cr NUMERIC(15,2) DEFAULT 0,
  input_tax NUMERIC(15,2) DEFAULT 0,
  repairs_admin NUMERIC(15,2) DEFAULT 0,
  repairs_sales NUMERIC(15,2) DEFAULT 0,
  repairs_plant NUMERIC(15,2) DEFAULT 0,
  fuel_admin NUMERIC(15,2) DEFAULT 0,
  fuel_plant NUMERIC(15,2) DEFAULT 0,
  fuel_sales NUMERIC(15,2) DEFAULT 0,
  fuel_construction NUMERIC(15,2) DEFAULT 0,
  itw_top_10t NUMERIC(15,2) DEFAULT 0,
  sundries_acct_title TEXT,
  sundries_amount NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  entry_date DATE NOT NULL,
  invoice_no TEXT,
  customer_name TEXT,
  cash_amount NUMERIC(15,2) DEFAULT 0,
  ar_trade NUMERIC(15,2) DEFAULT 0,
  c_deposits NUMERIC(15,2) DEFAULT 0,
  net_sales NUMERIC(15,2) DEFAULT 0,
  output_tax NUMERIC(15,2) DEFAULT 0,
  gross_sales NUMERIC(15,2) DEFAULT 0,
  transaction_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_receipts_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  entry_date DATE NOT NULL,
  or_pr_no TEXT,
  reference TEXT,
  customers TEXT,
  account TEXT,
  amount NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  entry_date DATE NOT NULL,
  account_code TEXT,
  account_name TEXT NOT NULL,
  particulars TEXT,
  folio TEXT,
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  source_module TEXT NOT NULL,
  source_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gl_account ON public.gl_entries(account_name);
CREATE INDEX IF NOT EXISTS idx_gl_month ON public.gl_entries(month_year);
CREATE INDEX IF NOT EXISTS idx_cdb_month ON public.cdb_entries(month_year);
CREATE INDEX IF NOT EXISTS idx_pb_month ON public.purchase_book_entries(month_year);
CREATE INDEX IF NOT EXISTS idx_sb_month ON public.sales_book_entries(month_year);
CREATE INDEX IF NOT EXISTS idx_cr_month ON public.cash_receipts_entries(month_year);

-- Enable RLS with fully permissive policies (single-tenant internal tool, no auth)
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdb_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_book_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_book_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_receipts_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.uploaded_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.cdb_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.purchase_book_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.sales_book_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.cash_receipts_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.gl_entries FOR ALL USING (true) WITH CHECK (true);
