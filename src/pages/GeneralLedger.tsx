import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySettings, CompanySettings } from "@/lib/abl/companySettings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { toast } from "sonner";

interface GLEntry {
  account_name: string;
  entry_date: string;
  month_year: string;
  source_module: string;
  folio: string;
  particulars: string;
  debit: number;
  credit: number;
}

interface TRow { date: string; particulars: string; folio: string; amount: number; }

interface TAccountData {
  accountName: string;
  debitRows: TRow[];
  creditRows: TRow[];
  totalDR: number;
  totalCR: number;
  balanceDR: number;
  balanceCR: number;
  grandTotal: number;
}

function r2(n: number) { return Math.round((Number(n) || 0) * 100) / 100; }

function mapParticulars(mod: string): string {
  const m: Record<string, string> = {
    CDB: "Disbursements", PB: "Purchases", SB: "Sales",
    CR: "Collections", JE: "General Journal Entries", JB: "General Journal Entries",
  };
  return m[mod] ?? mod;
}

function mapFolio(mod: string, folio: string): string {
  // Use the folio from the entry if it looks meaningful, else use module code
  if (folio && !folio.startsWith(mod + "-")) return folio;
  const m: Record<string, string> = { CDB: "CDB", PB: "PB", SB: "SB", CR: "CRB", JE: "JE" };
  return m[mod] ?? mod;
}

function lastDayDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MON[last.getMonth()]} ${last.getDate()}`;
}

function lastDayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
}

function buildTAccount(accountName: string, entries: GLEntry[]): TAccountData {
  const groups = new Map<string, { dr: number; cr: number; particulars: string; folio: string; displayDate: string; sortKey: string }>();
  for (const e of entries) {
    const key = `${e.month_year}||${e.source_module}`;
    if (!groups.has(key)) {
      groups.set(key, {
        dr: 0, cr: 0,
        particulars: mapParticulars(e.source_module),
        folio: mapFolio(e.source_module, e.folio),
        displayDate: lastDayDisplay(e.entry_date),
        sortKey: lastDayISO(e.entry_date),
      });
    }
    const g = groups.get(key)!;
    g.dr = r2(g.dr + (e.debit  || 0));
    g.cr = r2(g.cr + (e.credit || 0));
  }
  const sorted = Array.from(groups.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const debitRows:  TRow[] = [];
  const creditRows: TRow[] = [];
  for (const g of sorted) {
    if (g.dr > 0) debitRows.push ({ date: g.displayDate, particulars: g.particulars, folio: g.folio, amount: g.dr });
    if (g.cr > 0) creditRows.push({ date: g.displayDate, particulars: g.particulars, folio: g.folio, amount: g.cr });
  }
  const totalDR   = r2(debitRows .reduce((s, r) => s + r.amount, 0));
  const totalCR   = r2(creditRows.reduce((s, r) => s + r.amount, 0));
  const balanceDR = totalCR > totalDR ? r2(totalCR - totalDR) : 0;
  const balanceCR = totalDR > totalCR ? r2(totalDR - totalCR) : 0;
  const grandTotal = r2(Math.max(totalDR + balanceDR, totalCR + balanceCR));
  return { accountName, debitRows, creditRows, totalDR, totalCR, balanceDR, balanceCR, grandTotal };
}

const fmt = (n?: number | null) =>
  n && n !== 0 ? n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

// ── EXCEL EXPORT (single account) ────────────────────────────────────────────
function buildAccountSheet(data: TAccountData, settings: CompanySettings) {
  const maxLen = Math.max(data.debitRows.length, data.creditRows.length);
  const wsData: any[][] = [];
  wsData.push([settings.company_name ?? "","","","","","","","",""]);
  if (settings.address) wsData.push([settings.address]);
  if (settings.tin_no)  wsData.push([`TIN: ${settings.tin_no}`]);
  wsData.push([]);
  wsData.push([data.accountName.toUpperCase()]);
  wsData.push([]);
  wsData.push(["DATE","PARTICULARS","FOLIO","DEBIT",null,"DATE","PARTICULARS","FOLIO","CREDIT"]);

  for (let i = 0; i < maxLen; i++) {
    const dr = data.debitRows[i];
    const cr = data.creditRows[i];
    wsData.push([
      dr?.date ?? null, dr?.particulars ?? null, dr?.folio ?? null, dr ? dr.amount : null, null,
      cr?.date ?? null, cr?.particulars ?? null, cr?.folio ?? null, cr ? cr.amount : null,
    ]);
  }
  if (data.balanceDR > 0 || data.balanceCR > 0) {
    wsData.push([null,"Balance c/d",null, data.balanceDR > 0 ? data.balanceDR : null, null,
                 null,"Balance c/d",null, data.balanceCR > 0 ? data.balanceCR : null]);
  }
  wsData.push([null,"TOTAL",null, data.grandTotal, null, null,"TOTAL",null, data.grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{wch:12},{wch:32},{wch:10},{wch:18},{wch:2},{wch:12},{wch:32},{wch:10},{wch:18}];

  // Styling
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:I1");
  const HEADER_ROW = 6;
  const TOTAL_ROW  = wsData.length - 1;
  const BAL_ROW    = (data.balanceDR > 0 || data.balanceCR > 0) ? TOTAL_ROW - 1 : -1;
  const thin  = (rgb = "CBD5E1") => ({ style:"thin",  color:{ rgb } });
  const bAll  = { top:thin(), bottom:thin(), left:thin(), right:thin() };
  const bTot  = { ...bAll, top:{ style:"double", color:{ rgb:"000000" } } };

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      if (C === 4) continue;
      const addr = XLSX.utils.encode_cell({r:R, c:C});
      if (!ws[addr]) ws[addr] = {t:"z", v:null};
      const isHdr = R === HEADER_ROW;
      const isTot = R === TOTAL_ROW;
      const isBal = R === BAL_ROW;
      ws[addr].s = {
        font:  { name:"Arial", sz: isTot||isHdr ? 10 : 9, bold: isHdr||isTot, italic: isBal, color:{ rgb: isHdr ? "FFFFFF" : "000000" } },
        fill:  isHdr ? { fgColor:{ rgb:"0F2744" }, patternType:"solid" }
             : isTot ? { fgColor:{ rgb:"DBEAFE" }, patternType:"solid" }
             : isBal ? { fgColor:{ rgb:"FEF9C3" }, patternType:"solid" }
             : { fgColor:{ rgb: R%2===0?"FFFFFF":"F9FAFB" }, patternType:"solid" },
        border: isTot ? bTot : bAll,
        alignment: {
          horizontal: (C===3||C===8) ? "right" : (C===2||C===7) ? "center" : "left",
          vertical:"center",
        },
        numFmt: (C===3||C===8) ? "#,##0.00" : undefined,
      };
    }
  }
  return ws;
}

function exportSingleAccount(data: TAccountData, settings: CompanySettings) {
  const wb = XLSX.utils.book_new();
  const ws = buildAccountSheet(data, settings);
  const sheetName = data.accountName.replace(/[^a-zA-Z0-9 ]/g,"").substring(0,31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `GL_${sheetName.replace(/ /g,"_")}.xlsx`);
}

function exportAllAccounts(accounts: TAccountData[], settings: CompanySettings) {
  if (!accounts.length) { toast.error("No accounts to export."); return; }
  const wb = XLSX.utils.book_new();
  for (const acct of accounts) {
    const ws = buildAccountSheet(acct, settings);
    const sheetName = acct.accountName.replace(/[^a-zA-Z0-9 ]/g,"").substring(0,31) || "Account";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  XLSX.writeFile(wb, `General_Ledger_All_Accounts.xlsx`);
  toast.success(`✅ Exported ${accounts.length} accounts to Excel.`);
}

// ── PRINT (single account) ───────────────────────────────────────────────────
function printAccount(data: TAccountData, settings: CompanySettings) {
  const maxLen = Math.max(data.debitRows.length, data.creditRows.length);
  const BD = "border:1px solid #000;padding:4px 8px;font-size:8pt";
  let rows = "";
  for (let i = 0; i < maxLen; i++) {
    const dr = data.debitRows[i];
    const cr = data.creditRows[i];
    const bg = i%2===0 ? "#fff" : "#f9fafb";
    rows += `<tr style="background:${bg}">
      <td style="${BD}">${dr?.date??""}</td><td style="${BD}">${dr?.particulars??""}</td>
      <td style="text-align:center;${BD}">${dr?.folio??""}</td>
      <td style="text-align:right;${BD}">${dr?fmt(dr.amount):""}</td>
      <td style="background:#0f2744;width:6px;padding:0;border:1px solid #0f2744"></td>
      <td style="${BD}">${cr?.date??""}</td><td style="${BD}">${cr?.particulars??""}</td>
      <td style="text-align:center;${BD}">${cr?.folio??""}</td>
      <td style="text-align:right;${BD}">${cr?fmt(cr.amount):""}</td>
    </tr>`;
  }
  if (data.balanceDR > 0 || data.balanceCR > 0) {
    rows += `<tr style="background:#fef9c3;font-style:italic;font-weight:600">
      <td style="${BD}"></td><td style="${BD}">Balance c/d</td><td style="${BD}"></td>
      <td style="text-align:right;${BD}">${data.balanceDR>0?fmt(data.balanceDR):""}</td>
      <td style="background:#0f2744;width:6px;padding:0;border:1px solid #0f2744"></td>
      <td style="${BD}"></td><td style="${BD}">Balance c/d</td><td style="${BD}"></td>
      <td style="text-align:right;${BD}">${data.balanceCR>0?fmt(data.balanceCR):""}</td>
    </tr>`;
  }
  const TBD = "border:1px solid #93c5fd;border-top:2px double #000;padding:5px 8px;font-size:8pt;font-weight:700;background:#dbeafe";
  rows += `<tr>
    <td style="${TBD}"></td><td style="${TBD}">TOTAL</td><td style="${TBD}"></td>
    <td style="text-align:right;${TBD}">${fmt(data.grandTotal)}</td>
    <td style="background:#0f2744;width:6px;padding:0;border:1px solid #0f2744"></td>
    <td style="${TBD}"></td><td style="${TBD}">TOTAL</td><td style="${TBD}"></td>
    <td style="text-align:right;${TBD}">${fmt(data.grandTotal)}</td>
  </tr>`;

  const TH = "background:#0f2744;color:#fff;font-weight:700;padding:6px 8px;font-size:8pt;border:1px solid #1e3a5f;white-space:nowrap";
  const html = `<!DOCTYPE html><html><head><style>
    *{font-family:Arial,sans-serif;box-sizing:border-box;margin:0;padding:0}
    body{padding:12mm 15mm} table{width:100%;border-collapse:collapse}
    @media print{@page{size:landscape}}
  </style></head><body>
  <div style="text-align:center;margin-bottom:10px">
    <div style="font-size:12pt;font-weight:700">${settings.company_name??""}</div>
    ${settings.address?`<div style="font-size:9pt">${settings.address}</div>`:""}
    <div style="font-size:10pt;font-weight:700;margin-top:4px">GENERAL LEDGER</div>
    <div style="font-size:11pt;font-weight:700;margin-top:6px;background:#0f2744;color:#fff;padding:5px 12px">${data.accountName.toUpperCase()}</div>
  </div>
  <table><thead><tr>
    <th style="${TH}">DATE</th><th style="${TH}">PARTICULARS</th><th style="${TH}">FOLIO</th><th style="${TH}">DEBIT</th>
    <th style="background:#0f2744;width:6px;padding:0;border:1px solid #0f2744"></th>
    <th style="${TH}">DATE</th><th style="${TH}">PARTICULARS</th><th style="${TH}">FOLIO</th><th style="${TH}">CREDIT</th>
  </tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
  const w = window.open("","_blank");
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>w.print(), 600); }
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function GeneralLedger() {
  const [dataMap, setDataMap] = useState<Map<string, GLEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data }, s] = await Promise.all([
      supabase.from("gl_entries")
        .select("account_name,entry_date,month_year,source_module,folio,particulars,debit,credit")
        .order("entry_date", { ascending: true })
        .limit(50000),
      getCompanySettings(),
    ]);
    const map = new Map<string, GLEntry[]>();
    for (const row of data ?? []) {
      const key = (row.account_name ?? "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row as any);
    }
    setDataMap(map);
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const ch = supabase.channel("gl_realtime2")
      .on("postgres_changes" as any, { event:"*", schema:"public", table:"gl_entries" }, () => {
        fetchData(true);
        toast.info("General Ledger updated.", { id:"gl-rt" });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData]);

  const tAccounts = useMemo(() => {
    const keys = Array.from(dataMap.keys()).sort((a,b) => a.localeCompare(b));
    return keys.map(k => buildTAccount(k, dataMap.get(k)!));
  }, [dataMap]);

  const filtered = useMemo(() =>
    tAccounts.filter(a => a.accountName.toLowerCase().includes(search.toLowerCase())),
    [tAccounts, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <SyncStatusBadge table="gl_entries" />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-4 items-center justify-between bg-white/5 p-6 rounded-2xl border border-white/10 no-print">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">General Ledger</h2>
          <p className="text-xs text-white/40 mt-0.5">T-Account · aggregated per month per source book · Excel grid view</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search account…"
              className="pl-10 bg-black/20 border-white/10 text-white h-10 w-64 rounded-xl"
            />
          </div>
          <Button
            variant="outline"
            className="bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 h-10"
            disabled={!filtered.length || !settings}
            onClick={() => exportAllAccounts(filtered, settings!)}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export All ({filtered.length})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <span className="text-xs font-black tracking-widest uppercase text-blue-400/50">Loading Ledgers…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-24 text-center border border-dashed border-white/10 rounded-2xl text-white/30">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="font-bold text-white/40">No accounts found</p>
          <p className="text-xs mt-1">Upload CDB, Purchase Book, Sales Book, Cash Receipts or Journal Entries to populate the ledger.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {filtered.map(acct => (
            <TAccountCard key={acct.accountName} data={acct} settings={settings!} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── T-ACCOUNT CARD ─────────────────────────────────────────────────────────────
function TAccountCard({ data, settings }: { data: TAccountData; settings: CompanySettings }) {
  const maxRows = Math.max(data.debitRows.length, data.creditRows.length);

  // Inline styles that look exactly like Excel
  const S = {
    wrap:    { fontFamily:"Arial,Helvetica,sans-serif", fontSize:"0.78rem", background:"#fff", border:"1.5px solid #000", borderRadius:0, overflow:"hidden", marginBottom:4, pageBreakAfter:"always" as const },
    title:   { background:"#fff", color:"#000", textAlign:"center" as const, fontWeight:700, fontSize:"0.9rem", padding:"6px 12px", borderBottom:"2px solid #000", letterSpacing:"0.04em" },
    toolbar: { background:"#f0f0f0", padding:"4px 10px", borderBottom:"1px solid #ccc", display:"flex", justifyContent:"flex-end", gap:6 },
    btn:     { background:"#fff", border:"1px solid #999", borderRadius:2, padding:"3px 10px", fontSize:"0.72rem", fontWeight:700, cursor:"pointer", display:"flex" as const, alignItems:"center" as const, gap:4 },
    th:      { background:"#d9d9d9", color:"#000", fontWeight:700, padding:"5px 8px", border:"1px solid #000", fontSize:"0.73rem", whiteSpace:"nowrap" as const, textAlign:"center" as const },
    td:      (align="left") => ({ padding:"4px 8px", border:"1px solid #000", fontSize:"0.78rem", color:"#000", textAlign:align as any }),
    tdbold:  (align="left") => ({ padding:"5px 8px", border:"1px solid #000", borderTop:"2.5px double #000", fontSize:"0.78rem", color:"#000", fontWeight:700, background:"#dbeafe", textAlign:align as any }),
    divider: { width:6, background:"#000", padding:0, border:"1px solid #000" },
  };

  return (
    <div style={S.wrap}>
      {/* Account title */}
      <div style={S.title}>{data.accountName.toUpperCase()}</div>

      {/* Toolbar */}
      <div style={S.toolbar} className="no-print">
        <button style={S.btn} onClick={() => exportSingleAccount(data, settings)}>
          <FileSpreadsheet size={12} /> Export Excel
        </button>
        <button style={S.btn} onClick={() => printAccount(data, settings)}>
          <Printer size={12} /> Print
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", minWidth:820, borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={S.th}>DATE</th>
              <th style={{ ...S.th, width:200 }}>PARTICULARS</th>
              <th style={S.th}>FOLIO</th>
              <th style={{ ...S.th, textAlign:"right" }}>DEBIT</th>
              <th style={S.divider}></th>
              <th style={S.th}>DATE</th>
              <th style={{ ...S.th, width:200 }}>PARTICULARS</th>
              <th style={S.th}>FOLIO</th>
              <th style={{ ...S.th, textAlign:"right" }}>CREDIT</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, i) => {
              const dr = data.debitRows[i];
              const cr = data.creditRows[i];
              const bg = i % 2 === 0 ? "#fff" : "#f9fafb";
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={S.td()}>{dr?.date ?? ""}</td>
                  <td style={S.td()}>{dr?.particulars ?? ""}</td>
                  <td style={S.td("center")}>{dr?.folio ?? ""}</td>
                  <td style={S.td("right")}>{dr ? fmt(dr.amount) : ""}</td>
                  <td style={S.divider}></td>
                  <td style={S.td()}>{cr?.date ?? ""}</td>
                  <td style={S.td()}>{cr?.particulars ?? ""}</td>
                  <td style={S.td("center")}>{cr?.folio ?? ""}</td>
                  <td style={S.td("right")}>{cr ? fmt(cr.amount) : ""}</td>
                </tr>
              );
            })}

            {/* Balance c/d */}
            {(data.balanceDR > 0 || data.balanceCR > 0) && (
              <tr style={{ background:"#fef9c3", fontStyle:"italic", fontWeight:600 }}>
                <td style={S.td()}></td>
                <td style={S.td()}>Balance c/d</td>
                <td style={S.td("center")}></td>
                <td style={S.td("right")}>{data.balanceDR > 0 ? fmt(data.balanceDR) : ""}</td>
                <td style={S.divider}></td>
                <td style={S.td()}></td>
                <td style={S.td()}>Balance c/d</td>
                <td style={S.td("center")}></td>
                <td style={S.td("right")}>{data.balanceCR > 0 ? fmt(data.balanceCR) : ""}</td>
              </tr>
            )}

            {/* Grand Total */}
            <tr>
              <td style={S.tdbold()}></td>
              <td style={S.tdbold()}>TOTAL</td>
              <td style={S.tdbold("center")}></td>
              <td style={S.tdbold("right")}>{fmt(data.grandTotal)}</td>
              <td style={{ ...S.divider, borderTop:"2.5px double #000" }}></td>
              <td style={S.tdbold()}></td>
              <td style={S.tdbold()}>TOTAL</td>
              <td style={S.tdbold("center")}></td>
              <td style={S.tdbold("right")}>{fmt(data.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
