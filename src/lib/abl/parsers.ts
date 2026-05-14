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
 * Uses a scoring system to find the most likely header row.
 */
function detectHeaderConfig(rows: any[][]): HeaderMap | null {
  if (!rows || rows.length === 0) return null;

  let bestHeader: HeaderMap | null = null;
  let highestScore = 0;

  // Scan first 100 rows for potential headers
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const r = rows[i];
    if (!r || !Array.isArray(r)) continue;

    const mapping = { date: -1, payee: -1, particulars: -1, vno: -1, cno: -1, account: -1, debit: -1, credit: -1 };
    let score = 0;

    r.forEach((cell, colIdx) => {
      const val = String(cell || "").trim().toUpperCase();
      if (!val) return;

      for (const [key, variants] of Object.entries(HEADER_VARIANTS)) {
        if (variants.some(v => val === v || val.includes(v) || v.includes(val))) {
          if ((mapping as any)[key] === -1) {
            (mapping as any)[key] = colIdx;
            // Higher weight for essential columns
            if (key === 'date' || key === 'account') score += 10;
            else if (key === 'debit' || key === 'credit') score += 8;
            else score += 3;
          }
        }
      }
    });

    // If we have a Date and at least one amount or account column, it's a strong candidate
    if (mapping.date !== -1 && (mapping.debit !== -1 || mapping.credit !== -1 || mapping.account !== -1)) {
      if (score > highestScore) {
        highestScore = score;
        bestHeader = { rowIdx: i, cols: mapping as any };
      }
    }
  }

  if (bestHeader) {
    // Fill in account if missing but other critical columns are present
    if (bestHeader.cols.account === -1) {
       // Guess account column based on text density in data rows
       const sampleRows = rows.slice(bestHeader.rowIdx + 1, bestHeader.rowIdx + 20);
       let bestCol = -1;
       let maxLen = 0;
       for (let c = 0; c < 15; c++) {
         if (c === bestHeader.cols.date || c === bestHeader.cols.debit || c === bestHeader.cols.credit) continue;
         const avgLen = sampleRows.reduce((acc, row) => acc + String(row[c] || "").length, 0) / (sampleRows.length || 1);
         if (avgLen > maxLen) {
           maxLen = avgLen;
           bestCol = c;
         }
       }
       if (bestCol !== -1) bestHeader.cols.account = bestCol;
    }
    return bestHeader;
  }

  // SECOND PASS: Data Pattern Recognition (no headers found)
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const r = rows[i];
    if (!r) continue;
    
    let dateCol = -1, numCols: number[] = [], textCols: number[] = [];
    r.forEach((c, idx) => {
      if (toISODate(c)) dateCol = idx;
      else if (typeof c === 'number' || (!isNaN(parseFloat(String(c).replace(/[$,]/g,''))) && String(c).includes('.'))) numCols.push(idx);
      else if (String(c).trim().length > 3) textCols.push(idx);
    });

    if (dateCol !== -1 && numCols.length >= 1) {
      console.log(`[PARSER] Pattern match found at row ${i}. Date Col: ${dateCol}`);
      return {
        rowIdx: i - 1, 
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

/* ───── ACCOUNTING LOGIC ───── */

function classifyAccount(name: string): "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" {
  const n = (name || "").toLowerCase();
  if (n.startsWith("cib:") || n.startsWith("coh:")) return "ASSET";
  if (n.includes("receivable") || n.includes("prepaid") || 
      n.includes("inventory") || n.includes("property") || 
      n.includes("equipment") || n.includes("advances") || 
      n.includes("deposits") || n.includes("land") || 
      n.includes("input vat") || n.includes("input tax")) return "ASSET";
  if (n.includes("payable") || n.includes("withholding") || n.includes("sss") || 
      n.includes("phic") || n.includes("hdmf") || n.includes("accrued") || n.includes("tax payable")) return "LIABILITY";
  if (n.includes("sales") || n.includes("income") || n.includes("revenue")) return "INCOME";
  return "EXPENSE";
}

function routeCDBSubRow(account: string, dr: number, cr: number) {
  const mapping = CDB_ROUTING_MAP[account];
  if (mapping) {
    return {
      col: mapping.col,
      amount: dr || cr
    };
  }

  // Check startswith match (Advances to Employees)
  const startsWithKey = Object.keys(CDB_ROUTING_MAP).find(key => 
    CDB_ROUTING_MAP[key].match_type === "startswith" && account.startsWith(key)
  );
  if (startsWithKey) {
    return {
      col: CDB_ROUTING_MAP[startsWithKey].col,
      amount: dr || cr
    };
  }

  // Everything else → SUNDRIES
  return {
    col: "SUNDRIES",
    acct_title: account,
    dr: dr || 0,
    cr: cr || 0
  };
}

/* ───── MAIN CDB PARSER ───── */

export async function parseCDB(buf: ArrayBuffer): Promise<ParsedResult<any>> {
  const t0 = performance.now();
  console.log("[UPLOAD DEBUG] CDB Parsing started (Ref Spec v2025x)...");
  
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellNF: false, cellText: false });
  if (!wb.SheetNames.length) throw new Error("⚠ No worksheets detected in file.");

  const allRows: any[] = [];
  const glEntries: GLRow[] = [];
  let detectedMonthYear = "";

  const validation = {
    source_total_debit: 0, source_total_credit: 0,
    routed_total_debit: 0, routed_total_credit: 0,
    source_rows: 0, routed_rows: 0,
    gl_total_debit: 0, gl_total_credit: 0
  };

  // Find the best worksheet and header configuration
  let bestSheetName = "";
  let bestHeader: any = null;
  let maxValidRows = 0;

  for (const name of wb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) as any[][];
    const header = detectHeaderConfig(sheetRows);
    if (header) {
      const dataRows = sheetRows.slice(header.rowIdx + 1);
      const potential = dataRows.filter(r => {
        const acct = String(r[header.cols.account] || "").trim();
        const dr = num(r[header.cols.debit]);
        const cr = num(r[header.cols.credit]);
        return acct && (dr !== 0 || cr !== 0);
      }).length;

      if (potential > maxValidRows) {
        maxValidRows = potential;
        bestSheetName = name;
        bestHeader = header;
      }
    }
  }

  // Failsafe Mode
  if (!bestHeader) {
    bestSheetName = wb.SheetNames[0];
    bestHeader = {
      rowIdx: -1,
      cols: { date: 0, type: 1, vno: 2, payee: 3, particulars: 4, account: 5, debit: 6, credit: 7 }
    };
  }

  const { cols } = bestHeader;
  console.log(`[PARSER] Using Sheet: "${bestSheetName}" at rowIdx: ${bestHeader.rowIdx}`);
  console.log(`[PARSER] Columns: Date=${cols.date}, Account=${cols.account}, Debit=${cols.debit}, Credit=${cols.credit}`);

  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[bestSheetName], { header: 1, defval: "" }) as any[][];
  const dataRows = sheetRows.slice(bestHeader.rowIdx + 1);
  const groups: any[][] = [];
  let curGroup: any[] = [];
  
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (!r || r.every(c => !String(c).trim())) continue;

    const date = toISODate(r[cols.date]);
    const vno = String(r[cols.vno] || "").trim();
    const payee = String(r[cols.payee] || "").trim();

    // A new group starts if we have a Date AND (Voucher No or Payee)
    if (date && (vno || payee)) {
      if (curGroup.length > 0) groups.push(curGroup);
      curGroup = [r];
    } else if (curGroup.length > 0) {
      curGroup.push(r);
    } else {
      // If no current group, start one with this row anyway
      if (curGroup.length > 0) groups.push(curGroup);
      curGroup = [r];
    }
  }
  if (curGroup.length > 0) groups.push(curGroup);

  console.log(`[PARSER] Groups found: ${groups.length}`);

  let lastKnownDate: string | null = null;

  for (const txRows of groups) {
    const main = txRows[0];
    const groupDate = txRows.find(r => toISODate(r[cols.date]))?.[cols.date];
    const isoDate = toISODate(groupDate) || lastKnownDate;
    
    if (!isoDate) {
      console.log(`[PARSER] Skipping group: No date found.`);
      continue;
    }
    lastKnownDate = isoDate;

    const payee = String(main[cols.payee] || "").trim() || txRows.find(r => String(r[cols.payee] || "").trim())?.[cols.payee];
    const mainParticulars = String(main[cols.particulars] || "").trim() || txRows.find(r => String(r[cols.particulars] || "").trim())?.[cols.particulars];
    const cvNo = String(main[cols.vno] || "").trim() || txRows.find(r => String(r[cols.vno] || "").trim())?.[cols.vno];
    
    // Total cash amount for this transaction (usually from Column H Credit)
    const cashAmount = txRows.reduce((sum, r) => sum + num(r[cols.credit]), 0);
    
    const my = monthYearFromISO(isoDate);
    if (!detectedMonthYear) detectedMonthYear = my;
    const folio = "CDB";

    // Detect Bank Fund Account (Credit row in sub-rows)
    let fullFund = "";
    for (const r of txRows) {
      const acct = String(r[cols.account] || "").trim();
      if (acct.startsWith("CIB:") || acct.startsWith("COH:")) {
        fullFund = acct; break;
      }
    }
    const fundLabel = FUND_LABEL_MAP[fullFund] || "UNKNOWN";

    const entry: any = {
      id: createId(), 
      date: isoDate, 
      entry_date: isoDate, 
      payee: String(payee || "").trim(), 
      particulars: String(mainParticulars || "").trim(),
      petty_cash_vno: cvNo && String(cvNo).toUpperCase().includes("PCF") ? String(cvNo) : "",
      check_vno: String(cvNo || ""), 
      check_no: String(cvNo || ""), 
      month_year: my,
      fund: fullFund,
      fund_label: fundLabel,
      cash_amount: cashAmount,
      _is_sub_row: false
    };
    CDB_DISTRIBUTION_FIELDS.forEach(f => entry[f] = 0);
    entry.sundries_title = "";
    
    const sundries: any[] = [];

    for (const r of txRows) {
      const account = String(r[cols.account] || "").trim();
      if (!account || account.startsWith("CIB:") || account.startsWith("COH:")) continue;

      const dr = num(r[cols.debit]);
      const cr = num(r[cols.credit]);
      if (dr === 0 && cr === 0) continue;

      const rowParticulars = String(r[cols.particulars] || "").trim() || mainParticulars;
      const route = routeCDBSubRow(account, dr, cr);

      validation.source_rows++;
      validation.source_total_debit = round2(validation.source_total_debit + dr);
      validation.source_total_credit = round2(validation.source_total_credit + cr);

      if (route.col === "SUNDRIES") {
        sundries.push({ 
          title: route.acct_title, 
          dr: route.dr, 
          cr: route.cr, 
          particulars: rowParticulars 
        });
      } else {
        entry[route.col] = round2((entry[route.col] || 0) + (route.amount || 0));
      }
    }

    if (sundries.length === 0) {
      allRows.push(entry);
    } else {
      sundries.forEach((s, idx) => {
        const row = { 
          ...entry, 
          id: createId(), 
          particulars: s.particulars, 
          sundries_title: s.title, 
          sundries_dr: s.dr, 
          sundries_cr: s.cr, 
          _is_sub_row: idx > 0 
        };
        if (idx > 0) {
          CDB_DISTRIBUTION_FIELDS.forEach(f => (row as any)[f] = 0);
          row.cash_amount = 0;
        }
        allRows.push(row);
      });
    }

    // GL Posting Logic
    const pushGL = (account_name: string, debit: number, credit: number, p: string) => {
      if (debit === 0 && credit === 0) return;
      glEntries.push({ 
        month_year: my, entry_date: isoDate, account_name, particulars: p, 
        folio, debit, credit, source_module: "Cash Disbursements Book", source_ref: cvNo 
      });
    };

    if (fullFund && cashAmount !== 0) pushGL(fullFund, 0, cashAmount, mainParticulars);
    
    CDB_DISTRIBUTION_FIELDS.forEach(f => {
      if (entry[f] !== 0) {
        let acctName = f.replace(/_/g, " ").toUpperCase();
        pushGL(acctName, entry[f], 0, mainParticulars);
      }
    });

    sundries.forEach(s => {
      pushGL(s.title, s.dr, s.cr, s.particulars);
    });
  }

  // Sort: Date ASC → CV No. ASC
  allRows.sort((a, b) => 
    (a.entry_date || "").localeCompare(b.entry_date || "") || 
    compareStrings(a.check_vno, b.check_vno)
  );

  validation.routed_total_debit = round2(glEntries.reduce((s, e) => s + e.debit, 0));
  validation.routed_total_credit = round2(glEntries.reduce((s, e) => s + e.credit, 0));
  validation.gl_total_debit = validation.routed_total_debit;
  validation.gl_total_credit = validation.routed_total_credit;

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
