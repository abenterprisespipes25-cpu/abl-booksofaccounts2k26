import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySettings, CompanySettings } from "@/lib/abl/companySettings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import React from "react";

interface GLEntry {
  account_name: string;
  entry_date: string;
  month_year: string; // Used as month_tab
  source_module: string;
  folio: string;
  particulars: string;
  debit: number;
  credit: number;
}

interface TRow {
  date: string;
  particulars: string;
  folio: string;
  amount: number;
}

interface TAccountData {
  accountName: string;
  debitRows: TRow[];
  creditRows: TRow[];
  totalDR: number;
  totalCR: number;
  balanceDR: number;
  balanceCR: number;
  grandTotal: number;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

function mapParticulars(module: string): string {
  const m: Record<string, string> = {
    CDB: 'Disbursements', PB: 'Purchases', SB: 'Sales', CR: 'Collections',
    JB: 'General Journal Entries', GJB: 'General Journal Entries', JE: 'Journal Entry'
  };
  return m[module] ?? module;
}

function lastDayISO(dateStr: string): string {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
}

function lastDayDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MON[last.getMonth()]} ${last.getDate()}`;
}

function buildTAccount(accountName: string, entries: GLEntry[]): TAccountData {
  const groups = new Map<string, { dr: number; cr: number; particulars: string; folio: string; displayDate: string; sortKey: string }>();

  for (const entry of entries) {
    const key = `${entry.month_year}||${entry.source_module}`;
    if (!groups.has(key)) {
      groups.set(key, {
        dr:          0,
        cr:          0,
        particulars: mapParticulars(entry.source_module),
        folio:       entry.folio ?? entry.source_module,
        displayDate: lastDayDisplay(entry.entry_date),
        sortKey:     lastDayISO(entry.entry_date),
      });
    }
    const g = groups.get(key)!;
    g.dr = r2(g.dr + (entry.debit  || 0));
    g.cr = r2(g.cr + (entry.credit || 0));
  }

  const sorted = Array.from(groups.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const debitRows:  TRow[] = [];
  const creditRows: TRow[] = [];

  for (const g of sorted) {
    if (g.dr > 0) debitRows.push({  date: g.displayDate, particulars: g.particulars, folio: g.folio, amount: g.dr });
    if (g.cr > 0) creditRows.push({ date: g.displayDate, particulars: g.particulars, folio: g.folio, amount: g.cr });
  }

  const totalDR   = r2(debitRows.reduce((s, r)  => s + r.amount, 0));
  const totalCR   = r2(creditRows.reduce((s, r) => s + r.amount, 0));
  const balanceDR = totalCR > totalDR ? r2(totalCR - totalDR) : 0;
  const balanceCR = totalDR > totalCR ? r2(totalDR - totalCR) : 0;
  const grandTotal = r2(Math.max(totalDR + balanceDR, totalCR + balanceCR));

  return { accountName, debitRows, creditRows, totalDR, totalCR, balanceDR, balanceCR, grandTotal };
}

function exportGLAccountExcel(data: TAccountData, settings: CompanySettings) {
  const wb   = XLSX.utils.book_new();
  const maxLen = Math.max(data.debitRows.length, data.creditRows.length);

  const wsData: unknown[][] = [];
  wsData.push([settings.company_name, null, null, null, null, null, null, null, null]);
  if (settings.address) wsData.push([settings.address]);
  if (settings.tin_no)  wsData.push([`TIN: ${settings.tin_no}`]);
  wsData.push([]);
  wsData.push([data.accountName.toUpperCase()]);
  wsData.push([]);
  wsData.push(['DATE','PARTICULARS','FOLIO ','DEBIT',null,'DATE','PARTICULARS','FOLIO ','CREDIT']);

  for (let i = 0; i < maxLen; i++) {
    const dr = data.debitRows[i];
    const cr = data.creditRows[i];
    wsData.push([
      dr?.date ?? null, dr?.particulars ?? null, dr?.folio ?? null, dr ? dr.amount : null,
      null,
      cr?.date ?? null, cr?.particulars ?? null, cr?.folio ?? null, cr ? cr.amount : null,
    ]);
  }

  if (data.balanceDR > 0 || data.balanceCR > 0) {
    wsData.push([
      null, 'Balance c/d', null, data.balanceDR > 0 ? data.balanceDR : null,
      null,
      null, 'Balance c/d', null, data.balanceCR > 0 ? data.balanceCR : null,
    ]);
  }

  wsData.push([null,'TOTAL',null, data.grandTotal, null, null,'TOTAL',null, data.grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:12},{wch:30},{wch:16},{wch:18},{wch:2},{wch:12},{wch:30},{wch:16},{wch:18}];

  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:I1');
  const borderAll = { top:{style:'thin',color:{rgb:'CBD5E1'}}, bottom:{style:'thin',color:{rgb:'CBD5E1'}}, left:{style:'thin',color:{rgb:'CBD5E1'}}, right:{style:'thin',color:{rgb:'CBD5E1'}} };
  const borderMedium = { top:{style:'medium',color:{rgb:'000000'}}, bottom:{style:'medium',color:{rgb:'000000'}}, left:{style:'medium',color:{rgb:'000000'}}, right:{style:'medium',color:{rgb:'000000'}} };
  const borderDouble = { top:{style:'double',color:{rgb:'000000'}} };

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      if (C === 4) continue;
      const addr = XLSX.utils.encode_cell({r:R, c:C});
      if (!ws[addr]) ws[addr] = {t:'z', v:null};

      const isHeaderRow = R === 6;
      const isTotalRow  = R === wsData.length - 1;
      const isBalRow    = (data.balanceDR > 0 || data.balanceCR > 0) && R === wsData.length - 2;

      ws[addr].s = {
        font: {
          name:  'Arial',
          sz:    isHeaderRow || isTotalRow ? 10 : 9,
          bold:  isHeaderRow || isTotalRow || isBalRow,
          italic: isBalRow,
          color: { rgb: isHeaderRow ? 'FFFFFF' : '000000' },
        },
        fill: isHeaderRow
          ? { fgColor: { rgb: '0F2744' }, patternType: 'solid' }
          : isTotalRow
          ? { fgColor: { rgb: 'DBEAFE' }, patternType: 'solid' }
          : isBalRow
          ? { fgColor: { rgb: 'FEF9C3' }, patternType: 'solid' }
          : (R % 2 === 0 ? { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' } : { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' }),
        border: isTotalRow ? { ...borderAll, top: borderDouble.top } : borderAll,
        alignment: {
          horizontal: (C === 3 || C === 8) ? 'right' : (C === 2 || C === 7) ? 'center' : 'left',
          vertical:   'center',
          wrapText:   false,
        },
        numFmt: (C === 3 || C === 8) ? '#,##0.00' : undefined,
      };
    }
  }

  const sheetName = data.accountName.replace(/[^a-zA-Z0-9 ]/g,'').substring(0,31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `GL_${sheetName.replace(/ /g,'_')}.xlsx`);
}

function printGLAccount(data: TAccountData, settings: CompanySettings) {
  const fmt = (n: number) => n > 0 ? n.toLocaleString('en-PH',{minimumFractionDigits:2, maximumFractionDigits:2}) : '';
  const maxLen = Math.max(data.debitRows.length, data.creditRows.length);

  let rows = '';
  for (let i = 0; i < maxLen; i++) {
    const dr = data.debitRows[i];
    const cr = data.creditRows[i];
    rows += `<tr style='background:${i%2===0?'#fff':'#f9fafb'}'>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${dr?.date??''}</td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${dr?.particulars??''}</td>
      <td style='text-align:center;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${dr?.folio??''}</td>
      <td style='text-align:right;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${dr?fmt(dr.amount):''}</td>
      <td class='t-divider'></td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${cr?.date??''}</td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${cr?.particulars??''}</td>
      <td style='text-align:center;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${cr?.folio??''}</td>
      <td style='text-align:right;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${cr?fmt(cr.amount):''}</td>
    </tr>`;
  }

  if (data.balanceDR > 0 || data.balanceCR > 0) {
    rows += `<tr style='background:#fef9c3;font-style:italic;font-weight:600'>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>Balance c/d</td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
      <td style='text-align:right;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${data.balanceDR>0?fmt(data.balanceDR):''}</td>
      <td class='t-divider'></td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>Balance c/d</td>
      <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
      <td style='text-align:right;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${data.balanceCR>0?fmt(data.balanceCR):''}</td>
    </tr>`;
  }

  rows += `<tr style='background:#dbeafe;font-weight:700;border-top:2.5pt double #000'>
    <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
    <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>TOTAL</td>
    <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
    <td style='text-align:right;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${fmt(data.grandTotal)}</td>
    <td class='t-divider'></td>
    <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
    <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>TOTAL</td>
    <td style='border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'></td>
    <td style='text-align:right;border:1px solid #cbd5e1;padding:4px 8px;font-size:8pt'>${fmt(data.grandTotal)}</td>
  </tr>`;

  const html = `<!DOCTYPE html><html><head><style>
    *{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:0;box-sizing:border-box}
    body{padding:15mm 20mm}
    .hdr{text-align:center;margin-bottom:12px}
    .hdr .co{font-size:13pt;font-weight:700}
    .hdr .addr{font-size:9pt;margin:2px 0}
    .hdr .book{font-size:11pt;font-weight:700;margin-top:4px}
    .hdr .acct{font-size:11pt;font-weight:700;background:#0f2744;color:#fff;padding:5px 12px;margin-top:6px;text-align:center}
    table{width:100%;border-collapse:collapse;font-size:8pt}
    th{background:#0f2744;color:#fff;font-weight:700;padding:5px 8px;font-size:7.5pt;border:1px solid #1e3a5f}
    .t-divider{background:#0f2744 !important;width:6px !important;padding:0 !important;border:1px solid #0f2744 !important}
    @media print{body{padding:10mm 15mm}@page{size:landscape}}
  </style></head><body>
  <div class='hdr'>
    <div class='co'>${settings.company_name}</div>
    ${settings.address ? `<div class='addr'>${settings.address}</div>` : ''}
    ${settings.tin_no  ? `<div class='addr'>TIN: ${settings.tin_no}</div>` : ''}
    <div class='book'>GENERAL LEDGER</div>
    <div class='acct'>${data.accountName.toUpperCase()}</div>
  </div>
  <table>
    <thead><tr>
      <th>DATE</th><th>PARTICULARS</th><th>FOLIO</th><th>DEBIT</th>
      <th class='t-divider'></th>
      <th>DATE</th><th>PARTICULARS</th><th>FOLIO</th><th>CREDIT</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;

  const w = window.open('','_blank');
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();},600); }
}

