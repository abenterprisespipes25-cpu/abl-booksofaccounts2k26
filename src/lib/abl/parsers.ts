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
  // Date object (cellDates: true)
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Excel serial number (e.g. 45658 = Jan 1 2025)
  if (typeof v === "number" && v > 1000) {
    const date = new Date((v - 25569) * 86400000);
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${day}`;
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  // MM/DD/YYYY or MM-DD-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, mm, dd, yy] = m;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
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

function monthYearFromISO(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return dateToMonthYear(d);
}


// ---------- CDB ----------
const CDB_FIXED_MAPPING: Record<string, { field: string; match_type?: "startswith" }> = {
  "Accounts Payable": { field: "ap_trade_dr" },
  "Accounts Payable - Others": { field: "ap_trade_dr" },
  "Input VAT": { field: "vat_input_tax" },
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Basic": { field: "direct_labor_basic" },
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Overtime": { field: "direct_labor_basic" },
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Basic": { field: "overhead_labor_basic" },
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Overtime": { field: "overhead_labor_basic" },
  "Cost of Manufacturing:Overhead:OH-Communication, Light & Water": { field: "comm_light_water_plant" },
  "General and Administrative Expenses:G&A-Communication, Light & Water": { field: "comm_light_water_admin" },
  "Selling Expenses:Selling-Communication, Light & Water": { field: "comm_light_water_sales" },
  "Withholding Tax Payable - Expanded - Top Corp.": { field: "itw_top_10k_corp" },
  "Withholding Tax Payable - Compensation": { field: "itw_compensation" },
  "Withholding Tax Payable - Expanded - at Source": { field: "itw_at_source" },
  "Withholding Tax Payable - Final": { field: "itw_at_source" },
  "SSS, PHIC and HDMF Premiums Payable": { field: "sss_phic_hdmf_prem" },
  "SSS and HDMF Loans Payable": { field: "sss_hdmf_loan" },
  "Cost of Construction:Cons-Outside Services": { field: "outside_services_construction" },
  "Cost of Manufacturing:Overhead:OH-Outside Service": { field: "outside_services_construction" },
  "General and Administrative Expenses:G&A-Travel and Transportation": { field: "travel_admin" },
  "Selling Expenses:Selling-Travel and Transportation": { field: "travel_sales" },
  "Cost of Construction:Cons-Travel and Transportation": { field: "travel_construction" },
  "Cost of Manufacturing:Overhead:OH-Travel and Transportation": { field: "travel_water" },
  "Selling Expenses:Selling-Commissions": { field: "sales_comm_3rd_party" },
  "Selling Expenses:Selling-Delivery Expense": { field: "delivery_expenses" },
  "Advances to Employees": { field: "advances_officers_emp", match_type: "startswith" }
};

const CDB_FIXED_FIELDS = new Set(Object.values(CDB_FIXED_MAPPING).map(v => v.field));
const CREDIT_FIELDS_CDB = new Set(["itw_top_10k_corp", "itw_compensation", "itw_at_source", "sss_phic_hdmf_prem", "sss_hdmf_loan"]);


export function parseCDB(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allRows: any[] = [];
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

      const iso = toISODate(row[0]);
      const colC = String(row[2] ?? '').trim();  // No.
      const colD = String(row[3] ?? '').trim();  // Name (Payee)
      const colF = String(row[5] ?? '').trim();  // Account
      const colG = num(row[6]);  // Debit
      const colH = num(row[7]);  // Credit

      const isHeaderRow = iso !== null && colC !== '' && colD !== '';

      if (isHeaderRow) {
        if (currentHeader) transactions.push(currentHeader);
        currentHeader = {
          date: iso,
          type: String(row[1] ?? '').trim(),
          no: colC,
          payee: colD,
          particulars: String(row[4] ?? '').trim(),
          account: colF,
          debit: colG,
          credit: colH,
          splitRows: []
        };
        if (!detectedMonthYear) detectedMonthYear = monthYearFromISO(iso);
      } else if (colF !== '' && currentHeader !== null) {
        currentHeader.splitRows.push({
          account: colF,
          particulars: String(row[4] ?? '').trim() || currentHeader.particulars,
          debit: colG,
          credit: colH
        });
      }
    }
    if (currentHeader) transactions.push(currentHeader);

    // Map transactions to CDB Entries
    for (const tx of transactions) {
      const my = monthYearFromISO(tx.date);
      const fund = mapFund(tx.account);
      const folio = folioFor("CDB", my);

      const entryId = crypto.randomUUID();
      const entry: any = {
        id: entryId,
        entry_date: tx.date,
        payee: tx.payee,
        particulars: tx.particulars,
        petty_cash_voucher: tx.particulars.match(/PCF\s*(\S+)/i)?.[1] || "",
        check_voucher_no: tx.particulars.match(/CV\s*(\d+)/i)?.[0] || "",
        check_no: tx.no,
        fund: fund,
        cash_amount: tx.credit, // CASH AMOUNT source is Credit Col H
        month_year: my
      };

      // Initialize all fixed columns to 0
      CDB_FIXED_FIELDS.forEach(f => entry[f] = 0);
      entry.vat_input_tax = 0; // Ensure VAT is 0 too

      // 1. First pass: Collect all fixed column totals and all sundry rows
      const fixedTotals: Record<string, number> = {};
      CDB_FIXED_FIELDS.forEach(f => fixedTotals[f] = 0);
      fixedTotals.vat_input_tax = 0;

      const sundries: any[] = [];

      for (const sr of tx.splitRows) {
        const acct = sr.account.trim();
        const dr = sr.debit;
        const cr = sr.credit;

        // Post to GL
        glEntries.push({
          month_year: my, entry_date: tx.date, account_name: acct,
          particulars: tx.payee, folio: folio, debit: dr, credit: cr,
          source_module: 'CDB', source_ref: tx.no
        });

        let mapped = false;
        const mapping = CDB_FIXED_MAPPING[acct];
        if (mapping) {
          const isCreditField = CREDIT_FIELDS_CDB.has(mapping.field);
          // Rule: Input VAT on credit side goes to SUNDRIES
          if (acct === "Input VAT" && cr > 0) {
            mapped = false;
          } else {
            const amt = isCreditField ? cr : dr;
            fixedTotals[mapping.field] = round2((fixedTotals[mapping.field] || 0) + amt);
            mapped = true;
          }
        } else {
          // startswith match
          for (const [key, val] of Object.entries(CDB_FIXED_MAPPING)) {
            if (val.match_type === 'startswith' && acct.startsWith(key)) {
              fixedTotals[val.field] = round2((fixedTotals[val.field] || 0) + dr);
              mapped = true;
              break;
            }
          }
        }

        if (!mapped) {
          sundries.push({ acct_title: acct, dr, cr });
        }
      }

      // Also process the main row's account (the Fund/Bank) for GL
      glEntries.push({
        month_year: my, entry_date: tx.date, account_name: fundToGLAccount(fund),
        particulars: tx.payee, folio: folio, debit: tx.debit, credit: tx.credit,
        source_module: 'CDB', source_ref: tx.no
      });

      // 2. Second pass: Create the rows
      if (sundries.length === 0) {
        // Just one row with everything
        allRows.push({ ...entry, ...fixedTotals });
      } else {
        // One row per sundry
        sundries.forEach((s, idx) => {
          allRows.push({
            ...entry,
            // Only put cash amount and fixed totals on the first row
            cash_amount: idx === 0 ? entry.cash_amount : 0,
            ...(idx === 0 ? fixedTotals : {}),
            sundries_acct_title: s.acct_title,
            sundries_dr: s.dr,
            sundries_cr: s.cr,
            id: crypto.randomUUID()
          });
        });

      }
    }
  }

  // Sort by Date then Check No
  allRows.sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date);
    if (d !== 0) return d;
    return naturalSort(a.check_no, b.check_no);
  });

  return { rows: allRows, glEntries, monthYear: detectedMonthYear };
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
  "Cost of Construction:Cons-Fuel, Oil and Lubricants": "fuel_construction",
  "Withholding Tax Payable - Expanded - Top Corp.": "itw_top_10t",
  "Withholding Tax Payable - Expanded - at Source": "itw_top_10t",
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
      const colF = String(row[5] ?? '').trim();  // Account (User says Column F)
      const colG = String(row[6] ?? '').trim();  // Debit
      const colH = String(row[7] ?? '').trim();  // Credit (User says Column H)


      const iso = toISODate(row[0]);
      const type = colB.toLowerCase();
      // Only process "Bill" or "Item Receipt" types as per user request to avoid Journal Entry duplication
      const isHeaderRow = iso !== null && colC !== '' && colE !== '' && (type.includes("bill") || type.includes("item receipt"));

      if (isHeaderRow) {

        if (currentHeader) transactions.push(currentHeader);
        currentHeader = {
          date: iso,
          transactionType: colB,
          no: colC,
          posting: colD,
          supplier: colE,
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
          supplier: currentHeader.supplier,
          account: colF,
          debit: num(colG),
          credit: num(colH)
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

      CDB_FIXED_FIELDS.forEach(f => entry[f] = 0); // Not used here but good for consistency
      const fixedTotals: Record<string, number> = {};
      PB_FIELD_TO_GL.forEach(f => fixedTotals[f.field] = 0);

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
          fixedTotals.ap_trade_cr = round2((fixedTotals.ap_trade_cr || 0) + cr);
        } else if (acct.toLowerCase().includes("input")) {
          fixedTotals.input_tax = round2((fixedTotals.input_tax || 0) + dr);
        } else if (acct.toLowerCase().includes("repairs and maintenance")) {
          if (acct.includes("G&A")) fixedTotals.repairs_admin = round2((fixedTotals.repairs_admin || 0) + dr);
          else if (acct.includes("Selling")) fixedTotals.repairs_sales = round2((fixedTotals.repairs_sales || 0) + dr);
          else if (acct.includes("Overhead") || acct.includes("OH-")) fixedTotals.repairs_plant = round2((fixedTotals.repairs_plant || 0) + dr);
          else fixedTotals.repairs_admin = round2((fixedTotals.repairs_admin || 0) + dr);
        } else if (acct.toLowerCase().includes("fuel") || acct.toLowerCase().includes("lubricants")) {
          if (acct.includes("G&A")) fixedTotals.fuel_admin = round2((fixedTotals.fuel_admin || 0) + dr);
          else if (acct.includes("Selling")) fixedTotals.fuel_sales = round2((fixedTotals.fuel_sales || 0) + dr);
          else if (acct.includes("Overhead") || acct.includes("OH-")) fixedTotals.fuel_plant = round2((fixedTotals.fuel_plant || 0) + dr);
          else if (acct.includes("Cons-") || acct.includes("Construction")) fixedTotals.fuel_construction = round2((fixedTotals.fuel_construction || 0) + dr);
          else fixedTotals.fuel_admin = round2((fixedTotals.fuel_admin || 0) + dr);
        } else {
          const field = PB_EXACT[acct];
          if (field) {
            const amt = field === "itw_top_10t" ? -cr : dr;
            fixedTotals[field] = round2((fixedTotals[field] || 0) + amt);
          } else {
            sundries.push({ acct_title: acct, amount: round2(dr - cr) });
          }
        }
      }

      // 1.5 Calculate the A/P TRADE-CR as the sum of all distributions
      // This ensures the report balances: A/P = Sum(Debits) - Sum(Credits other than A/P)
      const apSum = round2(
        (fixedTotals.input_tax || 0) +
        (fixedTotals.repairs_admin || 0) +
        (fixedTotals.repairs_sales || 0) +
        (fixedTotals.repairs_plant || 0) +
        (fixedTotals.fuel_admin || 0) +
        (fixedTotals.fuel_plant || 0) +
        (fixedTotals.fuel_sales || 0) +
        (fixedTotals.fuel_construction || 0) +
        (fixedTotals.itw_top_10t || 0) + // itw is already negative
        sundries.reduce((acc, s) => acc + s.amount, 0)
      );
      fixedTotals.ap_trade_cr = apSum;

      // 2. Second pass: Create rows for the table visibility
      if (sundries.length === 0) {

        allRows.push({ ...entry, ...fixedTotals });
      } else {
        sundries.forEach((s, idx) => {
          allRows.push({
            ...entry,
            ...(idx === 0 ? fixedTotals : {}),
            sundries_acct_title: s.acct_title,
            sundries_amount: s.amount,
            _is_sub_row: idx > 0
          });
          allSundries.push({
            pb_entry_id: entryId,
            acct_title: s.acct_title,
            amount: s.amount
          });
        });
      }

      // 3. Post the header row's account to GL (Accountant verified: Credit Liability)
      // Use the calculated apSum to ensure the GL balances with the distributions
      if (tx.account) {
        glEntries.push({
          month_year: my,
          entry_date: tx.date,
          account_name: tx.account,
          particulars: tx.supplier,
          folio: folio,
          debit: 0,
          credit: apSum,
          source_module: 'PB',
          source_ref: tx.no
        });
      }

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
      if (!iso) continue;
      
      const type = String(r[1] ?? "").trim();
      const invoiceNo = String(r[2] ?? "").trim();
      const customer = String(r[3] ?? "").trim();
      const amt = num(r[7]); // Column H (Amount)
      const taxName = String(r[8] ?? "").toLowerCase(); // User says Column I
      
      if (amt === 0) continue;

      const isNoVat = taxName.includes("no vat");
      const net = round2(amt);
      const vat = isNoVat ? 0 : round2(net * 0.12); // User: "No VAT dapat zero lng amount"
      const gross = round2(net + vat);
 // User: "NET SALES + OUTPUT TAX"
      const my = monthYearFromISO(iso);
      
      allParsed.push({
        month_year: my,
        entry_date: iso,
        invoice_no: invoiceNo,
        customer_name: customer,
        transaction_type: type,
        // User: Sales Receipt -> CASH, Invoice -> A/R TRADE
        cash_amount: type.toLowerCase().includes("receipt") ? gross : 0,
        ar_trade: type.toLowerCase().includes("invoice") ? gross : 0,
        c_deposits: 0,
        net_sales: net,
        output_tax: vat,
        gross_sales: gross,
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
