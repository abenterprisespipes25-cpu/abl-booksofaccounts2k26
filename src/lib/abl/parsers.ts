// ABL v2.5 — Finalized Accounting-Tolerant Parsers
import * as XLSX from "xlsx";
import { FUND_LABEL_MAP, CDB_DISTRIBUTION_FIELDS } from "./config";
import { dateToMonthYear, round2, folioFor, createId, compareStrings } from "./format";

export interface GLRow {
  month_year: string;
  entry_date: string;
  account_name: string;
  particulars: string;
  folio: string;
  debit: number;
  credit: number;
  source_module: string;
  source_ref?: string;
}

export interface ParsedResult<T> {
  rows: T[];
  glEntries: GLRow[];
  monthYear: string;
  sundries?: any[];
  validation?: any;
}

/* ───── HELPER UTILS ───── */

/**
 * Robust numeric parsing: handles currency symbols, commas, and parentheses for negative numbers.
 */
function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  
  // Handle XLSX objects with results
  if (typeof v === "object" && v !== null && 'result' in v) v = v.result;
  
  let str = String(v).trim();
  if (!str) return 0;

  // Handle (1,234.55) as negative
  const isParenthesesNegative = str.startsWith('(') && str.endsWith(')');
  if (isParenthesesNegative) {
    str = str.slice(1, -1);
  }

  // Strip everything except digits, dots, and minus sign
  str = str.replace(/[^\d.-]/g, "");
  let n = parseFloat(str);
  if (isNaN(n)) return 0;
  
  return isParenthesesNegative ? -Math.abs(n) : n;
}

/**
 * Robust ISO date conversion.
 */
function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split("T")[0];
  }
  if (typeof v === "number") {
    // Excel date serial
    try {
      const date = new Date(Math.round((v - 25569) * 86400000));
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
    } catch { return null; }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  
  // Attempt to parse text dates
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  } catch { return null; }
  
  return null;
}

function monthYearFromISO(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? "" : dateToMonthYear(d);
}

const HEADER_VARIANTS = {
  date: ["DATE", "TRANSACTION DATE", "DATE RECEIVED", "DOC DATE"],
  payee: ["PAYEE", "NAME", "SUPPLIER", "VENDOR", "PAYOR", "CLIENT"],
  particulars: ["PARTICULARS", "DESCRIPTION", "MEMO", "REMARKS"],
  vno: ["VOUCHER", "VNO", "VOUCHER NO", "REF NO", "REFERENCE", "VOUCHER #"],
  cno: ["CHECK", "CNO", "CHECK NO", "CHECK #", "CHQ NO"],
  account: ["ACCOUNT", "ACCOUNT TITLE", "ACCT TITLE", "CHART OF ACCOUNTS", "TITLE", "ACCOUNT NAME"],
  debit: ["DEBIT", "DR", "AMOUNT DR", "DEBIT AMOUNT", "DR AMOUNT", "DEBITS"],
  credit: ["CREDIT", "CR", "AMOUNT CR", "CREDIT AMOUNT", "CR AMOUNT", "CREDITS"]
};

interface HeaderMap {
  rowIdx: number;
  cols: {
    date: number;
    payee: number;
    particulars: number;
    vno: number;
    cno: number;
    account: number;
    debit: number;
    credit: number;
  };
}

/**
 * Dynamically detects the header row and column mapping across multiple worksheets.
 */
