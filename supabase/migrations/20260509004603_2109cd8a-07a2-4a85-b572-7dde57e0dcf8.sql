
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date DATE NOT NULL,
  journal_no TEXT NOT NULL,
  reference_no TEXT,
  remarks TEXT,
  month_year TEXT NOT NULL,
  prepared_by TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.journal_entry_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  line_order INT NOT NULL DEFAULT 0,
  account_code TEXT,
  account_name TEXT NOT NULL,
  description TEXT,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_entries_month ON public.journal_entries(month_year);
CREATE INDEX idx_journal_entry_lines_journal ON public.journal_entry_lines(journal_id);
CREATE INDEX idx_gl_entries_source ON public.gl_entries(source_module, source_ref);

CREATE UNIQUE INDEX idx_pb_unique_invoice
  ON public.purchase_book_entries(month_year, supplier, invoice_no)
  WHERE invoice_no IS NOT NULL AND invoice_no <> '' AND supplier IS NOT NULL AND supplier <> '';

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.journal_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.journal_entry_lines FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
