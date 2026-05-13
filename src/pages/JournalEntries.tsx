import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dateToMonthYear, fmtDate, fmtMoney, folioFor, round2 } from "@/lib/abl/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, FileSpreadsheet, FileText, Printer, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCompanySettings } from "@/lib/abl/companySettings";
import "@/styles/print.css";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";

interface Line {
  id?: string;
  account_code: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
}
interface Journal {
  id: string;
  entry_date: string;
  journal_no: string;
  reference_no: string;
  remarks: string;
  month_year: string;
  prepared_by: string;
  approved_by: string;
  lines: Line[];
}

const emptyLine = (): Line => ({ account_code: "", account_name: "", description: "", debit: 0, credit: 0 });
const emptyJournal = (): Journal => ({
  id: "", entry_date: new Date().toISOString().slice(0, 10), journal_no: "", reference_no: "",
  remarks: "", month_year: dateToMonthYear(new Date()), prepared_by: "", approved_by: "",
  lines: [emptyLine(), emptyLine()],
});

export default function JournalEntries() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Journal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Journal | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: heads }, { data: lines }] = await Promise.all([
      supabase.from("journal_entries").select("*").order("entry_date", { ascending: false }).limit(2000),
      supabase.from("journal_entry_lines").select("*").order("line_order", { ascending: true }).limit(20000),
    ]);
    const linesByJ = new Map<string, Line[]>();
    for (const l of (lines ?? []) as any[]) {
      if (!linesByJ.has(l.journal_id)) linesByJ.set(l.journal_id, []);
      linesByJ.get(l.journal_id)!.push({
        id: l.id, account_code: l.account_code || "", account_name: l.account_name,
        description: l.description || "", debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
      });
    }
    setJournals(((heads ?? []) as any[]).map((h) => ({ ...h, lines: linesByJ.get(h.id) || [] })));
    setLoading(false);
  }, []);

  useEffect(() => { 
    load(); 

    const channel = supabase.channel('journal_realtime')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'journal_entries' } as any, () => {
        load(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return journals;
    return journals.filter((j) =>
      j.journal_no.toLowerCase().includes(q) ||
      (j.reference_no || "").toLowerCase().includes(q) ||
      (j.remarks || "").toLowerCase().includes(q) ||
      j.lines.some((l) => l.account_name.toLowerCase().includes(q))
    );
  }, [journals, search]);

  async function saveJournal(j: Journal) {
    const totalDr = round2(j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
    const totalCr = round2(j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
      toast.error(`Out of balance: Debit ${fmtMoney(totalDr)} ≠ Credit ${fmtMoney(totalCr)}`);
      return;
    }
    if (!j.entry_date || !j.journal_no.trim()) { toast.error("Date and Journal No. are required"); return; }
    const my = dateToMonthYear(new Date(j.entry_date + "T00:00:00"));
    const validLines = j.lines.filter((l) => l.account_name.trim() && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (!validLines.length) { toast.error("Add at least one valid line"); return; }

    const loaderId = toast.loading("Saving journal entry...");
    try {
      let journalId = j.id;
      const head = {
        entry_date: j.entry_date, journal_no: j.journal_no, reference_no: j.reference_no || null,
        remarks: j.remarks || null, month_year: my, prepared_by: j.prepared_by || null, approved_by: j.approved_by || null,
      };
      if (journalId) {
        const { error } = await supabase.from("journal_entries").update(head).eq("id", journalId);
        if (error) throw error;
        await supabase.from("journal_entry_lines").delete().eq("journal_id", journalId);
      } else {
        const { data, error } = await supabase.from("journal_entries").insert(head as any).select("id").single();
        if (error) throw error;
        journalId = data.id;
      }
      const lineRows = validLines.map((l, i) => ({
        journal_id: journalId, line_order: i, account_code: l.account_code || null,
        account_name: l.account_name, description: l.description || null,
        debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
      }));
      if (lineRows.length) {
        const { error } = await supabase.from("journal_entry_lines").insert(lineRows as any);
        if (error) throw error;
      }
      // Idempotent GL post
      await supabase.from("gl_entries").delete().eq("source_module", "JE").eq("source_ref", journalId);
      const folio = folioFor("JE", my);
      const glRows = validLines.map((l) => ({
        month_year: my, entry_date: j.entry_date, account_name: l.account_name,
        particulars: l.description || j.remarks || j.journal_no, folio,
        debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
        source_module: "JE", source_ref: journalId,
      }));
      if (glRows.length) {
        const { error } = await supabase.from("gl_entries").insert(glRows as any);
        if (error) throw error;
      }
      toast.success("Journal entry saved & posted to GL", { id: loaderId });
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || e}`, { id: loaderId });
    }
  }

  async function deleteJournal(j: Journal) {
    const loaderId = toast.loading("Deleting...");
    try {
      await supabase.from("gl_entries").delete().eq("source_module", "JE").eq("source_ref", j.id);
      await supabase.from("journal_entries").delete().eq("id", j.id);
      toast.success("Journal entry deleted", { id: loaderId });
      setConfirmDelete(null);
      await load();
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message || e}`, { id: loaderId });
    }
  }

  async function exportExcel() {
    const s = await getCompanySettings();
    const wb = XLSX.utils.book_new();
    const aoa: any[][] = [
      [s.company_name],
      ...(s.address ? [[s.address]] : []),
      ...(s.tin_no ? [[`TIN: ${s.tin_no}`]] : []),
      ["JOURNAL ENTRIES"],
      [],
      ["Date", "Journal No.", "Reference", "Account Title", "Description", "Debit", "Credit", "Remarks"],
    ];
    let gDr = 0, gCr = 0;
    for (const j of filtered) {
      for (let i = 0; i < j.lines.length; i++) {
        const l = j.lines[i];
        aoa.push([
          i === 0 ? fmtDate(j.entry_date) : "",
          i === 0 ? j.journal_no : "",
          i === 0 ? j.reference_no : "",
          l.account_name, l.description, Number(l.debit) || "", Number(l.credit) || "",
          i === 0 ? j.remarks : "",
        ]);
        gDr += Number(l.debit) || 0;
        gCr += Number(l.credit) || 0;
      }
    }
    aoa.push([]);
    aoa.push(["", "", "", "", "TOTAL", round2(gDr), round2(gCr), ""]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
    
    // Apply Styles
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    const thin = { style: "thin", color: { rgb: "000000" } };
    const bAll = { top: thin, bottom: thin, left: thin, right: thin };
    const bTot = { ...bAll, top: { style: "double", color: { rgb: "000000" } } };

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) ws[addr] = { t: "z", v: "" };

        const isTitle = R < 3;
        const isHead  = R === 3;
        const isTotal = R === aoa.length - 1;
        const isData  = R > 3 && R < aoa.length - 1;

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
            alignment: { horizontal: (C >= 5 && C <= 6) ? "right" : "left" },
            numFmt: (C >= 5 && C <= 6) ? "#,##0.00" : undefined
          };
        } else if (isTotal) {
          ws[addr].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "DBEAFE" }, patternType: "solid" },
            border: bTot,
            alignment: { horizontal: (C >= 5 && C <= 6) ? "right" : "left" },
            numFmt: (C >= 5 && C <= 6) ? "#,##0.00" : undefined
          };
        }
      }
    }

    // Merge titles
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    ];

    ws["!views"] = [{ state: "frozen", xSplit: 0, ySplit: 4 }];

    XLSX.utils.book_append_sheet(wb, ws, "Journal");
    XLSX.writeFile(wb, `ABL_JOURNAL_${new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true });
  }

  async function exportPDF() {
    const s = await getCompanySettings();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 28;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(s.company_name, w / 2, y, { align: "center" }); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    if (s.address) { doc.text(s.address, w / 2, y, { align: "center" }); y += 11; }
    if (s.tin_no) { doc.text(`TIN: ${s.tin_no}`, w / 2, y, { align: "center" }); y += 11; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("JOURNAL ENTRIES", w / 2, y, { align: "center" }); y += 14;

    const body: any[][] = [];
    let gDr = 0, gCr = 0;
    for (const j of filtered) {
      body.push([{ content: `${fmtDate(j.entry_date)}  ·  JV ${j.journal_no}  ·  Ref: ${j.reference_no || "—"}  ·  ${j.remarks || ""}`, colSpan: 5, styles: { fillColor: [241, 245, 249], fontStyle: "bold" } }]);
      for (const l of j.lines) {
        body.push(["", l.account_name, l.description || "", l.debit ? fmtMoney(l.debit) : "", l.credit ? fmtMoney(l.credit) : ""]);
        gDr += Number(l.debit) || 0;
        gCr += Number(l.credit) || 0;
      }
    }
    autoTable(doc, {
      startY: y,
      head: [["", "ACCOUNT TITLE", "DESCRIPTION", "DEBIT", "CREDIT"]],
      body,
      foot: [["", "", "TOTAL", fmtMoney(gDr), fmtMoney(gCr)]],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255 },
      footStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 95], fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 20 }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    const finalY = (doc as any).lastAutoTable.finalY || y + 100;
    doc.setFontSize(9);
    doc.text("Prepared by: ____________________", 40, finalY + 40);
    doc.text("Approved by: ____________________", w - 240, finalY + 40);
    doc.save(`ABL_JOURNAL_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <SyncStatusBadge table="journal_entries" />
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md no-print">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Journal Entries</h2>
          <p className="text-sm text-white/50 font-medium">Manual journal vouchers · auto-posted to General Ledger</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setEditing(emptyJournal())} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20">
            <Plus className="h-4 w-4 mr-2" /> New Journal Entry
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!filtered.length} onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!filtered.length} onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-2" /> PDF
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" disabled={!filtered.length} onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      <Card className="p-3 bg-white/5 border-white/10 no-print">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Search journal #, account, remarks..."
                 className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-white/30" />
        </div>
      </Card>

      <div className="print-header">
        <h1>Journal Entries</h1>
      </div>

      <div className="print-area space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/40">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-16 text-center bg-white/[0.02] border-dashed border-white/10 text-white/40">
            <p className="text-lg font-bold">No journal entries yet</p>
            <p className="text-xs mt-1">Click "New Journal Entry" to create your first voucher.</p>
          </Card>
        ) : (
          filtered.map((j) => {
            const dr = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
            const cr = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
            const balanced = Math.abs(dr - cr) < 0.01;
            return (
              <Card key={j.id} className="bg-[#0a1628] border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-white/[0.03] border-b border-white/10">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-bold text-blue-300">JV {j.journal_no}</span>
                    <span className="text-white/40">{fmtDate(j.entry_date)}</span>
                    {j.reference_no && <span className="text-white/40">Ref: {j.reference_no}</span>}
                    <span className="text-white/40 truncate max-w-md">{j.remarks}</span>
                    {!balanced && <span className="text-rose-400 font-bold text-xs">UNBALANCED</span>}
                  </div>
                  <div className="flex gap-2 no-print">
                    <Button size="sm" variant="ghost" className="text-white/60 hover:text-white" onClick={() => setEditing(j)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-white/60 hover:text-rose-400" onClick={() => setConfirmDelete(j)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
                      <th className="px-5 py-2 text-left">Account</th>
                      <th className="px-5 py-2 text-left">Description</th>
                      <th className="px-5 py-2 text-right">Debit</th>
                      <th className="px-5 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.lines.map((l, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="px-5 py-2 text-white/90 font-mono text-xs">{l.account_name}</td>
                        <td className="px-5 py-2 text-white/60 text-xs">{l.description}</td>
                        <td className="px-5 py-2 text-right font-mono text-emerald-400 text-xs">{l.debit ? fmtMoney(l.debit) : ""}</td>
                        <td className="px-5 py-2 text-right font-mono text-rose-400 text-xs">{l.credit ? fmtMoney(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/[0.03] font-bold text-xs">
                      <td className="px-5 py-2 text-white/40 uppercase tracking-widest" colSpan={2}>Total</td>
                      <td className="px-5 py-2 text-right font-mono text-blue-300">{fmtMoney(dr)}</td>
                      <td className="px-5 py-2 text-right font-mono text-blue-300">{fmtMoney(cr)}</td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            );
          })
        )}
      </div>

      {editing && (
        <JournalEditor j={editing} onClose={() => setEditing(null)} onSave={saveJournal} />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-[#0f172a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              JV {confirmDelete?.journal_no} and all GL postings tied to it will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => confirmDelete && deleteJournal(confirmDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function JournalEditor({ j, onClose, onSave }: { j: Journal; onClose: () => void; onSave: (j: Journal) => void }) {
  const [draft, setDraft] = useState<Journal>(j);
  const dr = round2(draft.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const cr = round2(draft.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const balanced = Math.abs(dr - cr) < 0.01;

  const update = (patch: Partial<Journal>) => setDraft({ ...draft, ...patch });
  const updateLine = (i: number, patch: Partial<Line>) => {
    const lines = [...draft.lines];
    lines[i] = { ...lines[i], ...patch };
    update({ lines });
  };
  const addLine = () => update({ lines: [...draft.lines, emptyLine()] });
  const removeLine = (i: number) => update({ lines: draft.lines.filter((_, idx) => idx !== i) });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0f172a] border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{draft.id ? "Edit" : "New"} Journal Entry</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Date">
            <Input type="date" value={draft.entry_date} onChange={(e) => update({ entry_date: e.target.value })}
                   className="bg-black/20 border-white/10 text-white" />
          </Field>
          <Field label="Journal No.">
            <Input value={draft.journal_no} onChange={(e) => update({ journal_no: e.target.value })}
                   placeholder="JV-001" className="bg-black/20 border-white/10 text-white" />
          </Field>
          <Field label="Reference No.">
            <Input value={draft.reference_no} onChange={(e) => update({ reference_no: e.target.value })}
                   className="bg-black/20 border-white/10 text-white" />
          </Field>
          <Field label="Prepared By">
            <Input value={draft.prepared_by} onChange={(e) => update({ prepared_by: e.target.value })}
                   className="bg-black/20 border-white/10 text-white" />
          </Field>
        </div>
        <Field label="Remarks">
          <Textarea rows={2} value={draft.remarks} onChange={(e) => update({ remarks: e.target.value })}
                    className="bg-black/20 border-white/10 text-white" />
        </Field>

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-widest text-white/40 px-2">
            <div className="col-span-4">Account Title</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-2 text-right">Debit</div>
            <div className="col-span-2 text-right">Credit</div>
            <div className="col-span-1"></div>
          </div>
          {draft.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-4 bg-black/20 border-white/10 text-white" placeholder="Account name"
                     value={l.account_name} onChange={(e) => updateLine(i, { account_name: e.target.value })} />
              <Input className="col-span-3 bg-black/20 border-white/10 text-white" placeholder="Description"
                     value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
              <Input type="number" step="0.01" className="col-span-2 bg-black/20 border-white/10 text-white text-right"
                     value={l.debit || ""} onChange={(e) => updateLine(i, { debit: parseFloat(e.target.value) || 0, credit: 0 })} />
              <Input type="number" step="0.01" className="col-span-2 bg-black/20 border-white/10 text-white text-right"
                     value={l.credit || ""} onChange={(e) => updateLine(i, { credit: parseFloat(e.target.value) || 0, debit: 0 })} />
              <Button variant="ghost" size="sm" className="col-span-1 text-white/40 hover:text-rose-400"
                      onClick={() => removeLine(i)} disabled={draft.lines.length <= 1}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLine}
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add line
          </Button>
        </div>

        <div className={`grid grid-cols-3 gap-3 p-4 rounded-xl border ${balanced ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/30"}`}>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Debit</div>
            <div className="text-lg font-mono font-bold">{fmtMoney(dr)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Credit</div>
            <div className="text-lg font-mono font-bold">{fmtMoney(cr)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Difference</div>
            <div className={`text-lg font-mono font-bold ${balanced ? "text-emerald-400" : "text-rose-400"}`}>
              {fmtMoney(Math.abs(dr - cr))}
            </div>
          </div>
        </div>

        <Field label="Approved By">
          <Input value={draft.approved_by} onChange={(e) => update({ approved_by: e.target.value })}
                 className="bg-black/20 border-white/10 text-white" />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</Button>
          <Button onClick={() => onSave(draft)} disabled={!balanced} className="bg-blue-600 hover:bg-blue-700">
            <Save className="h-4 w-4 mr-2" /> Save & Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</label>
      {children}
    </div>
  );
}
