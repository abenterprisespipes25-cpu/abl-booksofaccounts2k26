import { cn } from "@/lib/utils";
import { groupMonthsByYear, parseMonthYear } from "@/lib/abl/format";
import { useMemo } from "react";

export function MonthTabs({
  months, active, onSelect,
}: { months: string[]; active: string | null; onSelect: (m: string) => void }) {
  const grouped = useMemo(() => groupMonthsByYear(months), [months]);
  const years = useMemo(() => Object.keys(grouped).map(Number).sort((a, b) => a - b), [grouped]);

  if (!months.length) return null;
  
  return (
    <div className="flex flex-col space-y-4">
      {years.map((year) => (
        <div key={year} className="space-y-2">
          <div className="flex items-center gap-2 px-2">
            <span className="text-[10px] font-black text-blue-400/50 uppercase tracking-[0.3em]">{year}</span>
            <div className="h-[1px] flex-1 bg-white/5"></div>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
            {grouped[year].map((m) => {
              const isActive = active === m;
              const p = parseMonthYear(m);
              const label = p ? m.split(" ")[0].substring(0, 3) : m;
              return (
                <button
                  key={m}
                  onClick={() => onSelect(m)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[11px] font-black transition-all duration-300 whitespace-nowrap uppercase tracking-widest",
                    isActive 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/40 border-blue-500 scale-105" 
                      : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white"
                  )}
                  style={{
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
