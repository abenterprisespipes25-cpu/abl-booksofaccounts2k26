// ABL v2.2 — Finalized Audit-Ready Parsers
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

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  // Handle formulas or complex objects from XLSX if any (though sheet_to_json usually evaluates)
  if (typeof v === "object" && v !== null && 'result' in v) v = v.result;
  
  // Strip out currency symbols, commas, and spaces, retaining only digits, dots, and minus signs
  const str = String(v).replace(/[^\d.-]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split("T")[0];
  }
  if (typeof v === "number") {
    // Excel date serial conversion (using Math.round to fix precision issues)
    const date = new Date(Math.round((v - 25569) * 86400000));
    return date.toISOString().split("T")[0];
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  
  // Attempt to parse standard text dates like "1/15/2026" or "Jan 15, 2026"
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return null;
}

function monthYearFromISO(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? "" : dateToMonthYear(d);
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const first = String(rows[i]?.[0] ?? "").trim().toLowerCase();
    if (first.startsWith("date")) return i;
  }
  return -1;
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
    return x < y ? -1 : 1;
  }
  return 0;
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

function routeCDBSubRow(account: string, colG: number, colH: number) {
  // CIB/COH always -> SUNDRIES
  if (account?.startsWith("CIB:") || account?.startsWith("COH:")) {
    return { col: "SUNDRIES", acct_title: account, dr: colH || 0, cr: 0 };
  }
  // Withholding tax -> stored as NEGATIVE in ITW col
  const wtxAccounts = [
    "Withholding Tax Payable - Expanded - Top Corp.",
    "Withholding Tax Payable - Expanded - Top 10,000 Corp.",
    "ITW TOP 10K CORP.",
    "Withholding Tax Payable - Compensation",
    "COMPENSATION",
    "Withholding Tax Payable - Expanded - at Source",
    "Withholding Tax Payable - Expanded - At Source",
    "AT SOURCE",
    "Withholding Tax Payable - Final"
  ];
  if (wtxAccounts.includes(account)) {
    const route = CDB_ROUTING_MAP[account];
    return { col: route?.col || "SUNDRIES", amount: -(colH || 0) };
  }
  // Exact match in routing map
  if (CDB_ROUTING_MAP[account]) {
    return { col: CDB_ROUTING_MAP[account].col, amount: colG || 0 };
  }
  // Startswith match (Advances to Employees)
  if (account?.startsWith("Advances to Employees")) {
    return { col: "advances", amount: colG || 0 };
  }
  // Everything else -> SUNDRIES
  return { col: "SUNDRIES", acct_title: account, dr: colG || 0, cr: colH || 0/* ───── MAIN CDB PARSER ───── */

export async function parseCDB(buf: ArrayBuffer): Promise<ParsedResult<any>> {
  const t0 = performance.now();
  console.log("[UPLOAD] Parsing started...");
  
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  if (!wb.SheetNames.length) throw new Error("⚠️ No worksheets detected in Excel file.");

  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  const validation = {
    source_total_debit: 0,
    source_total_credit: 0,
    routed_total_debit: 0,
    routed_total_credit: 0,
    source_rows: 0,
    routed_rows: 0,
    column_coverage: {} as Record<string, number>,
    unrouted_entries: [] as any[],
    gl_total_debit: 0,
    gl_total_credit: 0
  };

  for (const sheetName of wb.SheetNames) {
    console.log(`[UPLOAD] Worksheet detected: ${sheetName}`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    
    // Fallback: if findHeaderRow fails, start from row 0
    const dataRows = h < 0 ? rows : rows.slice(h + 1);
    const groups: any[][] = [];
    let curGroup: any[] = [];

    let validRowCount = 0;
    let skippedCount = 0;

    // Step 2: Group sub-rows by transaction
    for (let i = 0; i < dataRows.length; i++) {
      // Yield to main thread every 500 rows
      if (i % 500 === 0) await new Promise(r => setTimeout(r, 0));
      
      const r = dataRows[i];
      if (!r || r.every(c => String(c).trim() === "")) {
        skippedCount++;
        continue;
      }
      
      const iso = toISODate(r[0]);
      const payee = String(r[1] || "").trim();
      const particulars = String(r[2] || "").trim();
      const vno = String(r[3] || "").trim();
      const cno = String(r[4] || "").trim();
      const acct = String(r[5] || "").trim();
      const dr = num(r[6]);
      const cr = num(r[7]);

      // A row is a start of a transaction if it has a date AND some details
      if (iso && (payee || vno || cno || dr > 0 || cr > 0)) {
        if (curGroup.length > 0) groups.push(curGroup);
        curGroup = [r];
        validRowCount++;
      } 
      // A sub-row must have an account and amounts
      else if (acct && (dr > 0 || cr > 0)) {
        if (curGroup.length > 0) curGroup.push(r);
        validRowCount++;
      } else {
        skippedCount++;
      }
    }
    if (curGroup.length > 0) groups.push(curGroup);
    
    console.log(`[UPLOAD] Worksheet processed: ${sheetName} | Total rows scanned: ${dataRows.length} | Valid rows: ${validRowCount} | Skipped: ${skippedCount}`);

    for (let i = 0; i < groups.length; i++) {
      if (i % 100 === 0) await new Promise(r => setTimeout(r, 0));
      const txRows = groups[i];
      const first = txRows[0];
      const iso = toISODate(first[0]);
      const payee = String(first[1] || "").trim();
      const particulars = String(first[2] || "").trim();
      const vno = String(first[3] || "").trim();
      const cno = String(first[4] || "").trim();
      
      const my = monthYearFromISO(iso);
      if (!detectedMonthYear) detectedMonthYear = my;
      const folio = folioFor("CDB", my);

      // Step 3: detectFund()
      let fullFund = "";
      for (const r of txRows) {
        const acct = String(r[5] || "").trim();
        if (acct.startsWith("CIB:") || acct.startsWith("COH:")) {
          fullFund = acct;
          break;
        }
      }
      const fundLabel = FUND_LABEL_MAP[fullFund] || "UNKNOWN";

      const entry: any = {
        id: createId(),
        entry_date: iso,
        payee,
        particulars: particulars,
        petty_cash_vno: vno && vno.toUpperCase().includes("PCF") ? vno : "",
        check_vno: vno,
        check_no: cno || vno,
        fund: fullFund,
        fund_label: fundLabel,
        month_tab: my,
        source_module: "Cash Disbursements Book",
      };
      CDB_DISTRIBUTION_FIELDS.forEach(f => entry[f] = 0);
      entry.sundries_title = "";

      const sundries: any[] = [];

      // Step 4: For each sub-row -> routeSubRow()
      for (const r of txRows) {
        const acct = String(r[5] || "").trim();
        if (!acct) continue;
        const dr = num(r[6]);
        const cr = num(r[7]);

        validation.source_rows++;
        validation.source_total_debit = round2(validation.source_total_debit + dr);
        validation.source_total_credit = round2(validation.source_total_credit + cr);

        // ALWAYS skip the main fund credit from distribution entirely so it doesn't double count in SUNDRIES
        if (acct === fullFund && dr === 0 && cr > 0) {
          validation.routed_rows++;
          validation.routed_total_credit = round2(validation.routed_total_credit + cr);
          continue; 
        }

        const route = routeCDBSubRow(acct, dr, cr);
        validation.routed_rows++;
        
        if (route.col === "SUNDRIES") {
          sundries.push({ 
            title: route.acct_title, 
            dr: route.dr, 
            cr: route.cr, 
            particulars: String(r[2] || "").trim() 
          });
          validation.unrouted_entries.push({ account: acct, amount: Math.abs(route.dr - route.cr) });
          validation.routed_total_debit = round2(validation.routed_total_debit + route.dr);
          validation.routed_total_credit = round2(validation.routed_total_credit + Math.abs(route.cr));
          validation.column_coverage["AD - Sundries DR"] = round2((validation.column_coverage["AD - Sundries DR"] || 0) + route.dr);
          validation.column_coverage["AE - Sundries CR"] = round2((validation.column_coverage["AE - Sundries CR"] || 0) + Math.abs(route.cr));
        } else {
          entry[route.col] = round2((entry[route.col] || 0) + (route.amount || 0));
          if (["itw_top10k", "itw_compensation", "itw_at_source"].includes(route.col)) {
            const crAmount = Math.abs(route.amount);
            validation.routed_total_credit = round2(validation.routed_total_credit + crAmount);
          } else {
            validation.routed_total_debit = round2(validation.routed_total_debit + route.amount);
          }
          validation.column_coverage[route.col] = round2((validation.column_coverage[route.col] || 0) + Math.abs(route.amount));
        }
      }

      const txGeneratedRows: any[] = [];
      if (sundries.length === 0) {
        entry.cash_amount = round2(CDB_DISTRIBUTION_FIELDS.reduce((s, f) => s + (num(entry[f]) || 0), 0));
        allRows.push(entry);
        txGeneratedRows.push(entry);
      } else {
        sundries.forEach((s, idx) => {
          const row = {
            ...entry,
            id: createId(),
            particulars: s.particulars || entry.particulars,
            sundries_title: s.title,
            sundries_dr: s.dr,
            sundries_cr: s.cr,
            _is_sub_row: idx > 0
          };
          if (idx > 0) {
             CDB_DISTRIBUTION_FIELDS.forEach(f => (row as any)[f] = 0);
          }
          row.cash_amount = round2(CDB_DISTRIBUTION_FIELDS.reduce((sum, f) => sum + (num(row[f]) || 0), 0));
          allRows.push(row);
          txGeneratedRows.push(row);
        });
      }

      const pushGL = (account_name: string, account_type: string, debit: number, credit: number, particulars: string) => {
        if (debit === 0 && credit === 0) return;
        glEntries.push({ month_year: my, entry_date: (iso || ""), account_name, particulars, folio, debit, credit, source_module: "CDB", source_ref: cno || vno });
      };

      for (const row of txGeneratedRows) {
        const p = row.particulars || payee;
        if (fullFund && row.cash_amount !== 0) {
          pushGL(fullFund, "ASSET", 0, Math.abs(row.cash_amount), "Cash Disbursements");
        }
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
  }

  if (allRows.length === 0) {
    throw new Error("⚠️ File contains headers only. No transaction rows detected.");
  }

  allRows.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || compareStrings(a.check_vno, b.check_vno));

  glEntries.forEach(g => {
    validation.gl_total_debit = round2(validation.gl_total_debit + g.debit);
    validation.gl_total_credit = round2(validation.gl_total_credit + g.credit);
  });

  const t1 = performance.now();
  console.log(`[UPLOAD] Valid transaction rows found: ${allRows.length}`);
  console.log(`[UPLOAD] Processing completed in ${((t1 - t0) / 1000).toFixed(2)}s`);

  return { rows: allRows, glEntries, monthYear: detectedMonthYear, validation };
}Rows, glEntries, monthYear: detectedMonthYear, validation };
}

/* ───── PURCHASE BOOK PARSER ───── */

export function parsePurchaseBook(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;

    const dataRows = rows.slice(h + 1);
    let curHeader: any = null;
    const transactions: any[] = [];

    for (const r of dataRows) {
      if (!r || r.every(c => String(c).trim() === "")) continue;
      const iso = toISODate(r[0]);
      const type = String(r[1] || "").trim().toLowerCase();
      if (iso && (type.includes("bill") || type.includes("item receipt"))) {
        if (curHeader) transactions.push(curHeader);
        curHeader = { date: iso, no: String(r[2] || "").trim(), supplier: String(r[4] || "").trim(), splits: [] };
        if (!detectedMonthYear) detectedMonthYear = monthYearFromISO(iso);
      } else if (curHeader && String(r[5] || "").trim()) {
        curHeader.splits.push({ acct: String(r[5] || "").trim(), dr: num(r[6]), cr: num(r[7]) });
      }
    }
    if (curHeader) transactions.push(curHeader);

    for (const tx of transactions) {
      const my = monthYearFromISO(tx.date);
      const folio = folioFor("PB", my);
      const entry: any = { id: createId(), entry_date: tx.date, supplier: tx.supplier, invoice_no: tx.no, month_year: my };
      
      const sundries: any[] = [];
      let apTotal = 0;
      let vatTotal = 0;

      for (const s of tx.splits) {
        const acct = s.acct;
        if (acct.toLowerCase() === "accounts payable") {
          apTotal = round2(apTotal + s.cr);
        } else if (acct.toLowerCase().includes("input")) {
          vatTotal = round2(vatTotal + s.dr);
        } else {
          sundries.push({ title: acct, amount: round2(s.dr - s.cr) });
        }
        glEntries.push({ month_year: my, entry_date: tx.date, account_name: acct, particulars: tx.supplier, folio, debit: s.dr, credit: s.cr, source_module: "PB", source_ref: tx.no });
      }
      entry.ap_trade_cr = apTotal || round2(vatTotal + sundries.reduce((acc, s) => acc + s.amount, 0));
      entry.input_tax = vatTotal;

      if (sundries.length === 0) {
        allRows.push(entry);
      } else {
        sundries.forEach((s, idx) => {
          allRows.push({ ...entry, id: createId(), ap_trade_cr: idx === 0 ? entry.ap_trade_cr : null, input_tax: idx === 0 ? entry.input_tax : null, sundries_acct_title: s.title, sundries_amount: s.amount, _is_sub_row: idx > 0 });
        });
      }
    }
  }
  return { rows: allRows, glEntries, monthYear: detectedMonthYear };
}

/* ───── SALES BOOK PARSER ───── */

export function parseSalesBook(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;

    const dataRows = rows.slice(h + 1);
    for (const r of dataRows) {
      const iso = toISODate(r[0]);
      if (!iso) continue;
      const type = String(r[1] || "").trim();
      const inv = String(r[2] || "").trim();
      const customer = String(r[3] || "").trim();
      const net = num(r[7]);
      if (net === 0) continue;

      const my = monthYearFromISO(iso);
      if (!detectedMonthYear) detectedMonthYear = my;
      const folio = folioFor("SB", my);
      const vat = round2(net * 0.12);
      const gross = round2(net + vat);

      allRows.push({
        id: createId(), entry_date: iso, invoice_no: inv, customer_name: customer, transaction_type: type,
        cash_amount: type.includes("Receipt") ? gross : 0,
        ar_trade: type.includes("Invoice") ? gross : 0,
        net_sales: net, output_tax: vat, gross_sales: gross, month_year: my
      });

      const drAcct = type.includes("Receipt") ? "Cash / Undeposited Funds" : "Accounts Receivable";
      glEntries.push({ month_year: my, entry_date: iso, account_name: drAcct, particulars: customer, folio, debit: gross, credit: 0, source_module: "SB", source_ref: inv });
      glEntries.push({ month_year: my, entry_date: iso, account_name: "Manufacturing Sales", particulars: customer, folio, debit: 0, credit: net, source_module: "SB", source_ref: inv });
      glEntries.push({ month_year: my, entry_date: iso, account_name: "Output VAT", particulars: customer, folio, debit: 0, credit: vat, source_module: "SB", source_ref: inv });
    }
  }
  return { rows: allRows, glEntries, monthYear: detectedMonthYear };
}