export default function GeneralLedger() {
  const [dataMap, setDataMap] = useState<Map<string, GLEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data }, s] = await Promise.all([
        supabase.from('gl_entries')
          .select('account_name, entry_date, month_year, source_module, folio, particulars, debit, credit')
          .order('entry_date', { ascending: true })
          .limit(20000),
        getCompanySettings(),
      ]);

      const map = new Map<string, GLEntry[]>();
      for (const row of data ?? []) {
        const key = row.account_name.trim();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row as any);
      }
      setDataMap(map);
      setSettings(s);
      setLoading(false);
    })();
  }, []);

  const tAccounts = useMemo(() => {
    const list: TAccountData[] = [];
    const accounts = Array.from(dataMap.keys()).sort();
    for (const acct of accounts) {
      list.push(buildTAccount(acct, dataMap.get(acct)!));
    }
    return list;
  }, [dataMap]);

  const filteredAccounts = useMemo(
    () => tAccounts.filter((a) => a.accountName.toLowerCase().includes(search.toLowerCase())),
    [tAccounts, search]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-wrap gap-4 items-end justify-between no-print bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-white tracking-tighter">General Ledger</h2>
          <p className="text-sm text-white/40 font-medium">
            T-Account format matching uploaded template. All cell borders enforced.
          </p>
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
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-white/40 space-y-4">
          <div className="relative">
             <div className="absolute inset-0 blur-xl bg-blue-500/20 animate-pulse"></div>
             <Loader2 className="h-12 w-12 animate-spin text-blue-500 relative" />
          </div>
          <span className="text-xs font-black tracking-[0.3em] uppercase text-blue-400/50">Loading Ledgers...</span>
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
            <TAccountCard key={acct.accountName} data={acct} settings={settings!} />
          ))}
        </div>
      )}
    </div>
  );
}

