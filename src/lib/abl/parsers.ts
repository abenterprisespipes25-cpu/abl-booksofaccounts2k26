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
}

/* ───── HELPER UTILS ───── */

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split("T")[0];
  }
  if (typeof v === "number" && v > 1000) {
    const date = new Date((v - 25569) * 86400000);
    return date.toISOString().split("T")[0];
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
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

const CDB_ROUTING_MAP: Record<string, { col: string; amount: "col_G" | "col_H_negative" }> = {
  "Accounts Payable": { col: "accounts_payable", amount: "col_G" },
  "Accounts Payable - Others": { col: "accounts_payable", amount: "col_G" },
  "Input VAT": { col: "vat_input_tax", amount: "col_G" },
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Basic": { col: "direct_labor", amount: "col_G" },
  "Cost of Manufacturing:Direct Labor:DL-Salaries, Wages and Allowances - Overtime": { col: "direct_labor", amount: "col_G" },
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Basic": { col: "overhead_labor", amount: "col_G" },
  "Cost of Manufacturing:Overhead:OH-Salaries, Wages and Allowances - Overtime": { col: "overhead_labor", amount: "col_G" },
  "Cost of Manufacturing:Overhead:OH-Communication, Light & Water": { col: "clw_plant", amount: "col_G" },
  "General and Administrative Expenses:G&A-Communication, Light & Water": { col: "clw_admin", amount: "col_G" },
  "Selling Expenses:Selling-Communication, Light & Water": { col: "clw_sales", amount: "col_G" },
  "Withholding Tax Payable - Expanded - Top Corp.": { col: "itw_top10k", amount: "col_H_negative" },
  "Withholding Tax Payable - Compensation": { col: "itw_compensation", amount: "col_H_negative" },
  "Withholding Tax Payable - Expanded - at Source": { col: "itw_at_source", amount: "col_H_negative" },
  "Withholding Tax Payable - Final": { col: "itw_at_source", amount: "col_H_negative" },
  "SSS, PHIC and HDMF Premiums Payable": { col: "sss_prem", amount: "col_G" },
  "SSS and HDMF Loans Payable": { col: "sss_loan", amount: "col_G" },
  "Cost of Construction:Cons-Outside Services": { col: "outside_services", amount: "col_G" },
  "Cost of Manufacturing:Overhead:OH-Outside Service": { col: "outside_services", amount: "col_G" },
  "Cost of Manufacturing:Overhead:OH-Outside Services": { col: "outside_services", amount: "col_G" },
  "General and Administrative Expenses:G&A-Travel and Transportation": { col: "travel_admin", amount: "col_G" },
  "Selling Expenses:Selling-Travel and Transportation": { col: "travel_sales", amount: "col_G" },
  "Cost of Construction:Cons-Travel and Transportation": { col: "travel_const", amount: "col_G" },
  "Cost of Manufacturing:Overhead:OH-Travel and Transportation": { col: "travel_water", amount: "col_G" },
  "Selling Expenses:Selling-Commissions": { col: "sales_comm", amount: "col_G" },
  "Selling Expenses:Selling-Delivery Expense": { col: "delivery_exp", amount: "col_G" },
};

function routeCDBSubRow(account: string, colG: number, colH: number) {
  // CIB/COH always -> SUNDRIES
  if (account?.startsWith("CIB:") || account?.startsWith("COH:")) {
    return { col: "SUNDRIES", acct_title: account, dr: 0, cr: colH || 0 };
  }
  // Routing Map
  const route = CDB_ROUTING_MAP[account];
  if (route) {
    const val = route.amount === "col_H_negative" ? -(colH || 0) : (colG || 0);
    return { col: route.col, amount: val };
  }
  // Advances to Employees
  if (account?.startsWith("Advances to Employees")) {
    return { col: "advances", amount: colG || 0 };
  }
  // Everything else -> SUNDRIES
  return { col: "SUNDRIES", acct_title: account, dr: colG || 0, cr: colH || 0 };
}

/* ───── MAIN CDB PARSER ───── */

export function parseCDB(buf: ArrayBuffer): ParsedResult<any> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false }) as any[][];
    const h = findHeaderRow(rows);
    if (h < 0) continue;

    const dataRows = rows.slice(h + 1);
    const groups: any[][] = [];
    let curGroup: any[] = [];

    // Grouping by Date/Payee block
    for (const r of dataRows) {
      if (!r || r.every(c => String(c).trim() === "")) continue;
      const acct = String(r[5] || "").trim();
      if (acct === "") break; // Stop Rule

      const iso = toISODate(r[0]);
      const no = String(r[2] || "").trim();
      const payee = String(r[3] || "").trim();

      if (iso && (no || payee)) {
        if (curGroup.length > 0) groups.push(curGroup);
        curGroup = [r];
      } else {
        curGroup.push(r);
      }
    }
    if (curGroup.length > 0) groups.push(curGroup);

    for (const txRows of groups) {
      const first = txRows[0];
      const iso = toISODate(first[0]);
      const no = String(first[2] || "").trim();
      const payee = String(first[3] || "").trim();
      const my = monthYearFromISO(iso);
      if (!detectedMonthYear) detectedMonthYear = my;
      const folio = folioFor("CDB", my);

      // Detect Fund
      let fullFund = "";
      for (const r of txRows) {
        const acct = String(r[5] || "").trim();
        if (acct.startsWith("CIB:") || acct.startsWith("COH:")) {
          fullFund = acct;
          break;
        }
      }
      const fundLabel = FUND_LABEL_MAP[fullFund] || "UNKNOWN";

      // Base entry structure
      const entry: any = {
        id: createId(),
        entry_date: iso,
        payee,
        particulars: String(first[4] || "").trim(),
        petty_cash_vno: String(first[4] || "").includes("PCF") ? (first[4].match(/PCF\s*(\S+)/i)?.[1] || "") : "",
        check_vno: no,
        check_no: no,
        fund: fullFund,
        fund_label: fundLabel,
        month_tab: my,
        source_module: "Cash Disbursements Book",
      };
      CDB_DISTRIBUTION_FIELDS.forEach(f => entry[f] = 0);
      entry.sundries_title = "";

      const sundries: any[] = [];

      for (const r of txRows) {
        const acct = String(r[5] || "").trim();
        if (!acct) continue;
        const dr = num(r[6]);
        const cr = num(r[7]);

        // ⚠️ Skip the main FUND credit from distribution completely so it doesn't double count
        if (acct === fullFund && dr === 0 && cr > 0) {
          continue; 
        }

        const route = routeCDBSubRow(acct, dr, cr);
        if (route.col === "SUNDRIES") {
          // Credits in sundries reduce the cash payout, so they must be negative for the SUM formula
          sundries.push({ 
            title: route.acct_title, 
            dr: route.dr, 
            cr: -Math.abs(route.cr), // Store credit as negative for SUM 
            particulars: String(r[4] || "").trim() 
          });
        } else {
          entry[route.col] = round2((entry[route.col] || 0) + (route.amount || 0));
        }

        // GL Posting for sub-row (Debits/Credits)
        const rowPart = String(r[4] || "").trim() || entry.particulars;
        if (acct.includes("Withholding Tax Payable")) {
          glEntries.push({ month_year: my, entry_date: (iso || ""), account_name: acct, particulars: rowPart, folio, debit: 0, credit: Math.abs(cr || dr), source_module: "CDB", source_ref: no });
        } else if (acct.startsWith("CIB:") || acct.startsWith("COH:")) {
          // This could be another bank account (transfer)
          if (dr > 0) glEntries.push({ month_year: my, entry_date: (iso || ""), account_name: acct, particulars: rowPart, folio, debit: dr, credit: 0, source_module: "CDB", source_ref: no });
          if (cr > 0) glEntries.push({ month_year: my, entry_date: (iso || ""), account_name: acct, particulars: rowPart, folio, debit: 0, credit: cr, source_module: "CDB", source_ref: no });
        } else {
          glEntries.push({ month_year: my, entry_date: (iso || ""), account_name: acct, particulars: rowPart, folio, debit: dr, credit: cr, source_module: "CDB", source_ref: no });
        }
      }

      const txGeneratedRows: any[] = [];
      // Handle row generation
      if (sundries.length === 0) {
        // Compute Cash Amount from fixed distribution columns only
        entry.cash_amount = round2(CDB_DISTRIBUTION_FIELDS.reduce((s, f) => s + (num(entry[f]) || 0), 0));
        allRows.push(entry);
        txGeneratedRows.push(entry);
      } else {
        sundries.forEach((s, idx) => {
          const row = {
            ...entry,
            id: createId(),
            particulars: s.particulars || entry.particulars,
            // Only the first row of a sundry set carries the fixed distribution columns
            sundries_title: s.title,
            sundries_dr: s.dr,
            sundries_cr: s.cr,
            _is_sub_row: idx > 0
          };
          if (idx > 0) {
             CDB_DISTRIBUTION_FIELDS.forEach(f => (row as any)[f] = 0);
          }
          // Re-compute cash_amount for this specific row (SUM of distribution cols)
          row.cash_amount = round2(CDB_DISTRIBUTION_FIELDS.reduce((sum, f) => sum + (num(row[f]) || 0), 0));
          allRows.push(row);
          txGeneratedRows.push(row);
        });
      }

      // GL Bank Credit for the entire transaction
      const bankCredit = round2(txGeneratedRows.reduce((s, r) => s + (num(r.cash_amount) || 0), 0));

      if (fullFund && bankCredit !== 0) {
        glEntries.push({
          month_year: my, entry_date: (iso || ""), account_name: fullFund, particulars: payee,
          folio, debit: 0, credit: Math.abs(bankCredit), source_module: "CDB", source_ref: no
        });
      }
    }
  }

  allRows.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || compareStrings(a.check_vno, b.check_vno));
  return { rows: allRows, glEntries, monthYear: detectedMonthYear };
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

