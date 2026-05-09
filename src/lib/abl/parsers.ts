// ABL v2.1 — Excel parsing for all 4 source files
import * as XLSX from "xlsx";
import { mapFund, fundToGLAccount } from "./config";
import { dateToMonthYear, round2, folioFor } from "./format";

export interface ParsedResult<T> {
  rows: T[];
  glEntries: GLRow[];
  monthYear: string;
}

export interface GLRow {
  month_year: string;
  entry_date: string; // YYYY-MM-DD
  account_name: string;
  particulars: string;
  folio: string;
  debit: number;
  credit: number;
  source_module: string;
  source_ref?: string;
}

function balanceWithSuspense(
  entries: GLRow[],
  monthYear: string,
  source_module: string,
  folio: string,
): GLRow[] {
  const totalDr = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCr = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const diff = round2(totalDr - totalCr);
  if (Math.abs(diff) < 0.01) return entries;
  const lastDate = entries.reduce((d, e) => (e.entry_date > d ? e.entry_date : d), entries[0]?.entry_date ?? `${monthYear}-01`);
  const suspense: GLRow = {
    month_year: monthYear,
    entry_date: lastDate,
    account_name: "Suspense Account",
    particulars: "AUTO_DIFFERENCE_ENTRY",
    folio,
    debit: diff < 0 ? Math.abs(diff) : 0,
    credit: diff > 0 ? diff : 0,
    source_module,
    source_ref: "AUTO_DIFFERENCE_ENTRY",
  };
  return [...entries, suspense];
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const first = String(rows[i]?.[0] ?? "").trim().toLowerCase();
    if (first === "date" || first.startsWith("date")) return i;
  }
  return -1;
}

function findColIdx(headerRow: any[], labels: string[], fallback: number): number {
  if (!headerRow) return fallback;
  for (let i = 0; i < headerRow.length; i++) {
    const v = String(headerRow[i] ?? "").trim().toLowerCase();
    if (!v) continue;
    if (labels.some((l) => v === l.toLowerCase())) return i;
  }
  return fallback;
}

function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, mm, dd, yy] = m;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return toISODate(d);
  return null;
}

