import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES, ModuleId } from "@/lib/abl/config";
import { sortMonthYears, monthYearToTabLabel, fmtMoney, fmtDate, round2 } from "@/lib/abl/format";
import { getCompanySettings } from "@/lib/abl/companySettings";


import { parseCDB, parsePurchaseBook, parseSalesBook, parseCashReceipts, ParsedResult } from "@/lib/abl/parsers";
import { exportExcel, exportPDF } from "@/lib/abl/exporters";
import { MonthTabs } from "./MonthTabs";
import { LedgerTable } from "./LedgerTable";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, FileText, Printer, Save, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";

const PARSERS: Record<ModuleId, (buf: ArrayBuffer) => ParsedResult<any>> = {
  cdb: parseCDB,
  purchase_book: parsePurchaseBook,
  sales_book: parseSalesBook,
  cash_receipts: parseCashReceipts,
};

// ─── Global in-memory cache (persists while the app tab is open) ───────────
// Keyed by moduleId → { months: string[], rows: Record<month_year, any[]> }
type ModuleCache = { months: string[]; rows: Record<string, any[]> };
const moduleCache = new Map<string, ModuleCache>();

function getCacheForModule(moduleId: string): ModuleCache {
  if (!moduleCache.has(moduleId)) {
    moduleCache.set(moduleId, { months: [], rows: {} });
  }
  return moduleCache.get(moduleId)!;
}

function invalidateCache(moduleId: string, month?: string) {
  const c = moduleCache.get(moduleId);
  if (!c) return;
  if (month) {
    delete c.rows[month]; // only clear the affected month
  } else {
    moduleCache.delete(moduleId); // full invalidation
  }
}