function detectHeaderConfig(rows: any[][]): HeaderMap | null {
  if (!rows || rows.length === 0) return null;

  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i];
    if (!r || !Array.isArray(r)) continue;

    const mapping = { date: -1, payee: -1, particulars: -1, vno: -1, cno: -1, account: -1, debit: -1, credit: -1 };
    let matches = 0;

    r.forEach((cell, colIdx) => {
      const val = String(cell || "").trim().toUpperCase();
      if (!val) return;

      for (const [key, variants] of Object.entries(HEADER_VARIANTS)) {
        if (variants.some(v => val === v || val.includes(v) || v.includes(val))) {
          if ((mapping as any)[key] === -1) {
            (mapping as any)[key] = colIdx;
            matches++;
          }
        }
      }
    });

    // Essential matches for accounting
    // We need at least an Account title and one amount column (Debit or Credit)
    if (mapping.account !== -1 && (mapping.debit !== -1 || mapping.credit !== -1)) {
      return { rowIdx: i, cols: mapping as any };
    }
    
    // Fallback: If we find Date + Debit + Credit but no explicit "Account" header, 
    // it might be a simple ledger where the first text column is the account.
    if (mapping.date !== -1 && mapping.debit !== -1 && mapping.credit !== -1) {
       if (mapping.account === -1) {
          // Find first non-date, non-amount column
          const firstText = r.findIndex((c, idx) => idx !== mapping.date && idx !== mapping.debit && idx !== mapping.credit && String(c).trim().length > 2);
          if (firstText !== -1) mapping.account = firstText;
       }
       return { rowIdx: i, cols: mapping as any };
    }
  }

  // SECOND PASS: Pattern-based fallback (no headers found)
  // Scan for rows that look like: [Date] [Text] [Number] [Number]
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i];
    if (!r) continue;
    
    let dateCol = -1, numCols: number[] = [], textCols: number[] = [];
    r.forEach((c, idx) => {
      if (toISODate(c)) dateCol = idx;
      else if (typeof c === 'number' || (!isNaN(parseFloat(String(c).replace(/[$,]/g,''))) && String(c).includes('.'))) numCols.push(idx);
      else if (String(c).trim().length > 3) textCols.push(idx);
    });

    if (dateCol !== -1 && numCols.length >= 1) {
      return {
        rowIdx: i - 1, // Assume headers might have been the row before
        cols: {
          date: dateCol,
          account: textCols[0] ?? (dateCol + 1),
          debit: numCols[0],
          credit: numCols[1] ?? numCols[0],
          payee: textCols[1] ?? -1,
          particulars: textCols[2] ?? -1,
          vno: -1, cno: -1
        }
      };
    }
  }

  return null;
}

/* ───── ACCOUNTING LOGIC ───── */

function classifyAccount(name: string): "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" {
  const n = (name || "").toLowerCase();
  if (n.startsWith("cib:") || n.startsWith("coh:")) return "ASSET";
  if (n.includes("receivable") || n.includes("prepaid") || n.includes("inventory") || 
      n.includes("property") || n.includes("equipment") || n.includes("advances") || 
      n.includes("deposits") || n.includes("land") || n.includes("input vat") || n.includes("input tax")) return "ASSET";
  if (n.includes("payable") || n.includes("withholding") || n.includes("sss") || 
      n.includes("phic") || n.includes("hdmf") || n.includes("accrued") || n.includes("tax payable")) return "LIABILITY";
  if (n.includes("sales") || n.includes("income") || n.includes("revenue")) return "INCOME";
  return "EXPENSE";
}

const CDB_ROUTING_MAP: Record<string, { col: string }> = {
  "Accounts Payable": { col: "accounts_payable" },
  "Accounts Payable - Others": { col: "accounts_payable" },
  "Input VAT": { col: "vat_input_tax" },
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Basic": { col: "direct_labor" },
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Overtime": { col: "direct_labor" },
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Basic": { col: "overhead_labor" },
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Overtime": { col: "overhead_labor" },
  "Cost of Manufacturing:Overhead:OH-Communication, Light & Water": { col: "clw_plant" },
  "General and Administrative Expenses:G&A-Communication, Light & Water": { col: "clw_admin" },
  "Selling Expenses:Selling-Communication, Light & Water": { col: "clw_sales" },
  "Withholding Tax Payable - Expanded - Top Corp.": { col: "itw_top10k" },
  "Withholding Tax Payable - Expanded - Top 10,000 Corp.": { col: "itw_top10k" },
  "ITW TOP 10K CORP.": { col: "itw_top10k" },
  "Withholding Tax Payable - Compensation": { col: "itw_compensation" },
  "COMPENSATION": { col: "itw_compensation" },
  "Withholding Tax Payable - Expanded - at Source": { col: "itw_at_source" },
  "Withholding Tax Payable - Expanded - At Source": { col: "itw_at_source" },
  "AT SOURCE": { col: "itw_at_source" },
  "Withholding Tax Payable - Final": { col: "itw_at_source" },
  "SSS, PHIC and HDMF Premiums Payable": { col: "sss_prem" },
  "SSS and HDMF Loans Payable": { col: "sss_loan" },
  "Cost of Construction:Cons-Outside Services": { col: "outside_services" },
  "Cost of Manufacturing:Overhead:OH-Outside Service": { col: "outside_services" },
  "Cost of Manufacturing:Overhead:OH-Outside Services": { col: "outside_services" },
  "General and Administrative Expenses:G&A-Travel and Transportation": { col: "travel_admin" },
  "Selling Expenses:Selling-Travel and Transportation": { col: "travel_sales" },
  "Cost of Construction:Cons-Travel and Transportation": { col: "travel_const" },
  "Cost of Manufacturing:Overhead:OH-Travel and Transportation": { col: "travel_water" },
  "Selling Expenses:Selling-Commissions": { col: "sales_comm" },
  "Selling Expenses:Selling-Delivery Expense": { col: "delivery_exp" },
};

