import { useNavigate } from "react-router-dom";
import { ModuleIcon, ModuleKey, MODULE_THEME } from "@/components/ModuleIcons";
import { useEffect, useState } from "react";
import { format } from "date-fns";

type GridModule = {
  key: ModuleKey;
  name: string;
  to: string;
};

const MODULES: GridModule[] = [
  { key: "cdb", name: "Cash Disbursements", to: "/cdb" },
  { key: "receipts", name: "Cash Receipts", to: "/cash-receipts" },
  { key: "sales", name: "Sales Book", to: "/sales-book" },
  { key: "purchase", name: "Purchase Book", to: "/purchase-book" },
  { key: "ledger", name: "General Ledger", to: "/general-ledger" },
  { key: "trial", name: "Trial Balance", to: "/trial-balance" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="min-h-[calc(100vh-8rem)] w-full flex items-center justify-center animate-in fade-in zoom-in duration-700"
      style={{ padding: "20px" }}
    >
      <div className="w-full max-w-5xl">
        <div className="text-center mb-16 relative">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-blue-500/10 rounded-full blur-[80px] -z-10"></div>
          
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-2 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40">
            Welcome, Adrian
          </h1>
          <p className="text-lg text-blue-400 font-bold tracking-widest uppercase mb-6">
            ABL Financial Management System
          </p>
          
          <div className="flex flex-col items-center justify-center space-y-1">
            <p className="text-sm text-white/50 font-medium">
              {format(currentTime, "EEEE, MMMM do, yyyy")}
            </p>
            <p className="text-xs font-mono text-blue-500/80 font-black">
              {format(currentTime, "HH:mm:ss")}
            </p>
          </div>
          
          <div className="mt-8 h-px w-32 mx-auto bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8">
          {MODULES.map((m) => {
            const color = MODULE_THEME[m.key].color;
            return (
              <button
                key={m.key}
                onClick={() => navigate(m.to)}
                className="neon-glass-card group relative overflow-hidden"
                style={{
                  ["--glow" as any]: color,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="neon-glass-icon transform group-hover:scale-110 transition-transform duration-500">
                  <ModuleIcon moduleKey={m.key} size={64} />
                </div>
                <span className="neon-glass-label group-hover:text-white transition-colors">{m.name}</span>
              </button>
            );
          })}
        </div>
        
        <div className="mt-20 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
            Automated Accounting Suite v2.1 • All Systems Operational
          </p>
        </div>
      </div>
    </div>
  );
}
