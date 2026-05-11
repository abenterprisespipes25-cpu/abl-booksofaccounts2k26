import React, { useState, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Printer, Download, Settings, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DEFAULT_COLUMNS = [
  { id: 'CASH_AMOUNT', line1: 'CASH', line2: 'AMOUNT', keywords: ['CASH', 'CHECK', 'CIB', 'BANK', 'BDO'] },
  { id: 'ACCOUNTS_PAYABLE_TRADE', line1: 'ACCOUNTS', line2: 'PAYABLE-TRADE', keywords: ['ACCOUNTS PAYABLE', 'AP TRADE'] },
  { id: 'VAT_INPUT_TAX', line1: 'VAT', line2: 'INPUT TAX', keywords: ['INPUT TAX', 'VAT', 'INPUT VAT'] },
  { id: 'DIRECT_LABOR_BASIC', line1: 'DIRECT', line2: 'LABOR / BASIC', keywords: ['DIRECT LABOR', 'DIRECT', 'LABOR'] },
  { id: 'OVERHEAD_LABOR_BASIC', line1: 'OVERHEAD', line2: 'LABOR / BASIC', keywords: ['OVERHEAD'] },
  { id: 'COMM_LIGHT_WATER_PLANT', line1: 'COMM., LIGHT &', line2: 'WATER-PLANT', keywords: ['WATER-PLANT', 'WATER (PLANT)'] },
  { id: 'COMM_LIGHT_WATER_ADMIN', line1: 'COMM., LIGHT &', line2: 'WATER-ADMIN', keywords: ['WATER-ADMIN', 'WATER (ADMIN)'] },
  { id: 'COMM_LIGHT_WATER_SALES', line1: 'COMM., LIGHT &', line2: 'WATER-SALES', keywords: ['WATER-SALES', 'WATER (SALES)'] },
  { id: 'ITW_TOP_10K_CORP', line1: 'ITW', line2: 'TOP 10K CORP.', keywords: ['TOP 10K', 'TOP CORP'] },
  { id: 'ITW_COMPENSATION', line1: 'ITW', line2: 'COMPENSATION', keywords: ['COMPENSATION'] },
  { id: 'ITW_AT_SOURCE', line1: 'ITW', line2: 'AT SOURCE', keywords: ['AT SOURCE'] },
  { id: 'SSS_PHIC_HDMF_PREM_PAYABLE', line1: 'SSS, PHIC & HDMF', line2: 'PREM. PAYABLE', keywords: ['SSS', 'PHIC', 'PREMIUM'] },
  { id: 'SSS_HDMF_LOAN_PAYABLE', line1: 'SSS/HDMF', line2: 'LOAN PAYABLE', keywords: ['LOAN', 'HDMF'] },
  { id: 'OUTSIDE_SERVICES_CONSTRUCTION', line1: 'OUTSIDE SERVICES', line2: 'Construction', keywords: ['OUTSIDE SERVICES'] },
  { id: 'TRAVEL_TRANSPORTATION_ADMIN', line1: 'TRAVEL & TRANSPORTATION', line2: 'ADMIN.', keywords: ['TRAVEL ADMIN', 'TRANSPORTATION ADMIN', 'TRAVEL'] },
  { id: 'TRAVEL_TRANSPORTATION_SALES', line1: 'TRAVEL & TRANSPORTATION', line2: 'SALES', keywords: ['TRAVEL SALES', 'TRANSPORTATION SALES'] },
  { id: 'TRAVEL_TRANSPORTATION_CONSTRUCTION', line1: 'TRAVEL & TRANSPORTATION', line2: 'CONSTRUCTION', keywords: ['TRAVEL CONSTRUCTION'] },
  { id: 'TRAVEL_TRANSPORTATION_WATER', line1: 'TRAVEL & TRANSPORTATION', line2: 'WATER', keywords: ['TRAVEL WATER'] },
  { id: 'SALES_COMM_3RD_PARTY_PAY', line1: 'SALES COMM', line2: '3RD PARTY PAY', keywords: ['COMMISSION', '3RD PARTY', 'SALES COMM'] },
  { id: 'DELIVERY_EXPENSES', line1: 'Delivery', line2: 'Expenses', keywords: ['DELIVERY'] },
  { id: 'ADVANCES_TO_OFFICERS_EMP', line1: 'ADVANCES TO', line2: 'OFFICERS/EMP.', keywords: ['OFFICERS', 'EMPLOYEE', 'ADVANCE', 'EMP'] },
];

interface GeneratedRow {
  date: string;
  payee: string;
  particulars: string;
  pcvNo: string;
  cvNo: string;
  checkNo: string;
  fund: string;
  amounts: Record<string, number>;
  sundryTitle?: string;
  sundryDr?: number;
  sundryCr?: number;
}

export default function CDBReportGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [reportData, setReportData] = useState<GeneratedRow[]>([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const saved = localStorage.getItem('cdb_column_mappings');
    if (saved) {
      try { setColumns(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const saveMappings = (newCols: typeof DEFAULT_COLUMNS) => {
    setColumns(newCols);
    localStorage.setItem('cdb_column_mappings', JSON.stringify(newCols));
    toast.success("Mappings saved successfully");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const generateReport = async () => {
    if (!file) {
      toast.error("Please upload a source Excel file first.");
      return;
    }
    setLoading(true);
    
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      
      let headerIdx = -1;
      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        if (row.some(c => String(c).toLowerCase().includes('account'))) {
          headerIdx = i;
          break;
        }
      }
      
      if (headerIdx === -1) {
        toast.error("Could not find header row with 'Account' column.");
        setLoading(false);
        return;
      }
      
      const headers = rawData[headerIdx].map(h => String(h).toLowerCase().trim());
      const colDate = headers.findIndex(h => h.includes('date'));
      const colName = headers.findIndex(h => h.includes('name') || h === 'payee');
      const colDesc = headers.findIndex(h => h.includes('memo') || h.includes('desc'));
      const colRef = headers.findIndex(h => h.includes('no.') || h.includes('num') || h.includes('ref'));
      const colAcct = headers.findIndex(h => h.includes('account'));
      const colDr = headers.findIndex(h => h === 'debit');
      const colCr = headers.findIndex(h => h === 'credit');

      const result: GeneratedRow[] = [];
      let currentDate = "";
      let currentPayee = "";
      let currentParticulars = "";
      let currentRef = "";
      let currentType = "";

      for (let i = headerIdx + 1; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r[colAcct] && !r[colDr] && !r[colCr]) continue;

        const dateVal = r[colDate];
        if (dateVal) {
          currentDate = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
        }
        if (r[colName]) currentPayee = String(r[colName]);
        if (r[colDesc]) currentParticulars = String(r[colDesc]);
        if (r[colRef]) currentRef = String(r[colRef]);
        
        // Try to determine if it's a Check or Petty Cash based on "No." or "Type" if colType existed
        // Since we don't have colType, we'll use No. logic or default to Check
        const isPetty = currentRef.toUpperCase().includes('PCV');
        const pcvNo = isPetty ? currentRef : "";
        const cvNo = !isPetty ? currentRef : "";

        const account = String(r[colAcct] || "").toUpperCase();
        const debit = parseFloat(String(r[colDr]).replace(/,/g, '')) || 0;
        const credit = parseFloat(String(r[colCr]).replace(/,/g, '')) || 0;

        if (debit === 0 && credit === 0) continue;

        // Auto-mapping logic
        let matchedColId = "";
        
        if (credit > 0) {
          if (account.includes("PAYABLE")) {
            matchedColId = "ACCOUNTS_PAYABLE_TRADE";
          } else {
            matchedColId = "CASH_AMOUNT";
          }
        } else if (debit > 0) {
          for (const col of columns) {
            if (col.keywords.some(kw => account.includes(kw.toUpperCase()))) {
              matchedColId = col.id;
              break;
            }
          }
        }

        let existingRow = result.find(x => x.date === currentDate && x.payee === currentPayee && x.particulars === currentParticulars && (x.pcvNo === pcvNo || x.cvNo === cvNo));
        if (!existingRow) {
          existingRow = { 
            date: currentDate, 
            payee: currentPayee, 
            particulars: currentParticulars, 
            pcvNo, cvNo, checkNo: "", fund: "",
            amounts: {} 
          };
          result.push(existingRow);
        }

        if (matchedColId) {
          existingRow.amounts[matchedColId] = (existingRow.amounts[matchedColId] || 0) + (debit > 0 ? debit : credit);
        } else {
          if (!existingRow.sundryTitle) {
            existingRow.sundryTitle = account;
            existingRow.sundryDr = debit;
            existingRow.sundryCr = credit;
          } else {
            result.push({
              date: "", payee: "", particulars: "", pcvNo: "", cvNo: "", checkNo: "", fund: "",
              amounts: {},
              sundryTitle: account, sundryDr: debit, sundryCr: credit
            });
          }
        }
      }
      
      setReportData(result);
      toast.success("Report generated successfully!");
    } catch (e: any) {
      toast.error("Failed to generate report: " + e.message);
    }
    setLoading(false);
  };

  const fmt = (n?: number) => (n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

  const getTotals = () => {
    const t: Record<string, number> = {};
    columns.forEach(c => t[c.id] = 0);
    let sDr = 0;
    let sCr = 0;
    reportData.forEach(r => {
      Object.entries(r.amounts).forEach(([k, v]) => {
        t[k] = (t[k] || 0) + v;
      });
      if (r.sundryDr) sDr += r.sundryDr;
      if (r.sundryCr) sCr += r.sundryCr;
    });
    return { ...t, sundryDr: sDr, sundryCr: sCr };
  };

  const totals = getTotals();

  // Excel Export
  const exportExcel = () => {
    const wsData: any[][] = [];
    wsData.push(["CASH DISBURSEMENT BOOK"]);
    wsData.push([`For the month of ${month || '________'}`]);
    wsData.push([]);
    
    const h1 = ["DATE", "", "", "PETTY CASH", "CHECK", "", "", "CASH", "ACCOUNTS", "VAT", "DIRECT", "OVERHEAD", "COMM., LIGHT &", "COMM., LIGHT &", "COMM., LIGHT &", "ITW", "ITW", "ITW", "SSS, PHIC & HDMF", "SSS/HDMF", "OUTSIDE SERVICES", "TRAVEL & TRANSPORTATION", "TRAVEL & TRANSPORTATION", "TRAVEL & TRANSPORTATION", "TRAVEL & TRANSPORTATION", "SALES COMM", "Delivery", "ADVANCES TO", "S U N D R I E S", "S U N D R I E S", "S U N D R I E S"];
    const h2 = [month || "JAN., 2025", "PAYEE", "PARTICULARS", "VOUCHER NO.", "VOUCHER NO.", "CHECK NO.", "FUND", "AMOUNT", "PAYABLE-TRADE", "INPUT TAX", "LABOR / BASIC", "LABOR / BASIC", "WATER-PLANT", "WATER-ADMIN", "WATER-SALES", "TOP 10K CORP.", "COMPENSATION", "AT SOURCE", "PREM. PAYABLE", "LOAN PAYABLE", "Construction", "ADMIN.", "SALES", "CONSTRUCTION", "WATER", "3RD PARTY PAY", "Expenses", "OFFICERS/EMP.", "ACCT. TITLE", "DR", "CR"];
    wsData.push(h1);
    wsData.push(h2);

    reportData.forEach(r => {
      const row = [r.date, r.payee, r.particulars, r.pcvNo, r.cvNo, r.checkNo, r.fund];
      columns.forEach(c => row.push(r.amounts[c.id] || 0));
      row.push(r.sundryTitle || "", r.sundryDr || 0, r.sundryCr || 0);
      wsData.push(row);
    });

    const tRow = ["TOTAL", "", "", "", "", "", ""];
    columns.forEach(c => tRow.push(totals[c.id] || 0));
    tRow.push("", totals.sundryDr || 0, totals.sundryCr || 0);
    wsData.push(tRow);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Auto-size columns slightly
    ws["!cols"] = [
      { wch: 12 }, // Date
      { wch: 25 }, // Payee
      { wch: 25 }, // Particulars
      { wch: 15 }, // PCV
      { wch: 15 }, // CV
      { wch: 15 }, // Check No
      { wch: 10 }, // Fund
      ...columns.map(() => ({ wch: 15 })), // Amount cols
      { wch: 25 }, // Sundry Title
      { wch: 15 }, // Sundry Dr
      { wch: 15 }  // Sundry Cr
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({r:R, c:C});
        if (!ws[addr]) continue;
        if (R > 3 && C > 3 && typeof ws[addr].v === 'number') {
          ws[addr].z = '#,##0.00'; // Accounting format
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CDB Report");
    XLSX.writeFile(wb, `CDB_Report_${month || 'Output'}.xlsx`);
  };

  // PDF Export
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("CASH DISBURSEMENT BOOK", 40, 40);
    doc.setFontSize(10);
    doc.text(`For the month of ${month || '________'}`, 40, 55);

    const head = [
      ["DATE", "PAYEE", "PARTICULARS", "PCV", "CV", "CHK", "FND", ...columns.map(c => `${c.line1}\n${c.line2}`), "SUNDRIES\nTITLE", "SUNDRIES\nDR", "SUNDRIES\nCR"]
    ];
    
    const body = reportData.map(r => [
      r.date, 
      r.payee.substring(0, 15), 
      r.particulars.substring(0, 15), 
      r.pcvNo,
      r.cvNo,
      r.checkNo,
      r.fund,
      ...columns.map(c => r.amounts[c.id] ? fmt(r.amounts[c.id]) : ''),
      r.sundryTitle || '',
      r.sundryDr ? fmt(r.sundryDr) : '',
      r.sundryCr ? fmt(r.sundryCr) : ''
    ]);

    body.push([
      "TOTAL", "", "", "", "", "", "",
      ...columns.map(c => totals[c.id] ? fmt(totals[c.id]) : ''),
      "",
      totals.sundryDr ? fmt(totals.sundryDr) : '',
      totals.sundryCr ? fmt(totals.sundryCr) : ''
    ]);

    autoTable(doc, {
      head, body,
      startY: 70,
      styles: { fontSize: 3.5, cellPadding: 1 },
      headStyles: { fillColor: [15, 39, 68], textColor: 255, halign: 'center' },
      columnStyles: {
        ...Object.fromEntries(columns.map((_, i) => [i + 7, { halign: 'right' }])),
        [columns.length + 7]: { halign: 'left', cellWidth: 40 },
        [columns.length + 8]: { halign: 'right' },
        [columns.length + 9]: { halign: 'right' }
      }
    });

    doc.save(`CDB_Report_${month || 'Output'}.pdf`);
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-wrap gap-4 items-end justify-between no-print bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-white tracking-tighter">CDB Report Generator</h2>
          <p className="text-sm text-white/40 font-medium">
            Generate wide-format Cash Disbursement Books from Quickbooks exports.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-11 px-4 rounded-xl">
                <Settings className="h-4 w-4 mr-2" /> Map Accounts
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0a1628] border-white/10 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Account to Column Mappings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {columns.map((col, idx) => (
                  <div key={col.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 text-xs font-bold text-white/70">{col.line1} {col.line2}</div>
                    <div className="col-span-8">
                      <Input 
                        defaultValue={col.keywords.join(', ')} 
                        className="bg-black/20 border-white/10 text-sm h-8"
                        onBlur={(e) => {
                          const newCols = [...columns];
                          newCols[idx].keywords = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          saveMappings(newCols);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-xl rounded-2xl no-print">
        <div className="flex flex-wrap gap-6 items-end">
          <div className="space-y-2 flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-white/50 uppercase tracking-widest">Select Month</label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-black/20 border-white/10 text-white h-12 rounded-xl" />
          </div>
          <div className="space-y-2 flex-1 min-w-[300px]">
            <label className="text-xs font-bold text-white/50 uppercase tracking-widest">Source Excel File</label>
            <div className="flex items-center gap-2">
              <Input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="bg-black/20 border-white/10 text-white h-12 rounded-xl file:text-blue-400 file:font-bold file:mr-4 file:bg-transparent file:border-0" />
            </div>
          </div>
          <Button onClick={generateReport} disabled={loading || !file} className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-105 active:scale-95">
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Upload className="h-5 w-5 mr-2" />}
            Generate Report
          </Button>
        </div>
      </Card>

      {reportData.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center no-print">
            <h3 className="text-lg font-bold text-white">Preview Output</h3>
            <div className="flex gap-2">
              <Button onClick={printReport} variant="outline" className="bg-white/5 border-white/10 text-white"><Printer className="h-4 w-4 mr-2"/> Print</Button>
              <Button onClick={exportPDF} variant="outline" className="bg-white/5 border-white/10 text-white"><FileText className="h-4 w-4 mr-2"/> PDF</Button>
              <Button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Download className="h-4 w-4 mr-2"/> Excel</Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl printable-area">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr>
                  <th colSpan={7} className="p-4 border border-white/10 text-center font-bold text-white bg-[#0a1628]">TRANSACTION DETAILS</th>
                  <th colSpan={columns.length} className="p-4 border border-white/10 text-center font-bold text-white bg-[#0a1628]">ACCOUNT DISTRIBUTIONS</th>
                  <th colSpan={3} className="p-4 border border-white/10 text-center font-bold text-white bg-[#0a1628]">S U N D R I E S</th>
                </tr>
                <tr className="bg-[#0f2744]">
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">Date</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">Payee</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">Particulars</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">PCV No.</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">CV No.</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">CHK No.</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-white/70 border border-white/10">Fund</th>
                  {columns.map(c => (
                    <th key={c.id} className="px-3 py-2 text-[9px] font-black uppercase text-white/70 border border-white/10 text-center whitespace-nowrap leading-tight">
                      {c.line1}<br/>{c.line2}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[9px] font-black uppercase text-white/70 border border-white/10 text-center leading-tight">ACCT.<br/>TITLE</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase text-white/70 border border-white/10 text-center leading-tight">DR</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase text-white/70 border border-white/10 text-center leading-tight">CR</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] border-b border-white/5">
                    <td className="px-4 py-2 text-[11px] font-mono text-white/60 border border-white/10">{r.date}</td>
                    <td className="px-4 py-2 text-[11px] text-white/90 border border-white/10 max-w-[150px] truncate" title={r.payee}>{r.payee}</td>
                    <td className="px-4 py-2 text-[11px] text-white/60 border border-white/10 max-w-[150px] truncate" title={r.particulars}>{r.particulars}</td>
                    <td className="px-4 py-2 text-[11px] font-mono text-white/50 border border-white/10">{r.pcvNo}</td>
                    <td className="px-4 py-2 text-[11px] font-mono text-white/50 border border-white/10">{r.cvNo}</td>
                    <td className="px-4 py-2 text-[11px] font-mono text-white/50 border border-white/10">{r.checkNo}</td>
                    <td className="px-4 py-2 text-[11px] font-mono text-white/50 border border-white/10">{r.fund}</td>
                    {columns.map(c => (
                      <td key={c.id} className="px-3 py-2 text-[11px] font-mono text-right border border-white/10 text-emerald-400/90">
                        {fmt(r.amounts[c.id])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-[11px] text-white/60 border border-white/10 max-w-[150px] truncate" title={r.sundryTitle}>{r.sundryTitle}</td>
                    <td className="px-3 py-2 text-[11px] font-mono text-right border border-white/10 text-emerald-400/90">{fmt(r.sundryDr)}</td>
                    <td className="px-3 py-2 text-[11px] font-mono text-right border border-white/10 text-rose-400/90">{fmt(r.sundryCr)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#0a1628] font-bold">
                  <td colSpan={7} className="px-4 py-3 text-right text-xs text-white/50 tracking-widest border border-white/10">GRAND TOTAL</td>
                  {columns.map(c => (
                    <td key={c.id} className="px-3 py-3 text-[11px] font-mono text-right border border-white/10 text-blue-400">
                      {fmt(totals[c.id])}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-[11px] border border-white/10"></td>
                  <td className="px-3 py-3 text-[11px] font-mono text-right border border-white/10 text-blue-400">{fmt(totals.sundryDr)}</td>
                  <td className="px-3 py-3 text-[11px] font-mono text-right border border-white/10 text-blue-400">{fmt(totals.sundryCr)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