/* ───── CASH RECEIPTS PARSER ───── */

export function parseCashReceipts(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;

    const dataRows = rows.slice(h + 1);
    for (const r of dataRows) {
      const iso = toISODate(r[0]);
      if (!iso) continue;
      const orNo = String(r[2] || "").trim();
      const payee = String(r[3] || "").trim();
      const acct = String(r[5] || "").trim();
      const dr = num(r[6]);
      const cr = num(r[7]);

      const my = monthYearFromISO(iso);
      if (!detectedMonthYear) detectedMonthYear = my;
      const folio = folioFor("CRB", my);

      allRows.push({
        id: createId(), entry_date: iso, or_no: orNo, payee, fund_label: "CASH",
        cash_amount: dr, ar_trade: acct.includes("Receivable") ? cr : 0,
        sales: !acct.includes("Receivable") ? cr : 0, month_year: my
      });

      glEntries.push({ month_year: my, entry_date: iso, account_name: "Cash / Undeposited Funds", particulars: payee, folio, debit: dr, credit: 0, source_module: "CRB", source_ref: orNo });
      glEntries.push({ month_year: my, entry_date: iso, account_name: acct, particulars: payee, folio, debit: 0, credit: cr, source_module: "CRB", source_ref: orNo });
    }
  }
  return { rows: allRows, glEntries, monthYear: detectedMonthYear };
}

