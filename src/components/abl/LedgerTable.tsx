import React, { useState, useEffect, useMemo } from "react";
import { ColumnDef } from "@/lib/abl/config";
import { fmtDate, fmtMoney } from "@/lib/abl/format";

/* ───── cell formatter (read-only) ───── */
const fmtCell = (val: any, type: string) => {
  if (type === "currency" || type === "formula") {
    const n = Number(val);
    if (!val || n === 0) return "";
    return fmtMoney(n);
  }
  if (type === "date") return fmtDate(val);
  return val ?? "";
};

/* ───── icon buttons ───── */
const IconBtn = ({
  onClick, title, color, children,
}: { onClick: () => void; title: string; color: string; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: "none", border: "none", cursor: "pointer",
      padding: "2px 5px", borderRadius: 4, color,
      fontSize: "0.8rem", lineHeight: 1,
      transition: "background 0.15s",
    }}
    onMouseEnter={e => (e.currentTarget.style.background = `${color}22`)}
    onMouseLeave={e => (e.currentTarget.style.background = "none")}
  >
    {children}
  </button>
);

/* ───── props ───── */
export interface LedgerTableProps {
  columns: ColumnDef[];
  rows: any[];
  showTotals?: boolean;
  emptyMessage?: string;
  bookName?: string;
  monthYear?: string;
  onSave?: (row: any) => Promise<void>;
  onDelete?: (row: any) => Promise<void>;
  onPrint?: () => void;
}

