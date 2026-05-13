// ABL v2.2 — Professional Accounting Excel / PDF Export
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ColumnDef } from "./config";
import { fmtDate, fmtMoney } from "./format";
import { getCompanySettings, CompanySettings } from "./companySettings";

/* ─────────── helpers ─────────── */

function cellValue(row: any, col: ColumnDef): any {
  const v = row[col.field];
  if (col.type === "currency") return Number(v) || 0;
  if (col.type === "date") return fmtDate(v);
  return v ?? "";
}

function headerLines(s: CompanySettings, bookName: string, monthYear: string): string[] {
  return [
    s.company_name || "JHAYMARTS INDUSTRIES, INC.",
    s.address || "",
    s.tin_no ? `TIN: ${s.tin_no}` : "",
    bookName,
    `FOR THE MONTH OF ${monthYear}`,
  ].filter((l) => l !== "");
}

/** Full solid black thin border — applied to every data cell */
const BORDER_THIN: any = {
  top:    { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left:   { style: "thin", color: { rgb: "000000" } },
  right:  { style: "thin", color: { rgb: "000000" } },
};

/** Thick/medium border for totals top */
const BORDER_MEDIUM_TOP: any = {
  top:    { style: "medium", color: { rgb: "000000" } },
  bottom: { style: "thin",  color: { rgb: "000000" } },
  left:   { style: "thin",  color: { rgb: "000000" } },
  right:  { style: "thin",  color: { rgb: "000000" } },
};

/** Double border for grand totals */
const BORDER_DOUBLE_TOP: any = {
  top:    { style: "double", color: { rgb: "000000" } },
  bottom: { style: "thin",  color: { rgb: "000000" } },
  left:   { style: "thin",  color: { rgb: "000000" } },
  right:  { style: "thin",  color: { rgb: "000000" } },
};

function setCellStyle(ws: XLSX.WorkSheet, r: number, c: number, style: any) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: "z", v: "" };
  ws[addr].s = style;
}

/* ─────────── EXCEL EXPORT ─────────── */

