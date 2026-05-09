import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sortMonthYears, parseMonthYear, folioFor, round2, fmtMoney } from "@/lib/abl/format";
import { MONTH_FULL } from "@/lib/abl/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Printer, Search, Loader2, Download, Calendar } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCompanySettings, CompanySettings } from "@/lib/abl/companySettings";
import { cn } from "@/lib/utils";
import React from "react";

interface GL {
  id: string;
  entry_date: string;
  account_name: string;
  particulars: string;
  folio: string;
  debit: number;
  credit: number;
  source_module: string;
  month_year: string;
}

interface TEntry {
  date: string;
  particulars: string;
  folio: string;
  debit: number;
  credit: number;
  sortKey: string;
}

interface TMonthGroup {
  monthYear: string;
  entries: TEntry[];
  begBalance: number;
  endBalance: number;
}

interface TAccount {
  accountName: string;
  months: TMonthGroup[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
}

const MODULE_PARTICULARS: Record<string, string> = {
  CDB: "Disbursements",
  PB: "Purchases",
  SB: "Sales",
  CR: "Collections",
  JB: "General Journal Entries",
};

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function lastDayLabel(monthYear: string): string {
  const p = parseMonthYear(monthYear);
  if (!p) return monthYear;
  const last = new Date(p.year, p.month + 1, 0).getDate();
  return `${MONTH_SHORT[p.month]} ${last}`;
}

export default function GeneralLedger() {
  const [rows, setRows] = useState<GL[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [glRes, s] = await Promise.all([
        supabase.from("gl_entries").select("*").order("entry_date", { ascending: true }).limit(20000),
        getCompanySettings(),
      ]);
      setRows((glRes.data ?? []) as any);
      setSettings(s);
      setLoading(false);
    })();
  }, []);

  const years = useMemo(() => {
    const ySet = new Set<string>();
    rows.forEach(r => {
      const p = parseMonthYear(r.month_year);
      if (p) ySet.add(p.year.toString());
    });
    return Array.from(ySet).sort();
  }, [rows]);

  const allMonths = useMemo(() => {
    const mSet = new Set<string>();
    rows.forEach(r => mSet.add(r.month_year));
    return sortMonthYears(Array.from(mSet));
  }, [rows]);

  const tAccounts = useMemo<TAccount[]>(() => {
    const acctMap = new Map<string, Map<string, Map<string, { dr: number; cr: number }>>>();
    for (const r of rows) {
      const acct = r.account_name;
      const mod = (r.source_module || "JB").toUpperCase();
      if (!acctMap.has(acct)) acctMap.set(acct, new Map());
      const byMonth = acctMap.get(acct)!;
      if (!byMonth.has(r.month_year)) byMonth.set(r.month_year, new Map());
      const byMod = byMonth.get(r.month_year)!;
      if (!byMod.has(mod)) byMod.set(mod, { dr: 0, cr: 0 });
      const cell = byMod.get(mod)!;
      cell.dr = round2(cell.dr + Number(r.debit || 0));
      cell.cr = round2(cell.cr + Number(r.credit || 0));
    }

    const result: TAccount[] = [];
    const accountsList = Array.from(acctMap.keys()).sort();

    for (const accountName of accountsList) {
      const byMonth = acctMap.get(accountName)!;
      let runningBalance = 0;
      const monthGroups: TMonthGroup[] = [];
      let grandDebit = 0;
      let grandCredit = 0;

      for (const my of allMonths) {
        const byMod = byMonth.get(my);
        const p = parseMonthYear(my);
        const sortPrefix = p ? `${p.year}-${String(p.month).padStart(2, "0")}` : my;
        const currentYear = p ? p.year.toString() : "Unknown";
        const currentMonth = p ? parseMonthYear(my)?.month.toString() : "Unknown";
        
        const entries: TEntry[] = [];
        let monthDebit = 0;
        let monthCredit = 0;

        if (byMod) {
          for (const [mod, v] of byMod) {
            const date = lastDayLabel(my);
            const particulars = MODULE_PARTICULARS[mod] ?? mod;
            const folio = folioFor(mod, my);
            entries.push({
              date, particulars, folio,
              debit: v.dr, credit: v.cr,
              sortKey: sortPrefix + mod
            });
            monthDebit = round2(monthDebit + v.dr);
            monthCredit = round2(monthCredit + v.cr);
          }
        }
        
        entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        
        const begBalance = runningBalance;
        runningBalance = round2(runningBalance + monthDebit - monthCredit);
        
        // Year/Month Filtering logic: 
        // We still need to calculate balances for ALL months, 
        // but only show the months that match the filter.
        const yearMatch = selectedYear === "ALL" || selectedYear === currentYear;
        const monthMatch = selectedMonth === "ALL" || my.startsWith(selectedMonth);

        if (yearMatch && monthMatch) {
          if (entries.length > 0 || begBalance !== 0 || runningBalance !== 0) {
            monthGroups.push({
              monthYear: my,
              entries,
              begBalance,
              endBalance: runningBalance
            });
          }
        }

        grandDebit = round2(grandDebit + monthDebit);
        grandCredit = round2(grandCredit + monthCredit);
      }

      if (monthGroups.length > 0) {
        result.push({
          accountName,
          months: monthGroups,
          totalDebit: grandDebit,
          totalCredit: grandCredit,
          finalBalance: runningBalance
        });
      }
    }
    return result;
  }, [rows, allMonths, selectedYear, selectedMonth]);

  const filteredAccounts = useMemo(
    () => tAccounts.filter((a) => a.accountName.toLowerCase().includes(search.toLowerCase())),
    [tAccounts, search]
  );

  function exportPDF() {
    if (!settings) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    filteredAccounts.forEach((account, idx) => {
      if (idx > 0) doc.addPage();

      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text(settings.company_name, 148, 12, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      let y = 17;
      if (settings.address) { doc.text(settings.address, 148, y, { align: "center" }); y += 4; }
      if (settings.tin_no) { doc.text(`TIN: ${settings.tin_no}`, 148, y, { align: "center" }); y += 4; }
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text("GENERAL LEDGER", 148, y + 2, { align: "center" });
      doc.setFontSize(10);
      doc.text(account.accountName.toUpperCase(), 148, y + 8, { align: "center" });

      const body: any[][] = [];
      account.months.forEach(m => {
        body.push([{ content: m.monthYear.toUpperCase(), colSpan: 5, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', halign: 'center' } }]);
        body.push(["", "Beginning Balance", "", m.begBalance >= 0 ? fmtMoney(m.begBalance) : "", m.begBalance < 0 ? fmtMoney(Math.abs(m.begBalance)) : ""]);
        m.entries.forEach(e => {
          body.push([e.date, e.particulars, e.folio, e.debit > 0 ? fmtMoney(e.debit) : "", e.credit > 0 ? fmtMoney(e.credit) : ""]);
        });
        body.push([{ content: `Ending Balance: ${fmtMoney(m.endBalance)}`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] } }]);
      });

      autoTable(doc, {
        startY: y + 12,
        head: [["DATE", "PARTICULARS", "FOLIO", "DEBIT", "CREDIT"]],
        body,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 39, 68], textColor: 255, fontStyle: "bold", halign: "center" },
        columnStyles: {
          3: { halign: "right", cellWidth: 35 },
          4: { halign: "right", cellWidth: 35 },
        },
      });
    });
    doc.save(`GL_FULL_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-wrap gap-4 items-end justify-between no-print bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-white tracking-tighter">General Ledger</h2>
          <p className="text-sm text-white/40 font-medium">
            Complete historical audit trail with continuous balance preservation.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-11 px-6 rounded-xl" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 h-11 px-6 rounded-xl transition-all hover:scale-105 active:scale-95" disabled={!filteredAccounts.length} onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-2" /> Export full PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 no-print">
        <Card className="md:col-span-6 p-4 bg-white/5 border-white/10 backdrop-blur-md rounded-2xl">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-blue-400 transition-colors" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account name..."
              className="pl-12 bg-black/20 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus-visible:ring-blue-500/50"
            />
          </div>
        </Card>
        <Card className="md:col-span-3 p-4 bg-white/5 border-white/10 backdrop-blur-md rounded-2xl">
          <div className="relative group">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-blue-400 transition-colors" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full pl-12 pr-4 bg-black/20 border-white/10 text-white h-12 rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none appearance-none cursor-pointer"
            >
              <option value="ALL">All Years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </Card>
        <Card className="md:col-span-3 p-4 bg-white/5 border-white/10 backdrop-blur-md rounded-2xl">
          <div className="relative group">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-blue-400 transition-colors" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full pl-12 pr-4 bg-black/20 border-white/10 text-white h-12 rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none appearance-none cursor-pointer"
            >
              <option value="ALL">All Months</option>
              {MONTH_FULL.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-white/40 space-y-4">
          <div className="relative">
             <div className="absolute inset-0 blur-xl bg-blue-500/20 animate-pulse"></div>
             <Loader2 className="h-12 w-12 animate-spin text-blue-500 relative" />
          </div>
          <span className="text-xs font-black tracking-[0.3em] uppercase text-blue-400/50">Recalculating Ledgers...</span>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Card className="p-32 text-center bg-white/[0.02] border-dashed border-white/10 text-white/20 rounded-3xl">
          <div className="max-w-xs mx-auto space-y-4">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
               <Search className="h-6 w-6" />
            </div>
            <div className="space-y-1">
               <p className="text-xl font-black text-white/40">No Records Found</p>
               <p className="text-xs font-medium">Try adjusting your filters or search terms.</p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-12">
          {filteredAccounts.map((acct) => (
            <TAccountCard key={acct.accountName} account={acct} settings={settings} />
          ))}
        </div>
      )}
    </div>
  );
}

function TAccountCard({ account, settings }: { account: TAccount; settings: CompanySettings | null }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="group relative">
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition duration-1000"></div>
      <Card className="relative overflow-hidden border-white/10 bg-[#0a1628]/80 backdrop-blur-2xl shadow-2xl rounded-3xl border">
        <div 
          className="p-6 flex items-center justify-between cursor-pointer border-b border-white/5 hover:bg-white/[0.02] transition-all"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 flex items-center justify-center border border-blue-500/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
              <span className="text-blue-400 font-black text-xl">{account.accountName[0].toUpperCase()}</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">{account.accountName}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                  account.finalBalance >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                )}>
                  {account.finalBalance >= 0 ? "DEBIT BALANCE" : "CREDIT BALANCE"}
                </span>
                <span className="text-xs font-mono font-bold text-white/40">
                  {fmtMoney(account.finalBalance)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 no-print">
             <Button variant="ghost" size="sm" className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl h-10 w-10 p-0 transition-colors">
               <Download className="h-4 w-4" />
             </Button>
             <div className={cn("transition-transform duration-500", isExpanded ? "rotate-180" : "")}>
                <Search className="h-4 w-4 text-white/20 rotate-45" />
             </div>
          </div>
        </div>

        {isExpanded && (
          <div className="p-0 overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5">Date</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5">Particulars</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5">Folio</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5 text-right">Debit</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5 text-right">Credit</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5 text-right">Running</th>
                </tr>
              </thead>
              <tbody className="text-[13px] font-medium">
                {account.months.map((m) => {
                  let monthRunning = m.begBalance;
                  return (
                    <React.Fragment key={m.monthYear}>
                      {/* Month Separator */}
                      <tr className="bg-blue-600/[0.03] group/month">
                        <td colSpan={6} className="px-8 py-4 border-y border-white/5">
                          <div className="flex items-center gap-3">
                             <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                             <span className="text-[11px] font-black text-blue-300 uppercase tracking-[0.3em]">
                               {m.monthYear}
                             </span>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Beginning Balance Row */}
                      <tr className="bg-white/[0.01] text-white/30 italic text-[11px] border-b border-white/5">
                        <td className="px-8 py-3"></td>
                        <td className="px-8 py-3 font-bold uppercase tracking-widest text-blue-400/30">Beginning Balance</td>
                        <td className="px-8 py-3"></td>
                        <td className="px-8 py-3"></td>
                        <td className="px-8 py-3"></td>
                        <td className="px-8 py-3 text-right font-mono text-white/40">
                          {fmtMoney(m.begBalance)}
                        </td>
                      </tr>

                      {/* Transaction Rows */}
                      {m.entries.map((e, idx) => {
                        monthRunning = round2(monthRunning + e.debit - e.credit);
                        return (
                          <tr key={idx} className="hover:bg-white/[0.03] border-b border-white/5 transition-colors group/row">
                            <td className="px-8 py-4 text-white/40 font-mono text-[11px]">{e.date}</td>
                            <td className="px-8 py-4 text-white/90 group-hover/row:text-white transition-colors">{e.particulars}</td>
                            <td className="px-8 py-4 text-white/20 text-[11px] font-mono">{e.folio}</td>
                            <td className="px-8 py-4 text-right text-emerald-400/90 font-mono">{e.debit > 0 ? fmtMoney(e.debit) : ""}</td>
                            <td className="px-8 py-4 text-right text-rose-400/90 font-mono">{e.credit > 0 ? fmtMoney(e.credit) : ""}</td>
                            <td className="px-8 py-4 text-right text-blue-300/60 font-mono">{fmtMoney(monthRunning)}</td>
                          </tr>
                        );
                      })}

                      {/* Ending Balance Row */}
                      <tr className="bg-blue-600/[0.02] border-b-2 border-white/10">
                        <td colSpan={5} className="px-8 py-5 text-right uppercase tracking-[0.2em] text-white/20 text-[10px] font-black">Ending Balance — {m.monthYear}</td>
                        <td className="px-8 py-5 text-right font-mono text-blue-300 font-bold decoration-blue-500/50 decoration-2 underline-offset-8">
                          {fmtMoney(m.endBalance)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
