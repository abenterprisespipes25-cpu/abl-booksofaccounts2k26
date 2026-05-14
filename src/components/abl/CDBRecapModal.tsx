// CDBRecapModal.tsx — ABL v2.6 — Full Recapitulation Module
// Live Supabase queries, Realtime, Cross-check, Export, Print
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, round2, parseMonthYear } from "@/lib/abl/format";
import { exportRecapCDBExcel } from "@/lib/abl/exporters";
import { X, RefreshCw, FileSpreadsheet, Printer } from "lucide-react";

/* ── Types ── */
interface SundryRow { account: string; dr: number; cr: number; }
interface FundRow   { fund: string; amount: number; }
interface GrandTotals {
  sundries_dr: number;
  sundries_cr: number;
  cash_amount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  monthTab: string;
  companyName: string;
}

/* ── Helper: derive period label ── */
function periodLabel(my: string): string {
  const p = parseMonthYear(my);
  if (!p) return my.toUpperCase();
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const lastDay = new Date(p.year, p.month + 1, 0).getDate();
  return `${months[p.month]} 01 - ${lastDay}, ${p.year}`;
}

export function CDBRecapModal({ isOpen, onClose, monthTab, companyName }: Props) {
  const [sundries,  setSundries]  = useState<SundryRow[]>([]);
  const [funds,     setFunds]     = useState<FundRow[]>([]);
  const [grandTots, setGrandTots] = useState<GrandTotals>({ sundries_dr: 0, sundries_cr: 0, cash_amount: 0 });
  const [loading,   setLoading]   = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── QUERY 1: Sundries pivot ── */
  const fetchSundries = useCallback(async () => {
    if (!monthTab) return;
    const { data, error } = await supabase
      .from("cdb_entries")
      .select("sundries_title, sundries_dr, sundries_cr")
      .eq("month_tab", monthTab)
      .not("sundries_title", "is", null)
      .neq("sundries_title", "");

    if (error) { console.error("[RECAP] Sundries query error:", error); return; }

    const map = new Map<string, { dr: number; cr: number }>();
    for (const row of data ?? []) {
      const key = (row.sundries_title as string).trim();
      if (!key) continue;
      const existing = map.get(key) ?? { dr: 0, cr: 0 };
      existing.dr = round2(existing.dr + (Number(row.sundries_dr) || 0));
      existing.cr = round2(existing.cr + Math.abs(Number(row.sundries_cr) || 0));
      map.set(key, existing);
    }
    const result = Array.from(map.entries())
      .map(([account, v]) => ({ account, dr: v.dr, cr: v.cr }))
      .sort((a, b) => a.account.localeCompare(b.account));
    setSundries(result);
  }, [monthTab]);

  /* ── QUERY 2: Bank/Fund pivot ── */
  const fetchFunds = useCallback(async () => {
    if (!monthTab) return;
    const { data, error } = await supabase
      .from("cdb_entries")
      .select("fund_label, cash_amount")
      .eq("month_tab", monthTab)
      .not("fund_label", "is", null)
      .neq("fund_label", "")
      .neq("fund_label", "UNKNOWN");

    if (error) { console.error("[RECAP] Funds query error:", error); return; }

    const map = new Map<string, number>();
    for (const row of data ?? []) {
      const key = (row.fund_label as string).trim();
      if (!key) continue;
      map.set(key, round2((map.get(key) || 0) + (Number(row.cash_amount) || 0)));
    }
    const result = Array.from(map.entries())
      .map(([fund, amount]) => ({ fund, amount }))
      .sort((a, b) => a.fund.localeCompare(b.fund));
    setFunds(result);
  }, [monthTab]);

  /* ── QUERY 3: Grand Totals (for cross-check) ── */
  const fetchGrandTotals = useCallback(async () => {
    if (!monthTab) return;
    const { data, error } = await supabase
      .from("cdb_entries")
      .select("sundries_dr, sundries_cr, cash_amount")
      .eq("month_tab", monthTab);

    if (error) { console.error("[RECAP] Grand totals query error:", error); return; }

    let sundries_dr = 0, sundries_cr = 0, cash_amount = 0;
    for (const row of data ?? []) {
      sundries_dr  = round2(sundries_dr  + (Number(row.sundries_dr)  || 0));
      sundries_cr  = round2(sundries_cr  + Math.abs(Number(row.sundries_cr) || 0));
      cash_amount  = round2(cash_amount  + (Number(row.cash_amount)  || 0));
    }
    setGrandTots({ sundries_dr, sundries_cr, cash_amount });
  }, [monthTab]);

  /* ── Refresh all ── */
  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSundries(), fetchFunds(), fetchGrandTotals()]);
    setLoading(false);
  }, [fetchSundries, fetchFunds, fetchGrandTotals]);

  /* ── Initial load + month-change ── */
  useEffect(() => {
    if (isOpen && monthTab) refresh();
  }, [isOpen, monthTab, refresh]);

  /* ── Realtime subscription ── */
  useEffect(() => {
    if (!isOpen) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel("recap_realtime")
      .on("postgres_changes" as any,
        { event: "*", schema: "public", table: "cdb_entries" } as any,
        () => {
          clearTimeout(timer);
          timer = setTimeout(refresh, 400);
        })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [isOpen, refresh]);

  /* ── Computed values ── */
  const recapDr   = sundries.reduce((s, r) => s + r.dr, 0);
  const recapCr   = sundries.reduce((s, r) => s + r.cr, 0);
  const bankTotal = funds.reduce((s, f) => s + f.amount, 0);

  const diffDr   = Math.abs(recapDr   - grandTots.sundries_dr);
  const diffCr   = Math.abs(recapCr   - grandTots.sundries_cr);
  const diffBank = Math.abs(bankTotal - grandTots.cash_amount);

  const drOk   = diffDr   < 0.01;
  const crOk   = diffCr   < 0.01;
  const bankOk = diffBank < 0.01;

  /* ── Print handler ── */
  const handlePrint = () => {
    setIsPrinting(true);
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 500);
    });
  };

  if (!isOpen) return null;

  const period = periodLabel(monthTab);

  return (
    <div className="fixed inset-0 z-[200] bg-[#060d1a]/96 overflow-y-auto backdrop-blur-md p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* ── Print styles ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        ${isPrinting ? `
          @media print {
            body * { visibility: hidden; }
            .recap-print-root, .recap-print-root * { visibility: visible; }
            .recap-print-root {
              position: fixed; top: 0; left: 0; width: 100%;
              background: white !important; color: black !important;
              padding: 20px; z-index: 99999;
            }
            .recap-card-print {
              background: white !important;
              border: 1px solid #000 !important;
              backdrop-filter: none !important;
              margin-bottom: 20px;
              page-break-inside: avoid;
              padding: 16px;
            }
            .recap-th-print { background: #e0e0e0 !important; color: #000 !important; border: 1px solid #000 !important; }
            .recap-td-print { color: #000 !important; border: 1px solid #000 !important; }
            .recap-title-print { color: #000 !important; font-size: 10pt !important; font-weight: bold; }
            .recap-toolbar-print, .recap-close-btn { display: none !important; }
            .recap-check-row { color: #000 !important; border: 1px solid #ccc !important; background: #f9f9f9 !important; }
            @page { size: legal portrait; margin: 0.75in 1in; }
          }
        ` : ''}

        /* Base recap styles */
        .recap-th-print {
          background: rgba(0,170,255,0.12);
          border: 1px solid rgba(0,170,255,0.25);
          color: #00aaff;
          font-weight: 700;
          padding: 6px 10px;
          text-align: center;
          font-size: 0.68rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .recap-th-sundries {
          background: rgba(170,85,255,0.12) !important;
          border-color: rgba(170,85,255,0.25) !important;
          color: #aa55ff !important;
          letter-spacing: 0.2em;
          font-size: 0.75rem;
          text-align: left;
        }
        .recap-td-print {
          border: 1px solid rgba(255,255,255,0.07);
          padding: 4px 10px;
          color: rgba(255,255,255,0.82);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }
        .recap-tr-hover:hover td { background: rgba(255,255,255,0.04) !important; }
        .recap-grand-total td {
          background: rgba(255,255,255,0.08) !important;
          border-top: 1px solid rgba(255,255,255,0.35) !important;
          font-weight: 700;
          color: #ffffff !important;
        }
        .recap-check-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 10px;
          border-radius: 8px;
          margin-top: 6px;
          font-size: 0.68rem;
          font-family: 'JetBrains Mono', monospace;
        }
        .recap-check-pass { background: rgba(0,200,100,0.12); border: 1px solid rgba(0,200,100,0.3); color: #00c864; }
        .recap-check-fail { background: rgba(255,68,68,0.12); border: 1px solid rgba(255,68,68,0.3); color: #ff4444; }
        .recap-toolbar-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px;
          font-size: 0.8rem; font-weight: 600; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.07); color: #fff;
          transition: all 0.18s ease;
        }
        .recap-toolbar-btn:hover { transform: translateY(-1px); }
        .recap-toolbar-btn.export { background: rgba(0,200,100,0.15); border-color: rgba(0,200,100,0.3); color: #00c864; }
        .recap-toolbar-btn.export:hover { background: rgba(0,200,100,0.25); }
        .recap-toolbar-btn.print  { background: rgba(255,165,0,0.15); border-color: rgba(255,165,0,0.3); color: #ffa500; }
        .recap-toolbar-btn.print:hover { background: rgba(255,165,0,0.25); }
        .recap-toolbar-btn.refresh { background: rgba(0,170,255,0.12); border-color: rgba(0,170,255,0.25); color: #00aaff; }
        .recap-toolbar-btn.refresh:hover { background: rgba(0,170,255,0.22); }
      `}} />

      <div ref={containerRef} className="recap-print-root max-w-[1400px] mx-auto flex flex-col gap-6 pb-16">

        {/* ── Header ── */}
        <div className="flex justify-between items-center recap-toolbar-print">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-widest">📊 Recapitulation</h2>
            <p className="text-white/40 text-xs mt-1 font-mono">{period} — {companyName}</p>
          </div>
          <button className="recap-close-btn text-white/40 hover:text-white bg-white/5 p-2 rounded-full transition-colors" onClick={onClose}>
            <X size={22} />
          </button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex gap-3 flex-wrap recap-toolbar-print recap-toolbar-btn-group">
          <button className="recap-toolbar-btn export" onClick={() => exportRecapCDBExcel({ companyName, monthYear: monthTab, recapSundries: sundries, recapFunds: funds })}>
            <FileSpreadsheet size={15} /> Export Recap Excel
          </button>
          <button className="recap-toolbar-btn print" onClick={handlePrint}>
            <Printer size={15} /> Print Recap
          </button>
          <button className="recap-toolbar-btn refresh" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* ── Two-column grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

          {/* ══════ SUNDRIES RECAP ══════ */}
          <div className="recap-card-print" style={{
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            backdropFilter: "blur(16px)",
            padding: 20,
            overflowX: "auto"
          }}>
            <div className="recap-title-print" style={{ fontFamily: "Syne,Arial,sans-serif", fontSize: "0.7rem", fontWeight: 800, color: "#00aaff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {companyName}
            </div>
            <div className="recap-title-print" style={{ fontFamily: "Syne,Arial,sans-serif", fontSize: "0.7rem", fontWeight: 800, color: "#00aaff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
              RECAPITULATION OF SUNDRY ACCOUNTS
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>— Cash Disbursements Book</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>{period}</div>

            {loading ? (
              <div className="text-white/40 text-sm py-8 text-center animate-pulse">Loading sundry accounts...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.72rem" }}>
                <thead>
                  <tr>
                    <th className="recap-th-print recap-th-sundries">S &nbsp; U &nbsp; N &nbsp; D &nbsp; R &nbsp; I &nbsp; E &nbsp; S</th>
                    <th className="recap-th-print" style={{ minWidth: 100 }}>DEBIT</th>
                    <th className="recap-th-print" style={{ minWidth: 100 }}>CREDIT</th>
                  </tr>
                </thead>
                <tbody>
                  {sundries.length === 0 ? (
                    <tr><td colSpan={3} className="recap-td-print text-center text-white/30 py-6">No sundry entries for this period.</td></tr>
                  ) : sundries.map((s, i) => (
                    <tr key={i} className="recap-tr-hover">
                      <td className="recap-td-print" style={{ textAlign: "left", fontSize: "0.68rem", color: "rgba(255,255,255,0.75)" }} title={s.account}>{s.account}</td>
                      <td className="recap-td-print" style={{ textAlign: "right", color: s.dr ? "#00e5a0" : "rgba(255,255,255,0.2)", fontVariantNumeric: "tabular-nums" }}>
                        {s.dr ? fmtMoney(s.dr) : ""}
                      </td>
                      <td className="recap-td-print" style={{ textAlign: "right", color: s.cr ? "#ff7c7c" : "rgba(255,255,255,0.2)", fontVariantNumeric: "tabular-nums" }}>
                        {s.cr ? fmtMoney(s.cr) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="recap-grand-total">
                    <td className="recap-td-print" style={{ textAlign: "right", fontWeight: 700, color: "#fff" }}>GRAND TOTAL</td>
                    <td className="recap-td-print" style={{ textAlign: "right", fontWeight: 700, color: "#00e5a0", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(recapDr)}</td>
                    <td className="recap-td-print" style={{ textAlign: "right", fontWeight: 700, color: "#ff7c7c", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(recapCr)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Cross-check */}
            <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 14 }}>
              <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>
                CROSS-CHECK vs CDB Total:
              </div>
              <div className={`recap-check-row ${drOk ? "recap-check-pass" : "recap-check-fail"}`}>
                <span>CHECK A — Sundries DR</span>
                <span>{drOk
                  ? `✅ Balanced: ₱${fmtMoney(recapDr)}`
                  : `⚠️ Mismatch — Diff: ₱${fmtMoney(diffDr)}`}
                </span>
              </div>
              <div className={`recap-check-row ${crOk ? "recap-check-pass" : "recap-check-fail"}`}>
                <span>CHECK B — Sundries CR</span>
                <span>{crOk
                  ? `✅ Balanced: ₱${fmtMoney(recapCr)}`
                  : `⚠️ Mismatch — Diff: ₱${fmtMoney(diffCr)}`}
                </span>
              </div>
            </div>
          </div>

          {/* ══════ BANK ACCOUNTS RECAP ══════ */}
          <div className="recap-card-print" style={{
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            backdropFilter: "blur(16px)",
            padding: 20,
            overflowX: "auto"
          }}>
            <div className="recap-title-print" style={{ fontFamily: "Syne,Arial,sans-serif", fontSize: "0.7rem", fontWeight: 800, color: "#00aaff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {companyName}
            </div>
            <div className="recap-title-print" style={{ fontFamily: "Syne,Arial,sans-serif", fontSize: "0.7rem", fontWeight: 800, color: "#00aaff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
              RECAPITULATION OF BANK ACCOUNTS
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>— Cash Disbursements Book</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>{period}</div>

            {loading ? (
              <div className="text-white/40 text-sm py-8 text-center animate-pulse">Loading bank accounts...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.72rem" }}>
                <thead>
                  <tr>
                    <th className="recap-th-print" style={{ textAlign: "left", background: "rgba(0,170,255,0.1)", borderColor: "rgba(0,170,255,0.25)", color: "#00aaff", letterSpacing: "0.2em", fontSize: "0.75rem" }}>
                      F &nbsp; U &nbsp; N &nbsp; D
                    </th>
                    <th className="recap-th-print" style={{ minWidth: 130 }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {funds.length === 0 ? (
                    <tr><td colSpan={2} className="recap-td-print text-center text-white/30 py-6">No bank entries for this period.</td></tr>
                  ) : funds.map((f, i) => (
                    <tr key={i} className="recap-tr-hover">
                      <td className="recap-td-print" style={{ textAlign: "left", fontSize: "0.68rem", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{f.fund}</td>
                      <td className="recap-td-print" style={{ textAlign: "right", color: "#ffffff", fontVariantNumeric: "tabular-nums" }}>
                        {f.amount ? fmtMoney(f.amount) : "0.00"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="recap-grand-total">
                    <td className="recap-td-print" style={{ textAlign: "right", fontWeight: 700, color: "#fff" }}>TOTAL</td>
                    <td className="recap-td-print" style={{ textAlign: "right", fontWeight: 700, color: "#00e5a0", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(bankTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Cross-check */}
            <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 14 }}>
              <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>
                CROSS-CHECK vs CDB Total:
              </div>
              <div className={`recap-check-row ${bankOk ? "recap-check-pass" : "recap-check-fail"}`}>
                <span>CHECK C — Bank Total vs Cash Amount</span>
                <span>{bankOk
                  ? `✅ Balanced: ₱${fmtMoney(bankTotal)}`
                  : `⚠️ Mismatch — Diff: ₱${fmtMoney(diffBank)}`}
                </span>
              </div>

              {/* Summary stats */}
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4, fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CDB Grand Sundries DR:</span><span style={{ color: "rgba(255,255,255,0.55)" }}>₱{fmtMoney(grandTots.sundries_dr)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CDB Grand Sundries CR:</span><span style={{ color: "rgba(255,255,255,0.55)" }}>₱{fmtMoney(grandTots.sundries_cr)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CDB Total Cash Amount:</span><span style={{ color: "rgba(255,255,255,0.55)" }}>₱{fmtMoney(grandTots.cash_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Overall Status Banner ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", borderRadius: 12,
          background: (drOk && crOk && bankOk) ? "rgba(0,200,100,0.1)" : "rgba(255,68,68,0.1)",
          border: `1px solid ${(drOk && crOk && bankOk) ? "rgba(0,200,100,0.3)" : "rgba(255,68,68,0.3)"}`,
          fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem",
          color: (drOk && crOk && bankOk) ? "#00c864" : "#ff4444",
          fontWeight: 700
        }}>
          {(drOk && crOk && bankOk)
            ? "✅ ALL CHECKS PASSED — Recapitulation is balanced and audit-ready."
            : `⚠️ IMBALANCE DETECTED — ${[!drOk && "Sundries DR", !crOk && "Sundries CR", !bankOk && "Bank Total"].filter(Boolean).join(", ")} mismatch(es) found.`}
        </div>
      </div>
    </div>
  );
}
