import { ColumnDef } from "@/lib/abl/config";
import { fmtDate, fmtMoney } from "@/lib/abl/format";

// Helper
const fmt = (val: any, type: string) => {
  if (type === "currency") {
    const n = Number(val);
    return (!val || n === 0) ? "" : n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (type === "date") return fmtDate(val);
  return val ?? "";
};

export function LedgerTable({
  columns, rows, showTotals = true,
  emptyMessage = "No entries. Upload an Excel file to get started.",
}: {
  columns: ColumnDef[];
  rows: any[];
  showTotals?: boolean;
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return (
      <div style={{
        border: "2px dashed #334155", borderRadius: 8, padding: "80px 24px",
        textAlign: "center", background: "#0a1628", color: "rgba(255,255,255,0.25)",
      }}>
        <p style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6 }}>{emptyMessage}</p>
        <p style={{ fontSize: "0.8rem" }}>Accepted: .xlsx / .xls</p>
      </div>
    );
  }

  const hasDoubleHeaders = columns.some(c => c.header1 !== undefined || c.header2 !== undefined);

  // Build grouped header spans for header1 row
  const buildSpans = () => {
    const spans: { label: string; colSpan: number }[] = [];
    let i = 0;
    while (i < columns.length) {
      const h1 = columns[i].header1 ?? columns[i].header;
      if (!h1) { spans.push({ label: "", colSpan: 1 }); i++; continue; }
      let span = 1;
      while (i + span < columns.length &&
        (columns[i + span].header1 ?? columns[i + span].header) === h1) span++;
      spans.push({ label: h1, colSpan: span });
      i += span;
    }
    return spans;
  };
  const headerSpans = hasDoubleHeaders ? buildSpans() : [];

  // Compute totals
  const totals: Record<string, number> = {};
  for (const c of columns) {
    if (c.type === "currency") {
      totals[c.field] = rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
    }
  }

  // Styles (Excel-like: white bg, black borders)
  const BORDER = "1px solid #000";
  const TH_BG  = "#0f2744";
  const TH_STYLE: React.CSSProperties = {
    background: TH_BG, color: "#fff", fontFamily: "Arial,Helvetica,sans-serif",
    fontWeight: 700, fontSize: "0.7rem", padding: "6px 8px", border: BORDER,
    whiteSpace: "nowrap", letterSpacing: "0.04em",
  };
  const TD_STYLE = (align: string, isSubRow?: boolean): React.CSSProperties => ({
    padding: "4px 8px", border: BORDER, fontSize: "0.78rem",
    fontFamily: "Arial,Helvetica,sans-serif", color: "#000",
    textAlign: align as any,
    fontStyle: isSubRow ? "italic" : "normal",
    background: "inherit",
  });
  const TFOOT_STYLE = (align: string): React.CSSProperties => ({
    padding: "5px 8px", border: BORDER, borderTop: "2.5px double #000",
    fontSize: "0.78rem", fontFamily: "Arial,Helvetica,sans-serif", color: "#000",
    fontWeight: 700, background: "#dbeafe", textAlign: align as any,
  });

  return (
    <div style={{ background: "#fff", border: "1.5px solid #000", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
        <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
            {/* Header Row 1 — Grouped labels (CDB only) */}
            {hasDoubleHeaders && (
              <tr>
                {headerSpans.map((span, i) => (
                  <th key={i} colSpan={span.colSpan} style={{ ...TH_STYLE, textAlign: "center" }}>
                    {span.label}
                  </th>
                ))}
              </tr>
            )}
            {/* Header Row 2 — Column sub-labels */}
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  style={{
                    ...TH_STYLE,
                    minWidth: hasDoubleHeaders ? `${(c.width || 10) * 8}px` : `${c.width || 80}px`,
                    textAlign: c.type === "currency" ? "right" : "left",
                  }}
                >
                  {hasDoubleHeaders ? (c.header2 ?? c.header) : c.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, ri) => {
              const bg = ri % 2 === 0 ? "#ffffff" : "#f9fafb";
              return (
                <tr key={r.id ?? ri} style={{ background: bg }}>
                  {columns.map((c, ci) => {
                    const val = r[c.field];
                    const isEmpty = c.type === "currency" && (!val || Number(val) === 0);
                    return (
                      <td key={ci} style={TD_STYLE(
                        c.type === "currency" ? "right" : "left", r._is_sub_row
                      )}>
                        {c.type === "currency"
                          ? (isEmpty ? "" : fmt(val, "currency"))
                          : fmt(val, c.type)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {showTotals && (
            <tfoot style={{ position: "sticky", bottom: 0, zIndex: 10 }}>
              <tr>
                {columns.map((c, i) => (
                  <td key={i} style={TFOOT_STYLE(c.type === "currency" ? "right" : i === 0 ? "left" : "center")}>
                    {c.type === "currency"
                      ? (totals[c.field] ? totals[c.field].toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "")
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

// Need React import for CSSProperties
import React from "react";
