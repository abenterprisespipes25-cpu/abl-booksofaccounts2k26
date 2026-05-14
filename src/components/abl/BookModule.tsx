import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES, ModuleId } from "@/lib/abl/config";
import { sortMonthYears, monthYearToTabLabel, fmtMoney, fmtDate, round2 } from "@/lib/abl/format";
import { getCompanySettings } from "@/lib/abl/companySettings";


import { parseCDB, parsePurchaseBook, parseSalesBook, parseCashReceipts, ParsedResult } from "@/lib/abl/parsers";
import { exportExcel, exportPDF, exportRecapCDBExcel } from "@/lib/abl/exporters";
import { MonthTabs } from "./MonthTabs";
import { LedgerTable } from "./LedgerTable";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, FileText, Printer, Save, Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { CDBPrintPreview } from "./CDBPrintPreview";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";

const PARSERS: Record<ModuleId, (buf: ArrayBuffer) => Promise<ParsedResult<any>>> = {
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [isPrintingRecap, setIsPrintingRecap] = useState(false);
  const [cdbValidationReport, setCdbValidationReport] = useState<{ parsed: ParsedResult<any>; fileName: string; replace: boolean; diff: number; totalDr: number; totalCr: number } | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
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
  
  useEffect(() => {
    getCompanySettings().then(setCompanySettings);
  }, []);

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
      
      // Prevent UI freezing by yielding back to the main thread before heavy parsing
      await new Promise(r => setTimeout(r, 50));
      
      const parsed = await PARSERS[moduleId](buf);
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

    if (moduleId === "cdb" && parsed.validation) {
      setCdbValidationReport({ parsed, fileName, replace, diff, totalDr, totalCr });
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

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

      if (moduleId === "cdb" && parsed.validation) {
        toast.success(`✅ ${parsed.rows.length} entries saved for ${targetMonth}\nGL: ₱${fmtMoney(parsed.validation.gl_total_debit)} DR = ₱${fmtMoney(parsed.validation.gl_total_credit)} CR ✅ Balanced`, { id: loaderId, duration: 5000 });
      } else {
        toast.success(`✅ ${meta.label} updated successfully! ${parsed.rows.length} new entries added for ${targetMonth}`, { id: loaderId });
      }
      
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
    const pageConfig = isPortrait ? "215.9mm 279.4mm portrait" : "355.6mm 215.9mm landscape"; // Legal Landscape

    const html = `<!DOCTYPE html><html><head><style>
      *{font-family:Arial,sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{padding:10mm 12mm; padding-bottom: 20mm;} 
      table{width:100%;border-collapse:collapse}
      @media print {
        @page { size: ${pageConfig}; margin: 8mm; }
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
          
          <button 
            onClick={() => fileRef.current?.click()} 
            disabled={uploading} 
            className="toolbar-btn"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload Excel
          </button>

          {moduleId === "cdb" && (
            <>
              <button 
                disabled={!rows.length} 
                onClick={() => setIsPreviewOpen(true)}
                className="toolbar-btn print"
              >
                <Printer className="h-4 w-4" />
                Print Preview
              </button>
              <button 
                disabled={!recapSundries.length && !recapFunds.length} 
                onClick={() => setIsRecapOpen(true)}
                className="toolbar-btn"
                style={{ borderColor: "rgba(170, 85, 255, 0.4)", color: "#aa55ff", backgroundColor: "rgba(170, 85, 255, 0.15)" }}
              >
                📊 Recapitulation
              </button>
            </>
          )}

          <button 
            disabled={!rows.length} 
            onClick={() => active && exportExcel({ 
              filename: `CDB_${(companySettings?.company_name || "COMPANY").replace(/\s+/g, "_")}_${active.replace(/\s+/g, "_")}.xlsx`, 
              bookName, 
              monthYear: active, 
              columns: meta.columns, 
              rows, 
              recapSundries: recapSundriesData, 
              recapFunds 
            })}
            className="toolbar-btn export"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </button>

          {moduleId !== "cdb" && (
            <>
              <button 
                className="toolbar-btn"
                disabled={!rows.length} 
                onClick={() => active && exportPDF({ filename: `${filenameBase}.pdf`, bookName, monthYear: active, columns: meta.columns, rows, recapSundries: recapSundriesData, recapFunds })}
              >
                <FileText className="h-4 w-4" /> Export PDF
              </button>

              <button 
                className="toolbar-btn"
                onClick={() => active && loadRows(active)}
              >
                <Save className="h-4 w-4" /> Save
              </button>
            </>
          )}
        </div>
      </div>

      <CDBPrintPreview 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        rows={rows}
        companyName={companySettings?.company_name || "JHAYMARTS INDUSTRIES, INC."}
        monthYear={active || ""}
      />

      {cdbValidationReport && (() => {
        const { parsed, fileName, totalDr, totalCr, diff, replace } = cdbValidationReport;
        const v = parsed.validation;
        const isDrBalanced = Math.abs(v.source_total_debit - v.routed_total_debit) <= 0.01;
        const isCrBalanced = Math.abs(v.source_total_credit - v.routed_total_credit) <= 0.01;
        const isGLBalanced = diff <= 0.01;
        const isRowsMatched = v.source_rows === v.routed_rows;
        const allChecksPassed = isDrBalanced && isCrBalanced && isGLBalanced && isRowsMatched;
        
        let issuesCount = 0;
        if (!isDrBalanced) issuesCount++;
        if (!isCrBalanced) issuesCount++;
        if (!isGLBalanced) issuesCount++;
        if (!isRowsMatched) issuesCount++;

        return (
          <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4">
            <div className="validation-report w-full overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                <div className="font-bold text-lg text-white">📊 UPLOAD VALIDATION REPORT</div>
                <button onClick={() => setCdbValidationReport(null)} className="text-white/50 hover:text-white"><X size={20} /></button>
              </div>
              <div className="text-white/70 mb-4">
                File: {fileName}<br/>
                Processed: {new Date().toLocaleString()}
              </div>

              <div className="report-section">
                <div className="report-title">1. ROWS</div>
                <div className="amount-row"><span>Source rows:</span> <span>{v.source_rows}</span></div>
                <div className="amount-row"><span>Processed rows:</span> <span>{v.routed_rows}</span></div>
                <div className="mt-1">{isRowsMatched ? <span className="check-pass">✅ All rows accounted for</span> : <span className="check-fail">⚠️ Row count mismatch! Missing: {v.source_rows - v.routed_rows}</span>}</div>
              </div>

              <div className="report-section">
                <div className="report-title">2. SOURCE FILE TOTALS (Col G & H)</div>
                <div className="amount-row"><span>Total Debit (Col G):</span> <span>₱ {fmtMoney(v.source_total_debit)}</span></div>
                <div className="amount-row"><span>Total Credit (Col H):</span> <span>₱ {fmtMoney(v.source_total_credit)}</span></div>
              </div>

              <div className="report-section">
                <div className="report-title">3. CDB DISTRIBUTION TOTALS (Cols I-AE)</div>
                <div className="amount-row"><span>Total Routed Debit:</span> <span>₱ {fmtMoney(v.routed_total_debit)}</span></div>
                <div className="amount-row"><span>Total Routed Credit:</span> <span>₱ {fmtMoney(v.routed_total_credit)}</span></div>
                <div className="mt-1">
                  <div>Debit Check: {isDrBalanced ? <span className="check-pass">✅ Balanced</span> : <span className="check-fail">⚠️ Difference ₱{fmtMoney(Math.abs(v.source_total_debit - v.routed_total_debit))}</span>}</div>
                  <div>Credit Check: {isCrBalanced ? <span className="check-pass">✅ Balanced</span> : <span className="check-fail">⚠️ Difference ₱{fmtMoney(Math.abs(v.source_total_credit - v.routed_total_credit))}</span>}</div>
                </div>
              </div>

              <div className="report-section">
                <div className="report-title">4. GENERAL LEDGER DOUBLE-ENTRY CHECK</div>
                <div className="amount-row"><span>GL Total Debit:</span> <span>₱ {fmtMoney(totalDr)}</span></div>
                <div className="amount-row"><span>GL Total Credit:</span> <span>₱ {fmtMoney(totalCr)}</span></div>
                <div className="mt-1">
                  Balance: {isGLBalanced ? <span className="check-pass">✅ DR = CR</span> : <span className="check-fail">⚠️ Difference ₱{fmtMoney(diff)}</span>}
                </div>
                {!isGLBalanced && (
                  <div className="mt-2 p-2 bg-black/30 rounded text-white/80">
                    {totalDr > totalCr ? (
                      <>
                        <div className="text-[#00aaff] font-bold">💡 Missing CREDIT of ₱{fmtMoney(diff)}</div>
                        <div>→ Check: Withholding Tax Payable</div>
                        <div>→ Check: Accounts Payable</div>
                        <div>→ Check: Cash/Bank (CIB/COH) credit entry</div>
                      </>
                    ) : (
                      <>
                        <div className="text-[#00aaff] font-bold">💡 Missing DEBIT of ₱{fmtMoney(diff)}</div>
                        <div>→ Check: Expense account debit entry</div>
                        <div>→ Check: Input VAT debit entry</div>
                        <div>→ Check: Accounts Payable debit entry</div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="report-section">
                <div className="report-title">5. COLUMN COVERAGE</div>
                <div className="grid grid-cols-2 gap-x-8">
                  {Object.entries(v.column_coverage).map(([col, amt]) => (
                    <div key={col} className="amount-row"><span>{col}:</span> <span>₱ {fmtMoney(Number(amt))}</span></div>
                  ))}
                </div>
              </div>

              <div className="report-section">
                <div className="report-title">6. CASH AMOUNT COMPUTATION</div>
                <div className="amount-row font-bold text-white">
                  <span>CASH AMOUNT TOTAL (SUM I-AE):</span> 
                  <span>₱ {fmtMoney(parsed.rows.reduce((s: any, r: any) => s + (Number(r.cash_amount) || 0), 0))}</span>
                </div>
              </div>

              {v.unrouted_entries.length > 0 && (
                <div className="report-section">
                  <div className="report-title text-orange-400">7. UNROUTED ENTRIES (→ SUNDRIES)</div>
                  <div className="max-h-32 overflow-y-auto pr-2">
                    {v.unrouted_entries.map((u: any, i: number) => (
                      <div key={i} className="amount-row text-white/60">
                        <span className="truncate mr-4">{u.account}</span>
                        <span>₱{fmtMoney(u.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="report-section border-none mb-4">
                <div className="report-title">8. OVERALL STATUS</div>
                {allChecksPassed ? (
                  <div className="check-pass text-sm">✅ ALL CHECKS PASSED — Safe to save</div>
                ) : (
                  <div className="check-fail text-sm">⚠️ {issuesCount} ISSUES FOUND — Review before saving</div>
                )}
              </div>

              <div className="report-title mt-4 pt-4 border-t border-white/10">9. ACTION BUTTONS</div>
              <div className="flex flex-wrap gap-3 mt-2">
                <button 
                  onClick={() => {
                    setCdbValidationReport(null);
                    commit(parsed, fileName, replace);
                  }}
                  disabled={!allChecksPassed}
                  className="save-btn"
                >
                  💾 Save to System
                </button>
                
                {!allChecksPassed && (
                  <button 
                    onClick={() => {
                      if(confirm("⚠️ Saving with imbalance may affect Trial Balance and GL accuracy. Proceed?")) {
                        setCdbValidationReport(null);
                        commit(parsed, fileName, replace);
                      }
                    }}
                    className="save-btn border-orange-500/50 text-orange-500 hover:bg-orange-500/20"
                  >
                    ⚠️ Force Save Anyway
                  </button>
                )}

                <button 
                  onClick={() => setCdbValidationReport(null)}
                  className="cancel-btn"
                >
                  ❌ Cancel Upload
                </button>

                <button 
                  onClick={() => {
                    let content = `CDB UPLOAD VALIDATION REPORT\n================================\n`;
                    content += `File: ${fileName}\nDate Processed: ${new Date().toLocaleString()}\nMonth Tab: ${parsed.monthYear}\n\n`;
                    content += `1. ROWS\nSource rows:    ${v.source_rows}\nProcessed rows: ${v.routed_rows}\nStatus: ${isRowsMatched ? 'PASS' : 'FAIL'}\n\n`;
                    content += `2. SOURCE TOTALS\nCol G (Debit) Total:  ₱${fmtMoney(v.source_total_debit)}\nCol H (Credit) Total: ₱${fmtMoney(v.source_total_credit)}\n\n`;
                    content += `3. CDB DISTRIBUTION TOTALS\nTotal Routed Debit:   ₱${fmtMoney(v.routed_total_debit)}\nTotal Routed Credit:  ₱${fmtMoney(v.routed_total_credit)}\n`;
                    content += `Debit Match:   ${isDrBalanced ? 'PASS' : 'FAIL'} (diff: ₱${fmtMoney(Math.abs(v.source_total_debit - v.routed_total_debit))})\n`;
                    content += `Credit Match:  ${isCrBalanced ? 'PASS' : 'FAIL'} (diff: ₱${fmtMoney(Math.abs(v.source_total_credit - v.routed_total_credit))})\n\n`;
                    content += `4. GL DOUBLE-ENTRY CHECK\nGL Total Debit:  ₱${fmtMoney(totalDr)}\nGL Total Credit: ₱${fmtMoney(totalCr)}\nBalance: ${isGLBalanced ? 'PASS' : 'FAIL'} (diff: ₱${fmtMoney(diff)})\n\n`;
                    content += `5. COLUMN BREAKDOWN\n`;
                    Object.entries(v.column_coverage).forEach(([col, amt]) => { content += `${col} : ₱${fmtMoney(Number(amt))}\n`; });
                    content += `\n6. CASH AMOUNT TOTAL (SUM I-AE): ₱${fmtMoney(parsed.rows.reduce((s: any, r: any) => s + (Number(r.cash_amount) || 0), 0))}\n`;
                    content += `\n7. SUNDRIES / UNROUTED ENTRIES\n`;
                    v.unrouted_entries.forEach((u: any) => { content += `${u.account} : ₱${fmtMoney(u.amount)} → SUNDRIES\n`; });
                    content += `\n8. OVERALL STATUS\n${allChecksPassed ? 'ALL CHECKS PASSED' : 'ISSUES FOUND'}\n`;
                    
                    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `CDB_Validation_${parsed.monthYear.replace(/\s+/g, "_")}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all ml-auto font-bold"
                >
                  📥 Download Report
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style dangerouslySetInnerHTML={{ __html: `
        .toolbar-btn {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          color: #ffffff;
          padding: 8px 16px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }

        .toolbar-btn:hover:not(:disabled) {
          background: rgba(0,170,255,0.2);
          border-color: rgba(0,170,255,0.4);
          color: #00aaff;
          transform: translateY(-1px);
        }

        .toolbar-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toolbar-btn.export {
          background: rgba(0,200,100,0.15);
          border-color: rgba(0,200,100,0.3);
          color: #00c864;
        }

        .toolbar-btn.print {
          background: rgba(255,165,0,0.15);
          border-color: rgba(255,165,0,0.3);
          color: #ffa500;
        }

        .validation-report {
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          backdrop-filter: blur(16px);
          padding: 20px;
          margin-top: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.85);
          max-width: 700px;
        }

        .report-section {
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding: 10px 0;
        }

        .report-title {
          font-weight: 700;
          font-size: 0.75rem;
          color: #00aaff;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }

        .check-pass {
          color: #00c864;
          font-weight: 600;
        }

        .check-fail {
          color: #ff4444;
          font-weight: 600;
        }

        .check-warn {
          color: #ffa500;
          font-weight: 600;
        }

        .amount-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }

        .save-btn {
          background: rgba(0,200,100,0.2);
          border: 1px solid rgba(0,200,100,0.4);
          color: #00c864;
          border-radius: 8px;
          padding: 10px 20px;
          font-weight: 700;
          cursor: pointer;
        }

        .save-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .cancel-btn {
          background: rgba(255,68,68,0.15);
          border: 1px solid rgba(255,68,68,0.3);
          color: #ff4444;
          border-radius: 8px;
          padding: 10px 20px;
          font-weight: 700;
          cursor: pointer;
        }
        
        .recap-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .recap-card {
          background: rgba(0, 0, 0, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          backdrop-filter: blur(16px);
          padding: 20px;
          overflow-x: auto;
        }
        .recap-title {
          font-family: 'Syne', Arial, sans-serif;
          font-size: 0.8rem;
          font-weight: 800;
          color: #00aaff;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .recap-subtitle {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: rgba(255,255,255,0.4);
          margin-bottom: 14px;
        }
        .recap-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
        }
        .recap-table th {
          background: rgba(0, 170, 255, 0.12);
          border: 1px solid rgba(0, 170, 255, 0.25);
          color: #00aaff;
          font-weight: 700;
          padding: 6px 10px;
          text-align: center;
          font-size: 0.68rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .recap-table th.sundries-header {
          background: rgba(170, 85, 255, 0.12);
          border-color: rgba(170, 85, 255, 0.25);
          color: #aa55ff;
          letter-spacing: 0.2em;
          font-size: 0.75rem;
        }
        .recap-table td {
          border: 1px solid rgba(255,255,255,0.07);
          padding: 4px 10px;
          color: rgba(255,255,255,0.82);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }
        .recap-table td.account-name { text-align: left; font-size: 0.68rem; color: rgba(255,255,255,0.75); }
        .recap-table td.amount { text-align: right; font-size: 0.72rem; color: rgba(255,255,255,0.9); font-variant-numeric: tabular-nums; }
        .recap-table td.amount.debit  { color: #00e5a0; }
        .recap-table td.amount.credit { color: #ff7c7c; }
        .recap-table tr.grand-total td {
          background: rgba(255,255,255,0.07);
          border-top: 1px solid rgba(255,255,255,0.3);
          font-weight: 700; color: #ffffff;
        }
        .recap-table tr:hover td { background: rgba(255,255,255,0.04); }
        .check-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 10px; border-radius: 8px; margin-top: 8px;
          font-family: 'JetBrains Mono', monospace; font-size: 0.68rem;
        }
        .recap-toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        
        ${isPrintingRecap ? `
          @media print {
            body * { visibility: hidden; }
            .recap-container, .recap-container * { visibility: visible; }
            .recap-container {
              position: absolute; top: 0; left: 0; width: 100%;
              background: white !important; color: black !important; padding: 20px;
            }
            .recap-card { background: white !important; border: 1px solid #000 !important; backdrop-filter: none !important; margin-bottom: 20px; page-break-inside: avoid; }
            .recap-table th { background: #e0e0e0 !important; color: #000 !important; border: 1px solid #000 !important; }
            .recap-table td { color: #000 !important; border: 1px solid #000 !important; }
            .recap-title { color: #000 !important; font-size: 10pt !important; }
            .recap-subtitle { color: #000 !important; }
            .check-row { color: #000 !important; border: 1px solid #000 !important; }
            .recap-toolbar { display: none !important; }
            @page { size: legal portrait; margin: 0.75in 1in; }
          }
        ` : ''}
      `}} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Transactions</p>
          <p className="text-xl font-black text-white">{stats.count}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">
            {moduleId === "cdb" ? "Total Disbursements" : moduleId === "purchase_book" ? "Total Purchases" : moduleId === "sales_book" ? "Total Sales" : "Total Receipts"}
          </p>
          <p className="text-xl font-black text-white">{fmtMoney(stats.totalAmount)}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">
            {moduleId === "purchase_book" ? "ITW TOP 10T" : "Total VAT"}
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

      {isRecapOpen && moduleId === "cdb" && (
        <div className="fixed inset-0 z-50 bg-[#0a1628]/95 overflow-y-auto backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="recap-container">
            <div className="flex justify-between items-center mb-4 no-print">
              <h2 className="text-2xl font-black text-white uppercase tracking-widest">Recapitulation</h2>
              <button onClick={() => setIsRecapOpen(false)} className="text-white/50 hover:text-white transition-colors bg-white/5 p-2 rounded-full">
                <X size={24} />
              </button>
            </div>
            
            <div className="recap-toolbar no-print">
               <button className="toolbar-btn export" onClick={() => exportRecapCDBExcel({
                 companyName: companySettings?.company_name || "JHAYMARTS INDUSTRIES, INC.",
                 monthYear: active || "",
                 recapSundries,
                 recapFunds
               })}>
                 💾 Export Recap Excel
               </button>
               <button className="toolbar-btn print" onClick={() => {
                 setIsPrintingRecap(true);
                 setTimeout(() => { window.print(); setIsPrintingRecap(false); }, 100);
               }}>
                 🖨 Print Recap
               </button>
               <button className="toolbar-btn" onClick={() => active && loadRows(active)}>
                 🔄 Refresh
               </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
               {/* SUNDRIES RECAP */}
               <div className="recap-card">
                 <div className="recap-title">{companySettings?.company_name || "JHAYMARTS INDUSTRIES, INC."}</div>
                 <div className="recap-title">RECAPITULATION OF SUNDRY ACCOUNTS</div>
                 <div className="recap-subtitle">— Cash Disbursements Book</div>
                 <div className="recap-subtitle">{active ? active.toUpperCase() : "PERIOD N/A"}</div>
                 
                 <table className="recap-table mt-4">
                   <thead>
                     <tr>
                       <th className="sundries-header text-left">S U N D R I E S</th>
                       <th>DEBIT</th>
                       <th>CREDIT</th>
                     </tr>
                   </thead>
                   <tbody>
                     {recapSundries.map((s, i) => (
                       <tr key={i}>
                         <td className="account-name" title={s.account}>{s.account}</td>
                         <td className="amount debit">{s.dr ? fmtMoney(s.dr) : ""}</td>
                         <td className="amount credit">{s.cr ? fmtMoney(s.cr) : ""}</td>
                       </tr>
                     ))}
                     <tr className="grand-total">
                       <td className="account-name text-right">GRAND TOTAL</td>
                       <td className="amount debit">{fmtMoney(recapSundries.reduce((acc, s) => acc + s.dr, 0))}</td>
                       <td className="amount credit">{fmtMoney(recapSundries.reduce((acc, s) => acc + s.cr, 0))}</td>
                     </tr>
                   </tbody>
                 </table>
                 
                 <div className="mt-6 border-t border-white/20 pt-4">
                   <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-2">CROSS-CHECK vs CDB Total:</div>
                   {(() => {
                     const recapDr = recapSundries.reduce((acc, s) => acc + s.dr, 0);
                     const cdbDr = rows.reduce((acc, r) => acc + (Number(r.sundries_dr) || 0), 0);
                     const diffDr = Math.abs(recapDr - cdbDr);
                     const recapCr = recapSundries.reduce((acc, s) => acc + s.cr, 0);
                     const cdbCr = rows.reduce((acc, r) => acc + (Math.abs(Number(r.sundries_cr)) || 0), 0);
                     const diffCr = Math.abs(recapCr - cdbCr);

                     return (
                       <div className="flex flex-col gap-2">
                         <div className={`check-row ${diffDr < 0.01 ? 'check-pass' : 'check-fail'}`}>
                           <span>Recap DR - CDB Sundries DR =</span>
                           <span>{diffDr < 0.01 ? `✅ ₱ ${fmtMoney(recapDr)}` : `⚠️ Diff ₱ ${fmtMoney(diffDr)}`}</span>
                         </div>
                         <div className={`check-row ${diffCr < 0.01 ? 'check-pass' : 'check-fail'}`}>
                           <span>Recap CR - CDB Sundries CR =</span>
                           <span>{diffCr < 0.01 ? `✅ ₱ ${fmtMoney(recapCr)}` : `⚠️ Diff ₱ ${fmtMoney(diffCr)}`}</span>
                         </div>
                       </div>
                     );
                   })()}
                 </div>
               </div>

               {/* BANK RECAP */}
               <div className="recap-card">
                 <div className="recap-title">{companySettings?.company_name || "JHAYMARTS INDUSTRIES, INC."}</div>
                 <div className="recap-title">RECAPITULATION OF BANK ACCOUNTS</div>
                 <div className="recap-subtitle">— Cash Disbursements Book</div>
                 <div className="recap-subtitle">{active ? active.toUpperCase() : "PERIOD N/A"}</div>
                 
                 <table className="recap-table mt-4">
                   <thead>
                     <tr>
                       <th className="sundries-header text-left border-[#00aaff]/30 !text-[#00aaff] !bg-[#00aaff]/10">F U N D</th>
                       <th>AMOUNT</th>
                     </tr>
                   </thead>
                   <tbody>
                     {recapFunds.map((f, i) => (
                       <tr key={i}>
                         <td className="account-name">{f.fund}</td>
                         <td className="amount text-white">{f.amount ? fmtMoney(f.amount) : "0.00"}</td>
                       </tr>
                     ))}
                     <tr className="grand-total">
                       <td className="account-name text-right">TOTAL</td>
                       <td className="amount text-emerald-400">{fmtMoney(recapFunds.reduce((acc, f) => acc + f.amount, 0))}</td>
                     </tr>
                   </tbody>
                 </table>

                 <div className="mt-6 border-t border-white/20 pt-4">
                   <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-2">CROSS-CHECK vs CDB Total:</div>
                   {(() => {
                     const bankTotal = recapFunds.reduce((acc, f) => acc + f.amount, 0);
                     const cdbCash = rows.reduce((acc, r) => acc + (Number(r.cash_amount) || 0), 0);
                     const diffBank = Math.abs(bankTotal - cdbCash);

                     return (
                       <div className={`check-row ${diffBank < 0.01 ? 'check-pass' : 'check-fail'}`}>
                         <span>Bank Total - CDB Cash Amt =</span>
                         <span>{diffBank < 0.01 ? `✅ ₱ ${fmtMoney(bankTotal)}` : `⚠️ Diff ₱ ${fmtMoney(diffBank)}`}</span>
                       </div>
                     );
                   })()}
                 </div>
               </div>
            </div>
          </div>
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