export async function exportExcel(opts: {
  filename: string;
  bookName: string;
  monthYear: string;
  columns: ColumnDef[];
  rows: any[];
  recapSundries?: { account: string; dr?: number; cr?: number; amount?: number }[];
  recapFunds?: { fund: string; amount: number }[];
}) {
  const { filename, bookName, monthYear, columns, rows, recapSundries, recapFunds } = opts;
  const settings = await getCompanySettings();
  const colCount = columns.length;

  // ── Build AOA ──
  const aoa: any[][] = [];

  // Title rows (rows 0-2)
  aoa.push([settings.company_name || "JHAYMARTS INDUSTRIES, INC."]);
  aoa.push([bookName]);
  aoa.push([`FOR THE MONTH OF ${monthYear}`]);
  aoa.push([]); // blank separator (row 3)

  const INFO_ROWS = 4;

  const hasDoubleHeaders = columns.some(c => c.header1 !== undefined || c.header2 !== undefined);

  if (hasDoubleHeaders) {
    aoa.push(columns.map(c => c.header1 ?? c.header ?? ""));  // row INFO_ROWS
    aoa.push(columns.map(c => c.header2 ?? ""));               // row INFO_ROWS+1
  } else {
    aoa.push(columns.map(c => c.header ?? ""));               // row INFO_ROWS
  }

  const COL_HEADER_ROWS = hasDoubleHeaders ? 2 : 1;
  const DATA_START_ROW = INFO_ROWS + COL_HEADER_ROWS;

  // Data rows
  for (const r of rows) {
    aoa.push(columns.map(c => cellValue(r, c)));
  }

  // Totals row
  const totalsRow = columns.map((c, i) => {
    if (c.type === "currency") {
      return rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
    }
    return i === 0 ? "TOTAL" : "";
  });
  aoa.push(totalsRow);

  const TOTAL_ROW = aoa.length - 1;

  // ── Sheet ──
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = columns.map(c => ({ wch: c.width || 10 }));

  // Row heights
  ws["!rows"] = aoa.map((_, i) => {
    if (i < INFO_ROWS) return { hpt: i === 0 ? 22 : 16 };
    if (i < DATA_START_ROW) return { hpt: 24 };
    return { hpt: 15 };
  });

  // ── Merges: title rows across all columns ──
  const merges: XLSX.Range[] = [];
  for (let r = 0; r < INFO_ROWS; r++) {
    if (colCount > 1) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  }

  // Merged header groups (header1 spans)
  if (hasDoubleHeaders) {
    let ci = 0;
    while (ci < columns.length) {
      const h1 = columns[ci].header1 ?? columns[ci].header;
      let span = 1;
      while (ci + span < columns.length && (columns[ci + span].header1 ?? columns[ci + span].header) === h1) span++;
      if (span > 1) merges.push({ s: { r: INFO_ROWS, c: ci }, e: { r: INFO_ROWS, c: ci + span - 1 } });
      ci += span;
    }
  }
  ws["!merges"] = merges;

  // ── Apply Styles ──
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: "z", v: "" };

      const isTitle   = R < INFO_ROWS;
      const isColHead = R >= INFO_ROWS && R < DATA_START_ROW;
      const isData    = R >= DATA_START_ROW && R < TOTAL_ROW;
      const isTotal   = R === TOTAL_ROW;
      const isCurrency = columns[C]?.type === "currency";

      if (isTitle) {
        ws[addr].s = {
          font: { name: "Arial", sz: R === 0 ? 13 : 11, bold: true },
          alignment: { horizontal: "center", vertical: "center" },
        };
      } else if (isColHead) {
        ws[addr].s = {
          font: { name: "Arial", sz: 9, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "0F2744" }, patternType: "solid" },
          border: BORDER_THIN,
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      } else if (isData) {
        ws[addr].s = {
          font: { name: "Arial", sz: 9, color: { rgb: "000000" } },
          fill: { fgColor: { rgb: "FFFFFF" }, patternType: "solid" },
          border: BORDER_THIN,
          alignment: {
            horizontal: isCurrency ? "right" : "left",
            vertical: "center",
          },
          numFmt: isCurrency ? '#,##0.00' : undefined,
        };
      } else if (isTotal) {
        ws[addr].s = {
          font: { name: "Arial", sz: 10, bold: true, color: { rgb: "1E3A5F" } },
          fill: { fgColor: { rgb: "DBEAFE" }, patternType: "solid" },
          border: BORDER_DOUBLE_TOP,
          alignment: {
            horizontal: isCurrency ? "right" : (C === 0 ? "right" : "center"),
            vertical: "center",
          },
          numFmt: isCurrency ? '#,##0.00' : undefined,
        };
      }
    }
  }

  // ── Freeze Panes ──
  ws["!views"] = [
    { state: "frozen", xSplit: 0, ySplit: DATA_START_ROW }
  ];

  // ── Print settings ──
  const isPortraitBook = bookName.toUpperCase().includes("SALES") || bookName.toUpperCase().includes("CASH RECEIPTS");
  ws["!pageSetup"] = {
    orientation: isPortraitBook ? "portrait" : "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: isPortraitBook ? 1 : 5, // 1=Letter (Coupon Bond), 5=Legal
  };
  ws["!printOptions"] = { gridLines: true };
  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

  // ── Workbook ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, monthYear.replace(/\s+/g, "_").substring(0, 31));

  // ── Recap: Sundries sheet ──
  if (recapSundries && recapSundries.length > 0) {
    const isPB = bookName.toUpperCase().includes("PURCHASE");
    const rAoa: any[][] = [
      [settings.company_name || "JHAYMARTS INDUSTRIES, INC."],
      ["RECAPITULATION OF SUNDRY ACCOUNTS"],
      [`FOR THE MONTH OF ${monthYear}`],
      [],
      isPB
        ? ["S U N D R I E S", "AMOUNT", "TOTAL"]
        : ["S U N D R I E S", "DEBIT", "CREDIT"],
    ];
    recapSundries.forEach(s => {
      if (isPB) {
        const v = s.amount ?? 0;
        rAoa.push([s.account, v, v]);
      } else {
        rAoa.push([s.account, s.dr ?? "", s.cr ?? ""]);
      }
    });
    const gDr = recapSundries.reduce((a, s) => a + (s.amount ?? s.dr ?? 0), 0);
    const gCr = recapSundries.reduce((a, s) => a + (s.amount ?? s.cr ?? 0), 0);
    rAoa.push(isPB ? ["GRAND TOTAL", gDr, gDr] : ["TOTAL", gDr, gCr]);

    const rWs = XLSX.utils.aoa_to_sheet(rAoa);
    rWs["!cols"] = [{ wch: 45 }, { wch: 18 }, { wch: 18 }];
    // Style header + data
    const rRange = XLSX.utils.decode_range(rWs["!ref"] ?? "A1:C1");
    for (let R = rRange.s.r; R <= rRange.e.r; R++) {
      for (let C = rRange.s.c; C <= rRange.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!rWs[addr]) rWs[addr] = { t: "z", v: "" };
        const isHead = R === 4;
        const isTotal2 = R === rAoa.length - 1;
        rWs[addr].s = {
          font: { name: "Arial", sz: 9, bold: isHead || isTotal2 || R < 4, color: { rgb: "000000" } },
          fill: isHead
            ? { fgColor: { rgb: "0F2744" }, patternType: "solid" }
            : isTotal2
            ? { fgColor: { rgb: "DBEAFE" }, patternType: "solid" }
            : undefined,
          border: R >= 4 ? BORDER_THIN : undefined,
          alignment: { horizontal: R < 4 ? "center" : C === 0 ? "left" : "right", vertical: "center" },
          numFmt: C > 0 && R >= 5 ? "#,##0.00" : undefined,
        };
        if (isHead) rWs[addr].s.font.color = { rgb: "FFFFFF" };
      }
    }
    if (rRange.e.c > 0) {
      for (let r = 0; r < 4; r++) {
        rWs["!merges"] = rWs["!merges"] ?? [];
        (rWs["!merges"] as XLSX.Range[]).push({ s: { r, c: 0 }, e: { r, c: 2 } });
      }
    }
    XLSX.utils.book_append_sheet(wb, rWs, isPB ? "Sundries-PB" : "Sundries-CDB");
  }

  // ── Recap: Bank Accounts sheet ──
  if (recapFunds && recapFunds.length > 0) {
    const fAoa: any[][] = [
      [settings.company_name || "JHAYMARTS INDUSTRIES, INC."],
      ["RECAPITULATION OF BANK ACCOUNTS"],
      [`FOR THE MONTH OF ${monthYear}`],
      [],
      ["F U N D", "AMOUNT"],
    ];
    recapFunds.forEach(f => fAoa.push([f.fund, f.amount]));
    const total = recapFunds.reduce((a, f) => a + f.amount, 0);
    fAoa.push(["TOTAL", total]);

    const fWs = XLSX.utils.aoa_to_sheet(fAoa);
    fWs["!cols"] = [{ wch: 45 }, { wch: 20 }];
    const fRange = XLSX.utils.decode_range(fWs["!ref"] ?? "A1:B1");
    for (let R = fRange.s.r; R <= fRange.e.r; R++) {
      for (let C = fRange.s.c; C <= fRange.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!fWs[addr]) fWs[addr] = { t: "z", v: "" };
        const isHead = R === 4;
        const isTotal3 = R === fAoa.length - 1;
        fWs[addr].s = {
          font: { name: "Arial", sz: 9, bold: isHead || isTotal3 || R < 4, color: { rgb: "000000" } },
          fill: isHead
            ? { fgColor: { rgb: "0F2744" }, patternType: "solid" }
            : isTotal3
            ? { fgColor: { rgb: "D1FAE5" }, patternType: "solid" }
            : undefined,
          border: R >= 4 ? BORDER_THIN : undefined,
          alignment: { horizontal: R < 4 ? "center" : C === 0 ? "left" : "right", vertical: "center" },
          numFmt: C === 1 && R >= 5 ? "#,##0.00" : undefined,
        };
        if (isHead) fWs[addr].s.font.color = { rgb: "FFFFFF" };
      }
    }
    if (fRange.e.c > 0) {
      for (let r = 0; r < 4; r++) {
        fWs["!merges"] = fWs["!merges"] ?? [];
        (fWs["!merges"] as XLSX.Range[]).push({ s: { r, c: 0 }, e: { r, c: 1 } });
      }
    }
    XLSX.utils.book_append_sheet(wb, fWs, "Bank-Accounts");
  }

  // Write with cellStyles enabled (required for XLSX-style)
  XLSX.writeFile(wb, filename, { bookType: "xlsx", cellStyles: true });
}