function naturalSort(a: string, b: string): number {
  const segmentize = (s: string) =>
    String(s ?? "").replace(/[^\w]/g, " ").trim().split(/(\d+)/).filter(Boolean).map((seg) => (/^\d+$/.test(seg) ? parseInt(seg, 10) : seg.toLowerCase()));
  const sa = segmentize(a), sb = segmentize(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const x = sa[i] ?? "", y = sb[i] ?? "";
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function sortWithSubRows<T extends Record<string, any>>(rows: T[], keyField: string): T[] {
  const groups: T[][] = [];
  let cur: T[] = [];
  for (const r of rows) {
    const isSub = (r as any)._sundry_parent_ref || (!String(r[keyField] ?? "").trim() && String(r["sundries_acct_title"] ?? "").trim() !== "");
    if (!isSub) { if (cur.length) groups.push(cur); cur = [r]; } else { cur.push(r); }
  }
  if (cur.length) groups.push(cur);
  groups.sort((g1, g2) => {
    const a = g1[0], b = g2[0];
    const d = String(a.entry_date ?? "").localeCompare(String(b.entry_date ?? ""));
    if (d !== 0) return d;
    return naturalSort(String(a[keyField] ?? ""), String(b[keyField] ?? ""));
  });
  return groups.flat();
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function monthYearFromISO(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return dateToMonthYear(d);
}

// ---------- CDB ----------
const CDB_EXACT_ACCOUNTS: Record<string, string> = {
  "Accounts Payable": "accounts_payable_trade",
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Basic": "direct_labor_basic",
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Basic": "overhead_labor_basic",
  "Cost of Manufacturing:Overhead:OH-Communication, Light & Water": "comm_light_water_plant",
  "General and Administrative Expenses:G&A-Communication, Light & Water": "comm_light_water_admin",
  "Selling Expenses:Selling-Communication, Light & Water": "comm_light_water_sales",
  "Withholding Tax Payable - Expanded - Top Corp.": "itw_top_10k_corp",
  "Withholding Tax Payable - Compensation": "itw_compensation",
  "Withholding Tax Payable - Expanded - at Source": "itw_at_source",
  "SSS, PHIC and HDMF Premiums Payable": "sss_phic_hdmf_prem",
  "SSS and HDMF Loans Payable": "sss_hdmf_loan",
  "Selling Expenses:Selling-Outside Services": "outside_services_construction",
  "General and Administrative Expenses:G&A-Travel and Transportation": "travel_admin",
  "Selling Expenses:Selling-Travel and Transportation": "travel_sales",
  "Cost of Construction:Cons-Travel and Transportation": "travel_construction",
  "Selling Expenses:Selling-Commissions": "sales_comm_3rd_party",
  "Selling Expenses:Selling-Delivery Expense": "delivery_expenses",
};
const CREDIT_FIELDS_CDB = new Set(["itw_top_10k_corp", "itw_compensation", "itw_at_source"]);
const CDB_FIELD_TO_GL: Array<{ field: string; account: string; side: "dr" | "cr" }> = [
  { field: "accounts_payable_trade", account: "Accounts Payable", side: "dr" },
  { field: "vat_input_tax", account: "Input VAT", side: "dr" },
  { field: "direct_labor_basic", account: "Direct Labor - Basic", side: "dr" },
  { field: "overhead_labor_basic", account: "Overhead Labor - Basic", side: "dr" },
  { field: "comm_light_water_plant", account: "OH - Communication, Light & Water", side: "dr" },
  { field: "comm_light_water_admin", account: "G&A - Communication, Light & Water", side: "dr" },
  { field: "comm_light_water_sales", account: "Selling - Communication, Light & Water", side: "dr" },
  { field: "itw_top_10k_corp", account: "Withholding Tax Payable - Top Corp.", side: "cr" },
  { field: "itw_compensation", account: "Withholding Tax Payable - Compensation", side: "cr" },
  { field: "itw_at_source", account: "Withholding Tax Payable - at Source", side: "cr" },
  { field: "sss_phic_hdmf_prem", account: "SSS, PHIC & HDMF Premiums Payable", side: "dr" },
  { field: "sss_hdmf_loan", account: "SSS & HDMF Loans Payable", side: "dr" },
  { field: "outside_services_construction", account: "Outside Services - Construction", side: "dr" },
  { field: "travel_admin", account: "G&A - Travel and Transportation", side: "dr" },
  { field: "travel_sales", account: "Selling - Travel and Transportation", side: "dr" },
  { field: "travel_construction", account: "Construction - Travel and Transportation", side: "dr" },
  { field: "travel_water", account: "Water - Travel and Transportation", side: "dr" },
  { field: "sales_comm_3rd_party", account: "Selling - Commissions", side: "dr" },
  { field: "delivery_expenses", account: "Selling - Delivery Expense", side: "dr" },
  { field: "advances_officers_emp", account: "Advances to Employees", side: "dr" },
];

export function parseCDB(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  let allParsed: any[] = [];
  const glByMonth = new Map<string, Map<string, GLRow>>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;
    const headerRow = rows[h] || [];
    const data = rows.slice(h + 1);

    const COL_ACCT = findColIdx(headerRow, ["Account"], 5);
    const COL_DR = findColIdx(headerRow, ["Debit"], 6);
    const COL_CR = findColIdx(headerRow, ["Credit"], 7);
    const COL_NAME = findColIdx(headerRow, ["Name"], 3);
    const COL_NO = findColIdx(headerRow, ["Num", "No.", "No", "Number"], 2);
    const COL_MEMO = findColIdx(headerRow, ["Memo", "Memo/Description"], 4);

    let current: { header: any[]; splits: any[][] } | null = null;
    const flush = () => {
      if (!current) return;
      const hdr = current.header;
      const iso = toISODate(hdr[0]);
      if (!iso) { current = null; return; }
      const memo = String(hdr[COL_MEMO] ?? "");
      const cvMatch = memo.match(/CV\s*(\d+)/i);
      const pcfMatch = memo.match(/PCF\s*(\S+)/i);
      const fundRaw = String(hdr[COL_ACCT] ?? hdr[5] ?? "");
      const fund = mapFund(fundRaw);
      const my = monthYearFromISO(iso);

      const entry: any = {
        entry_date: iso, payee: String(hdr[COL_NAME] ?? ""), particulars: memo,
        petty_cash_voucher: pcfMatch ? pcfMatch[1] : "", check_voucher_no: cvMatch ? `CV ${cvMatch[1]}` : "",
        check_no: String(hdr[COL_NO] ?? ""), fund, cash_amount: 0, month_year: my,
      };
      for (const f of CDB_FIELD_TO_GL) entry[f.field] = 0;
      entry["vat_input_tax"] = 0;
      const sundryLines: Array<{ title: string; dr: number; cr: number }> = [];

      let totalCredits = num(hdr[COL_CR]);
      const isFundAccount = (acct: string) => {
        const a = acct.trim();
        return /^CIB[:\s]/i.test(a) || /petty\s*cash/i.test(a) || /revolving\s*fund/i.test(a);
      };

      for (const sp of current.splits) {
        const acct = String(sp[COL_ACCT] ?? "").trim();
        const dr = num(sp[COL_DR]); const cr = num(sp[COL_CR]);
        totalCredits += cr;
        if (isFundAccount(acct) || !acct) continue;
        if (acct.toLowerCase().includes("input vat")) { entry.vat_input_tax = round2(entry.vat_input_tax + dr); continue; }
        if (acct.startsWith("Advances to Employees")) { entry.advances_officers_emp = round2(entry.advances_officers_emp + dr); continue; }
        if (acct.toLowerCase().includes("water") && acct.toLowerCase().includes("travel")) { entry.travel_water = round2(entry.travel_water + dr); continue; }
        const field = CDB_EXACT_ACCOUNTS[acct];
        if (field) { const amt = CREDIT_FIELDS_CDB.has(field) ? cr : dr; entry[field] = round2((entry[field] || 0) + amt); continue; }
        sundryLines.push({ title: acct, dr: round2(dr), cr: round2(cr) });
      }
      entry.sundries_acct_title = ""; entry.sundries_dr = 0; entry.sundries_cr = 0;
      for (const f of CDB_FIELD_TO_GL) if (f.side === "cr" && entry[f.field] > 0) entry[f.field] = round2(-entry[f.field]);
      entry.cash_amount = round2(totalCredits || 0);
      allParsed.push(entry);

      for (const s of sundryLines) {
        allParsed.push({
          entry_date: entry.entry_date, payee: entry.payee, particulars: "", petty_cash_voucher: entry.petty_cash_voucher,
          check_voucher_no: entry.check_voucher_no, check_no: "", fund: "", cash_amount: 0, month_year: my,
          accounts_payable_trade: 0, vat_input_tax: 0, direct_labor_basic: 0, overhead_labor_basic: 0,
          comm_light_water_plant: 0, comm_light_water_admin: 0, comm_light_water_sales: 0, itw_top_10k_corp: 0,
          itw_compensation: 0, itw_at_source: 0, sss_phic_hdmf_prem: 0, sss_hdmf_loan: 0, outside_services_construction: 0,
          travel_admin: 0, travel_sales: 0, travel_construction: 0, travel_water: 0, sales_comm_3rd_party: 0,
          delivery_expenses: 0, advances_officers_emp: 0, sundries_acct_title: s.title, sundries_dr: s.dr, sundries_cr: s.cr,
        });
      }
      current = null;
    };

    for (const r of data) {
      const hasDate = !!toISODate(r[0]);
      const hasNo = String(r[COL_NO] ?? "").trim() !== "";
      const hasName = String(r[COL_NAME] ?? "").trim() !== "";
      if (hasDate && hasNo && hasName) { flush(); current = { header: r, splits: [] }; }
      else if (current && (String(r[COL_ACCT] ?? "").trim() || num(r[COL_DR]) || num(r[COL_CR]))) { current.splits.push(r); }
    }
    flush();
  }

  const addGL = (my: string, date: string, account: string, debit: number, credit: number, particulars: string) => {
    if (!account || (debit === 0 && credit === 0)) return;
    const key = `${date}|${account}|${particulars}`;
    let bucket = glByMonth.get(my);
    if (!bucket) { bucket = new Map(); glByMonth.set(my, bucket); }
    const cur = bucket.get(key);
    if (cur) { cur.debit = round2(cur.debit + debit); cur.credit = round2(cur.credit + credit); }
    else { bucket.set(key, { month_year: my, entry_date: date, account_name: account, particulars, folio: folioFor("CDB", my), debit, credit, source_module: "CDB" }); }
  };

  for (const e of allParsed) {
    const my = e.month_year;
    addGL(my, e.entry_date, fundToGLAccount(e.fund), 0, Math.abs(e.cash_amount), e.payee);
    for (const f of CDB_FIELD_TO_GL) {
      const amt = e[f.field] || 0; if (amt === 0) continue;
      const abs = Math.abs(amt);
      if (f.side === "dr") addGL(my, e.entry_date, f.account, abs, 0, e.payee);
      else addGL(my, e.entry_date, f.account, 0, abs, e.payee);
    }
    if (e.vat_input_tax > 0) addGL(my, e.entry_date, "Input VAT", e.vat_input_tax, 0, e.payee);
    if (e.sundries_acct_title) addGL(my, e.entry_date, e.sundries_acct_title, e.sundries_dr, e.sundries_cr, e.payee);
  }

  const glEntries: GLRow[] = [];
  for (const [my, bucket] of glByMonth) glEntries.push(...balanceWithSuspense([...bucket.values()], my, "CDB", folioFor("CDB", my)));
  return { rows: allParsed, glEntries, monthYear: allParsed[0]?.month_year || "" };
}

// ---------- Purchase Book ----------
const PB_EXACT: Record<string, string> = {
  "Accounts Payable": "ap_trade_cr",
  "General and Administrative Expenses:G&A-Repairs and Maintenance": "repairs_admin",
  "Selling Expenses:Selling-Repairs and Maintenance": "repairs_sales",
  "Cost of Manufacturing:Overhead:OH-Repairs and Maintenance": "repairs_plant",
  "General and Administrative Expenses:G&A-Fuel, Oil and Lubricants": "fuel_admin",
  "Cost of Manufacturing:Overhead:OH-Fuel, Oil and Lubricants": "fuel_plant",
  "Selling Expenses:Selling-Fuel, Oil and Lubricants": "fuel_sales",
  "Withholding Tax Payable - Expanded - Top Corp.": "itw_top_10t",
};
const PB_FIELD_TO_GL: Array<{ field: string; account: string; side: "dr" | "cr" }> = [
  { field: "ap_trade_cr", account: "Accounts Payable", side: "cr" },
  { field: "input_tax", account: "Input VAT", side: "dr" },
  { field: "repairs_admin", account: "G&A - Repairs and Maintenance", side: "dr" },
  { field: "repairs_sales", account: "Selling - Repairs and Maintenance", side: "dr" },
  { field: "repairs_plant", account: "OH - Repairs and Maintenance", side: "dr" },
  { field: "fuel_admin", account: "G&A - Fuel, Oil and Lubricants", side: "dr" },
  { field: "fuel_plant", account: "OH - Fuel, Oil and Lubricants", side: "dr" },
  { field: "fuel_sales", account: "Selling - Fuel, Oil and Lubricants", side: "dr" },
  { field: "fuel_construction", account: "Cons - Fuel, Oil and Lubricants", side: "dr" },
  { field: "itw_top_10t", account: "Withholding Tax Payable - Top Corp.", side: "cr" },
];

export function parsePurchaseBook(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  let allParsed: any[] = [];
  const glByMonth = new Map<string, Map<string, GLRow>>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;
    const headerRow = rows[h] || [];
    // Enhanced date detection: check for Transaction Date, Invoice Date, or Posting Date
    const COL_DATE = findColIdx(headerRow, ["Date", "Transaction Date", "Invoice Date", "Posting Date", "Trans Date"], 0);
    const data = rows.slice(h + 1);

    let current: { header: any[]; splits: any[][] } | null = null;
    const flush = () => {
      if (!current) return;
      const h = current.header;
      const iso = toISODate(h[COL_DATE]);
      if (!iso) { current = null; return; }
      const txType = String(h[1] ?? "").trim().toLowerCase();
      if (txType === "journal entry" || txType === "journal") { current = null; return; }

      const sampleAcct5 = current.splits.map(s => String(s[5] ?? "")).find(Boolean) ?? "";
      const sampleAcct6 = current.splits.map(s => String(s[6] ?? "")).find(Boolean) ?? "";
      const useNewLayout = sampleAcct6.includes(":") || /accounts payable|input vat|withholding/i.test(sampleAcct6) || (!sampleAcct5 && !!sampleAcct6);
      const ACC = useNewLayout ? 6 : 5; const DR = useNewLayout ? 7 : 6; const CR = useNewLayout ? 8 : 7;
      const my = monthYearFromISO(iso);

      const entry: any = { entry_date: iso, supplier: String(h[4] ?? ""), invoice_no: String(h[2] ?? ""), month_year: my };
      for (const f of PB_FIELD_TO_GL) entry[f.field] = 0;
      const sundryLines: Array<{ title: string; amount: number }> = [];

      for (const sp of current.splits) {
        const acct = String(sp[ACC] ?? "").trim();
        const dr = num(sp[DR]); const cr = num(sp[CR]);
        if (!acct || acct.toLowerCase() === "accounts payable") continue;
        if (acct.toLowerCase().includes("input vat")) { entry.input_tax = round2(entry.input_tax + dr); continue; }
        if (acct.startsWith("Cost of Construction:") && acct.toLowerCase().includes("fuel")) { entry.fuel_construction = round2(entry.fuel_construction + dr); continue; }
        const field = PB_EXACT[acct];
        if (field) { const amt = field === "itw_top_10t" ? cr : dr; entry[field] = round2(entry[field] + amt); continue; }
        sundryLines.push({ title: acct, amount: round2(dr - cr) });
      }
      if (entry.itw_top_10t > 0) entry.itw_top_10t = round2(-entry.itw_top_10t);
      let apSum = 0;
      for (const f of PB_FIELD_TO_GL) if (f.field !== "ap_trade_cr") apSum += entry[f.field] || 0;
      for (const s of sundryLines) apSum += s.amount;
      entry.ap_trade_cr = round2(apSum);
      allParsed.push(entry);

      for (const s of sundryLines) {
        const sub: any = { entry_date: iso, supplier: entry.supplier, invoice_no: entry.invoice_no, month_year: my, ap_trade_cr: 0, sundries_acct_title: s.title, sundries_amount: s.amount };
        for (const f of PB_FIELD_TO_GL) sub[f.field] = 0;
        allParsed.push(sub);
      }
      current = null;
    };

    for (const r of data) {
      const hasDate = !!toISODate(r[COL_DATE]);
      const hasName = String(r[4] ?? "").trim() !== "";
      if (hasDate && hasName) { flush(); current = { header: r, splits: [] }; }
      else if (current && (String(r[5] ?? "").trim() || String(r[6] ?? "").trim() || num(r[6]) || num(r[7]) || num(r[8]))) { current.splits.push(r); }
    }
    flush();
  }

  const addGL = (my: string, date: string, account: string, debit: number, credit: number, particulars: string) => {
    if (!account || (debit === 0 && credit === 0)) return;
    const key = `${date}|${account}|${particulars}`;
    let bucket = glByMonth.get(my);
    if (!bucket) { bucket = new Map(); glByMonth.set(my, bucket); }
    const cur = bucket.get(key);
    if (cur) { cur.debit = round2(cur.debit + debit); cur.credit = round2(cur.credit + credit); }
    else { bucket.set(key, { month_year: my, entry_date: date, account_name: account, particulars, folio: folioFor("PB", my), debit, credit, source_module: "PB" }); }
  };

  for (const e of allParsed) {
    const my = e.month_year;
    for (const f of PB_FIELD_TO_GL) {
      const amt = e[f.field] || 0; if (amt === 0) continue;
      const abs = Math.abs(amt);
      if (f.side === "dr") addGL(my, e.entry_date, f.account, abs, 0, e.supplier);
      else addGL(my, e.entry_date, f.account, 0, abs, e.supplier);
    }
    if (e.sundries_acct_title && e.sundries_amount !== 0) {
      const dr = e.sundries_amount > 0 ? e.sundries_amount : 0;
      const cr = e.sundries_amount < 0 ? Math.abs(e.sundries_amount) : 0;
      addGL(my, e.entry_date, e.sundries_acct_title, dr, cr, e.supplier);
    }
  }

  const glEntries: GLRow[] = [];
  for (const [my, bucket] of glByMonth) glEntries.push(...balanceWithSuspense([...bucket.values()], my, "PB", folioFor("PB", my)));
  return { rows: allParsed, glEntries, monthYear: allParsed[0]?.month_year || "" };
}

// ---------- Sales Book ----------
export function parseSalesBook(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  let allParsed: any[] = [];
  const glByMonth = new Map<string, Map<string, GLRow>>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;
    const headerRow = rows[h] || [];
    const taxIdx = findColIdx(headerRow, ["Tax Name", "Tax"], 8);
    const data = rows.slice(h + 1);

    for (const r of data) {
      const iso = toISODate(r[0]);
      const amt = num(r[7]);
      if (!iso || amt === 0) continue;
      const tax = String(r[taxIdx] ?? "").toLowerCase();
      const isNoVat = !tax || tax.includes("no vat") || tax.includes("exempt");
      const net = round2(amt);
      const vat = isNoVat ? 0 : round2(net * 0.12);
      const gross = round2(net + vat);
      const my = monthYearFromISO(iso);
      allParsed.push({
        month_year: my, entry_date: iso, invoice_no: String(r[2] ?? ""), customer_name: String(r[3] ?? ""),
        transaction_type: String(r[1] ?? ""), cash_amount: String(r[1]) === "Sales Receipt" ? gross : 0,
        ar_trade: String(r[1]) === "Invoice" ? gross : 0, net_sales: net, output_tax: vat, gross_sales: gross,
      });
    }
  }

  const addGL = (my: string, date: string, account: string, debit: number, credit: number, particulars: string) => {
    if (!account || (debit === 0 && credit === 0)) return;
    const key = `${date}|${account}`;
    let bucket = glByMonth.get(my);
    if (!bucket) { bucket = new Map(); glByMonth.set(my, bucket); }
    const cur = bucket.get(key);
    if (cur) { cur.debit = round2(cur.debit + debit); cur.credit = round2(cur.credit + credit); }
    else { bucket.set(key, { month_year: my, entry_date: date, account_name: account, particulars, folio: folioFor("SB", my), debit, credit, source_module: "SB" }); }
  };

  for (const e of allParsed) {
    const my = e.month_year;
    const drAcct = e.transaction_type === "Sales Receipt" ? "Cash / Undeposited Funds" : "Accounts Receivable";
    addGL(my, e.entry_date, drAcct, e.gross_sales, 0, e.customer_name);
    addGL(my, e.entry_date, "Manufacturing Sales", 0, e.net_sales, e.customer_name);
    addGL(my, e.entry_date, "Output VAT", 0, e.output_tax, e.customer_name);
  }

  const glEntries: GLRow[] = [];
  for (const [, bucket] of glByMonth) glEntries.push(...bucket.values());
  return { rows: allParsed, glEntries, monthYear: allParsed[0]?.month_year || "" };
}

