// ABL v2.1 — Excel parsing for all 4 source files
import * as XLSX from "xlsx";
import { mapFund, fundToGLAccount } from "./config";
import { dateToMonthYear, round2, folioFor } from "./format";

export interface ParsedResult<T> {
  rows: T[];
  glEntries: GLRow[];
  monthYear: string;
  sundries?: any[];
}

// Force every row + GL entry into a target month_year. Re-stamps folios and
// rewrites the day-of-month in entry_date to keep records inside the month.
export function forceMonthYear<T extends Record<string, any>>(
  parsed: ParsedResult<T>,
  targetMY: string,
  folioPrefix: string,
): ParsedResult<T> {
  const p = parseMonthYearLite(targetMY);
  const remapDate = (iso: string): string => {
    if (!p) return iso;
    const day = (iso || "").slice(8, 10) || "01";
    const safeDay = Math.min(parseInt(day, 10) || 1, new Date(p.year, p.month + 1, 0).getDate());
    return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
  };
  const folio = folioFor(folioPrefix, targetMY);
  return {
    monthYear: targetMY,
    rows: parsed.rows.map((r: any) => ({ ...r, month_year: targetMY, entry_date: remapDate(r.entry_date) })) as T[],
    glEntries: parsed.glEntries.map((g) => ({ ...g, month_year: targetMY, entry_date: remapDate(g.entry_date), folio })),
  };
}

