import { useNavigate } from "react-router-dom";
import { ShoppingCart, AccountTree, ReceiptLong, Payments, AccountBalanceWallet, Analytics, ArrowForward, CheckCircle, TrendingUp } from "@mui/icons-material";

export default function Dashboard() {
  const navigate = useNavigate();

  const modules = [
    { 
      id: "cdb", 
      name: "Cash Disbursements", 
      desc: "Manage all outgoing payments, vendor settlements, and operational expenses.", 
      icon: <Payments />, 
      stats: "₱4.2M", 
      trend: "12%", 
      status: "LIVE",
      to: "/cdb"
    },
    { 
      id: "receipts", 
      name: "Cash Receipts", 
      desc: "Record and track incoming revenue streams and deposit status across entities.", 
      icon: <AccountBalanceWallet />, 
      stats: "₱12.8M", 
      trend: "8.4%", 
      status: "QUEUED",
      to: "/cash-receipts"
    },
    { 
      id: "sales", 
      name: "Sales Book", 
      desc: "Automated sales journal entries with integrated VAT tracking and reporting.", 
      icon: <ReceiptLong />, 
      stats: "₱8.1M", 
      status: "READY",
      to: "/sales-book"
    },
    { 
      id: "purchase", 
      name: "Purchase Book", 
      desc: "Centralized ledger for all procurement activities and supply chain financing.", 
      icon: <ShoppingCart />, 
      progress: 65, 
      to: "/purchase-book"
    },
    { 
      id: "ledger", 
      name: "General Ledger", 
      desc: "The core of the system. View double-entry journals and real-time balances.", 
      icon: <AccountTree />, 
      team: ["GA", "TM", "SK"],
      to: "/general-ledger"
    },
    { 
      id: "trial", 
      name: "Trial Balance", 
      desc: "Instant balance verification for auditing and financial integrity checks.", 
      icon: <Analytics />, 
      verified: true,
      to: "/trial-balance"
    },
  ];

  return (
    <div className="px-container-desktop py-8 animate-in fade-in duration-700">
      {/* Hero Header */}
      <section className="mb-section-gap">
        <div className="relative py-12 px-10 rounded-3xl overflow-hidden glass-card">
          <div className="absolute top-0 right-0 w-1/2 h-full">
            <img 
              className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-overlay" 
              alt="Background detail"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMWjQKVRSEyWqvIjtwugIrtEtM7eD3_vjW9vRYtZl9K1DLUZOUh_i5vJ0v5i17wMwv4pwN0TwtaJS8Q1Tf0l3UuzW3ydh3crxPbHJdM2wVb2Gxgj7-W6mDEhUhDBdr_p7alPcFDvIyeBpZLWuO_KUtEj_3wwG-9llZGyEBDlbDlzovlNF7sJtlrFwYQsTDTJpovjNfjFXVc-VteaJpkrXs8Qgw9XCn3uZr74qiAcBjY5-eoPXTS5OSnAyRMmms7lESKfPMWMtJQDo"
            />
          </div>
          <div className="relative z-10 max-w-2xl">
            <span className="inline-block px-3 py-1 bg-primary-fixed/20 text-primary-fixed text-[10px] font-bold tracking-widest uppercase rounded-full mb-4 border border-primary-fixed/30">
              System Status: Optimal
            </span>
            <h2 className="font-display-lg text-4xl md:text-5xl lg:text-6xl text-primary-fixed mb-4 neon-text-glow tracking-tight">
              Financial Operations Dashboard
            </h2>
            <p className="text-sm md:text-base text-on-surface-variant max-w-lg leading-relaxed opacity-80">
              Real-time intelligence and automated ledger reconciliation for JHAYMARTS INDUSTRIES. Monitor liquidity flow and transaction velocity across all financial modules.
            </p>
          </div>
        </div>
      </section>

      {/* Central Process Flow */}
      <section className="mb-section-gap">
        <div className="flex items-center gap-4 mb-8">
          <AccountTree className="text-primary-fixed !text-[32px]" />
          <h3 className="font-headline-lg text-2xl text-on-surface tracking-tight">Financial Process Flow</h3>
        </div>
        
        <div className="glass-card p-12 rounded-3xl relative overflow-hidden group">
          <div className="grid grid-cols-5 gap-4 items-center relative z-10">
            {/* Node 1 */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/10 flex items-center justify-center mb-4 glow-cyan hover:scale-110 transition-transform duration-500">
                <ShoppingCart className="text-primary-fixed !text-[28px]" />
              </div>
              <span className="font-label-sm text-[10px] uppercase tracking-widest font-bold">Purchase Book</span>
            </div>
            
            {/* Connector 1 */}
            <div className="relative flex items-center justify-center">
              <div className="flow-line w-full"></div>
            </div>
            
            {/* Node 2 */}
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-surface-container-highest border-2 border-secondary flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(255,36,228,0.2)] hover:scale-110 transition-transform duration-500">
                <AccountTree className="text-secondary !text-[40px]" />
              </div>
              <span className="text-lg text-secondary font-black tracking-tight uppercase">General Ledger</span>
            </div>
            
            {/* Connector 2 */}
            <div className="relative flex items-center justify-center">
              <div className="flow-line w-full"></div>
            </div>
            
            {/* Node 3 */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/10 flex items-center justify-center mb-4 glow-cyan hover:scale-110 transition-transform duration-500">
                <ReceiptLong className="text-primary-fixed !text-[28px]" />
              </div>
              <span className="font-label-sm text-[10px] uppercase tracking-widest font-bold">Sales Book</span>
            </div>
          </div>
          
          {/* Secondary Row Connectors */}
          <div className="flex justify-around mt-8 relative">
            {/* Vertical Line Left */}
            <div className="flex flex-col items-center">
              <div className="w-[2px] h-12 bg-gradient-to-b from-primary-fixed to-transparent shadow-[0_0_10px_rgba(0,219,233,0.5)]"></div>
              <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/10 flex items-center justify-center mt-4 glow-cyan hover:scale-110 transition-transform duration-500">
                <Payments className="text-primary-fixed !text-[28px]" />
              </div>
              <span className="font-label-sm text-[10px] uppercase tracking-widest font-bold mt-2">Disbursements</span>
            </div>
            {/* Vertical Line Right */}
            <div className="flex flex-col items-center">
              <div className="w-[2px] h-12 bg-gradient-to-b from-primary-fixed to-transparent shadow-[0_0_10px_rgba(0,219,233,0.5)]"></div>
              <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/10 flex items-center justify-center mt-4 glow-cyan hover:scale-110 transition-transform duration-500">
                <AccountBalanceWallet className="text-primary-fixed !text-[28px]" />
              </div>
              <span className="font-label-sm text-[10px] uppercase tracking-widest font-bold mt-2">Cash Receipts</span>
            </div>
          </div>
        </div>
      </section>

      {/* Module Grid */}
      <section className="mb-section-gap">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-headline-lg text-2xl text-on-surface tracking-tight uppercase font-black">Interactive Modules</h3>
          <button className="text-primary-fixed hover:underline text-[10px] uppercase tracking-[0.2em] font-bold flex items-center gap-2 transition-all">
            View All <ArrowForward className="!text-[16px]" />
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((m) => (
            <div 
              key={m.id} 
              onClick={() => navigate(m.to)}
              className="glass-card p-6 rounded-2xl group cursor-pointer relative overflow-hidden hover:-translate-y-2"
            >
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary-fixed/5 rounded-full blur-3xl group-hover:bg-primary-fixed/15 transition-all"></div>
              
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-surface-container-highest rounded-xl text-primary-fixed group-hover:scale-110 transition-transform">
                  <span className="!text-[24px]">{m.icon}</span>
                </div>
                {m.status && (
                  <span className="text-primary-fixed-dim text-[10px] font-black bg-primary-fixed/10 px-2 py-1 rounded tracking-widest">
                    {m.status}
                  </span>
                )}
              </div>
              
              <h4 className="font-headline-lg text-lg text-on-surface mb-2 font-bold group-hover:text-primary-fixed transition-colors">
                {m.name}
              </h4>
              <p className="text-[11px] text-on-surface-variant/80 leading-relaxed mb-6">
                {m.desc}
              </p>
              
              {m.stats && (
                <div className="flex items-center gap-4 text-primary-fixed-dim font-black">
                  <span className="text-2xl tracking-tighter">{m.stats}</span>
                  {m.trend && (
                    <span className="text-[10px] text-on-error bg-error/20 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                      <TrendingUp className="!text-[12px]" /> {m.trend}
                    </span>
                  )}
                </div>
              )}
              
              {m.progress !== undefined && (
                <div className="space-y-2">
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary-fixed h-full" style={{ width: `${m.progress}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[9px] text-on-surface-variant font-black uppercase tracking-widest">
                    <span>Reconciled: {m.progress}%</span>
                    <span>Pending Items</span>
                  </div>
                </div>
              )}
              
              {m.team && (
                <div className="flex -space-x-2">
                  {m.team.map((initials, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-surface bg-primary-fixed-dim/20 flex items-center justify-center text-[10px] font-black shadow-lg">
                      {initials}
                    </div>
                  ))}
                </div>
              )}
              
              {m.verified && (
                <div className="flex items-center gap-2 text-emerald-400 font-black">
                  <CheckCircle className="!text-[18px]" />
                  <span className="text-[10px] uppercase tracking-widest">Debits = Credits</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