export function LedgerTable({
  columns, rows, showTotals = true,
  emptyMessage = "No entries. Upload an Excel file to get started.",
  bookName, monthYear,
  onSave, onDelete, onPrint,
}: LedgerTableProps) {
  const [displayCount, setDisplayCount] = useState(200);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reset on rows change (month switch)
  useEffect(() => {
    setDisplayCount(200);
    setEditingId(null);
    setSearch("");
  }, [rows]);

  // Progressive loading
  useEffect(() => {
    if (rows.length > displayCount) {
      const t = setTimeout(() => setDisplayCount(p => Math.min(p + 500, rows.length)), 50);
      return () => clearTimeout(t);
    }
  }, [rows.length, displayCount]);

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      columns.some(c => {
        const v = r[c.field];
        if (!v) return false;
        return String(v).toLowerCase().includes(q);
      })
    );
  }, [rows, search, columns]);

  // Totals
  const totals: Record<string, number> = {};
  for (const c of columns) {
    if (c.type === "currency" || c.type === "formula") {
      totals[c.field] = filtered.reduce((s, r) => s + (Number(r[c.field]) || 0), 0);
    }
  }

  // ── Styles ──
  const BORDER = "1px solid #000";
  const TH_STYLE: React.CSSProperties = {
    background: "#0f2744", color: "#fff",
    fontFamily: "Arial,Helvetica,sans-serif",
    fontWeight: 700, fontSize: "0.68rem",
    padding: "6px 8px", border: BORDER,
    whiteSpace: "nowrap", letterSpacing: "0.04em",
  };
  const TD = (align: string, isSubRow?: boolean): React.CSSProperties => ({
    padding: "3px 7px", border: BORDER, fontSize: "0.76rem",
    fontFamily: "Arial,Helvetica,sans-serif", color: "#000",
    textAlign: align as any,
    fontStyle: isSubRow ? "italic" : "normal",
    background: "inherit",
  });
  const TFOOT: React.CSSProperties = {
    padding: "5px 8px", border: BORDER, borderTop: "2.5px double #000",
    fontSize: "0.76rem", fontFamily: "Arial,Helvetica,sans-serif",
    color: "#000", fontWeight: 700, background: "#dbeafe",
    textAlign: "right",
  };

  const hasDoubleHeaders = columns.some(c => c.header1 !== undefined || c.header2 !== undefined);

  const buildSpans = () => {
    const spans: { label: string; colSpan: number }[] = [];
    let i = 0;
    while (i < columns.length) {
      const h1 = columns[i].header1 ?? columns[i].header;
      let span = 1;
      while (i + span < columns.length &&
        (columns[i + span].header1 ?? columns[i + span].header) === h1) span++;
      spans.push({ label: h1 ?? "", colSpan: span });
      i += span;
    }
    return spans;
  };
  const headerSpans = hasDoubleHeaders ? buildSpans() : [];

  // ── Edit helpers ──
  const startEdit = (row: any) => {
    setEditingId(row.id);
    setEditData({ ...row });
  };
  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async (row: any) => {
    if (!onSave) return;
    setSavingId(row.id);
    try {
      await onSave({ ...row, ...editData });
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async (row: any) => {
    if (!onDelete) return;
    if (!window.confirm(`Delete this entry? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      await onDelete(row);
    } finally {
      setDeletingId(null);
    }
  };

  const hasActions = !!(onSave || onDelete);
  const sliced = filtered.slice(0, displayCount);

  // ── Empty state ──
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

  return (
    <div>
      {/* ── Search Bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: "#0f2744", borderBottom: "1px solid #1e3a5f",
      }}>
        <span style={{ color: "#60a5fa", fontSize: "0.85rem" }}>🔍</span>
        <input
          type="text"
          placeholder={`Search ${monthYear ?? "entries"}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: "#0a1628", border: "1px solid #1e3a5f",
            borderRadius: 8, padding: "6px 12px", color: "#fff",
            fontSize: "0.8rem", outline: "none",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: "0.85rem" }}
          >✕ Clear</button>
        )}
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
          {filtered.length} / {rows.length} rows
        </span>
        {onPrint && (
          <button
            onClick={onPrint}
            style={{
              background: "#22c55e", border: "none", borderRadius: 8,
              color: "#fff", padding: "6px 12px", cursor: "pointer",
              fontSize: "0.8rem", fontWeight: 900, display: "flex", alignItems: "center", gap: 6,
              marginLeft: "12px", boxShadow: "0 0 15px rgba(34,197,94,0.3)"
            }}
          >
            🖨️ PRINT PREVIEW
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", border: "1.5px solid #000", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "68vh", overflowY: "auto" }}>
          <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
              {/* Company header */}
              {bookName && monthYear && (
                <tr>
                  <th colSpan={columns.length + (hasActions ? 1 : 0)} style={{ background: "#fff", color: "#000", textAlign: "center", padding: "14px 8px", border: BORDER }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>JHAYMARTS INDUSTRIES, INC.</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{bookName}</div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>FOR THE MONTH OF {monthYear}</div>
                  </th>
                </tr>
              )}
              {/* Grouped header row */}
              {hasDoubleHeaders && (
                <tr>
                  {hasActions && <th style={{ ...TH_STYLE, textAlign: "center" }}>ACTIONS</th>}
                  {headerSpans.map((s, i) => (
                    <th key={i} colSpan={s.colSpan} style={{ ...TH_STYLE, textAlign: "center" }}>{s.label}</th>
                  ))}
                </tr>
              )}
              {/* Column sub-labels */}
              <tr>
                {!hasDoubleHeaders && hasActions && (
                  <th style={{ ...TH_STYLE, textAlign: "center", minWidth: 80 }}>ACTIONS</th>
                )}
                {hasDoubleHeaders && hasActions && <th style={{ ...TH_STYLE }}></th>}
                {columns.map((c, i) => (
                  <th key={i} style={{
                    ...TH_STYLE,
                    minWidth: hasDoubleHeaders ? `${(c.width || 10) * 8}px` : `${c.width || 80}px`,
                    textAlign: (c.type === "currency" || c.type === "formula") ? "right" : "left",
                  }}>
                    {hasDoubleHeaders ? (c.header2 ?? c.header) : c.header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sliced.map((r, ri) => {
                const isEditing = editingId === r.id;
                const isSaving = savingId === r.id;
                const isDeleting = deletingId === r.id;
                const bg = ri % 2 === 0 ? "#ffffff" : "#f9fafb";
                return (
                  <tr key={r.id ?? ri} style={{ background: bg }}>
                    {/* Action cell */}
                    {hasActions && (
                      <td style={{ ...TD("center"), background: bg, whiteSpace: "nowrap", minWidth: 90 }}>
                        {isEditing ? (
                          <>
                            <IconBtn onClick={() => saveEdit(r)} title="Save" color="#16a34a">
                              {isSaving ? "⏳" : "💾"}
                            </IconBtn>
                            <IconBtn onClick={cancelEdit} title="Cancel" color="#6b7280">✕</IconBtn>
                          </>
                        ) : (
                          <>
                            {onSave && (
                              <IconBtn onClick={() => startEdit(r)} title="Edit" color="#2563eb">✏️</IconBtn>
                            )}
                            {onDelete && (
                              <IconBtn onClick={() => confirmDelete(r)} title="Delete" color="#dc2626">
                                {isDeleting ? "⏳" : "🗑"}
                              </IconBtn>
                            )}
                          </>
                        )}
                      </td>
                    )}
                    {/* Data cells */}
                    {columns.map((c, ci) => {
                      const val = isEditing ? (editData[c.field] ?? r[c.field]) : r[c.field];
                      const isEmpty = c.type === "currency" && (!val || Number(val) === 0);
                      const align = c.type === "currency" ? "right" : "left";

                      if (isEditing) {
                        return (
                          <td key={ci} style={{ ...TD(align, r._is_sub_row), background: "#fefce8", padding: "2px 4px" }}>
                            <input
                              type={(c.type === "currency" || c.type === "formula") ? "number" : c.type === "date" ? "date" : "text"}
                              value={c.type === "date"
                                ? (editData[c.field] ?? r[c.field] ?? "").toString().substring(0, 10)
                                : (editData[c.field] ?? r[c.field] ?? "")}
                              onChange={e => setEditData(prev => ({ ...prev, [c.field]: (c.type === "currency" || c.type === "formula") ? parseFloat(e.target.value) || 0 : e.target.value }))}
                              style={{
                                width: "100%", border: "1px solid #93c5fd", borderRadius: 4,
                                padding: "2px 6px", fontSize: "0.75rem", textAlign: align,
                                background: "#fff", outline: "none",
                                minWidth: c.type === "currency" ? 80 : c.type === "date" ? 110 : 120,
                              }}
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={ci} style={TD(align, r._is_sub_row)}>
                          {(c.type === "currency" || c.type === "formula")
                            ? (isEmpty ? "" : fmtCell(val, c.type))
                            : fmtCell(val, c.type)}
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
                  {hasActions && <td style={{ ...TFOOT, textAlign: "left" }}></td>}
                  {columns.map((c, i) => (
                    <td key={i} style={{ ...TFOOT, textAlign: (c.type === "currency" || c.type === "formula") ? "right" : i === 0 ? "left" : "center" }}>
                      {(c.type === "currency" || c.type === "formula")
                        ? (totals[c.field] ? fmtMoney(totals[c.field]) : "")
                        : i === 0 ? "TOTAL" : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {filtered.length > displayCount && (
          <div style={{
            padding: "8px 12px", background: "#fef3c7", borderTop: "1px solid #f59e0b",
            fontSize: "0.75rem", color: "#92400e", textAlign: "center", fontWeight: 500,
          }}>
            Loading more rows... ({displayCount} of {filtered.length} displayed)
          </div>
        )}
      </div>
    </div>
  );
}