function parseMonthYearLite(my: string): { month: number; year: number } | null {
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const parts = (my || "").trim().toUpperCase().split(/\s+/);
  if (parts.length !== 2) return null;
  const m = months.indexOf(parts[0]);
  const y = parseInt(parts[1], 10);
  return m < 0 || isNaN(y) ? null : { month: m, year: y };
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
  const allRows: any[] = [];
  const allSundries: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;
    const dataStartIndex = h + 1;
    
    let currentHeader: any = null;
    const transactions: any[] = [];

    for (let i = dataStartIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => String(cell).trim() === '')) continue;

      const colA = String(row[0] ?? '').trim();  // Date
      const colB = String(row[1] ?? '').trim();  // Transaction Type
      const colC = String(row[2] ?? '').trim();  // No.
      const colD = String(row[3] ?? '').trim();  // Name
      const colE = String(row[4] ?? '').trim();  // Memo/Description
      const colF = String(row[5] ?? '').trim();  // Account
      const colG = String(row[6] ?? '').trim();  // Debit
      const colH = String(row[7] ?? '').trim();  // Credit

      const iso = toISODate(row[0]);
      const isHeaderRow = iso !== null && colC !== '' && colD !== '';

      if (isHeaderRow) {
        if (currentHeader) transactions.push(currentHeader);
        currentHeader = {
          date: iso,
          transactionType: colB,
          no: colC,
          name: colD,
          memo: colE,
          account: colF,
          debit: num(colG),
          credit: num(colH),
          splitRows: []
        };
        if (!detectedMonthYear) detectedMonthYear = monthYearFromISO(iso);
      } else if (colF !== '' && currentHeader !== null) {
        currentHeader.splitRows.push({
          date: currentHeader.date,
          transactionType: currentHeader.transactionType,
          no: currentHeader.no,
          name: currentHeader.name,
          memo: colE !== '' ? colE : currentHeader.memo,
          account: colF,
          debit: num(colG),
          credit: num(colH)
        });
      }
    }
    if (currentHeader) transactions.push(currentHeader);

    // Map transactions to CDB Entries
    for (const tx of transactions) {
      const my = monthYearFromISO(tx.date);
      const cvMatch = tx.memo.match(/CV\s*(\d+)/i);
      const pcfMatch = tx.memo.match(/PCF\s*(\S+)/i);
      const fund = mapFund(tx.account);
      const folio = folioFor("CDB", my);

      const entryId = crypto.randomUUID();
      const entry: any = {
        id: entryId,
        entry_date: tx.date,
        payee: tx.name,
        particulars: tx.memo,
        petty_cash_voucher: pcfMatch ? pcfMatch[1] : "",
        check_voucher_no: cvMatch ? `CV ${cvMatch[1]}` : "",
        check_no: tx.no,
        fund: fund,
        cash_amount: tx.credit,
        month_year: my,
        allSplitRows_json: JSON.stringify(tx.splitRows)
      };

      // Reset columns
      for (const f of CDB_FIELD_TO_GL) entry[f.field] = 0;
      entry.vat_input_tax = 0;

      const sundries: any[] = [];

      // Process split rows for columns
      for (const sr of tx.splitRows) {
        const acct = sr.account.trim();
        const dr = sr.debit;
        const cr = sr.credit;

        // Post individual GL lines
        glEntries.push({
          month_year: my,
          entry_date: tx.date,
          account_name: acct,
          particulars: tx.name,
          folio: folio,
          debit: dr,
          credit: cr,
          source_module: 'CDB',
          source_ref: tx.no
        });

        if (acct.toLowerCase().includes("input vat")) {
          entry.vat_input_tax = round2(entry.vat_input_tax + dr);
        } else if (acct.startsWith("Advances to Employees")) {
          entry.advances_officers_emp = round2(entry.advances_officers_emp + dr);
        } else if (acct.toLowerCase().includes("water") && acct.toLowerCase().includes("travel")) {
          entry.travel_water = round2(entry.travel_water + dr);
        } else {
          const field = CDB_EXACT_ACCOUNTS[acct];
          if (field) {
            const amt = CREDIT_FIELDS_CDB.has(field) ? cr : dr;
            entry[field] = round2((entry[field] || 0) + amt);
          } else {
            // Sundry
            sundries.push({
              cdb_entry_id: entryId,
              acct_title: acct,
              dr: dr,
              cr: cr
            });
          }
        }
      }

      // Post the Cash/Fund credit to GL
      glEntries.push({
        month_year: my,
        entry_date: tx.date,
        account_name: fundToGLAccount(fund),
        particulars: tx.name,
        folio: folio,
        debit: tx.debit, // In case of refund? Usually 0
        credit: tx.credit,
        source_module: 'CDB',
        source_ref: tx.no
      });

      allRows.push(entry);
      allSundries.push(...sundries);
    }
  }

  return { rows: allRows, glEntries, monthYear: detectedMonthYear, sundries: allSundries };
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
  const allRows: any[] = [];
  const allSundries: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;
    const dataStartIndex = h + 1;
    
    let currentHeader: any = null;
    const transactions: any[] = [];

    for (let i = dataStartIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => String(cell).trim() === '')) continue;

      const colA = String(row[0] ?? '').trim();  // Date
      const colB = String(row[1] ?? '').trim();  // Transaction Type
      const colC = String(row[2] ?? '').trim();  // No.
      const colD = String(row[3] ?? '').trim();  // Posting
      const colE = String(row[4] ?? '').trim();  // Name (Supplier)
      const colF = String(row[5] ?? '').trim();  // Memo/Description
      const colG = String(row[6] ?? '').trim();  // Account
      const colH = String(row[7] ?? '').trim();  // Debit
      const colI = String(row[8] ?? '').trim();  // Credit

      const iso = toISODate(row[0]);
      const isHeaderRow = iso !== null && colC !== '' && colE !== '';

      if (isHeaderRow) {
        if (currentHeader) transactions.push(currentHeader);
        currentHeader = {
          date: iso,
          transactionType: colB,
          no: colC,
          posting: colD,
          supplier: colE,
          memo: colF,
          account: colG,
          debit: num(colH),
          credit: num(colI),
          splitRows: []
        };
        if (!detectedMonthYear) detectedMonthYear = monthYearFromISO(iso);
      } else if (colG !== '' && currentHeader !== null) {
        currentHeader.splitRows.push({
          date: currentHeader.date,
          transactionType: currentHeader.transactionType,
          no: currentHeader.no,
          supplier: currentHeader.supplier,
          memo: colF !== '' ? colF : currentHeader.memo,
          account: colG,
          debit: num(colH),
          credit: num(colI)
        });
      }
    }
    if (currentHeader) transactions.push(currentHeader);

    // Map transactions to Purchase Book Entries
    for (const tx of transactions) {
      const my = monthYearFromISO(tx.date);
      const folio = folioFor("PB", my);
      const entryId = crypto.randomUUID();

      const entry: any = {
        id: entryId,
        entry_date: tx.date,
        supplier: tx.supplier,
        invoice_no: tx.no,
        month_year: my
      };

      for (const f of PB_FIELD_TO_GL) entry[f.field] = 0;
      const sundries: any[] = [];

      for (const sr of tx.splitRows) {
        const acct = sr.account.trim();
        const dr = sr.debit;
        const cr = sr.credit;

        // Post individual GL lines
        glEntries.push({
          month_year: my,
          entry_date: tx.date,
          account_name: acct,
          particulars: tx.supplier,
          folio: folio,
          debit: dr,
          credit: cr,
          source_module: 'PB',
          source_ref: tx.no
        });

        if (acct.toLowerCase() === "accounts payable") {
          entry.ap_trade_cr = round2(entry.ap_trade_cr + cr);
        } else if (acct.toLowerCase().includes("input vat")) {
          entry.input_tax = round2(entry.input_tax + dr);
        } else if (acct.startsWith("Cost of Construction:") && acct.toLowerCase().includes("fuel")) {
          entry.fuel_construction = round2(entry.fuel_construction + dr);
        } else {
          const field = PB_EXACT[acct];
          if (field) {
            const amt = field === "itw_top_10t" ? cr : dr;
            entry[field] = round2(entry[field] + amt);
          } else {
            sundries.push({
              pb_entry_id: entryId,
              acct_title: acct,
              amount: round2(dr - cr)
            });
          }
        }
      }

      // Handle the header row's account if it's not a split row
      // (Usually the header row in QB export is just the summary row)
      // Actually, our loop already processes header row as the summary.
      // But we should ensure the summary row account (usually Accounts Payable) is NOT double counted.
      // Actually, the splitRows contain ALL the lines. The header row itself usually doesn't have an account in the export if it's just a summary.
      // Wait, in QB, the header row DOES have an account (e.g. Accounts Payable).
      // Let's check if the header row should be posted to GL too.
      // Yes, the header row is the "Top Level" account.
      glEntries.push({
        month_year: my,
        entry_date: tx.date,
        account_name: tx.account,
        particulars: tx.supplier,
        folio: folio,
        debit: tx.debit,
        credit: tx.credit,
        source_module: 'PB',
        source_ref: tx.no
      });
      if (tx.account.toLowerCase() === "accounts payable") {
        entry.ap_trade_cr = round2(entry.ap_trade_cr + tx.credit);
      }

      allRows.push(entry);
      allSundries.push(...sundries);
    }
  }

  return { rows: allRows, glEntries, monthYear: detectedMonthYear, sundries: allSundries };
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
