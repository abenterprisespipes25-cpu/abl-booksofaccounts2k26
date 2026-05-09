import { useEffect, useState } from "react";
import { Loader2, CloudCheck, CloudSync, CloudAlert } from "lucide-react";

interface SyncInfo {
  status: 'syncing' | 'synced' | 'error';
  message: string;
  lastSync: string;
}

export function SyncStatus() {
  const [info, setInfo] = useState<SyncInfo | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/sync-status.json?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          setInfo(data);
        }
      } catch (e) {}
    };
    check();
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, []);

  if (!info) return null;

  const Icon = info.status === 'syncing' ? Loader2 : (info.status === 'error' ? CloudAlert : CloudCheck);
  const color = info.status === 'syncing' ? 'text-blue-400' : (info.status === 'error' ? 'text-rose-400' : 'text-emerald-400');

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#0a1628]/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-3">
        <Icon className={`h-4 w-4 ${info.status === 'syncing' ? 'animate-spin' : ''} ${color}`} />
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-none">
            Repository Sync
          </span>
          <span className="text-xs font-bold text-white/90 leading-tight truncate max-w-[150px]">
            {info.message}
          </span>
        </div>
      </div>
    </div>
  );
}
