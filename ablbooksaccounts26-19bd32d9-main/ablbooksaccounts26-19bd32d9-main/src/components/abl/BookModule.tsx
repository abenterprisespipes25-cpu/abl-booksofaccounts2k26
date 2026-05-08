import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES, ModuleId } from "@/lib/abl/config";
import { sortMonthYears, monthYearToTabLabel } from "@/lib/abl/format";
import { parseCDB, parsePurchaseBook, parseSalesBook, parseCashReceipts, ParsedResult } from "@/lib/abl/parsers";
import { exportExcel, exportPDF } from "@/lib/abl/exporters";
import { MonthTabs } from "./MonthTabs";
import { LedgerTable } from "./LedgerTable";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, FileText, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [pending, setPending] = useState<{ parsed: ParsedResult<any>; fileName: string; conflictMonths: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadMonths() {
    const { data } = await supabase.from(meta.tableName).select("month_year").limit(10000);
    const list = sortMonthYears((data ?? []).map((r: any) => r.month_year));
    setMonths(list);
    if (list.length && (!active || !list.includes(active))) setActive(list[list.length - 1]);
    if (!list.length) { setActive(null); setRows([]); }
  }

  async function loadRows(my: string) {
    setLoading(true);
    try {
      const { data } = await supabase
        .from(meta.tableName)
        .select("*")
        .eq("month_year", my)
        .order("entry_date", { ascending: true })
        .limit(5000);
      const list = data ?? [];
      const subKey = moduleId === "cdb" || moduleId === "purchase_book" ? "sundries_acct_title" : null;
      const sortKey = moduleId === "cdb" ? "check_voucher_no" : moduleId === "purchase_book" ? "invoice_no" : null;
      const parentMarker = moduleId === "cdb" ? "check_no" : moduleId === "purchase_book" ? "invoice_no" : null;
      
      if (sortKey && subKey && parentMarker) {
        const groups: any[][] = [];
        let cur: any[] = [];
        for (const r of list) {
          const isSub = !String(r[parentMarker] ?? "").trim() && String(r[subKey] ?? "").trim() !== "";
          if (!isSub) { if (cur.length) groups.push(cur); cur = [r]; } else { cur.push(r); }
        }
        if (cur.length) groups.push(cur);
        
        const natural = (a: string, b: string) => {
          const seg = (s: string) => String(s ?? "").replace(/[^\w]/g, " ").trim().split(/(\d+)/).filter(Boolean).map(x => /^\d+$/.test(x) ? parseInt(x, 10) : x.toLowerCase());
          const sa = seg(a), sb = seg(b), L = Math.max(sa.length, sb.length);
          for (let i = 0; i < L; i++) { const x = sa[i] ?? "", y = sb[i] ?? ""; if (x === y) continue; if (typeof x === "number" && typeof y === "number") return x - y; if (typeof x === "number") return -1; if (typeof y === "number") return 1; return x < y ? -1 : 1; }
          return 0;
        };
        
        groups.sort((g1, g2) => {
          const a = g1[0], b = g2[0];
          const d = String(a.entry_date ?? "").localeCompare(String(b.entry_date ?? ""));
          if (d !== 0) return d;
          const sk = natural(String(a[sortKey] ?? ""), String(b[sortKey] ?? ""));
          if (sk !== 0) return sk;
          return String(a.payee ?? a.supplier ?? "").localeCompare(String(b.payee ?? b.supplier ?? ""));
        });
        setRows(groups.flat());
      } else {
        setRows(list);
      }
    } catch (e) {
      console.error("Error loading rows:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMonths(); }, [moduleId]);
  useEffect(() => { if (active) loadRows(active); }, [active]);

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
        toast.success(`${meta.label} records grouped successfully by month.`, { id: loaderId });
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
    try {
      const monthsInFile = Array.from(new Set(parsed.rows.map((r: any) => r.month_year))).filter(Boolean) as string[];
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
      
      const BATCH = 100;
      for (let i = 0; i < parsed.rows.length; i += BATCH) {
        const chunk = parsed.rows.slice(i, i + BATCH);
        const { error } = await supabase.from(meta.tableName).insert(chunk as any);
        if (error) throw error;
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
      toast.success(`${meta.label} records grouped successfully by month.`, { id: loaderId });
      await loadMonths();
      if (monthsInFile.length) setActive(monthsInFile[monthsInFile.length - 1]);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || e}`, { id: loaderId });
    } finally {
      setUploading(false);
      setPending(null);
    }
  }

  const bookName = meta.label.toUpperCase();
  const filenameBase = `ABL_${meta.glSource}_${active ?? "EMPTY"}`.replace(/\s+/g, "_");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">{meta.label}</h2>
          <p className="text-sm text-white/50 font-medium">{meta.uploadHint}</p>
        </div>
        <div className="flex flex-wrap gap-3">
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

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/40 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <span className="text-sm font-bold tracking-widest uppercase">Loading Records...</span>
        </div>
      ) : (
        <div className="bg-[#0a1628] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
           <LedgerTable columns={meta.columns} rows={rows} />
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
