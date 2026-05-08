import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getCompanySettings } from "@/lib/abl/companySettings";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/cdb", label: "Cash Disbursements" },
  { to: "/purchase-book", label: "Purchase Book" },
  { to: "/sales-book", label: "Sales Book" },
  { to: "/cash-receipts", label: "Cash Receipts" },
  { to: "/general-ledger", label: "General Ledger" },
  { to: "/trial-balance", label: "Trial Balance" },
  { to: "/maintenance", label: "Maintenance" },
];

export default function AppLayout() {
  const [companyName, setCompanyName] = useState("");
  useEffect(() => {
    getCompanySettings().then((s) => setCompanyName(s.company_name));
  }, []);

  return (
    <div className="min-h-screen w-full" style={{ background: "#0a1628" }}>
      <nav className="top-nav">
        <div className="top-nav-logo">
          <span className="logo-text">ABL</span>
          <span className="logo-version">· v2.1</span>
          <span className="logo-sub">Books of Accounts</span>
        </div>
        <div className="top-nav-links">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="top-nav-company" title={companyName}>
          {companyName}
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
