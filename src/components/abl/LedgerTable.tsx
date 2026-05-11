import { ColumnDef } from "@/lib/abl/config";
import { fmtDate, fmtMoney } from "@/lib/abl/format";
import { cn } from "@/lib/utils";

export function LedgerTable({
  columns, rows, showTotals = true, emptyMessage = "No entries. Upload an Excel file to get started.",
}: {
  columns: ColumnDef[]; rows: any[]; showTotals?: boolean; emptyMessage?: string;
}) {
  if (!rows.length) {
    return (
      <div className="border border-dashed border-white/10 rounded-2xl p-20 text-center text-sm text-white/30 bg-white/5">
        <div className="max-w-xs mx-auto space-y-2">
          <p className="text-lg font-bold text-white/50">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const totals: Record<string, number> = {};
  for (const c of columns) {
    if (c.type === "currency") {
      totals[c.field] = rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
    }
  }

  const hasDoubleHeaders = columns.some(c => c.header1 !== undefined || c.header2 !== undefined);

  // Build grouped header spans for header1 row
  // Columns with the same header1 value (non-empty) that are adjacent get merged
  const buildSpans = () => {
    const spans: { label: string; colSpan: number; startIdx: number }[] = [];
    let i = 0;
    while (i < columns.length) {
      const h1 = columns[i].header1 ?? columns[i].header;
      if (!h1) {
        spans.push({ label: "", colSpan: 1, startIdx: i });
        i++;
      } else {
        // Group adjacent columns with same header1
        let span = 1;
        while (
          i + span < columns.length &&
          (columns[i + span].header1 ?? columns[i + span].header) === h1
        ) {
          span++;
        }
        spans.push({ label: h1, colSpan: span, startIdx: i });
        i += span;
      }
    }
    return spans;
  };

  const headerSpans = hasDoubleHeaders ? buildSpans() : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1628] shadow-2xl">
      <div className="overflow-auto max-h-[700px] no-scrollbar">
        <table className="w-full text-left border-collapse min-w-max">
          <thead className="sticky top-0 z-20">
            {hasDoubleHeaders ? (
              <>
                {/* Header Row 1 — Grouped labels */}
                <tr className="bg-[#081020]">
                  {headerSpans.map((span, i) => (
                    <th
                      key={i}
                      colSpan={span.colSpan}
                      className={cn(
                        "px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-white/60 border border-white/10 text-center",
                        !span.label && "bg-transparent"
                      )}
                    >
                      {span.label}
                    </th>
                  ))}
                </tr>
                {/* Header Row 2 — Individual column sub-labels */}
                <tr className="bg-[#0f172a] shadow-md">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      style={{ minWidth: `${(c.width || 10) * 7}px`, width: `${(c.width || 10) * 7}px` }}
                      className={cn(
                        "px-3 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-white/50 border border-white/10",
                        c.type === "currency" ? "text-right" : "text-left"
                      )}
                    >
                      {c.header2 ?? c.header}
                    </th>
                  ))}
                </tr>
              </>
            ) : (
              <tr className="bg-[#0f172a] shadow-md">
                {columns.map((c, i) => (
                  <th
                    key={i}
                    style={{ minWidth: c.width, width: c.width }}
                    className={cn(
                      "px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/40 border border-white/10",
                      c.type === "currency" ? "text-right" : "text-left"
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="text-sm font-medium">
            {rows.map((r, ri) => (
              <tr
                key={r.id ?? ri}
                className={cn(
                  "hover:bg-white/[0.03] border-b border-white/5 transition-colors group/row",
                  r._is_sub_row && "bg-white/[0.01] opacity-80 italic"
                )}
              >
                {columns.map((c, ci) => {
                  const val = r[c.field];
                  const isZero = c.type === "currency" && (val === 0 || val === null || val === undefined || val === "");
                  return (
                    <td
                      key={ci}
                      className={cn(
                        "px-3 py-2 whitespace-nowrap font-mono text-[11px] border border-white/[0.06]",
                        c.type === "currency" ? "text-right" : "text-left",
                        c.type === "currency" && !isZero && Number(val) > 0 && "text-emerald-400/90",
                        c.type === "currency" && !isZero && Number(val) < 0 && "text-rose-400/90",
                        isZero && "text-white/10",
                        c.type !== "currency" && "text-white/70"
                      )}
                    >
                      {c.type === "currency"
                        ? isZero ? "" : fmtMoney(val)
                        : c.type === "date"
                        ? fmtDate(val)
                        : val ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {showTotals && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-[#0f172a] border-t-2 border-blue-500/30">
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-3 py-4 text-right font-black font-mono text-[11px] text-blue-300 border border-white/10",
                      i === 0 && "text-left font-sans text-white/50 tracking-widest"
                    )}
                  >
                    {c.type === "currency"
                      ? totals[c.field] ? fmtMoney(totals[c.field]) : ""
                      : i === 0 ? "TOTAL" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
