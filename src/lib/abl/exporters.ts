// ABL v2.1 — Excel / PDF export helpers (uses company_settings)
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ColumnDef } from "./config";
import { fmtDate, fmtMoney } from "./format";
import { getCompanySettings, CompanySettings } from "./companySettings";

function cellValue(row: any, col: ColumnDef): any {
  const v = row[col.field];
  if (col.type === "currency") return Number(v) || 0;
  if (col.type === "date") return fmtDate(v);
  return v ?? "";
}

function headerLines(s: CompanySettings, bookName: string, monthYear: string): string[] {
  return [
    s.company_name,
    s.address,
    s.tin_no ? `TIN: ${s.tin_no}` : "",
    bookName,
    `For the month of ${monthYear}`,
  ].filter((l) => l !== "");
}

export async function exportExcel(opts: {
  filename: string;
  bookName: string;
  monthYear: string;
  columns: ColumnDef[];
  rows: any[];
}) {
  const { filename, bookName, monthYear, columns, rows } = opts;
  const settings = await getCompanySettings();
  const wb = XLSX.utils.book_new();
  const lines = headerLines(settings, bookName, monthYear);
  const headerAoa: any[][] = [
    ...lines.map((l) => [l]),
    [],
    columns.map((c) => c.header),
  ];
  for (const r of rows) headerAoa.push(columns.map((c) => cellValue(r, c)));
  // Totals
  const totals = columns.map((c) => {
    if (c.type === "currency") {
      return rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
    }
    return c === columns[0] ? "TOTAL" : "";
  });
  headerAoa.push(totals);

  const ws = XLSX.utils.aoa_to_sheet(headerAoa);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(10, Math.floor((c.width || 100) / 7)) }));

  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  const borderAll = { top:{style:'thin',color:{rgb:'CBD5E1'}}, bottom:{style:'thin',color:{rgb:'CBD5E1'}}, left:{style:'thin',color:{rgb:'CBD5E1'}}, right:{style:'thin',color:{rgb:'CBD5E1'}} };
  const borderDouble = { top:{style:'double',color:{rgb:'000000'}} };

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({r:R, c:C});
      if (!ws[addr]) ws[addr] = {t:'z', v:null};

      const isHeaderArea = R < lines.length + 1; // company name, etc.
      const isColHeader = R === lines.length + 1;
      const isTotalRow = R === headerAoa.length - 1;
      const isDataRow = R > lines.length + 1 && !isTotalRow;

      if (!isHeaderArea) {
        ws[addr].s = {
          font: {
            name:  'Arial',
            sz:    isColHeader || isTotalRow ? 10 : 9,
            bold:  isColHeader || isTotalRow,
            color: { rgb: isColHeader ? 'FFFFFF' : '000000' },
          },
          fill: isColHeader
            ? { fgColor: { rgb: '0F2744' }, patternType: 'solid' }
            : isTotalRow
            ? { fgColor: { rgb: 'DBEAFE' }, patternType: 'solid' }
            : (R % 2 === 0 ? { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' } : { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' }),
          border: isTotalRow ? { ...borderAll, top: borderDouble.top } : borderAll,
          alignment: {
            horizontal: columns[C]?.type === 'currency' ? 'right' : 'left',
            vertical:   'center',
            wrapText:   false,
          },
          numFmt: columns[C]?.type === 'currency' ? '#,##0.00' : undefined,
        };
      } else {
        // Title area formatting
        ws[addr].s = {
          font: { name: 'Arial', sz: R === 0 ? 12 : 10, bold: true },
          alignment: { horizontal: 'center' }
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

export async function exportPDF(opts: {
  filename: string;
  bookName: string;
  monthYear: string;
  columns: ColumnDef[];
  rows: any[];
  orientation?: "landscape" | "portrait";
}) {
  const { filename, bookName, monthYear, columns, rows, orientation = "landscape" } = opts;
  const settings = await getCompanySettings();
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  const lines = headerLines(settings, bookName, monthYear);
  let y = 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(lines[0], pageWidth / 2, y, { align: "center" }); y += 13;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  // address / TIN
  for (let i = 1; i < lines.length - 2; i++) {
    doc.text(lines[i], pageWidth / 2, y, { align: "center" }); y += 11;
  }
  // module name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(lines[lines.length - 2], pageWidth / 2, y, { align: "center" }); y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(lines[lines.length - 1], pageWidth / 2, y, { align: "center" }); y += 8;

  const head = [columns.map((c) => c.header)];
  const body = rows.map((r) =>
    columns.map((c) =>
      c.type === "currency" ? fmtMoney(r[c.field]) : c.type === "date" ? fmtDate(r[c.field]) : String(r[c.field] ?? "")
    )
  );
  // totals row
  const totals = columns.map((c, i) => {
    if (c.type === "currency") {
      return fmtMoney(rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0));
    }
    return i === 0 ? "TOTAL" : "";
  });
  body.push(totals);

  const columnStyles: Record<number, any> = {};
  columns.forEach((c, i) => {
    columnStyles[i] = {
      halign: c.type === "currency" ? "right" : "left",
      cellWidth: Math.max(35, (c.width || 95) * 0.7),
    };
  });

  autoTable(doc, {
    head, body,
    startY: y + 6,
    theme: "grid",
    styles: { fontSize: 6.5, cellPadding: 2, overflow: "ellipsize" },
    headStyles: { fillColor: [15, 39, 68], textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    didParseCell: (data) => {
      if (data.row.index === body.length - 1 && data.section === "body") {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [30, 58, 95];
      }
    },
    didDrawPage: () => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${current} of ${pageCount} — ABL v2.1`, pageWidth / 2, h - 15, { align: "center" });
    },
  });
  doc.save(filename);
}