function TAccountCard({ data, settings }: { data: TAccountData, settings: CompanySettings }) {
  const fmt = (n: number) => n > 0
    ? n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const maxRows = Math.max(data.debitRows.length, data.creditRows.length);

  return (
    <div style={{
      marginBottom:  '32px',
      border:        '1px solid #1e3a5f',
      borderRadius:  '4px',
      overflow:      'hidden',
      background:    '#ffffff',
      pageBreakAfter:'always',
    }}>
      <div style={{
        background:     '#0f2744',
        color:          '#ffffff',
        padding:        '8px 16px',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
      }}>
        <span style={{ fontFamily:'Arial', fontWeight:700, fontSize:'0.88rem', letterSpacing:'0.05em' }}>
          {data.accountName.toUpperCase()}
        </span>
        <div style={{ display:'flex', gap:'8px' }} className="no-print">
          <button onClick={() => exportGLAccountExcel(data, settings)}
            style={{ background:'#ffffff', color:'#000000', border:'1px solid #1e3a5f', borderRadius:'3px', padding:'5px 12px', fontFamily:'Arial', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
            📊 Export Excel
          </button>
          <button onClick={() => printGLAccount(data, settings)}
            style={{ background:'#e2e8f0', color:'#000000', border:'1px solid #1e3a5f', borderRadius:'3px', padding:'5px 12px', fontFamily:'Arial', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
            🖨 Print
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
      <table style={{ width:'100%', minWidth: '800px', borderCollapse:'collapse', fontFamily:'Arial,Helvetica,sans-serif', fontSize:'0.78rem' }}>
        <thead>
          <tr>
            <th style={thStyle('left')}>DATE</th>
            <th style={thStyle('left')}>PARTICULARS</th>
            <th style={thStyle('center')}>FOLIO</th>
            <th style={thStyle('right')}>DEBIT</th>
            <th className="t-divider" style={{ width:'6px', background:'#0f2744', padding:0, border:'1px solid #0f2744' }}></th>
            <th style={thStyle('left')}>DATE</th>
            <th style={thStyle('left')}>PARTICULARS</th>
            <th style={thStyle('center')}>FOLIO</th>
            <th style={thStyle('right')}>CREDIT</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }, (_, i) => {
            const dr = data.debitRows[i];
            const cr = data.creditRows[i];
            const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
            return (
              <tr key={i} style={{ background: bg }}>
                <td style={tdStyle('left')}>{dr?.date ?? ''}</td>
                <td style={tdStyle('left')}>{dr?.particulars ?? ''}</td>
                <td style={tdStyle('center')}>{dr?.folio ?? ''}</td>
                <td style={tdStyle('right')}>{dr ? fmt(dr.amount) : ''}</td>
                <td className="t-divider" style={{ background:'#0f2744', width:'6px', padding:0, border:'1px solid #0f2744' }}></td>
                <td style={tdStyle('left')}>{cr?.date ?? ''}</td>
                <td style={tdStyle('left')}>{cr?.particulars ?? ''}</td>
                <td style={tdStyle('center')}>{cr?.folio ?? ''}</td>
                <td style={tdStyle('right')}>{cr ? fmt(cr.amount) : ''}</td>
              </tr>
            );
          })}

          {(data.balanceDR > 0 || data.balanceCR > 0) && (
            <tr style={{ background:'#fef9c3', fontStyle:'italic', fontWeight:600 }}>
              <td style={tdStyle('left')}></td>
              <td style={tdStyle('left')}>Balance c/d</td>
              <td style={tdStyle('center')}></td>
              <td style={tdStyle('right')}>{data.balanceDR > 0 ? fmt(data.balanceDR) : ''}</td>
              <td className="t-divider" style={{ background:'#0f2744', width:'6px', padding:0, border:'1px solid #0f2744' }}></td>
              <td style={tdStyle('left')}></td>
              <td style={tdStyle('left')}>Balance c/d</td>
              <td style={tdStyle('center')}></td>
              <td style={tdStyle('right')}>{data.balanceCR > 0 ? fmt(data.balanceCR) : ''}</td>
            </tr>
          )}

          <tr style={{ background:'#dbeafe', fontWeight:700 }}>
            <td style={tdTotalStyle('left')}></td>
            <td style={tdTotalStyle('left')}>TOTAL</td>
            <td style={tdTotalStyle('center')}></td>
            <td style={tdTotalStyle('right')}>{fmt(data.grandTotal)}</td>
            <td className="t-divider" style={{ background:'#0f2744', width:'6px', padding:0, border:'1px solid #0f2744' }}></td>
            <td style={tdTotalStyle('left')}></td>
            <td style={tdTotalStyle('left')}>TOTAL</td>
            <td style={tdTotalStyle('center')}></td>
            <td style={tdTotalStyle('right')}>{fmt(data.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

const BORDER = '1px solid #cbd5e1';
function thStyle(align: string) {
  return {
    background:    '#0f2744',
    color:         '#ffffff',
    fontFamily:    'Arial, Helvetica, sans-serif',
    fontWeight:    700,
    fontSize:      '0.73rem',
    padding:       '7px 10px',
    textAlign:     align as any,
    border:        '1px solid #1e3a5f',
    whiteSpace:    'nowrap' as any,
    letterSpacing: '0.04em',
  };
}
function tdStyle(align: string) {
  return {
    padding:    '5px 10px',
    color:      '#000000',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize:   '0.78rem',
    border:     BORDER,
    textAlign:  align as any,
  };
}
function tdTotalStyle(align: string) {
  return {
    padding:    '7px 10px',
    color:      '#000000',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize:   '0.8rem',
    fontWeight: 700,
    border:     '1px solid #93c5fd',
    borderTop:  '2px double #000000',
    textAlign:  align as any,
  };
}