function routeCDBSubRow(account: string, dr: number, cr: number) {
  if (account?.startsWith("CIB:") || account?.startsWith("COH:")) {
    return { col: "SUNDRIES", acct_title: account, dr: cr || 0, cr: 0 };
  }
  const wtxAccounts = [
    "Withholding Tax Payable - Expanded - Top Corp.", "Withholding Tax Payable - Expanded - Top 10,000 Corp.",
    "ITW TOP 10K CORP.", "Withholding Tax Payable - Compensation", "COMPENSATION",
    "Withholding Tax Payable - Expanded - at Source", "Withholding Tax Payable - Expanded - At Source",
    "AT SOURCE", "Withholding Tax Payable - Final"
  ];
  if (wtxAccounts.includes(account)) {
    const route = CDB_ROUTING_MAP[account];
    return { col: route?.col || "SUNDRIES", amount: -(cr || 0) };
  }
  if (CDB_ROUTING_MAP[account]) {
    return { col: CDB_ROUTING_MAP[account].col, amount: dr || 0 };
  }
  if (account?.startsWith("Advances to Employees")) {
    return { col: "advances", amount: dr || 0 };
  }
  return { col: "SUNDRIES", acct_title: account, dr: dr || 0, cr: cr || 0 };
}

/* ───── MAIN CDB PARSER ───── */

