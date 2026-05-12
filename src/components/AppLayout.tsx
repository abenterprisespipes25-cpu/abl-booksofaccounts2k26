import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getCompanySettings } from "@/lib/abl/companySettings";
import { supabase } from "@/integrations/supabase/client";
import { Search, Notifications, AccountCircle, Settings, Dashboard, Payments, ShoppingCart, ReceiptLong, AccountBalanceWallet, AccountTree, Analytics, EditNote, Summarize, SettingsSuggest, Menu } from "@mui/icons-material";

const NAV = [
  { to: "/", label: "Home", icon: <Dashboard />, end: true },
  { to: "/cdb", label: "Cash Disbursements", icon: <Payments /> },
  { to: "/purchase-book", label: "Purchase Book", icon: <ShoppingCart /> },
  { to: "/sales-book", label: "Sales Book", icon: <ReceiptLong /> },
  { to: "/cash-receipts", label: "Cash Receipts", icon: <AccountBalanceWallet /> },
  { to: "/general-ledger", label: "General Ledger", icon: <AccountTree /> },
];

const REPORTING_NAV = [
  { to: "/trial-balance", label: "Trial Balance", icon: <Analytics /> },
  { to: "/journal-entries", label: "Journal Entries", icon: <EditNote /> },
  { to: "/reports/cdb", label: "ITW Summary", icon: <Summarize /> },
  { to: "/maintenance", label: "Maintenance", icon: <SettingsSuggest /> },
];

export default function AppLayout() {
  const [companyName, setCompanyName] = useState("");
  const location = useLocation();
  
  useEffect(() => {
    const fetch = () => getCompanySettings().then((s) => setCompanyName(s.company_name));
    fetch();

    const channel = supabase.channel('company_settings_layout')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'company_settings' }, () => {
        fetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen font-body-md antialiased text-on-surface selection:bg-primary-fixed/30">
      {/* Liquid Background Asset */}
      <img 
        className="liquid-bg" 
        alt="Premium background"
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuC4V_uyCZUKfJPBJ0gSZYh6_c7p-gaalmkwHnptxeKQp0kjD17SizJ1DHqYfY7XI20LJBMGo9-iiVJ0QcpMJgHsB_KQMmH0GSjNWdCoYuBYEWWf77ntPML2gs4xRUw38pvzeaabofXKAeMSHJCDc3Z-oPPbfbUicusF9g_vMRisYG492EcPb7bYeAQizY7Eo-yqOh-1eMQvQAJuW9wk9CtVzdxeopFFnW7ut1JPMxQN4m9Fb9BvkcrkrXD2I6SSFsemia3gTM9CIHU"
      />

      {/* Top Navigation Bar */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-surface-container-low/70 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,219,233,0.1)]">
        <div className="flex justify-between items-center w-full px-container-desktop py-4">
          <div className="flex items-center gap-4">
            <h1 className="font-display-lg text-[22px] tracking-wider text-primary-fixed glow-sm uppercase">
              {companyName || "JHAYMARTS INDUSTRIES, INC."}
            </h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex relative group">
              <input 
                className="bg-surface-container-lowest/50 border-white/10 rounded-full pl-10 pr-4 py-2 text-xs focus:border-primary-fixed-dim focus:ring-1 focus:ring-primary-fixed-dim transition-all w-64 backdrop-blur-md text-white outline-none" 
                placeholder="Search operations..." 
                type="text"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-[18px]" />
            </div>
            
            <div className="flex items-center gap-4 text-on-surface-variant">
              <button className="hover:bg-white/5 hover:text-primary-fixed-dim p-2 rounded-full transition-all active:opacity-80">
                <Notifications className="!text-[22px]" />
              </button>
              <button className="hover:bg-white/5 hover:text-primary-fixed-dim p-2 rounded-full transition-all active:opacity-80">
                <AccountCircle className="!text-[22px]" />
              </button>
              <button className="hover:bg-white/5 hover:text-primary-fixed-dim p-2 rounded-full transition-all active:opacity-80">
                <Settings className="!text-[22px]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Side Navigation Bar */}
      <aside className="fixed left-0 top-0 h-full z-40 flex flex-col pt-24 pb-8 bg-surface-container/80 backdrop-blur-2xl border-r border-white/5 w-64 shadow-2xl overflow-y-auto scrollbar-hide">
        <div className="px-6 mb-8">
          <div className="font-display-lg text-primary-fixed text-[24px] leading-none mb-1">ABL FMS</div>
          <div className="font-label-sm text-secondary-fixed-dim opacity-70 text-[10px] uppercase tracking-widest">v2.4 Biolume</div>
        </div>
        
        <nav className="flex-1 space-y-1 px-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-3 rounded-r-xl transition-all duration-300
                ${isActive 
                  ? "bg-secondary-container/20 text-secondary-fixed-dim border-l-4 border-secondary shadow-[inset_0_0_15px_rgba(255,172,232,0.1)] translate-x-1 font-bold" 
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface hover:backdrop-blur-md"
                }
              `}
            >
              <span className="!text-[20px]">{item.icon}</span>
              <span className="font-label-sm text-xs">{item.label}</span>
            </NavLink>
          ))}
          
          <div className="pt-6 pb-2 px-4 text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-bold">Reporting</div>
          
          {REPORTING_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-3 rounded-r-xl transition-all duration-300
                ${isActive 
                  ? "bg-primary-fixed/10 text-primary-fixed border-l-4 border-primary-fixed translate-x-1 font-bold" 
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface hover:backdrop-blur-md"
                }
              `}
            >
              <span className="!text-[20px]">{item.icon}</span>
              <span className="font-label-sm text-xs">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-6 pt-6 border-t border-white/5">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-fixed-dim to-secondary-fixed ring-2 ring-white/10 flex items-center justify-center text-on-primary shadow-lg">
              <span className="font-bold text-xs">JD</span>
            </div>
            <div>
              <div className="text-[11px] text-on-surface font-black uppercase tracking-tight">Chief Accountant</div>
              <div className="text-[9px] text-primary-fixed-dim font-bold uppercase tracking-widest opacity-70">Operations Lead</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 pt-20 min-h-screen flex flex-col relative z-10">
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
        
        {/* Footer Section */}
        <footer className="w-full py-6 flex justify-between px-container-desktop mt-auto opacity-60 bg-transparent text-on-surface-variant font-label-sm text-[10px] uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <span>© 2026 {companyName || "JHAYMARTS INDUSTRIES, INC."} | ABL Financial System</span>
            <span className="text-primary-fixed flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse"></span> System Status: Online
            </span>
          </div>
          <div className="flex gap-6">
            <a className="hover:text-primary-fixed transition-colors" href="#">Privacy</a>
            <a className="hover:text-primary-fixed transition-colors" href="#">Security</a>
            <a className="hover:text-primary-fixed transition-colors" href="#">Help</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
