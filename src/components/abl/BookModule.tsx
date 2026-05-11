import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES, ModuleId } from "@/lib/abl/config";
import { sortMonthYears, monthYearToTabLabel } from "@/lib/abl/format";
import { parseCDB, parsePurchaseBook, parseSalesBook, parseCashReceipts, ParsedResult } from "@/lib/abl/parsers";
import { exportExcel, exportPDF } from "@/lib/abl/exporters";
import { MonthTabs } from "./MonthTabs";
import { LedgerTable } from "./LedgerTable";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, FileText, Save, Loader2, CheckCircle2 } from "lucide-react";
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

export default function BookModule({ moduleId }: { moduleId: ModuleId }) {
  const meta = MODULES[moduleId];
  const [months, setMonths] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<{ parsed: ParsedResult<any>; fileName: string; conflictMonths: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMonths = useCallback(async () => {
    const { data } = await supabase.from(meta.tableName).select("month_year").limit(10000);
    const list = sortMonthYears((data ?? []).map((r: any) => r.month_year));
    setMonths(list);
    if (list.length && (!active || !list.includes(active))) setActive(list[list.length - 1]);
    if (!list.length) { setActive(null); setRows([]); }
  }, [meta.tableName, active]);

  const loadRows = useCallback(async (my: string) => {
    setLoading(true);
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

      if (moduleId === "cdb") {
        // Fetch sundries for CDB
        const { data: sundries } = await supabase
          .from("cdb_sundries")
          .select("*")
          .in("cdb_entry_id", entryIds);
        
        const sundriesMap = (sundries ?? []).reduce((acc: any, s: any) => {
          if (!acc[s.cdb_entry_id]) acc[s.cdb_entry_id] = [];
          acc[s.cdb_entry_id].push(s);
          return acc;
        }, {});

        const resultRows: any[] = [];
        for (const tx of list) {
          const txSundries = sundriesMap[tx.id] || [];
          // Base row with mapped distributions
          const baseRow = {
            ...tx,
            date: tx.entry_date,
            voucher_no: tx.check_voucher_no || tx.petty_cash_voucher,
            account: tx.fund ? `CIB:${tx.fund}` : "",
            debit: null,
            credit: tx.cash_amount,
            sundries_acct_title: txSundries[0]?.acct_title || "",
            sundries_dr: txSundries[0]?.dr || null,
            sundries_cr: txSundries[0]?.cr || null,
          };
          resultRows.push(baseRow);

          // Add extra sundries as sub-rows
          for (let i = 1; i < txSundries.length; i++) {
            const s = txSundries[i];
            resultRows.push({
              ...tx,
              id: `${tx.id}-sundry-${i}`,
              entry_date: tx.entry_date, 
              payee: tx.payee,
              check_voucher_no: tx.check_voucher_no,
              ...Object.fromEntries(meta.columns.filter(c => c.type === 'currency').map(c => [c.field, null])),
              sundries_acct_title: s.acct_title,
              sundries_dr: s.dr,
              sundries_cr: s.cr,
              _is_sub_row: true
            });
          }
        }
        setRows(resultRows);
      } else if (moduleId === "purchase_book") {
        // Fetch sundries for Purchase Book
        const { data: sundries } = await supabase
          .from("pb_sundries")
          .select("*")
          .in("pb_entry_id", entryIds);
        
        const sundriesMap = (sundries ?? []).reduce((acc: any, s: any) => {
          if (!acc[s.pb_entry_id]) acc[s.pb_entry_id] = [];
          acc[s.pb_entry_id].push(s);
          return acc;
        }, {});

        const resultRows: any[] = [];
        for (const tx of list) {
          const txSundries = sundriesMap[tx.id] || [];
          const baseRow = {
            ...tx,
            sundries_acct_title: txSundries[0]?.acct_title || "",
            sundries_amount: txSundries[0]?.amount || null,
          };
          resultRows.push(baseRow);

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
        setRows(resultRows);
      } else {
        setRows(list);
      }
    } catch (e) {
      console.error("Error loading rows:", e);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [meta.tableName, meta.columns, moduleId]);

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel(`${moduleId}_realtime`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: meta.tableName },
        (payload) => {
          console.log('Real-time change received:', payload);
          loadMonths();
          if (active) loadRows(active);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [moduleId, meta.tableName, active, loadMonths, loadRows]);

  useEffect(() => { loadMonths(); }, [loadMonths]);
  useEffect(() => { if (active) loadRows(active); }, [active, loadRows]);

  async function handleFile(file: File) {
    setUploading(true);
    const loaderId = toast.loading(`Processing ${file.name}...`);
    try {
      const buf = await file.arrayBuffer();
      const parsed = PARSERS[moduleId](buf);
      const monthsInFile = Array.from(new Set(parsed.rows.map((r: any) => r.month_year))).filter(Boolean) as string[];
      
      if (!monthsInFile.length) throw new Error("No valid transactions found in file.");
      
      const { data: existing } = await supabase
        .from(meta.tableName)
        .select("month_year")
        .in("month_year", monthsInFile);
      
      const conflictMonths = Array.from(new Set((existing ?? []).map((r: any) => r.month_year)));
      
      if (conflictMonths.length > 0) {
        setPending({ parsed, fileName: file.name, conflictMonths });
        toast.dismiss(loaderId);
      } else {
        await commit(parsed, file.name);
      }
    } catch (e: any) {
      toast.error(`Upload error: ${e.message || e}`, { id: loaderId });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
          const { data: existing } = await supabase.from(meta.tableName).select("id").eq("month_year", my);
          const ids = (existing ?? []).map((r: any) => r.id);
          
          if (ids.length > 0) {
            const sundryTable = moduleId === "cdb" ? "cdb_sundries" : "pb_sundries";
            const fk = moduleId === "cdb" ? "cdb_entry_id" : "pb_entry_id";
            await supabase.from(sundryTable).delete().in(fk, ids);
          }

          await supabase.from(meta.tableName).delete().eq("month_year", my);
          await supabase.from("uploaded_files").delete().eq("module", meta.glSource).eq("month_year", my);
        }
        for (const my of glMonthsInFile) {
          await supabase.from("gl_entries").delete().eq("source_module", meta.glSource).eq("month_year", my);
        }
      }
      
      const BATCH = 100;
      for (let i = 0; i < parsed.rows.length; i += BATCH) {
        const chunk = parsed.rows.slice(i, i + BATCH);
        const { error } = await supabase.from(meta.tableName).insert(chunk as any);
        if (error) throw error;
      }
      
      if (parsed.sundries && parsed.sundries.length > 0) {
        const sundryTable = moduleId === "cdb" ? "cdb_sundries" : "pb_sundries";
        for (let i = 0; i < parsed.sundries.length; i += BATCH) {
          const chunk = parsed.sundries.slice(i, i + BATCH);
          const { error } = await supabase.from(sundryTable).insert(chunk as any);
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
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!rows.length} onClick={() => active && exportExcel({ filename: `${filenameBase}.xlsx`, bookName, monthYear: active, columns: meta.columns, rows })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!rows.length} onClick={() => active && exportPDF({ filename: `${filenameBase}.pdf`, bookName, monthYear: active, columns: meta.columns, rows })}>
            <FileText className="h-4 w-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

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
           <LedgerTable columns={meta.columns} rows={rows} />
           {syncing && rows.length > 0 && (
             <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] pointer-events-none" />
           )}
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
