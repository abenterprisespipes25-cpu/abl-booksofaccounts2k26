import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/abl/format";
import { getCompanySettings } from "@/lib/abl/companySettings";

type Row = { name: string; top10t: number; top10k: number; atSource: number; total: number };

export default function ITWSummary() {
  const [loading, setLoading] = useState(true);
  const [monthYear, setMonthYear] = useState<string>("");
  const [months, setMonths] = useState<string[]>([]);
  const [pbRows, setPbRows] = useState<any[]>([]);
  const [cdbRows, setCdbRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [pbM, cdbM] = await Promise.all([
        supabase.from("purchase_book_entries").select("month_year"),
        supabase.from("cdb_entries").select("month_year"),
      ]);
      const set = new Set<string>();
      (pbM.data || []).forEach((r: any) => r.month_year && set.add(r.month_year));
      (cdbM.data || []).forEach((r: any) => r.month_year && set.add(r.month_year));
      const arr = Array.from(set).sort();
      setMonths(arr);
      if (arr.length && !monthYear) setMonthYear(arr[arr.length - 1]);
      else setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!monthYear) return;
    setLoading(true);
    (async () => {
      const [pb, cdb] = await Promise.all([
        supabase.from("purchase_book_entries").select("supplier, itw_top_10t").eq("month_year", monthYear),
        supabase.from("cdb_entries").select("payee, itw_top_10k_corp, itw_at_source").eq("month_year", monthYear),
      ]);
      setPbRows(pb.data || []);
      setCdbRows(cdb.data || []);
      setLoading(false);
    })();
  }, [monthYear]);

  const grouped = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const get = (name: string) => {
      const key = (name || "(Unnamed)").trim() || "(Unnamed)";
      if (!map.has(key)) map.set(key, { name: key, top10t: 0, top10k: 0, atSource: 0, total: 0 });
      return map.get(key)!;
    };
    for (const r of pbRows) {
      const v = Number(r.itw_top_10t) || 0;
      if (v) get(r.supplier).top10t += v;
    }
    for (const r of cdbRows) {
      const k = Number(r.itw_top_10k_corp) || 0;
      const s = Number(r.itw_at_source) || 0;
      if (k || s) {
        const row = get(r.payee);
        row.top10k += k;
        row.atSource += s;
      }
    }
    const out = Array.from(map.values());
    out.forEach(r => { r.total = r.top10t + r.top10k + r.atSource; });
    return out
      .filter(r => r.total !== 0)
      .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [pbRows, cdbRows, search]);

  const totals = useMemo(() => grouped.reduce(
    (t, r) => ({ top10t: t.top10t + r.top10t, top10k: t.top10k + r.top10k, atSource: t.atSource + r.atSource, total: t.total + r.total }),
    { top10t: 0, top10k: 0, atSource: 0, total: 0 }
  ), [grouped]);

  const exportExcel = async () => {
    if (!grouped.length) { toast.error("No data to export."); return; }
    const settings = await getCompanySettings();
    const aoa: any[][] = [
      [settings.company_name || ""],
      ["WITHHOLDING TAX SUMMARY (ITW)"],
      [`FOR THE MONTH OF ${monthYear}`],
      [],
      ["NAME", "ITW TOP 10T", "ITW TOP 10K", "ITW AT SOURCE", "TOTAL"],
      ...grouped.map(r => [r.name, r.top10t || "", r.top10k || "", r.atSource || "", r.total || ""]),
      ["TOTAL", totals.top10t, totals.top10k, totals.atSource, totals.total],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ITW Summary");
    XLSX.writeFile(wb, `ITW_Summary_${monthYear.replace(/\s+/g, "_")}.xlsx`);
    toast.success("Excel exported.");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap gap-4 items-end justify-between bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl no-print">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-white tracking-tighter">ITW Summary</h2>
          <p className="text-sm text-white/40 font-medium">
            Withholding Tax Payable - Expanded — grouped by Supplier / Payee, sourced from Cash Disbursements & Purchase Book.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Month</label>
            <select
              value={monthYear}
              onChange={(e) => setMonthYear(e.target.value)}
              className="h-11 px-4 bg-white/5 border border-white/10 text-white rounded-xl text-sm"
            >
              {months.map(m => <option key={m} value={m} className="bg-[#0a1628]">{m}</option>)}
            </select>
          </div>
          <Input
            placeholder="Search name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-64 bg-white/5 border-white/10 text-white rounded-xl"
          />
          <Button onClick={exportExcel} disabled={!grouped.length} className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!grouped.length} className="h-11 px-6 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        </div>
      ) : !grouped.length ? (
        <div className="border-2 border-dashed border-white/10 rounded-2xl p-24 text-center text-white/40">
          No ITW entries for {monthYear || "this period"}.
        </div>
      ) : (
        <div className="printable-area">
          <div className="hidden print:block text-center space-y-1 mb-4">
            <p className="text-base font-bold">WITHHOLDING TAX SUMMARY (ITW)</p>
            <p className="text-sm">FOR THE MONTH OF {monthYear}</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1628] shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#0f2744]">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/70 border border-white/10">Name</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/70 border border-white/10 text-right">ITW TOP 10T</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/70 border border-white/10 text-right">ITW TOP 10K</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/70 border border-white/10 text-right">ITW AT SOURCE</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/70 border border-white/10 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((r, i) => (
                  <tr key={r.name} className={i % 2 ? "bg-white/[0.02]" : ""}>
                    <td className="px-4 py-2 text-[12px] text-white/80 border border-white/[0.05]">{r.name}</td>
                    <td className="px-4 py-2 text-[12px] font-mono text-right text-white/80 border border-white/[0.05]">{r.top10t ? fmtMoney(r.top10t) : ""}</td>
                    <td className="px-4 py-2 text-[12px] font-mono text-right text-white/80 border border-white/[0.05]">{r.top10k ? fmtMoney(r.top10k) : ""}</td>
                    <td className="px-4 py-2 text-[12px] font-mono text-right text-white/80 border border-white/[0.05]">{r.atSource ? fmtMoney(r.atSource) : ""}</td>
                    <td className="px-4 py-2 text-[12px] font-mono text-right text-blue-300 font-bold border border-white/[0.05]">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#0f172a] border-t-2 border-blue-500/40">
                  <td className="px-4 py-3 text-[12px] font-bold uppercase tracking-widest text-white/60 border border-white/10">Grand Total</td>
                  <td className="px-4 py-3 text-[12px] font-mono font-bold text-right text-blue-300 border border-white/10">{fmtMoney(totals.top10t)}</td>
                  <td className="px-4 py-3 text-[12px] font-mono font-bold text-right text-blue-300 border border-white/10">{fmtMoney(totals.top10k)}</td>
                  <td className="px-4 py-3 text-[12px] font-mono font-bold text-right text-blue-300 border border-white/10">{fmtMoney(totals.atSource)}</td>
                  <td className="px-4 py-3 text-[12px] font-mono font-bold text-right text-blue-300 border border-white/10">{fmtMoney(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-white/30 text-right mt-2 no-print">{grouped.length} names · {monthYear}</p>
        </div>
      )}
    </div>
  );
}