// ---------- Cash Receipts ----------
export function parseCashReceipts(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  let allParsed: any[] = [];
  const glByMonth = new Map<string, Map<string, GLRow>>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;
    const data = rows.slice(h + 1);

    for (const r of data) {
      const iso = toISODate(r[0]);
      const amt = round2(num(r[5]));
      if (!iso || amt === 0) continue;
      const my = monthYearFromISO(iso);
      allParsed.push({
        month_year: my, entry_date: iso, or_pr_no: String(r[1] ?? ""),
        customers: String(r[2] ?? ""), reference: String(r[3] ?? ""),
        account: String(r[4] ?? ""), amount: amt,
      });
    }
  }

  const addGL = (my: string, date: string, account: string, debit: number, credit: number, particulars: string) => {
    if (!account || (debit === 0 && credit === 0)) return;
    const key = `${date}|${account}|${debit > 0 ? "D" : "C"}`;
    let bucket = glByMonth.get(my);
    if (!bucket) { bucket = new Map(); glByMonth.set(my, bucket); }
    const cur = bucket.get(key);
    if (cur) { cur.debit = round2(cur.debit + debit); cur.credit = round2(cur.credit + credit); }
    else { bucket.set(key, { month_year: my, entry_date: date, account_name: account, particulars, folio: folioFor("CR", my), debit, credit, source_module: "CR" }); }
  };

  for (const e of allParsed) {
    const my = e.month_year;
    addGL(my, e.entry_date, "Cash / Undeposited Funds", e.amount, 0, e.customers);
    addGL(my, e.entry_date, e.account || "Accounts Receivable", 0, e.amount, e.customers);
  }

  const glEntries: GLRow[] = [];
  for (const [, bucket] of glByMonth) glEntries.push(...bucket.values());
  return { rows: allParsed, glEntries, monthYear: allParsed[0]?.month_year || "" };
}
