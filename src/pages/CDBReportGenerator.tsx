import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, FileText, Printer, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseCDB } from "@/lib/abl/parsers";
import { CDB_COLUMNS } from "@/lib/abl/config";
import { fmtDate, fmtMoney, monthYearToTabLabel } from "@/lib/abl/format";
import { getCompanySettings } from "@/lib/abl/companySettings";
import { cn } from "@/lib/utils";

// Helper: format number for display (empty string for zero/null)
const fmt = (n?: number | null) => {
  if (n === null || n === undefined || n === 0) return "";
  return Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Helper: excel number value
const xNum = (n?: number | null) => (n && n !== 0 ? Number(n) : "");

export default function CDBReportGenerator() {
  const [rows, setRows] = useState<any[]>([]);
  const [monthYear, setMonthYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── PARSE ──────────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseCDB(buf);

      if (!parsed.rows.length) {
        toast.error("No valid transactions found. Check the file format.");
        setLoading(false);
        return;
      }

      setRows(parsed.rows);
      setMonthYear(parsed.monthYear);
      toast.success(`✅ ${parsed.rows.length} entries parsed for ${parsed.monthYear}`);
    } catch (e: any) {
      toast.error("Parse error: " + (e.message || String(e)));
    }
    setLoading(false);
  };

  // ── TOTALS ─────────────────────────────────────────────────────────────────
  const totals: Record<string, number> = {};
  for (const col of CDB_COLUMNS) {
    if (col.type === "currency") {
      totals[col.field] = rows.reduce((s, r) => s + (Number(r[col.field]) || 0), 0);
    }
  }

  // ── EXCEL EXPORT ───────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!rows.length) { toast.error("No data to export."); return; }
    const settings = await getCompanySettings();

    // Build AOA
    const aoa: any[][] = [
      [settings.company_name || "JHAYMARTS INDUSTRIES, INC."],
      ["CASH DISBURSEMENTS BOOK"],
      [`FOR THE MONTH OF ${monthYear}`],
      [], // blank row 4
      // Row 5 — header1
      CDB_COLUMNS.map(c => c.header1 ?? c.header),
      // Row 6 — header2
      CDB_COLUMNS.map(c => c.header2 ?? ""),
    ];

    // Data rows
    for (const r of rows) {
      aoa.push(
        CDB_COLUMNS.map(c => {
          if (c.type === "date") return fmtDate(r[c.field]);
          if (c.type === "currency") return xNum(r[c.field]);
          return r[c.field] ?? "";
        })
      );
    }

    // Totals row
    aoa.push(
      CDB_COLUMNS.map((c, i) => {
        if (c.type === "currency") return totals[c.field] || "";
        return i === 0 ? "TOTAL" : "";
      })
    );

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths from config
    ws["!cols"] = CDB_COLUMNS.map(c => ({ wch: c.width || 10 }));

    // Styling
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    const INFO_ROWS = 4;        // rows 0-3 (company name, title, period, blank)
    const HEADER_ROWS = 2;      // rows 4-5 (header1, header2)
    const DATA_START = INFO_ROWS + HEADER_ROWS;
    const TOTAL_ROW = aoa.length - 1;

    const borderThin = { style: "thin", color: { rgb: "CBD5E1" } };
    const borderAll = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) ws[addr] = { t: "z", v: null };

        const isInfo = R < INFO_ROWS;
        const isHeader = R >= INFO_ROWS && R < DATA_START;
        const isTotal = R === TOTAL_ROW;
        const col = CDB_COLUMNS[C];

        if (isInfo) {
          ws[addr].s = {
            font: { name: "Arial", sz: R === 0 ? 12 : 10, bold: true },
            alignment: { horizontal: "left" },
          };
        } else if (isHeader) {
          ws[addr].s = {
            font: { name: "Arial", sz: 8, bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "0F2744" }, patternType: "solid" },
            border: borderAll,
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
          };
        } else {
          ws[addr].s = {
            font: { name: "Arial", sz: 8, bold: isTotal, color: { rgb: "000000" } },
            fill: isTotal
              ? { fgColor: { rgb: "DBEAFE" }, patternType: "solid" }
              : R % 2 === 0
              ? { fgColor: { rgb: "FFFFFF" }, patternType: "solid" }
              : { fgColor: { rgb: "F9FAFB" }, patternType: "solid" },
            border: isTotal ? { ...borderAll, top: { style: "double", color: { rgb: "000000" } } } : borderAll,
            alignment: {
              horizontal: col?.type === "currency" ? "right" : "left",
              vertical: "center",
            },
            numFmt: col?.type === "currency" ? "#,##0.00" : undefined,
          };
        }
      }
    }

    // Merge company/title/period rows across all columns
    const colCount = CDB_COLUMNS.length - 1;
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push(
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: colCount } },
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthYear || "CDB");
    XLSX.writeFile(wb, `CDB_${(monthYear || "Report").replace(/\s+/g, "_")}.xlsx`);
    toast.success("Excel exported successfully.");
  };

  // ── PDF EXPORT ─────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!rows.length) { toast.error("No data to export."); return; }
    const settings = await getCompanySettings();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    let y = 28;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(settings.company_name || "JHAYMARTS INDUSTRIES, INC.", pw / 2, y, { align: "center" }); y += 14;
    doc.setFontSize(9);
    doc.text("CASH DISBURSEMENTS BOOK", pw / 2, y, { align: "center" }); y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`FOR THE MONTH OF ${monthYear}`, pw / 2, y, { align: "center" }); y += 10;

    const head = [
      CDB_COLUMNS.map(c => c.header1 ?? c.header),
      CDB_COLUMNS.map(c => c.header2 ?? ""),
    ];

    const body = rows.map(r =>
      CDB_COLUMNS.map(c => {
        if (c.type === "currency") return fmt(r[c.field]);
        if (c.type === "date") return fmtDate(r[c.field]);
        return r[c.field] ?? "";
      })
    );

    // Totals row
    body.push(
      CDB_COLUMNS.map((c, i) => {
        if (c.type === "currency") return fmt(totals[c.field]);
        return i === 0 ? "TOTAL" : "";
      })
    );

    const colStyles: Record<number, any> = {};
    CDB_COLUMNS.forEach((c, i) => {
      colStyles[i] = {
        halign: c.type === "currency" ? "right" : "left",
        cellWidth: (c.width || 10) * 4.5,
        fontSize: 5,
      };
    });

    autoTable(doc, {
      head, body,
      startY: y + 4,
      theme: "grid",
      styles: { fontSize: 5, cellPadding: 1.5, overflow: "ellipsize" },
      headStyles: { fillColor: [15, 39, 68], textColor: 255, fontStyle: "bold", fontSize: 5.5, halign: "center" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: colStyles,
      didParseCell: (data) => {
        if (data.row.index === body.length - 1 && data.section === "body") {
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [30, 58, 95];
        }
      },
      didDrawPage: () => {
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(6);
        doc.text(`CASH DISBURSEMENTS BOOK — ${monthYear} — Page ${(doc as any).internal.getCurrentPageInfo().pageNumber}`, pw / 2, h - 12, { align: "center" });
      },
    });

    doc.save(`CDB_${(monthYear || "Report").replace(/\s+/g, "_")}.pdf`);
    toast.success("PDF exported successfully.");
  };

  // ── PRINT ──────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── HEADER SPAN BUILD ──────────────────────────────────────────────────────
  const buildSpans = () => {
    const spans: { label: string; colSpan: number }[] = [];
    let i = 0;
    while (i < CDB_COLUMNS.length) {
      const h1 = CDB_COLUMNS[i].header1 ?? CDB_COLUMNS[i].header;
      if (!h1) { spans.push({ label: "", colSpan: 1 }); i++; continue; }
      let span = 1;
      while (i + span < CDB_COLUMNS.length && (CDB_COLUMNS[i + span].header1 ?? CDB_COLUMNS[i + span].header) === h1) span++;
      spans.push({ label: h1, colSpan: span });
      i += span;
    }
    return spans;
  };
  const headerSpans = buildSpans();

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">

      {/* ── TOOLBAR ── */}
      <div className="flex flex-wrap gap-4 items-end justify-between bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl no-print">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-white tracking-tighter">CDB Report Generator</h2>
          <p className="text-sm text-white/40 font-medium">
            Upload a Jhaymarts Cash Disbursements Detail export to generate the exact 31-column book.
          </p>
          {rows.length > 0 && (
            <div className="flex items-center gap-2 mt-1 text-xs font-bold text-emerald-400 uppercase tracking-widest">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{rows.length} rows — {monthYear}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Upload className="h-4 w-4 mr-2" />}
            {loading ? "Processing…" : "Upload & Parse"}
          </Button>
          <Button
            variant="outline"
            className="h-11 px-6 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl"
            disabled={!rows.length}
            onClick={exportExcel}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
          </Button>
          <Button
            variant="outline"
            className="h-11 px-6 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl"
            disabled={!rows.length}
            onClick={exportPDF}
          >
            <FileText className="h-4 w-4 mr-2" /> Export PDF
          </Button>
          <Button
            variant="outline"
            className="h-11 px-6 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl"
            disabled={!rows.length}
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* ── EMPTY STATE ── */}
      {!rows.length && !loading && (
        <div
          className="border-2 border-dashed border-white/10 rounded-2xl p-24 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-500/40 hover:bg-white/[0.02] transition-all"
          onClick={() => fileRef.current?.click()}
        >
          <div className="p-5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <Upload className="h-10 w-10 text-blue-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white/50">Click to upload or drag an Excel file</p>
            <p className="text-sm text-white/30 mt-1">
              Expects: <code className="text-blue-400/70">Jhaymarts Industries Incorporated_CASH DISBURSEMENTS - DETAIL.xlsx</code>
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-sm font-bold text-white/50 uppercase tracking-widest">Parsing file…</p>
        </div>
      )}

      {/* ── REPORT PREVIEW ── */}
      {rows.length > 0 && !loading && (
        <div className="space-y-3 printable-area">

          {/* Print header */}
          <div className="hidden print:block text-center space-y-1 mb-4">
            <p className="text-base font-bold">JHAYMARTS INDUSTRIES, INC.</p>
            <p className="text-sm font-bold">CASH DISBURSEMENTS BOOK</p>
            <p className="text-sm">FOR THE MONTH OF {monthYear}</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1628] shadow-2xl">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 z-20">
                {/* Header Row 1 — Grouped labels */}
                <tr className="bg-[#06101e]">
                  {headerSpans.map((span, i) => (
                    <th
                      key={i}
                      colSpan={span.colSpan}
                      className="px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/50 border border-white/[0.08] text-center"
                    >
                      {span.label}
                    </th>
                  ))}
                </tr>
                {/* Header Row 2 — Sub-column labels */}
                <tr className="bg-[#0f2744]">
                  {CDB_COLUMNS.map((c, i) => (
                    <th
                      key={i}
                      style={{ minWidth: `${(c.width || 10) * 8}px` }}
                      className={cn(
                        "px-2 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-white/70 border border-white/10",
                        c.type === "currency" ? "text-right" : "text-left"
                      )}
                    >
                      {c.header2 ?? c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr
                    key={r.id ?? ri}
                    className={cn(
                      "border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors",
                      ri % 2 === 1 && "bg-white/[0.01]"
                    )}
                  >
                    {CDB_COLUMNS.map((c, ci) => {
                      const val = r[c.field];
                      const isEmpty = c.type === "currency" && (!val || Number(val) === 0);
                      return (
                        <td
                          key={ci}
                          className={cn(
                            "px-2 py-1.5 text-[10px] border border-white/[0.05] font-mono",
                            c.type === "currency"
                              ? isEmpty
                                ? "text-right text-white/10"
                                : Number(val) > 0
                                ? "text-right text-emerald-400/90"
                                : "text-right text-rose-400/90"
                              : "text-left text-white/70"
                          )}
                        >
                          {c.type === "currency"
                            ? isEmpty ? "" : fmt(val)
                            : c.type === "date"
                            ? fmtDate(val)
                            : val ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-[#0f172a] border-t-2 border-blue-500/40">
                  {CDB_COLUMNS.map((c, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-2 py-2.5 text-[10px] border border-white/10 font-mono font-bold",
                        i === 0 ? "text-left text-white/50 tracking-widest font-sans" : "text-right text-blue-300"
                      )}
                    >
                      {c.type === "currency"
                        ? totals[c.field] ? fmt(totals[c.field]) : ""
                        : i === 0 ? "TOTAL" : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Row count summary */}
          <p className="text-xs text-white/30 text-right no-print">
            {rows.length} entries · {monthYear} · Source: {fileName}
          </p>
        </div>
      )}
    </div>
  );
}