/* ─────────── PDF EXPORT ─────────── */

export async function exportPDF(opts: {
  filename: string;
  bookName: string;
  monthYear: string;
  columns: ColumnDef[];
  rows: any[];
  orientation?: "landscape" | "portrait";
  recapSundries?: { account: string; dr?: number; cr?: number; amount?: number }[];
  recapFunds?: { fund: string; amount: number }[];
}) {
  const {
    filename, bookName, monthYear, columns, rows,
    orientation = "landscape", recapSundries, recapFunds,
  } = opts;

  const settings = await getCompanySettings();
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const drawHeader = (subtitle?: string) => {
    let y = 28;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(settings.company_name || "JHAYMARTS INDUSTRIES, INC.", pageW / 2, y, { align: "center" });
    y += 14;
    if (settings.address) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(settings.address, pageW / 2, y, { align: "center" }); y += 11;
    }
    if (settings.tin_no) {
      doc.text(`TIN: ${settings.tin_no}`, pageW / 2, y, { align: "center" }); y += 11;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(bookName, pageW / 2, y, { align: "center" }); y += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`FOR THE MONTH OF ${monthYear}`, pageW / 2, y, { align: "center" }); y += 8;
    if (subtitle) {
      doc.setFontSize(8); doc.text(subtitle, 30, y + 4); y += 10;
    }
    return y;
  };

  const isCDB = bookName.toUpperCase().includes("CASH DISBURSEMENT");
  const splitIndex = isCDB ? columns.findIndex(c => c.header2?.includes("TOP 10K")) : -1;

  const renderTable = (cols: ColumnDef[], startY: number): number => {
    const head = cols.map(c => c.header2 || c.header || "");
    const body = rows.map(r =>
      cols.map(c =>
        c.type === "currency"
          ? (r[c.field] ? fmtMoney(r[c.field]) : "")
          : c.type === "date"
          ? fmtDate(r[c.field])
          : String(r[c.field] ?? "")
      )
    );
    const totals = cols.map((c, i) => {
      if (c.type === "currency") {
        const s = rows.reduce((acc, r) => acc + (Number(r[c.field]) || 0), 0);
        return s !== 0 ? fmtMoney(s) : "";
      }
      return i === 0 ? "TOTAL" : "";
    });
    body.push(totals);

    const colStyles: Record<number, any> = {};
    cols.forEach((c, i) => {
      colStyles[i] = {
        halign: c.type === "currency" ? "right" : "left",
        cellWidth: isCDB ? (c.width ? c.width * 6 : 36) : "auto",
      };
    });

    autoTable(doc, {
      head: [head],
      body,
      startY,
      theme: "grid",
      styles: { fontSize: 5.5, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.2, overflow: "ellipsize" },
      headStyles: {
        fillColor: [15, 39, 68], textColor: 255, fontStyle: "bold", fontSize: 6,
        lineColor: [0, 0, 0], lineWidth: 0.4,
      },
      alternateRowStyles: { fillColor: [242, 245, 250] },
      columnStyles: colStyles,
      margin: { left: 30, right: 30 },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1 && data.section === "body") {
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [30, 58, 95];
          data.cell.styles.lineWidth = 0.5;
        }
      },
      didDrawPage: () => {
        const pdf = doc as any;
        const pgCount = pdf.getNumberOfPages();
        const cur = pdf.getCurrentPageInfo().pageNumber;
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(7); doc.setFont("helvetica", "normal");
        doc.text(`Page ${cur} of ${pgCount}`, pageW / 2, h - 12, { align: "center" });
      },
    });
    return (doc as any).lastAutoTable.finalY as number;
  };

  let y = drawHeader();

  if (isCDB && splitIndex > 0) {
    y = renderTable(columns.slice(0, splitIndex + 1), y + 10);
    doc.addPage();
    y = drawHeader("(Part 2 — Expenses & Sundries)");
    y = renderTable([...columns.slice(0, 3), ...columns.slice(splitIndex + 1)], y + 6);
  } else {
    y = renderTable(columns, y + 10);
  }

  // Recap Sundries
  if (recapSundries && recapSundries.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 160) { doc.addPage(); y = drawHeader() + 10; }
    else y += 30;

    const isPB = bookName.toUpperCase().includes("PURCHASE");
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("RECAPITULATION OF SUNDRY ACCOUNTS", 30, y); y += 12;

    const rHead = [isPB ? ["S U N D R I E S", "AMOUNT", "TOTAL"] : ["S U N D R I E S", "DEBIT", "CREDIT"]];
    const rBody = recapSundries.map(s =>
      isPB
        ? [s.account, fmtMoney(s.amount ?? 0), fmtMoney(s.amount ?? 0)]
        : [s.account, s.dr ? fmtMoney(s.dr) : "", s.cr ? fmtMoney(s.cr) : ""]
    );
    const gDr = recapSundries.reduce((a, s) => a + (s.amount ?? s.dr ?? 0), 0);
    const gCr = recapSundries.reduce((a, s) => a + (s.amount ?? s.cr ?? 0), 0);
    rBody.push(isPB ? ["GRAND TOTAL", fmtMoney(gDr), fmtMoney(gDr)] : ["TOTAL", fmtMoney(gDr), fmtMoney(gCr)]);

    autoTable(doc, {
      head: rHead, body: rBody, startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.3 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255, lineWidth: 0.4, lineColor: [0, 0, 0] },
      columnStyles: { 0: { cellWidth: 250 }, 1: { halign: "right", cellWidth: 90 }, 2: { halign: "right", cellWidth: 90 } },
      margin: { left: 30 },
      didParseCell: (data) => {
        if (data.row.index === rBody.length - 1) {
          data.cell.styles.fillColor = [219, 234, 254]; data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // Recap Funds
  if (recapFunds && recapFunds.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 160) { doc.addPage(); y = drawHeader() + 10; }
    else y += 30;

    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("RECAPITULATION OF BANK ACCOUNTS", 30, y); y += 12;

    const fHead = [["F U N D", "AMOUNT"]];
    const fBody = recapFunds.map(f => [f.fund, fmtMoney(f.amount)]);
    fBody.push(["TOTAL", fmtMoney(recapFunds.reduce((a, f) => a + f.amount, 0))]);

    autoTable(doc, {
      head: fHead, body: fBody, startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.3 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255, lineWidth: 0.4, lineColor: [0, 0, 0] },
      columnStyles: { 0: { cellWidth: 250 }, 1: { halign: "right", cellWidth: 100 } },
      margin: { left: 30 },
      didParseCell: (data) => {
        if (data.row.index === fBody.length - 1) {
          data.cell.styles.fillColor = [209, 250, 229]; data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  doc.save(filename);
}
