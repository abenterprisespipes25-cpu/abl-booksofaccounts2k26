import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, round2 } from "@/lib/abl/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCompanySettings } from "@/lib/abl/companySettings";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";

interface AccRow {
  account_name: string;
  total_debit: number;
  total_credit: number;
  debit_balance: number;
  credit_balance: number;
}


export default function TrialBalance() {
  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("gl_entries").select("account_name, debit, credit, entry_date");
    setRaw(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { 
    load(); 

    // Real-time subscription
    const channel = supabase.channel('trial_balance_realtime')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'gl_entries' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const accounts = useMemo<AccRow[]>(() => {
    const map = new Map<string, { d: number; c: number }>();
    for (const r of raw) {
      if (fromDate && r.entry_date < fromDate) continue;
      if (toDate && r.entry_date > toDate) continue;
      const cur = map.get(r.account_name) || { d: 0, c: 0 };
      cur.d += Number(r.debit) || 0;
      cur.c += Number(r.credit) || 0;
      map.set(r.account_name, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => {
        const d = round2(v.d);
        const c = round2(v.c);
        return {
          account_name: name,
          total_debit: d,
          total_credit: c,
          debit_balance: d > c ? round2(d - c) : 0,
          credit_balance: c > d ? round2(c - d) : 0,
        };
      })
      .sort((a, b) => a.account_name.localeCompare(b.account_name));
  }, [raw, fromDate, toDate]);

  const totalDr = round2(accounts.reduce((s, r) => s + r.debit_balance, 0));
  const totalCr = round2(accounts.reduce((s, r) => s + r.credit_balance, 0));
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  function periodLabel() {
    if (fromDate && toDate) return `For the Period: ${fromDate} to ${toDate}`;
    if (fromDate) return `From ${fromDate}`;
    if (toDate) return `As of ${toDate}`;
    return "Cumulative (All Dates)";
  }
  const dateSuffix = `${fromDate || "ALL"}_${toDate || "ALL"}`.replace(/-/g, "");

  async function exportExcel() {
    const s = await getCompanySettings();
    const wb = XLSX.utils.book_new();
    const aoa: any[][] = [
      [s.company_name],
      ...(s.address ? [[s.address]] : []),
      ...(s.tin_no ? [[`TIN: ${s.tin_no}`]] : []),
      ["TRIAL BALANCE"],
      [periodLabel()],
      [],
      ["ACCOUNT TITLE", "DEBIT", "CREDIT"],
    ];
    for (const r of accounts) aoa.push([r.account_name, r.debit_balance || "", r.credit_balance || ""]);
    aoa.push(["TOTAL", totalDr, totalCr]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 50 }, { wch: 18 }, { wch: 18 }];

    // Apply Styles
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    const thin = { style: "thin", color: { rgb: "000000" } };
    const bAll = { top: thin, bottom: thin, left: thin, right: thin };
    const bTot = { ...bAll, top: { style: "double", color: { rgb: "000000" } } };

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) ws[addr] = { t: "z", v: "" };

        const isTitle = R < 6;
        const isHead  = R === 6;
        const isTotal = R === aoa.length - 1;
        const isData  = R > 6 && R < aoa.length - 1;

        if (isTitle) {
          ws[addr].s = { font: { bold: true, sz: R === 0 ? 12 : 10 }, alignment: { horizontal: "center" } };
        } else if (isHead) {
          ws[addr].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "0F2744" }, patternType: "solid" },
            border: bAll,
            alignment: { horizontal: "center" }
          };
        } else if (isData) {
          ws[addr].s = {
            border: bAll,
            alignment: { horizontal: C === 0 ? "left" : "right" },
            numFmt: C > 0 ? "#,##0.00" : undefined
          };
        } else if (isTotal) {
          ws[addr].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "DBEAFE" }, patternType: "solid" },
            border: bTot,
            alignment: { horizontal: C === 0 ? "left" : "right" },
            numFmt: C > 0 ? "#,##0.00" : undefined
          };
        }
      }
    }

    // Merge titles
    for (let i = 0; i < 5; i++) {
      ws["!merges"] = ws["!merges"] || [];
      ws["!merges"].push({ s: { r: i, c: 0 }, e: { r: i, c: 2 } });
    }

    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `ABL_TRIAL_BALANCE_${dateSuffix}.xlsx`, { cellStyles: true });
  }

  async function exportPDF() {
    const s = await getCompanySettings();
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 32;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(s.company_name, w / 2, y, { align: "center" }); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    if (s.address) { doc.text(s.address, w / 2, y, { align: "center" }); y += 11; }
    if (s.tin_no) { doc.text(`TIN: ${s.tin_no}`, w / 2, y, { align: "center" }); y += 11; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("TRIAL BALANCE", w / 2, y, { align: "center" }); y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(periodLabel(), w / 2, y, { align: "center" }); y += 8;

    autoTable(doc, {
      head: [["ACCOUNT TITLE", "DEBIT", "CREDIT"]],
      body: accounts.map((r) => [r.account_name, fmtMoney(r.debit_balance), fmtMoney(r.credit_balance)]),
      foot: [["TOTAL", fmtMoney(totalDr), fmtMoney(totalCr)]],
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255 },
      footStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 95], fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    doc.save(`ABL_TRIAL_BALANCE_${dateSuffix}.pdf`);
  }

  return (
    <div className="space-y-4">
      <SyncStatusBadge table="gl_entries" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Trial Balance</h2>
          <p className="text-xs text-white/60">{periodLabel()}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!loading && accounts.length > 0 && (
            balanced ? (
              <div className="flex items-center gap-1.5 text-success font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4" /> Balanced
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-destructive font-semibold text-sm">
                <AlertTriangle className="h-4 w-4" /> Diff ₱ {fmtMoney(Math.abs(totalDr - totalCr))}
              </div>
            )
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-white/80">From:</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
            <label className="text-xs font-semibold text-white/80">To:</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
            <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</Button>
          </div>
          <Button variant="outline" disabled={!accounts.length} onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" disabled={!accounts.length} onClick={exportPDF}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {!loading && accounts.length > 0 && !balanced && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm">
          <strong>Trial Balance is OUT OF BALANCE.</strong> Difference: ₱ {fmtMoney(Math.abs(totalDr - totalCr))}.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : accounts.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm">
          No GL entries yet. Upload data in any book module to populate the Trial Balance.
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left" style={{ width: "60%" }}>Account Title</th>
                <th className="px-4 py-2.5 text-right" style={{ width: "20%" }}>Debit</th>
                <th className="px-4 py-2.5 text-right" style={{ width: "20%" }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((r) => (
                <tr key={r.account_name} className="border-t border-border">
                  <td className="px-4 py-2">{r.account_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.debit_balance)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.credit_balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-bold">
              <tr>
                <td className="px-4 py-2.5">TOTAL</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalDr)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
