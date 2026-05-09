import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES, MONTH_FULL, MONTH_ABBR } from "@/lib/abl/config";
import { parsePurchaseBook, forceMonthYear } from "@/lib/abl/parsers";
import { exportExcel, exportPDF } from "@/lib/abl/exporters";
import { fmtMoney } from "@/lib/abl/format";
import { LedgerTable } from "./LedgerTable";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, FileText, Printer, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import "@/styles/print.css";

const meta = MODULES.purchase_book;

export default function PurchaseBookModule() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState<number>(now.getMonth());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<{
    fileName: string; inserted: number; skipped: number;
    totalPurchases: number; totalVAT: number; totalInputTax: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const monthYear = `${MONTH_FULL[monthIdx]} ${year}`;

  async function loadRows() {
    setLoading(true);
    const { data } = await supabase
      .from(meta.tableName)
      .select("*")
      .eq("month_year", monthYear)
      .order("entry_date", { ascending: true })
      .limit(10000);
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [monthYear]);

  async function handleFile(file: File) {
    setUploading(true);
    const loaderId = toast.loading(`Processing ${file.name} into ${monthYear}...`);
    try {
      const buf = await file.arrayBuffer();
      const parsedRaw = parsePurchaseBook(buf);
      if (!parsedRaw.rows.length) throw new Error("No valid transactions found in file.");
      const parsed = forceMonthYear(parsedRaw, monthYear, meta.glSource);

      // Pull existing invoices for this month to dedupe
      const { data: existing } = await supabase
        .from(meta.tableName)
        .select("supplier, invoice_no")
        .eq("month_year", monthYear);
      const seen = new Set<string>(
        (existing ?? [])
          .map((r: any) => `${(r.supplier || "").trim()}::${(r.invoice_no || "").trim()}`)
          .filter((k: string) => !k.endsWith("::"))
      );

      const filteredRows: any[] = [];
      const filteredKeys = new Set<string>();
      let skipped = 0;
      for (const r of parsed.rows) {
        const key = `${(r.supplier || "").trim()}::${(r.invoice_no || "").trim()}`;
        const isParent = !!(r.invoice_no || "").trim() && !!(r.supplier || "").trim();
        if (isParent && seen.has(key)) { skipped++; continue; }
        if (isParent) { seen.add(key); filteredKeys.add(key); }
        filteredRows.push(r);
      }

      // Insert in batches of 500
      const BATCH = 500;
      for (let i = 0; i < filteredRows.length; i += BATCH) {
        const chunk = filteredRows.slice(i, i + BATCH);
        const { error } = await supabase.from(meta.tableName).insert(chunk as any);
        if (error) throw error;
      }
      // Always replace GL postings for this month from this source to stay idempotent
      await supabase.from("gl_entries").delete().eq("source_module", meta.glSource).eq("month_year", monthYear);
      if (parsed.glEntries.length) {
        for (let i = 0; i < parsed.glEntries.length; i += BATCH) {
          const chunk = parsed.glEntries.slice(i, i + BATCH);
          const { error } = await supabase.from("gl_entries").insert(chunk as any);
          if (error) throw error;
        }
      }
      await supabase.from("uploaded_files").insert({
        module: meta.glSource, month_year: monthYear, file_name: file.name, row_count: filteredRows.length,
      } as any);

      // Compute summary on inserted rows
      const totalInputTax = filteredRows.reduce((s, r) => s + (Number(r.input_tax) || 0), 0);
      const totalNet = filteredRows.reduce((s, r) => {
        let v = 0;
        for (const k of Object.keys(r)) {
          if (k === "ap_trade_cr" || k === "input_tax" || k === "month_year" || k === "entry_date" || typeof r[k] !== "number") continue;
          if (["repairs_admin","repairs_sales","repairs_plant","fuel_admin","fuel_plant","fuel_sales","fuel_construction","sundries_amount"].includes(k)) v += Number(r[k]) || 0;
        }
        return s + v;
      }, 0);
      const totalPurchases = totalNet + totalInputTax;

      setSummary({
        fileName: file.name,
        inserted: filteredRows.length,
        skipped,
        totalPurchases,
        totalVAT: totalInputTax,
        totalInputTax,
      });
      toast.success(`Imported ${filteredRows.length} rows into ${monthYear}.`, { id: loaderId });
      await loadRows();
    } catch (e: any) {
      toast.error(`Upload error: ${e.message || e}`, { id: loaderId });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const totals = useMemo(() => {
    const t = { purchases: 0, vat: 0, inputTax: 0, count: 0 };
    for (const r of rows) {
      const isParent = !!(r.invoice_no || "").trim() && !!(r.supplier || "").trim();
      if (isParent) t.count++;
      t.inputTax += Number(r.input_tax) || 0;
      t.vat += Number(r.input_tax) || 0;
      t.purchases += (Number(r.ap_trade_cr) || 0);
    }
    return t;
  }, [rows]);

  const yearOptions = useMemo(() => {
    const cur = now.getFullYear();
    return [cur - 2, cur - 1, cur, cur + 1];
  }, []);

  const filenameBase = `ABL_PB_${monthYear.replace(/\s+/g, "_")}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header / actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md no-print">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Purchase Book</h2>
          <p className="text-sm text-white/50 font-medium">Per-month uploads · Duplicate invoices auto-skipped</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="bg-white/5 border border-white/10 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload to {MONTH_ABBR[monthIdx]} {year}
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                  disabled={!rows.length}
                  onClick={() => exportExcel({ filename: `${filenameBase}.xlsx`, bookName: "PURCHASE BOOK", monthYear, columns: meta.columns, rows })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                  disabled={!rows.length}
                  onClick={() => exportPDF({ filename: `${filenameBase}.pdf`, bookName: "PURCHASE BOOK", monthYear, columns: meta.columns, rows })}>
            <FileText className="h-4 w-4 mr-2" /> PDF
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                  disabled={!rows.length}
                  onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Month tabs */}
      <div className="grid grid-cols-6 md:grid-cols-12 gap-2 no-print">
        {MONTH_FULL.map((m, i) => {
          const isActive = i === monthIdx;
          return (
            <button
              key={m}
              onClick={() => setMonthIdx(i)}
              className={`px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all
                ${isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/40 scale-105"
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              {MONTH_ABBR[i]}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
        <Stat label="Transactions" value={totals.count.toLocaleString()} />
        <Stat label="Total Purchases" value={fmtMoney(totals.purchases)} />
        <Stat label="Total VAT" value={fmtMoney(totals.vat)} />
        <Stat label="Total Input Tax" value={fmtMoney(totals.inputTax)} />
      </div>

      {/* Print header (only visible on print) */}
      <div className="print-header">
        <h1>Purchase Book</h1>
        <h2>{monthYear}</h2>
      </div>

      {/* Table */}
      <div className="print-area">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/40 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <span className="text-sm font-bold tracking-widest uppercase">Loading {monthYear}...</span>
          </div>
        ) : (
          <div className="bg-[#0a1628] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <LedgerTable columns={meta.columns} rows={rows} />
          </div>
        )}
      </div>

      {/* Upload summary */}
      <Dialog open={!!summary} onOpenChange={(o) => !o && setSummary(null)}>
        <DialogContent className="bg-[#0f172a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Upload Summary
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {summary?.fileName} → <span className="text-blue-400 font-bold">{monthYear}</span>
            </DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="space-y-2 font-mono text-sm">
              <SummaryRow label="Rows inserted" value={summary.inserted.toLocaleString()} />
              <SummaryRow label="Duplicates skipped" value={summary.skipped.toLocaleString()} accent={summary.skipped > 0} />
              <div className="h-px bg-white/10 my-2" />
              <SummaryRow label="Total Purchases" value={fmtMoney(summary.totalPurchases)} />
              <SummaryRow label="Total VAT" value={fmtMoney(summary.totalVAT)} />
              <SummaryRow label="Total Input Tax" value={fmtMoney(summary.totalInputTax)} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSummary(null)} className="bg-blue-600 hover:bg-blue-700">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">{label}</div>
      <div className="text-2xl font-black text-white mt-2 font-mono">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <span className={accent ? "text-amber-400 font-bold" : "text-white font-bold"}>{value}</span>
    </div>
  );
}
