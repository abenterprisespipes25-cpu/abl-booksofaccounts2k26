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
  recapSundries?: { account: string; dr: number; cr: number }[];
  recapFunds?: { fund: string; amount: number }[];
}) {
  const { filename, bookName, monthYear, columns, rows, recapSundries, recapFunds } = opts;


  const settings = await getCompanySettings();
  
  // Header Rows (1-4 as per spec, but we have 6 lines of info if we include company name, title, etc)
  // Spec: Row 1: Company, Row 2: Title, Row 3: For the month of, Row 4: blank, Row 5: Header1, Row 6: Header2
  const headerRows: any[][] = [
    [settings.company_name],
    [bookName],
    [`FOR THE MONTH OF ${monthYear}`],
    [],
  ];

  const hasDoubleHeaders = columns.some(c => c.header1 !== undefined || c.header2 !== undefined);
  if (hasDoubleHeaders) {
    headerRows.push(columns.map(c => c.header1 ?? c.header ?? ""));
    headerRows.push(columns.map(c => c.header2 ?? ""));
  } else {
    headerRows.push(columns.map(c => c.header));
  }

  const dataAoa: any[][] = [...headerRows];
  for (const r of rows) dataAoa.push(columns.map((c) => cellValue(r, c)));
  
  // Totals
  const totals = columns.map((c) => {
    if (c.type === "currency") {
      return rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
    }
    return c === columns[0] ? "TOTAL" : "";
  });
  dataAoa.push(totals);

  const ws = XLSX.utils.aoa_to_sheet(dataAoa);
  
  // Column Widths from config
  ws["!cols"] = columns.map((c) => ({ wch: c.width || 10 }));

  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  const borderAll = { 
    top: { style: 'thin', color: { rgb: 'CBD5E1' } }, 
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, 
    left: { style: 'thin', color: { rgb: 'CBD5E1' } }, 
    right: { style: 'thin', color: { rgb: 'CBD5E1' } } 
  };
  const borderDouble = { top: { style: 'double', color: { rgb: '000000' } } };

  const infoRowsCount = 4;
  const colHeaderRowsCount = hasDoubleHeaders ? 2 : 1;
  const dataStartRow = infoRowsCount + colHeaderRowsCount;

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 'z', v: null };

      const isInfoRow = R < infoRowsCount;
      const isColHeader = R >= infoRowsCount && R < dataStartRow;
      const isTotalRow = R === dataAoa.length - 1;
      const isDataRow = R >= dataStartRow && R < dataAoa.length - 1;

      if (isInfoRow) {
        ws[addr].s = {
          font: { name: 'Arial', sz: R === 0 ? 12 : 10, bold: true },
          alignment: { horizontal: 'left' }
        };
      } else if (isColHeader) {
        ws[addr].s = {
          font: { name: 'Arial', sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '0F2744' }, patternType: 'solid' },
          border: borderAll,
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        };
      } else {
        ws[addr].s = {
          font: {
            name: 'Arial',
            sz: isTotalRow ? 10 : 9,
            bold: isTotalRow,
            color: { rgb: '000000' },
          },
          fill: isTotalRow
            ? { fgColor: { rgb: 'DBEAFE' }, patternType: 'solid' }
            : (R % 2 === 0 ? { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' } : { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' }),
          border: isTotalRow ? { ...borderAll, top: borderDouble.top } : borderAll,
          alignment: {
            horizontal: columns[C]?.type === 'currency' ? 'right' : 'left',
            vertical: 'center',
            wrapText: false,
          },
          numFmt: columns[C]?.type === 'currency' ? '#,##0.00' : undefined,
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  // Add Sundries Recap if provided
  if (recapSundries && recapSundries.length > 0) {
    const recapAoa: any[][] = [
      [],
      ["RECAPITULATION OF SUNDRY ACCOUNTS"],
      ["S U N D R I E S", "Debit", "Credit"],
    ];
    recapSundries.forEach(s => recapAoa.push([s.account, s.dr || "", s.cr || ""]));
    const recapWs = XLSX.utils.aoa_to_sheet(recapAoa);
    recapWs["!cols"] = [{ wch: 40 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, recapWs, "Recap - Sundries");
  }

  // Add Fund Recap if provided
  if (recapFunds && recapFunds.length > 0) {
    const recapAoa: any[][] = [
      [],
      ["RECAPITULATION OF BANK ACCOUNTS"],
      ["F U N D", "Amount"],
    ];
    recapFunds.forEach(f => recapAoa.push([f.fund, f.amount || ""]));
    const recapWs = XLSX.utils.aoa_to_sheet(recapAoa);
    recapWs["!cols"] = [{ wch: 40 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, recapWs, "Recap - Bank Accounts");
  }

  XLSX.writeFile(wb, filename);
}



export async function exportPDF(opts: {
  filename: string;
  bookName: string;
  monthYear: string;
  columns: ColumnDef[];
  rows: any[];
  orientation?: "landscape" | "portrait";
  recapSundries?: { account: string; dr: number; cr: number }[];
  recapFunds?: { fund: string; amount: number }[];
}) {
  const { filename, bookName, monthYear, columns, rows, orientation = "landscape", recapSundries, recapFunds } = opts;


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

  const isCDB = bookName.toUpperCase().includes("CASH DISBURSEMENTS");
  const splitIndex = isCDB ? columns.findIndex(c => c.header2?.includes("TOP 10K")) : -1;

  const renderTable = (cols: ColumnDef[], startY: number, title?: string) => {
    const head = [cols.map((c) => c.header2 || c.header)];
    const body = rows.map((r) =>
      cols.map((c) =>
        c.type === "currency" ? (r[c.field] ? fmtMoney(r[c.field]) : "") : c.type === "date" ? fmtDate(r[c.field]) : String(r[c.field] ?? "")
      )
    );
    // totals row
    const totals = cols.map((c, i) => {
      if (c.type === "currency") {
        const sum = rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
        return sum !== 0 ? fmtMoney(sum) : "";
      }
      return i === 0 ? "TOTAL" : "";
    });
    body.push(totals);

    const columnStyles: Record<number, any> = {};
    cols.forEach((c, i) => {
      columnStyles[i] = {
        halign: c.type === "currency" ? "right" : "left",
        cellWidth: isCDB ? (c.width ? c.width * 6.5 : 40) : 'auto',
      };
    });

    if (title) {
       doc.setFontSize(8);
       doc.setFont("helvetica", "bold");
       doc.text(title, 30, startY - 4);
    }

    autoTable(doc, {
      head, body,
      startY: startY,
      theme: "grid",
      styles: { fontSize: 5, cellPadding: 1.2, overflow: "ellipsize" },
      headStyles: { fillColor: [15, 39, 68], textColor: 255, fontStyle: "bold", fontSize: 5.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      margin: { left: 30, right: 30 },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1 && data.section === "body") {
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [30, 58, 95];
        }
      },
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages();
        const current = doc.internal.getCurrentPageInfo().pageNumber;
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(`Page ${current} of ${pageCount}`, pageWidth / 2, h - 15, { align: "center" });
      },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  if (isCDB && splitIndex > 0) {
    // PART 1
    const cols1 = columns.slice(0, splitIndex + 1);
    let lastY = renderTable(cols1, y + 10, "Part 1: Primary Accounts (up to ITW Top 10K)");
    
    doc.addPage();
    // Repeat Header on new page
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(lines[0], pageWidth / 2, 30, { align: "center" });
    doc.setFontSize(8); doc.text(`${bookName} - ${monthYear} (Part 2)`, pageWidth / 2, 45, { align: "center" });

    // PART 2: Include Date, Payee, and Check No as reference columns
    const refCols = columns.slice(0, 3);
    const cols2 = [...refCols, ...columns.slice(splitIndex + 1)];
    lastY = renderTable(cols2, 60, "Part 2: Expenses & Sundries");
    y = lastY;
  } else {
    y = renderTable(columns, y + 10);
  }

  // Add Recap to PDF
  if (recapSundries && recapSundries.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 150) doc.addPage();
    else y += 30;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("RECAPITULATION OF SUNDRY ACCOUNTS", 30, y);
    y += 12;

    const recapHead = [["S U N D R I E S", "DEBIT", "CREDIT"]];
    const recapBody = recapSundries.map(s => [s.account, s.dr ? fmtMoney(s.dr) : "", s.cr ? fmtMoney(s.cr) : ""]);
    recapBody.push(["TOTAL", 
      fmtMoney(recapSundries.reduce((acc, s) => acc + s.dr, 0)),
      fmtMoney(recapSundries.reduce((acc, s) => acc + s.cr, 0))
    ]);

    autoTable(doc, {
      head: recapHead,
      body: recapBody,
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255 },
      columnStyles: { 0: { cellWidth: 250 }, 1: { halign: "right", cellWidth: 80 }, 2: { halign: "right", cellWidth: 80 } },
      margin: { left: 30 },
      didParseCell: (data) => {
        if (data.row.index === recapBody.length - 1) {
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.fontStyle = "bold";
        }
      }
    });
  }

  // Add Fund Recap to PDF
  if (recapFunds && recapFunds.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 150) doc.addPage();
    else y += 30;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("RECAPITULATION OF BANK ACCOUNTS", 30, y);
    y += 12;

    const recapHead = [["F U N D", "AMOUNT"]];
    const recapBody = recapFunds.map(f => [f.fund, fmtMoney(f.amount)]);
    recapBody.push(["TOTAL", fmtMoney(recapFunds.reduce((acc, f) => acc + f.amount, 0))]);

    autoTable(doc, {
      head: recapHead,
      body: recapBody,
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255 },
      columnStyles: { 0: { cellWidth: 250 }, 1: { halign: "right", cellWidth: 80 } },
      margin: { left: 30 },
      didParseCell: (data) => {
        if (data.row.index === recapBody.length - 1) {
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.fontStyle = "bold";
        }
      }
    });
  }

  doc.save(filename);
}