export async function parseCDB(buf: ArrayBuffer): Promise<ParsedResult<any>> {
  const t0 = performance.now();
  console.log("[UPLOAD DEBUG] CDB Parsing started...");
  
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellNF: false, cellText: false });
  if (!wb.SheetNames.length) throw new Error("⚠ No worksheets detected in file.");

  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  const validation = {
    source_total_debit: 0, source_total_credit: 0,
    routed_total_debit: 0, routed_total_credit: 0,
    source_rows: 0, routed_rows: 0,
    column_coverage: {} as Record<string, number>,
    unrouted_entries: [] as any[],
    gl_total_debit: 0, gl_total_credit: 0
  };

  // Find the best worksheet
  let bestSheetName = "";
  let bestHeader: HeaderMap | null = null;
  let maxValidRows = 0;

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    const header = detectHeaderConfig(rows);
    
    if (header) {
      // Basic count of potential rows
      const potential = rows.slice(header.rowIdx + 1).filter(r => r[header.cols.account] && (num(r[header.cols.debit]) !== 0 || num(r[header.cols.credit]) !== 0)).length;
      if (potential > maxValidRows) {
        maxValidRows = potential;
        bestSheetName = name;
        bestHeader = header;
      }
    }
  }

  // FAILSAFE: If no header detected, try first sheet with raw mapping
  if (!bestHeader) {
    console.warn("[UPLOAD DEBUG] Strict header detection failed. Using Failsafe Mode on Sheet 0.");
    bestSheetName = wb.SheetNames[0];
    bestHeader = {
      rowIdx: -1,
      cols: { date: 0, payee: 1, particulars: 2, vno: 3, cno: 4, account: 5, debit: 6, credit: 7 }
    };
  }

  console.log(`[UPLOAD DEBUG] Worksheet Selected: ${bestSheetName} (${maxValidRows} valid-looking rows)`);

  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[bestSheetName], { header: 1, defval: "" }) as any[][];
  const dataRows = sheetRows.slice(bestHeader.rowIdx + 1);
  const groups: any[][] = [];
  let curGroup: any[] = [];
  
  let validRowCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    if (i % 800 === 0) await new Promise(r => setTimeout(r, 0));
    const r = dataRows[i];
    if (!r || r.every(c => !String(c).trim())) {
      skippedCount++; continue;
    }

    const { cols } = bestHeader;
    const acct = String(r[cols.account] || "").trim();
    const dr = num(r[cols.debit]);
    const cr = num(r[cols.credit]);
    const date = toISODate(r[cols.date]);

    // RULE: Account exists AND (Dr != 0 or Cr != 0)
    if (acct && (dr !== 0 || cr !== 0)) {
      if (date) {
        if (curGroup.length > 0) groups.push(curGroup);
        curGroup = [r];
      } else if (curGroup.length > 0) {
        curGroup.push(r);
      } else {
        groups.push([r]);
      }
      validRowCount++;
    } else {
      skippedCount++;
    }
  }
  if (curGroup.length > 0) groups.push(curGroup);

  if (groups.length === 0) {
     throw new Error(`⚠ No valid accounting transactions found in worksheet '${bestSheetName}'. Check if the file has 'Account Title' and 'Debit/Credit' columns.`);
  }

  for (let i = 0; i < groups.length; i++) {
    if (i % 300 === 0) await new Promise(r => setTimeout(r, 0));
    const txRows = groups[i];
    const first = txRows[0];
    const { cols } = bestHeader;
    const iso = toISODate(first[cols.date]) || toISODate(txRows.find(r => toISODate(r[cols.date]))?.[cols.date]);
    if (!iso) continue;

    const payee = String(first[cols.payee] || "").trim();
    const particulars = String(first[cols.particulars] || "").trim();
    const vno = String(first[cols.vno] || "").trim();
    const cno = String(first[cols.cno] || "").trim();
    const my = monthYearFromISO(iso);
    if (!detectedMonthYear) detectedMonthYear = my;
    const folio = folioFor("CDB", my);

    let fullFund = "";
    for (const r of txRows) {
      const acct = String(r[cols.account] || "").trim();
      if (acct.startsWith("CIB:") || acct.startsWith("COH:")) {
        fullFund = acct; break;
      }
    }
    const fundLabel = FUND_LABEL_MAP[fullFund] || "UNKNOWN";

    const entry: any = {
      id: createId(), entry_date: iso, payee, particulars,
      petty_cash_vno: vno && vno.toUpperCase().includes("PCF") ? vno : "",
      check_vno: vno, check_no: cno || vno,
      fund: fullFund, fund_label: fundLabel, month_tab: my,
      source_module: "Cash Disbursements Book",
    };
    CDB_DISTRIBUTION_FIELDS.forEach(f => entry[f] = 0);
    entry.sundries_title = "";
    const sundries: any[] = [];

    for (const r of txRows) {
      const acct = String(r[cols.account] || "").trim();
      if (!acct) continue;
      const dr = num(r[cols.debit]);
      const cr = num(r[cols.credit]);

      validation.source_rows++;
      validation.source_total_debit = round2(validation.source_total_debit + dr);
      validation.source_total_credit = round2(validation.source_total_credit + cr);

      if (acct === fullFund && dr === 0 && cr > 0) {
        validation.routed_total_credit = round2(validation.routed_total_credit + cr);
        continue;
      }

      const route = routeCDBSubRow(acct, dr, cr);
      validation.routed_rows++;

      if (route.col === "SUNDRIES") {
        sundries.push({ title: route.acct_title, dr: route.dr, cr: route.cr, particulars: String(r[cols.particulars] || "").trim() });
        validation.unrouted_entries.push({ account: acct, amount: Math.abs(route.dr - route.cr) });
        validation.routed_total_debit = round2(validation.routed_total_debit + route.dr);
        validation.routed_total_credit = round2(validation.routed_total_credit + Math.abs(route.cr));
        validation.column_coverage["AD - Sundries DR"] = round2((validation.column_coverage["AD - Sundries DR"] || 0) + route.dr);
        validation.column_coverage["AE - Sundries CR"] = round2((validation.column_coverage["AE - Sundries CR"] || 0) + Math.abs(route.cr));
      } else {
        entry[route.col] = round2((entry[route.col] || 0) + (route.amount || 0));
        if (["itw_top10k", "itw_compensation", "itw_at_source"].includes(route.col)) {
          validation.routed_total_credit = round2(validation.routed_total_credit + Math.abs(route.amount));
        } else {
          validation.routed_total_debit = round2(validation.routed_total_debit + route.amount);
        }
        validation.column_coverage[route.col] = round2((validation.column_coverage[route.col] || 0) + Math.abs(route.amount));
      }
    }

    const txGeneratedRows: any[] = [];
    if (sundries.length === 0) {
      entry.cash_amount = round2(CDB_DISTRIBUTION_FIELDS.reduce((s, f) => s + (num(entry[f]) || 0), 0));
      allRows.push(entry); txGeneratedRows.push(entry);
    } else {
      sundries.forEach((s, idx) => {
        const row = { ...entry, id: createId(), particulars: s.particulars || entry.particulars, sundries_title: s.title, sundries_dr: s.dr, sundries_cr: s.cr, _is_sub_row: idx > 0 };
        if (idx > 0) CDB_DISTRIBUTION_FIELDS.forEach(f => (row as any)[f] = 0);
        row.cash_amount = round2(CDB_DISTRIBUTION_FIELDS.reduce((sum, f) => sum + (num(row[f]) || 0), 0));
        allRows.push(row); txGeneratedRows.push(row);
      });
    }

    const pushGL = (account_name: string, account_type: string, debit: number, credit: number, p: string) => {
      if (debit === 0 && credit === 0) return;
      glEntries.push({ month_year: my, entry_date: iso, account_name, particulars: p, folio, debit, credit, source_module: "CDB", source_ref: cno || vno });
    };

    for (const row of txGeneratedRows) {
      const p = row.particulars || payee;
      if (fullFund && row.cash_amount !== 0) pushGL(fullFund, "ASSET", 0, Math.abs(row.cash_amount), "Cash Disbursements");
      if (!row._is_sub_row) {
        if (row.accounts_payable) pushGL("Accounts Payable", "LIABILITY", row.accounts_payable, 0, p);
        if (row.vat_input_tax) pushGL("Input VAT", "ASSET", row.vat_input_tax, 0, p);
        if (row.itw_top10k) pushGL("Withholding Tax Payable - Expanded - Top Corp.", "LIABILITY", 0, Math.abs(row.itw_top10k), p);
        if (row.itw_compensation) pushGL("Withholding Tax Payable - Compensation", "LIABILITY", 0, Math.abs(row.itw_compensation), p);
        if (row.itw_at_source) pushGL("Withholding Tax Payable - Expanded - at Source", "LIABILITY", 0, Math.abs(row.itw_at_source), p);
        if (row.sss_prem) pushGL("SSS, PHIC and HDMF Premiums Payable", "LIABILITY", row.sss_prem, 0, p);
        if (row.sss_loan) pushGL("SSS and HDMF Loans Payable", "LIABILITY", row.sss_loan, 0, p);
        if (row.direct_labor) pushGL("Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Basic", "EXPENSE", row.direct_labor, 0, p);
        if (row.overhead_labor) pushGL("Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Basic", "EXPENSE", row.overhead_labor, 0, p);
        if (row.clw_plant) pushGL("Cost of Manufacturing:Overhead:OH-Communication, Light & Water", "EXPENSE", row.clw_plant, 0, p);
        if (row.clw_admin) pushGL("General and Administrative Expenses:G&A-Communication, Light & Water", "EXPENSE", row.clw_admin, 0, p);
        if (row.clw_sales) pushGL("Selling Expenses:Selling-Communication, Light & Water", "EXPENSE", row.clw_sales, 0, p);
        if (row.outside_services) pushGL("Cost of Manufacturing:Overhead:OH-Outside Service", "EXPENSE", row.outside_services, 0, p);
        if (row.travel_admin) pushGL("General and Administrative Expenses:G&A-Travel and Transportation", "EXPENSE", row.travel_admin, 0, p);
        if (row.travel_sales) pushGL("Selling Expenses:Selling-Travel and Transportation", "EXPENSE", row.travel_sales, 0, p);
        if (row.travel_const) pushGL("Cost of Construction:Cons-Travel and Transportation", "EXPENSE", row.travel_const, 0, p);
        if (row.travel_water) pushGL("Cost of Manufacturing:Overhead:OH-Travel and Transportation", "EXPENSE", row.travel_water, 0, p);
        if (row.sales_comm) pushGL("Selling Expenses:Selling-Commissions", "EXPENSE", row.sales_comm, 0, p);
        if (row.delivery_exp) pushGL("Selling Expenses:Selling-Delivery Expense", "EXPENSE", row.delivery_exp, 0, p);
        if (row.advances) pushGL("Advances to Employees", "ASSET", row.advances, 0, p);
      }
      if (row.sundries_title) {
        const sType = classifyAccount(row.sundries_title);
        if (row.sundries_dr) pushGL(row.sundries_title, sType, row.sundries_dr, 0, p);
        if (row.sundries_cr) pushGL(row.sundries_title, sType, 0, Math.abs(row.sundries_cr), p);
      }
    }
  }

  allRows.sort((a, b) => (a.entry_date || "").localeCompare(b.entry_date || "") || compareStrings(a.check_vno, b.check_vno));
  glEntries.forEach(g => { validation.gl_total_debit = round2(validation.gl_total_debit + g.debit); validation.gl_total_credit = round2(validation.gl_total_credit + g.credit); });

  const t1 = performance.now();
  console.log(`[UPLOAD DEBUG] Success: ${allRows.length} rows parsed in ${((t1 - t0) / 1000).toFixed(2)}s`);
  return { rows: allRows, glEntries, monthYear: detectedMonthYear, validation };
}

