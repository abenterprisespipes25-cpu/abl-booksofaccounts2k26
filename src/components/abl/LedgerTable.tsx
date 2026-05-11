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

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1628] shadow-2xl">
      <div className="overflow-auto max-h-[700px] no-scrollbar">
        <table className="w-full text-left border-collapse min-w-max">
          <thead className="sticky top-0 z-20">
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
          </thead>
          <tbody className="text-sm font-medium">
            {rows.map((r, ri) => (
              <tr 
                key={r.id ?? ri} 
                className="hover:bg-white/[0.03] border-b border-white/5 transition-colors group/row"
              >
                {columns.map((c, ci) => (
                  <td 
                    key={ci} 
                    className={cn(
                      "px-6 py-3 whitespace-nowrap font-mono text-[11px] border border-white/10",
                      c.type === "currency" ? "text-right text-emerald-400/90" : "text-white/70",
                      c.type === "currency" && Number(r[c.field]) < 0 && "text-rose-400/90"
                    )}
                  >
                    {c.type === "currency"
                      ? fmtMoney(r[c.field])
                      : c.type === "date"
                      ? fmtDate(r[c.field])
                      : r[c.field] ?? ""}
                  </td>
                ))}
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
                      "px-6 py-4 text-right font-black font-mono text-[11px] text-blue-300 border border-white/10",
                      i === 0 && "text-left font-sans text-white/50 tracking-widest"
                    )}
                  >
                    {c.type === "currency" 
                      ? fmtMoney(totals[c.field]) 
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