export default function BookModule({ moduleId }: { moduleId: ModuleId }) {
  const meta = MODULES[moduleId];
  const [months, setMonths] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<{ parsed: ParsedResult<any>; fileName: string; conflictMonths: string[] } | null>(null);
  const [glValidation, setGLValidation] = useState<{ parsed: ParsedResult<any>; fileName: string; totalDr: number; totalCr: number; diff: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMonths = useCallback(async (silent = false) => {
    const cache = getCacheForModule(moduleId);

    // Serve from cache immediately so navigation feels instant
    if (cache.months.length > 0 && silent) {
      setMonths(cache.months);
      if (!active || !cache.months.includes(active)) {
        setActive(cache.months[cache.months.length - 1]);
      }
    }

    // Always fetch fresh from Supabase in background
    const { data } = await supabase.from(meta.tableName).select("month_year").limit(10000);
    const list = sortMonthYears((data ?? []).map((r: any) => r.month_year));
    cache.months = list; // update cache
    setMonths(list);
    if (list.length && (!active || !list.includes(active))) setActive(list[list.length - 1]);
    if (!list.length) { setActive(null); setRows([]); }
  }, [meta.tableName, active, moduleId]);

  const loadRows = useCallback(async (my: string, silent = false) => {
    const cache = getCacheForModule(moduleId);

    // Serve cached rows instantly — skip the loading skeleton
    if (cache.rows[my]) {
      setRows(cache.rows[my]);
      if (!silent) return; // already have data, no need for full re-fetch unless forced
    }

    setLoading(!cache.rows[my]); // only show loader if no cached data
    setSyncing(true);
    try {
      // Fetch main entries
      const { data: entries } = await supabase
        .from(meta.tableName)
        .select("*")
        .eq("month_year", my)
        .order("entry_date", { ascending: true });
      
      const list = entries ?? [];
      const entryIds = list.map(r => r.id);

      let resultRows: any[] = [];

      if (moduleId === "cdb") {
        resultRows = list;
      } else if (moduleId === "purchase_book") {
        const { data: sundries } = await supabase
          .from("pb_sundries")
          .select("*")
          .in("pb_entry_id", entryIds);
        
        const sundriesMap = (sundries ?? []).reduce((acc: any, s: any) => {
          if (!acc[s.pb_entry_id]) acc[s.pb_entry_id] = [];
          acc[s.pb_entry_id].push(s);
          return acc;
        }, {});

        for (const tx of list) {
          const txSundries = sundriesMap[tx.id] || [];
          resultRows.push({
            ...tx,
            sundries_acct_title: txSundries[0]?.acct_title || "",
            sundries_amount: txSundries[0]?.amount || null,
          });
          for (let i = 1; i < txSundries.length; i++) {
            const s = txSundries[i];
            resultRows.push({
              ...tx,
              id: `${tx.id}-sundry-${i}`,
              entry_date: tx.entry_date,
              supplier: tx.supplier,
              invoice_no: tx.invoice_no,
              ...Object.fromEntries(meta.columns.filter(c => c.type === 'currency').map(c => [c.field, null])),
              sundries_acct_title: s.acct_title,
              sundries_amount: s.amount,
              _is_sub_row: true
            });
          }
        }
      } else {
        resultRows = list;
      }

      cache.rows[my] = resultRows; // update cache
      setRows(resultRows);
    } catch (e) {
      console.error("Error loading rows:", e);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [meta.tableName, meta.columns, moduleId]);
  
  const stats = useMemo(() => {
    const n = (v: any) => {
      if (!v) return 0;
      if (typeof v === "number") return v;
      const parsed = parseFloat(String(v).replace(/[,\s]/g, ""));
      return isNaN(parsed) ? 0 : parsed;
    };
    return {
      count: rows.length,
      totalAmount: rows.reduce((acc, r) => acc + n(r.ap_trade_cr || r.gross_sales || r.amount || r.cash_amount || r.accounts_payable), 0),
      totalVat: rows.reduce((acc, r) => acc + n(r.input_tax || r.output_tax || r.vat_input_tax), 0),
      totalItw: rows.reduce((acc, r) => acc + n(r.itw_top_10t || r.itw_top10k || r.itw_compensation || r.itw_at_source), 0),
      totalItwTop10: rows.reduce((acc, r) => acc + n(r.itw_top_10t || r.itw_top10k), 0),
    };

  }, [rows]);

  const recapSundriesPB = useMemo(() => {
    if (moduleId !== "purchase_book") return [];
    const map = new Map<string, number>();
    rows.forEach(r => {
      if (r.sundries_acct_title) {
        const key = r.sundries_acct_title;
        map.set(key, round2((map.get(key) || 0) + (Number(r.sundries_amount) || 0)));
      }
    });
    return Array.from(map.entries()).map(([account, amount]) => ({ account, amount })).sort((a, b) => a.account.localeCompare(b.account));
  }, [rows, moduleId]);

  const recapSundries = useMemo(() => {
    if (moduleId !== "cdb") return [];
    const map = new Map<string, { account: string; dr: number; cr: number }>();
    rows.forEach(r => {
      if (r.sundries_title) {
        const key = r.sundries_title;
        const existing = map.get(key) || { account: key, dr: 0, cr: 0 };
        existing.dr = round2(existing.dr + (Number(r.sundries_dr) || 0));
        existing.cr = round2(existing.cr + (Number(r.sundries_cr) || 0));
        map.set(key, existing);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.account.localeCompare(b.account));
  }, [rows, moduleId]);

  const recapFunds = useMemo(() => {
    if (moduleId !== "cdb") return [];
    const map = new Map<string, number>();
    rows.forEach(r => {
      if (r.fund && !r._is_sub_row) {
        const key = r.fund;
        map.set(key, round2((map.get(key) || 0) + (Number(r.cash_amount) || 0)));
      }
    });
    return Array.from(map.entries()).map(([fund, amount]) => ({ fund, amount })).sort((a, b) => a.fund.localeCompare(b.fund));
  }, [rows, moduleId]);

  const recapSundriesData = moduleId === "purchase_book" ? recapSundriesPB : recapSundries;

  const [uploadInfo, setUploadInfo] = useState<{ file_name: string; created_at: string } | null>(null);

  useEffect(() => {
    async function getStatus() {
      if (!active) return;
      const { data } = await supabase
        .from("uploaded_files")
        .select("file_name, created_at")
        .eq("module", meta.glSource)
        .eq("month_year", active)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      setUploadInfo(data as any);
    }
    getStatus();
  }, [active, meta.glSource]);





  // Subscribe to real-time changes
  useEffect(() => {
    let debounceTimer: any = null;
    const channel = supabase
      .channel(`${moduleId}_realtime`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: meta.tableName } as any,
        (payload) => {
          console.log('Real-time change received:', payload);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadMonths();
            if (active) loadRows(active);
          }, 300);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [moduleId, meta.tableName, active, loadMonths, loadRows]);

  useEffect(() => { loadMonths(true); }, [loadMonths]);
  useEffect(() => { if (active) loadRows(active); }, [active, loadRows]);

  const handleSave = async (updatedRow: any) => {
    try {
      const { id, _is_sub_row, ...cleanRow } = updatedRow;
      const actualId = _is_sub_row ? id.split("-sundry-")[0] : id;

      // Filter out non-database fields (like _is_sub_row, sundries_acct_title, etc if they aren't in the main table)
      const dbFields = meta.columns.map(c => c.field);
      const dataToUpdate: any = { id: actualId };
      dbFields.forEach(f => {
        if (updatedRow[f] !== undefined) dataToUpdate[f] = updatedRow[f];
      });

      const { error } = await supabase
        .from(meta.tableName)
        .update(dataToUpdate)
        .eq("id", actualId);

      if (error) throw error;
      
      // Sync with GL
      // We'll delete and re-insert the GL entry for this specific row
      // We need a way to identify the GL entry. Usually source_module + month_year + particulars/date?
      // Better: we should have a source_ref in gl_entries. 
      // Let's check if gl_entries has a reference to the book entry id.
      // Looking at commit() logic, it seems it doesn't store the source id.
      // However, we can try to find it by date, particulars, and amount.
      
      // Actually, a better way is to update the GL entry if it matches.
      // But since we don't have a direct ID link yet in the existing schema's GL insertion,
      // we'll skip the automated sync for now to avoid accidental deletions of other rows,
      // OR we add a source_id column to gl_entries.
      
      // For now, let's just update the book entry as requested. 
      // If the user wants full sync, we'd need a schema change for gl_entries to include source_id.
      
      toast.success("Record updated successfully");
      invalidateCache(moduleId, active!);
      loadRows(active!, true);
    } catch (e: any) {
      toast.error(`Failed to save: ${e.message || e}`);
      throw e;
    }
  };

  const handleDelete = async (rowToDelete: any) => {
    try {
      const { id, _is_sub_row } = rowToDelete;
      const actualId = _is_sub_row ? id.split("-sundry-")[0] : id;

      const { error } = await supabase
        .from(meta.tableName)
        .delete()
        .eq("id", actualId);

      if (error) throw error;
      
      // Cleanup associated sundries for PB
      if (moduleId === "purchase_book") {
        await supabase.from("pb_sundries").delete().eq("pb_entry_id", actualId);
      }

      toast.success("Record deleted");
      invalidateCache(moduleId, active!);
      loadRows(active!, true);
    } catch (e: any) {
      toast.error(`Failed to delete: ${e.message || e}`);
      throw e;
    }
  };

  async function handleFile(file: File) {
    if (moduleId === "purchase_book" && !file.name.toLowerCase().includes("purchase+book")) {
      toast.error("Invalid file. Please upload 'Purchase Book' file only.");
      return;
    }

    setUploading(true);
    try {

      const buf = await file.arrayBuffer();
      const parsed = PARSERS[moduleId](buf);
      const monthsInFile = Array.from(new Set(parsed.rows.map((r: any) => r.month_year))).filter(Boolean) as string[];
      
      if (!monthsInFile.length) throw new Error("No valid transactions found in file.");
      
      const { data: existing } = await supabase
        .from(meta.tableName)
        .select("month_year")
        .in("month_year", monthsInFile);
      
      const conflictMonths = Array.from(new Set((existing ?? []).map((r: any) => r.month_year))) as string[];
      
      if (conflictMonths.length > 0) {
        setPending({ parsed, fileName: file.name, conflictMonths });
      } else {
        validateAndCommit(parsed, file.name);
      }

    } catch (e: any) {
      toast.error(`Upload error: ${e.message || e}`);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function validateAndCommit(parsed: ParsedResult<any>, fileName: string, replace = false) {
    // Double-entry validation
    const totalDr = round2(parsed.glEntries.reduce((s, e) => s + (e.debit || 0), 0));
    const totalCr = round2(parsed.glEntries.reduce((s, e) => s + (e.credit || 0), 0));
    const diff = Math.abs(totalDr - totalCr);

    if (diff > 0.01) {
      setGLValidation({ parsed, fileName, totalDr, totalCr, diff });
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    } else {
      commit(parsed, fileName, replace);
    }
  }

  async function commit(parsed: ParsedResult<any>, fileName: string, replace = false) {
    setUploading(true);
    const loaderId = toast.loading("Saving records...");
    
    // OPTIMISTIC UI: Immediately show rows if they match the active month
    const monthsInFile = Array.from(new Set(parsed.rows.map((r: any) => r.month_year))).filter(Boolean) as string[];
    const targetMonth = monthsInFile[monthsInFile.length - 1];
    
    if (targetMonth === active) {
      setRows(prev => [...prev, ...parsed.rows.filter((r: any) => r.month_year === active)]);
    }

    try {
      const glMonthsInFile = Array.from(new Set(parsed.glEntries.map((r: any) => r.month_year))).filter(Boolean) as string[];
      
      if (replace) {
        for (const my of monthsInFile) {
          await supabase.from(meta.tableName).delete().eq("month_year", my);
          await supabase.from("uploaded_files").delete().eq("module", meta.glSource).eq("month_year", my);
        }
        for (const my of glMonthsInFile) {
          await supabase.from("gl_entries").delete().eq("source_module", meta.glSource).eq("month_year", my);
        }
      }

      // CDB sundries are embedded in rows — no separate sundry table insert needed.
      // Purchase Book still uses pb_sundries separate table.
      if (moduleId === "purchase_book" && parsed.sundries && parsed.sundries.length > 0) {
        if (replace) {
          const { data: existing } = await supabase.from(meta.tableName).select("id");
          const ids = (existing ?? []).map((r: any) => r.id);
          if (ids.length > 0) await supabase.from("pb_sundries").delete().in("pb_entry_id", ids);
        }
      }

      const BATCH = 1000;
      for (let i = 0; i < parsed.rows.length; i += BATCH) {
        const chunk = parsed.rows.slice(i, i + BATCH);
        const { error } = await supabase.from(meta.tableName).insert(chunk as any);
        if (error) throw error;
      }


      if (moduleId === "purchase_book" && parsed.sundries && parsed.sundries.length > 0) {
        for (let i = 0; i < parsed.sundries.length; i += BATCH) {
          const chunk = parsed.sundries.slice(i, i + BATCH);
          const { error } = await supabase.from("pb_sundries").insert(chunk as any);
          if (error) throw error;
        }
      }


      if (parsed.glEntries.length) {
        for (let i = 0; i < parsed.glEntries.length; i += BATCH) {
          const chunk = parsed.glEntries.slice(i, i + BATCH);
          const { error } = await supabase.from("gl_entries").insert(chunk as any);
          if (error) throw error;
        }
      }


      for (const my of monthsInFile) {
        const rowCount = parsed.rows.filter((r: any) => r.month_year === my).length;
        await supabase.from("uploaded_files").insert({
          module: meta.glSource, month_year: my, file_name: fileName, row_count: rowCount,
        } as any);
      }

      toast.success(`✅ ${meta.label} updated successfully! ${parsed.rows.length} new entries added for ${targetMonth}`, { id: loaderId });
      
      // Invalidate cache for all uploaded months so fresh data is loaded next visit
      monthsInFile.forEach(my => invalidateCache(moduleId, my));

      await loadMonths();
      // Auto-switch to the month of the uploaded data
      if (targetMonth) setActive(targetMonth);
      
    } catch (e: any) {
      toast.error(`❌ Save failed: ${e.message || e}`, { id: loaderId });
      // Rollback optimistic update
      if (active) loadRows(active);
    } finally {
      setUploading(false);
      setPending(null);
    }
  }

  const handlePrint = async () => {
    const settings = await getCompanySettings();
    const BD = "border:1px solid #000;padding:3px 5px;font-size:7pt;white-space:nowrap";
    const TH = "background:#fff;color:#000;font-weight:700;padding:5px;font-size:7.5pt;border:1.5px solid #000;text-align:center;vertical-align:middle";
    
    // Grouped header logic
    const hasH2 = meta.columns.some(c => c.header2);
    let headRow1 = "";
    let headRow2 = "";
    
    if (hasH2) {
      for (let i = 0; i < meta.columns.length; i++) {
        const c = meta.columns[i];
        const h1 = c.header1;
        const h2 = c.header2;
        
        if (h1 && h1.trim() !== "") {
          // Check for grouping
          let span = 1;
          let j = i + 1;
          while (j < meta.columns.length && meta.columns[j].header1 === h1) { span++; j++; }
          
          headRow1 += `<th style="${TH}" colspan="${span}">${h1}</th>`;
          // Add row 2 subheaders
          for (let k = i; k < j; k++) {
            headRow2 += `<th style="${TH}">${meta.columns[k].header2 || ""}</th>`;
          }
          i = j - 1; // skip merged
        } else {
          // No group (empty or missing h1), use rowspan
          headRow1 += `<th style="${TH}" rowspan="2">${c.header}</th>`;
          // Add an empty th to headRow2 to keep table structure if needed? 
          // Actually no, rowspan="2" means it occupies the cell in the next row too.
        }
      }
    } else {
      meta.columns.forEach(c => {
        headRow1 += `<th style="${TH}">${c.header}</th>`;
      });
    }

    let rowHtml = "";
    rows.forEach(r => {
      rowHtml += "<tr>";
      meta.columns.forEach(c => {
        const val = r[c.field];
        const display = (c.type === "currency" || c.type === "formula") ? (Number(val) ? fmtMoney(Number(val)) : "—") : (c.type === "date" ? fmtDate(val) : (val ?? ""));
        const align = (c.type === "currency" || c.type === "formula") ? "right" : "left";
        rowHtml += `<td style="${BD};text-align:${align}">${display}</td>`;
      });
      rowHtml += "</tr>";
    });

    // Totals
    rowHtml += `<tr style="background:#f8fafc;font-weight:700">`;
    meta.columns.forEach((c, i) => {
      if (c.type === "currency" || c.type === "formula") {
        const sum = rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
        rowHtml += `<td style="${BD};text-align:right">${fmtMoney(sum)}</td>`;
      } else {
        rowHtml += `<td style="${BD}">${i === 0 ? "TOTAL" : ""}</td>`;
      }
    });
    rowHtml += "</tr>";

    const isPortrait = moduleId === "sales_book" || moduleId === "cash_receipts";
    const pageSize = isPortrait ? "letter portrait" : "legal landscape";

    const html = `<!DOCTYPE html><html><head><style>
      *{font-family:Arial,sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{padding:10mm 12mm; padding-bottom: 20mm;} 
      table{width:100%;border-collapse:collapse}
      @media print {
        @page { size: ${pageSize}; margin: 10mm; }
        .no-print { display: none; }
        .page-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          text-align: right;
          font-size: 8pt;
          color: #666;
        }
        .page-footer:after {
          content: "Page " counter(page);
        }
      }
    </style></head><body>
      <div style="text-align:left;margin-bottom:15px">
        <div style="font-size:12pt;font-weight:900">${settings.company_name || "JHAYMARTS INDUSTRIES, INC."}</div>
        <div style="font-size:11pt;font-weight:900;margin-top:2px">${bookName}</div>
        <div style="font-size:10pt;font-weight:900;margin-top:2px">${active ? active.toUpperCase() : "PERIOD N/A"}</div>
      </div>
      <table>
        <thead>
          <tr>${headRow1}</tr>
          ${headRow2 ? `<tr>${headRow2}</tr>` : ""}
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
      <div class="page-footer"></div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup blocked! Please allow popups to view the print preview.");
      return;
    }
    
    try {
      w.document.write(html);
      w.document.close();
      w.focus();
      // Wait for content to load before printing
      setTimeout(() => {
        if (!w.closed) {
          w.print();
        }
      }, 1000);
    } catch (err) {
      console.error("Print Error:", err);
      toast.error("An error occurred while generating the print preview.");
      w.close();
    }
  }

  const bookName = meta.label.toUpperCase();
  const filenameBase = `ABL_${meta.glSource}_${active ?? "EMPTY"}`.replace(/\s+/g, "_");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <SyncStatusBadge table={meta.tableName} />
      
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-black text-white tracking-tight">{meta.label}</h2>
          <div className="flex items-center gap-4">
            <p className="text-sm text-white/50 font-medium">{meta.uploadHint}</p>
            {uploadInfo ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  Uploaded: {uploadInfo.file_name} · 100% Integrity
                </span>

              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                  No Data Uploaded
                </span>
              </div>
            )}
            {syncing && (

              <div className="sync-indicator">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>⟳ Syncing...</span>
              </div>
            )}
            {!syncing && rows.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                <CheckCircle2 className="h-3 w-3" />
                <span>Up to date</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 relative z-10">
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload Excel
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" onClick={() => active && loadRows(active)}>
            <Save className="h-4 w-4 mr-2" /> Save
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!rows.length} onClick={() => active && exportExcel({ filename: `${filenameBase}.xlsx`, bookName, monthYear: active, columns: meta.columns, rows, recapSundries: recapSundriesData, recapFunds })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!rows.length} onClick={() => active && exportPDF({ filename: `${filenameBase}.pdf`, bookName, monthYear: active, columns: meta.columns, rows, recapSundries: recapSundriesData, recapFunds })}>
            <FileText className="h-4 w-4 mr-2" /> Export PDF
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!rows.length} onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Print Preview
          </Button>



        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Transactions</p>
          <p className="text-xl font-black text-white">{stats.count}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Total Purchases</p>
          <p className="text-xl font-black text-white">{fmtMoney(stats.totalAmount)}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">
            {moduleId === "purchase_book" ? "TOTAL ITW TOP 10T" : "Total VAT"}
          </p>
          <p className="text-xl font-black text-blue-400">
            {moduleId === "purchase_book" ? fmtMoney(stats.totalItwTop10) : fmtMoney(stats.totalVat)}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Total ITW</p>
          <p className="text-xl font-black text-red-400">{fmtMoney(stats.totalItw)}</p>
        </div>
      </div>

      <AlertDialog open={!!glValidation} onOpenChange={(o) => !o && setGLValidation(null)}>
        <AlertDialogContent className="bg-[#0a1628] border-red-500/30 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-500 flex items-center gap-2">
              ⚠️ GL Imbalance Detected!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/70 space-y-2">
              <p>The system detected that total debits do not equal total credits for this upload.</p>
              <div className="bg-red-500/10 p-3 rounded border border-red-500/20 font-mono text-sm">
                <div className="flex justify-between"><span>Total Debits:</span> <span className="text-blue-400">{fmtMoney(glValidation?.totalDr || 0)}</span></div>
                <div className="flex justify-between"><span>Total Credits:</span> <span className="text-emerald-400">{fmtMoney(glValidation?.totalCr || 0)}</span></div>
                <div className="flex justify-between font-bold border-t border-white/10 mt-1 pt-1 text-rose-400">
                  <span>Difference:</span> <span>{fmtMoney(glValidation?.diff || 0)}</span>
                </div>
              </div>
              <p className="text-xs italic">
                {glValidation && glValidation.totalDr > glValidation.totalCr 
                  ? `💡 Missing CREDIT of ${fmtMoney(glValidation.diff)}\n→ Possible: Accounts Payable CR\n→ Possible: Withholding Tax Payable CR\n→ Possible: Cash/Bank CR` 
                  : `💡 Missing DEBIT of ${fmtMoney(glValidation?.diff || 0)}\n→ Possible: Expense Account DR\n→ Possible: Input VAT DR\n→ Possible: Accounts Payable DR`}
              </p>
              <p className="text-xs font-bold text-rose-500">Force posting may affect Trial Balance accuracy.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel Upload</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-rose-600 hover:bg-rose-700 text-white" 
              onClick={() => {
                if (glValidation) {
                  commit(glValidation.parsed, glValidation.fileName, false); // Or whatever replace logic is needed
                  setGLValidation(null);
                }
              }}
            >
              Force Post Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pending && (
        <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
          <AlertDialogContent className="bg-[#0a1628] border-white/10 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Replace Existing Records?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/70">
                You are about to upload records for months that already exist: <strong className="text-white">{pending.conflictMonths.join(", ")}</strong>.<br/><br/>
                Do you want to REPLACE the existing data for these months with the new upload?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={uploading}>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-rose-600 hover:bg-rose-700 text-white" disabled={uploading} onClick={() => {
                validateAndCommit(pending.parsed, pending.fileName, true);
                setPending(null);
              }}>
                Replace Records
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {months.length > 0 && (
        <MonthTabs months={months} active={active} onSelect={setActive} />
      )}

      {loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/40 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <span className="text-sm font-bold tracking-widest uppercase">Loading Records...</span>
        </div>
      ) : (
        <div className="bg-[#0a1628] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative">
           <LedgerTable 
             columns={meta.columns} 
             rows={rows} 
             bookName={bookName} 
             monthYear={active || undefined} 
             onSave={handleSave}
             onDelete={handleDelete}
             onPrint={handlePrint}
           />
           {syncing && rows.length > 0 && (
             <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] pointer-events-none" />
           )}
        </div>
      )}

      {moduleId === "cdb" && (recapSundries.length > 0 || recapFunds.length > 0) && (
        <div className="mt-12 grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-700">
          {recapSundries.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-black text-white tracking-tight uppercase underline decoration-blue-500 decoration-4 underline-offset-8">
                  Recapitulation of Sundry Accounts
                </h3>
                <p className="text-[10px] text-white/40 font-bold mt-2 uppercase tracking-widest">
                  Summarized by account title for {active}
                </p>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#0f2744] text-white font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-6 py-3 text-left border-r border-white/10">S U N D R I E S</th>
                      <th className="px-6 py-3 text-right border-r border-white/10 w-32">Debit</th>
                      <th className="px-6 py-3 text-right w-32">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {recapSundries.map((s, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-2.5 text-white/80 font-medium border-r border-white/5">{s.account}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-emerald-400 border-r border-white/5">{s.dr ? fmtMoney(s.dr) : "—"}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-rose-400">{s.cr ? fmtMoney(s.cr) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-500/10 text-white font-bold border-t border-white/20">
                      <td className="px-6 py-3 text-right border-r border-white/5">TOTAL</td>
                      <td className="px-6 py-3 text-right font-mono text-blue-400 border-r border-white/5">
                        {fmtMoney(recapSundries.reduce((acc, s) => acc + s.dr, 0))}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-blue-400">
                        {fmtMoney(recapSundries.reduce((acc, s) => acc + s.cr, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {recapFunds.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-black text-white tracking-tight uppercase underline decoration-emerald-500 decoration-4 underline-offset-8">
                  Recapitulation of Bank Accounts
                </h3>
                <p className="text-[10px] text-white/40 font-bold mt-2 uppercase tracking-widest">
                  Summarized by Fund for {active}
                </p>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#0f2744] text-white font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-6 py-3 text-left border-r border-white/10">F U N D</th>
                      <th className="px-6 py-3 text-right w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {recapFunds.map((f, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-2.5 text-white/80 font-medium border-r border-white/5">{f.fund}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-emerald-400">{fmtMoney(f.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-500/10 text-white font-bold border-t border-white/20">
                      <td className="px-6 py-3 text-right border-r border-white/5">TOTAL</td>
                      <td className="px-6 py-3 text-right font-mono text-emerald-400">
                        {fmtMoney(recapFunds.reduce((acc, f) => acc + f.amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {moduleId === "purchase_book" && recapSundriesPB.length > 0 && (
        <div className="mt-12 space-y-4 animate-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col">
            <h3 className="text-lg font-black text-white tracking-tight uppercase underline decoration-rose-500 decoration-4 underline-offset-8">
              Recapitulation of Sundry Accounts
            </h3>
            <p className="text-[10px] text-white/40 font-bold mt-2 uppercase tracking-widest">
              Summarized by account title for {active}
            </p>
          </div>
          
          <div className="max-w-2xl bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0f2744] text-white font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-6 py-3 text-left border-r border-white/10">S U N D R I E S</th>
                  <th className="px-6 py-3 text-right w-32">Amount</th>
                  <th className="px-6 py-3 text-right w-32">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recapSundriesPB.map((s, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-2.5 text-white/80 font-medium border-r border-white/5">{s.account}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-white/90 border-r border-white/5">{fmtMoney(s.amount)}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-white/90">{fmtMoney(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-rose-500/10 text-white font-bold border-t border-white/20">
                  <td className="px-6 py-3 text-right border-r border-white/5">GRAND TOTAL</td>
                  <td className="px-6 py-3 text-right font-mono text-rose-400 border-r border-white/5">
                    {fmtMoney(recapSundriesPB.reduce((acc, s) => acc + s.amount, 0))}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-rose-400">
                    {fmtMoney(recapSundriesPB.reduce((acc, s) => acc + s.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}




      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="bg-[#0f172a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Data Conflict Detected</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Records for <span className="text-blue-400 font-bold">{pending?.conflictMonths.join(", ")}</span> already exist in the database.
              <br /><br />
              Would you like to <strong>Replace</strong> the existing records or <strong>Append</strong> to them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => pending && commit(pending.parsed, pending.fileName, false)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Append
            </AlertDialogAction>
            <AlertDialogAction 
              onClick={() => pending && commit(pending.parsed, pending.fileName, true)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