/* ───── OTHER PARSERS (Simplified / Improved) ───── */

async function parseGenericBook(buf: ArrayBuffer, type: "PB"|"SB"|"CRB"): Promise<ParsedResult<any>> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) as any[][];
    const header = detectHeaderConfig(rows);
    if (!header) continue;

    const dataRows = rows.slice(header.rowIdx + 1);
    for (let i = 0; i < dataRows.length; i++) {
      if (i % 800 === 0) await new Promise(r => setTimeout(r, 0));
      const r = dataRows[i];
      if (!r || r.every(c => !String(c).trim())) continue;
      
      const { cols } = header;
      const iso = toISODate(r[cols.date]);
      if (!iso) continue;
      
      const acct = String(r[cols.account] || "").trim();
      const dr = num(r[cols.debit]);
      const cr = num(r[cols.credit]);
      if (!acct || (dr === 0 && cr === 0)) continue;

      if (!detectedMonthYear) detectedMonthYear = monthYearFromISO(iso);
      const my = monthYearFromISO(iso);
      const folio = folioFor(type, my);
      const ref = String(r[cols.vno] || "").trim();
      const payee = String(r[cols.payee] || "").trim();

      const entry: any = { 
        id: createId(), entry_date: iso, month_year: my, 
        [type === "PB" ? "supplier" : type === "SB" ? "customer_name" : "payee"]: payee,
        [type === "PB" ? "invoice_no" : type === "SB" ? "invoice_no" : "or_no"]: ref
      };

      if (type === "PB") {
        entry.ap_trade_cr = cr;
        entry.input_tax = acct.toLowerCase().includes("input") ? dr : 0;
        if (!acct.toLowerCase().includes("input") && !acct.toLowerCase().includes("payable")) {
          entry.sundries_acct_title = acct;
          entry.sundries_amount = dr - cr;
        }
      } else if (type === "SB") {
        entry.ar_trade = dr;
        entry.output_tax = acct.toLowerCase().includes("output") ? cr : 0;
        entry.net_sales = !acct.toLowerCase().includes("output") && !acct.toLowerCase().includes("receivable") ? cr : 0;
        entry.gross_sales = entry.net_sales + entry.output_tax;
      } else {
        entry.cash_amount = dr;
        entry.ar_trade = acct.toLowerCase().includes("receivable") ? cr : 0;
        entry.sales = !acct.toLowerCase().includes("receivable") ? cr : 0;
      }

      allRows.push(entry);
      glEntries.push({ month_year: my, entry_date: iso, account_name: acct, particulars: payee, folio, debit: dr, credit: cr, source_module: type, source_ref: ref });
    }
  }

  if (allRows.length === 0) throw new Error(`⚠ No valid transactions found. Check if the file matches accounting headers.`);
  return { rows: allRows, glEntries, monthYear: detectedMonthYear };
}

export const parsePurchaseBook = (buf: ArrayBuffer) => parseGenericBook(buf, "PB");
export const parseSalesBook = (buf: ArrayBuffer) => parseGenericBook(buf, "SB");
export const parseCashReceipts = (buf: ArrayBuffer) => parseGenericBook(buf, "CRB");
