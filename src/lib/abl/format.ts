// ABL v2.1 — formatters
export function fmtMoney(n: number | null | undefined): string {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return "—";
  const abs = Math.abs(v).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `(${abs})` : abs;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  if (isNaN(date.getTime())) return String(d);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function fmtDateLong(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  if (isNaN(date.getTime())) return "";
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function parseMonthYear(my: string): { month: number; year: number } | null {
  if (!my) return null;
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const parts = my.trim().toUpperCase().split(/\s+/);
  if (parts.length !== 2) return null;
  const m = months.indexOf(parts[0]);
  const y = parseInt(parts[1], 10);
  if (m < 0 || isNaN(y)) return null;
  return { month: m, year: y };
}

export function monthYearToTabLabel(my: string): string {
  const p = parseMonthYear(my);
  if (!p) return my;
  const abbr = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${abbr[p.month]} ${p.year}`;
}

export function dateToMonthYear(d: Date): string {
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function sortMonthYears(mys: string[]): string[] {
  return [...new Set(mys)].sort((a, b) => {
    const pa = parseMonthYear(a);
    const pb = parseMonthYear(b);
    if (!pa || !pb) return a.localeCompare(b);
    return pa.year - pb.year || pa.month - pb.month;
  });
}

export function folioFor(prefix: string, monthYear: string): string {
  const p = parseMonthYear(monthYear);
  if (!p) return prefix;
  const abbr = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${prefix}-${abbr[p.month]}${String(p.year).slice(-2)}`;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function groupMonthsByYear(mys: string[]): Record<number, string[]> {
  const sorted = sortMonthYears(mys);
  const groups: Record<number, string[]> = {};
  for (const my of sorted) {
    const p = parseMonthYear(my);
    if (!p) continue;
    if (!groups[p.year]) groups[p.year] = [];
    groups[p.year].push(my);
  }
  return groups;
}
