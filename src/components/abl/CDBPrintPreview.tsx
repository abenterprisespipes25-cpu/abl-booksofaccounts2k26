import React, { useState } from "react";
import { X, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/abl/format";

interface CDBPrintPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  companyName: string;
  monthYear: string;
}

const ROWS_PER_PAGE = 26;

export const CDBPrintPreview: React.FC<CDBPrintPreviewProps> = ({
  isOpen,
  onClose,
  rows,
  companyName,
  monthYear,
}) => {
  const [currentPage, setCurrentPage] = useState(0);

  if (!isOpen) return null;

  // Split rows into pages
  const pages: any[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  }

  const totalPages = pages.length || 1;

  const handlePrint = () => {
    window.print();
  };

  const getColHValue = (r: any) => {
    // formula = SUM(I:AE)
    const fields = [
      'accounts_payable', 'vat_input_tax', 'direct_labor', 'overhead_labor',
      'clw_plant', 'clw_admin', 'clw_sales', 'itw_top10k',
      'itw_compensation', 'itw_at_source', 'sss_prem', 'sss_loan',
      'outside_services', 'travel_admin', 'travel_sales', 'travel_const',
      'travel_water', 'sales_comm', 'delivery_exp', 'advances',
      'sundries_dr', 'sundries_cr'
    ];
    return fields.reduce((sum, f) => sum + (Number(r[f]) || 0), 0);
  };

  const calculateGrandTotal = (field: string) => {
    return rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
  };

  const colHGrandTotal = rows.reduce((sum, r) => sum + getColHValue(r), 0);

  const previewColWidths = {
    A: 38, B: 110, C: 128, D: 42, E: 42, F: 42, G: 48, H: 52, I: 52, J: 52, K: 52,
    L: 52, M: 52, N: 52, O: 52, P: 52, Q: 52, R: 52, S: 52, T: 52, U: 52, V: 52,
    W: 52, X: 52, Y: 52, Z: 52, AA: 52, AB: 52, AC: 150, AD: 52, AE: 52
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 flex flex-col overflow-hidden print-preview-modal">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border-b border-white/10 no-print">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all"
          >
            <X size={18} />
            <span>Close</span>
          </button>
          <div className="text-white/60 text-sm">
            Print Preview — Legal Landscape
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button 
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-white font-bold text-sm min-w-[80px] text-center">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button 
              disabled={currentPage === totalPages - 1}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg disabled:opacity-30 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg shadow-lg shadow-orange-500/20 transition-all"
          >
            <Printer size={18} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Pages Container */}
      <div className="flex-1 overflow-auto p-8 flex flex-col gap-8 bg-[#2a2a2a] print:p-0 print:bg-white">
        {pages.map((pageRows, pageIdx) => (
          <div 
            key={pageIdx}
            className={`preview-page ${pageIdx === currentPage ? "block" : "hidden print:block"}`}
          >
            {/* Header Content */}
            <div className="mb-10"> {/* Margin for blank spacer rows (4-7) */}
              <div className="font-bold text-[10pt] font-arial">{companyName}</div>
              <div className="font-bold text-[10pt] font-arial uppercase">Cash Disbursements Book</div>
              <div className="font-bold text-[10pt] font-arial uppercase">For the Month of {monthYear}</div>
            </div>

            {/* Table */}
            <table className="preview-table">
              <thead>
                <tr className="head-row-1">
                  <th style={{ width: previewColWidths.A }}>DATE</th>
                  <th colSpan={2} style={{ width: previewColWidths.B + previewColWidths.C }}></th>
                  <th style={{ width: previewColWidths.D }}>PETTY CASH</th>
                  <th style={{ width: previewColWidths.E }}>CHECK</th>
                  <th style={{ width: previewColWidths.F }}></th>
                  <th style={{ width: previewColWidths.G }}></th>
                  <th style={{ width: previewColWidths.H }}>CASH</th>
                  <th style={{ width: previewColWidths.I }}>ACCOUNTS</th>
                  <th style={{ width: previewColWidths.J }}>VAT</th>
                  <th style={{ width: previewColWidths.K }}>DIRECT</th>
                  <th style={{ width: previewColWidths.L }}>OVERHEAD</th>
                  <th style={{ width: previewColWidths.M }}>COMM., LIGHT &</th>
                  <th style={{ width: previewColWidths.N }}>COMM., LIGHT &</th>
                  <th style={{ width: previewColWidths.O }}>COMM., LIGHT &</th>
                  <th style={{ width: previewColWidths.P }}>ITW</th>
                  <th style={{ width: previewColWidths.Q }}>ITW</th>
                  <th style={{ width: previewColWidths.R }}>ITW</th>
                  <th style={{ width: previewColWidths.S }}>SSS, PHIC & HDMF</th>
                  <th style={{ width: previewColWidths.T }}>SSS/HDMF</th>
                  <th style={{ width: previewColWidths.U }}>OUTSIDE SERVICES</th>
                  <th colSpan={2} style={{ width: previewColWidths.V + previewColWidths.W }}>TRAVEL & TRANSPORTATION</th>
                  <th colSpan={2} style={{ width: previewColWidths.X + previewColWidths.Y }}>TRAVEL & TRANSPORTATION</th>
                  <th style={{ width: previewColWidths.Z }}>SALES COMM</th>
                  <th style={{ width: previewColWidths.AA }}>Delivery</th>
                  <th style={{ width: previewColWidths.AB }}>ADVANCES TO</th>
                  <th style={{ width: previewColWidths.AC }}>S  U  N  D  R  I  E  S</th>
                  <th colSpan={2} style={{ width: previewColWidths.AD + previewColWidths.AE }}>A M O U N T</th>
                </tr>
                <tr className="head-row-2">
                  <th>{monthYear ? `${monthYear.substring(0, 3).toUpperCase()}., ${monthYear.split(' ')[1]}` : ""}</th>
                  <th style={{ width: previewColWidths.B }}>PAYEE</th>
                  <th style={{ width: previewColWidths.C }}>PARTICULARS</th>
                  <th>VOUCHER NO.</th>
                  <th>VOUCHER NO.</th>
                  <th>CHECK NO.</th>
                  <th>FUND</th>
                  <th>AMOUNT</th>
                  <th>PAYABLE-TRADE</th>
                  <th>INPUT TAX</th>
                  <th>LABOR / BASIC</th>
                  <th>LABOR  / BASIC</th>
                  <th>WATER-PLANT</th>
                  <th>WATER-ADMIN</th>
                  <th>WATER-SALES</th>
                  <th>TOP 10K CORP.</th>
                  <th>COMPENSATION</th>
                  <th>AT SOURCE</th>
                  <th>PREM. PAYABLE</th>
                  <th>LOAN PAYABLE</th>
                  <th>Construction</th>
                  <th style={{ width: previewColWidths.V }}>ADMIN.</th>
                  <th style={{ width: previewColWidths.W }}>SALES</th>
                  <th style={{ width: previewColWidths.X }}>CONSTRUCTION</th>
                  <th style={{ width: previewColWidths.Y }}>WATER</th>
                  <th>3RD PARTY PAY</th>
                  <th>Expenses</th>
                  <th>OFFICERS/EMP.</th>
                  <th>ACCT. TITLE</th>
                  <th style={{ width: previewColWidths.AD }}>DR</th>
                  <th style={{ width: previewColWidths.AE }}>CR.</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="center">{fmtDate(r.entry_date)}</td>
                    <td className="left">{r.payee}</td>
                    <td className="left">{r.particulars}</td>
                    <td className="center">{r.petty_cash_vno}</td>
                    <td className="center">{r.check_vno}</td>
                    <td className="center">{r.check_no}</td>
                    <td className="center">{r.fund_label}</td>
                    <td className="num">{fmtMoney(getColHValue(r))}</td>
                    <td className="num">{fmtMoney(r.accounts_payable)}</td>
                    <td className="num">{fmtMoney(r.vat_input_tax)}</td>
                    <td className="num">{fmtMoney(r.direct_labor)}</td>
                    <td className="num">{fmtMoney(r.overhead_labor)}</td>
                    <td className="num">{fmtMoney(r.clw_plant)}</td>
                    <td className="num">{fmtMoney(r.clw_admin)}</td>
                    <td className="num">{fmtMoney(r.clw_sales)}</td>
                    <td className="num">{fmtMoney(r.itw_top10k)}</td>
                    <td className="num">{fmtMoney(r.itw_compensation)}</td>
                    <td className="num">{fmtMoney(r.itw_at_source)}</td>
                    <td className="num">{fmtMoney(r.sss_prem)}</td>
                    <td className="num">{fmtMoney(r.sss_loan)}</td>
                    <td className="num">{fmtMoney(r.outside_services)}</td>
                    <td className="num">{fmtMoney(r.travel_admin)}</td>
                    <td className="num">{fmtMoney(r.travel_sales)}</td>
                    <td className="num">{fmtMoney(r.travel_const)}</td>
                    <td className="num">{fmtMoney(r.travel_water)}</td>
                    <td className="num">{fmtMoney(r.sales_comm)}</td>
                    <td className="num">{fmtMoney(r.delivery_exp)}</td>
                    <td className="num">{fmtMoney(r.advances)}</td>
                    <td className="left">{r.sundries_title}</td>
                    <td className="num">{fmtMoney(r.sundries_dr)}</td>
                    <td className="num">{fmtMoney(r.sundries_cr)}</td>
                  </tr>
                ))}
                
                {pageIdx === totalPages - 1 && (
                  <>
                    <tr className="sep-row">
                      <td colSpan={31} className="left italic" style={{ border: 'none', padding: '10px 0 0 100px' }}>
                        * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
                      </td>
                    </tr>
                    <tr className="grand-total-row">
                      <td className="center font-bold"></td>
                      <td className="left font-bold" colSpan={6}>GRAND TOTAL</td>
                      <td className="num font-bold">{fmtMoney(colHGrandTotal)}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('accounts_payable'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('vat_input_tax'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('direct_labor'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('overhead_labor'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('clw_plant'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('clw_admin'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('clw_sales'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('itw_top10k'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('itw_compensation'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('itw_at_source'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('sss_prem'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('sss_loan'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('outside_services'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('travel_admin'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('travel_sales'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('travel_const'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('travel_water'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('sales_comm'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('delivery_exp'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('advances'))}</td>
                      <td className="left font-bold"></td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('sundries_dr'))}</td>
                      <td className="num font-bold">{fmtMoney(calculateGrandTotal('sundries_cr'))}</td>
                    </tr>
                    <tr className="verification-row">
                      <td colSpan={7}></td>
                      <td className="num font-bold border-none">{fmtMoney(colHGrandTotal)}</td>
                      <td colSpan={23} className="border-none"></td>
                    </tr>
                    <tr className="verification-row">
                      <td colSpan={7}></td>
                      <td className="num font-bold border-none">0.00</td>
                      <td colSpan={23} className="border-none"></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            <div className="page-number">
              Page {pageIdx + 1} of {totalPages}
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print-preview-modal,
          .print-preview-modal * { visibility: visible; }
          .print-preview-modal {
            position: absolute; top: 0; left: 0;
            width: 100%;
            background: white !important;
          }
          .no-print { display: none !important; }
          .preview-page {
            width: 14in !important;
            min-height: 8.5in !important;
            padding: 0.75in 1.28in 0.75in 1.25in !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always !important;
            display: block !important;
            position: relative !important;
          }
          @page {
            size: legal landscape;
            margin: 0;
          }
          .flex-1 { overflow: visible !important; }
        }

        .preview-page {
          background: white;
          width: 1100px;
          min-height: 667px;
          padding: 54px 90px 54px 90px;
          margin: 0 auto;
          box-shadow: 0 4px 32px rgba(0,0,0,0.5);
          position: relative;
        }

        .preview-table {
          width: 100%;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
          font-size: 7pt;
          table-layout: fixed;
        }

        .preview-table th {
          font-size: 7pt;
          font-weight: bold;
          text-align: center;
          border: 1.5px solid #000;
          padding: 2px 3px;
          background: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          line-height: 1.2;
        }

        .preview-table td {
          font-size: 7pt;
          border: 0.5px solid #000;
          padding: 1px 3px;
          white-space: nowrap;
          overflow: hidden;
          background: #ffffff;
          line-height: 1.3;
        }

        .preview-table td.num {
          text-align: right;
          font-family: Arial, monospace;
        }

        .preview-table td.center { text-align: center; }
        .preview-table td.left { text-align: left; }
        
        .grand-total-row td {
          border: 1.5px solid #000;
        }

        .page-number {
          position: absolute;
          bottom: 20px;
          width: 100%;
          text-align: center;
          font-size: 7pt;
          font-family: Arial;
          color: #333;
          left: 0;
        }
      `}} />
    </div>
  );
};
