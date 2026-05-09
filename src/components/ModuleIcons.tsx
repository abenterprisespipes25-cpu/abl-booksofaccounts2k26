import { CSSProperties } from "react";

export type ModuleKey =
  | "cdb"
  | "receipts"
  | "purchase"
  | "sales"
  | "ledger"
  | "trial"
  | "maintenance";

export const MODULE_THEME: Record<ModuleKey, { color: string; label: string }> = {
  cdb: { color: "#03b3c3", label: "Cash Disbursements" },
  receipts: { color: "#0e5ea5", label: "Cash Receipts" },
  sales: { color: "#d856bf", label: "Sales Book" },
  purchase: { color: "#6750a2", label: "Purchase Book" },
  ledger: { color: "#c247ac", label: "General Ledger" },
  trial: { color: "#324555", label: "Trial Balance" },
  maintenance: { color: "#ff8800", label: "Maintenance" },
};

interface IconProps {
  size?: number;
  color: string;
  id: string;
}

const Defs = ({ id, color }: { id: string; color: string }) => (
  <defs>
    <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor={color} stopOpacity="0.95" />
      <stop offset="100%" stopColor={color} stopOpacity="0.55" />
    </linearGradient>
    <linearGradient id={`${id}-shine`} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
    <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

// Wallet w/ coins
const CdbIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <rect x="8" y="20" width="44" height="30" rx="6" fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" />
      <rect x="8" y="20" width="44" height="10" rx="6" fill={`url(#${id}-shine)`} opacity="0.4" />
      <circle cx="44" cy="35" r="4" fill="#fff" opacity="0.85" />
      <circle cx="44" cy="35" r="1.6" fill={color} />
      <circle cx="48" cy="14" r="3" fill={color} opacity="0.9" />
      <circle cx="55" cy="10" r="2" fill={color} opacity="0.7" />
    </g>
  </svg>
);

// Clipboard w/ check + tag
const PurchaseIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <rect x="14" y="12" width="32" height="42" rx="5" fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" />
      <rect x="22" y="8" width="16" height="8" rx="2" fill={color} />
      <path d="M22 32 L28 38 L40 26" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="14" y="12" width="32" height="14" rx="5" fill={`url(#${id}-shine)`} opacity="0.35" />
    </g>
  </svg>
);

// Bar chart w/ up arrow
const SalesIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <rect x="10" y="38" width="10" height="18" rx="2" fill={`url(#${id}-grad)`} />
      <rect x="24" y="28" width="10" height="28" rx="2" fill={`url(#${id}-grad)`} />
      <rect x="38" y="18" width="10" height="38" rx="2" fill={`url(#${id}-grad)`} />
      <path d="M10 30 L26 22 L38 16 L52 8" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M46 8 L54 8 L54 16" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g>
  </svg>
);

// Open book / ledger
const LedgerIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <path d="M6 14 L30 18 L30 54 L6 50 Z" fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" />
      <path d="M58 14 L34 18 L34 54 L58 50 Z" fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" />
      <line x1="11" y1="26" x2="26" y2="29" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="11" y1="32" x2="26" y2="35" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="11" y1="38" x2="26" y2="41" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="38" y1="26" x2="53" y2="23" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="38" y1="32" x2="53" y2="29" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" />
    </g>
  </svg>
);

// Balance scale
const TrialIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <rect x="30" y="14" width="4" height="38" rx="1.5" fill={color} />
      <circle cx="32" cy="12" r="3" fill={color} />
      <line x1="14" y1="18" x2="50" y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 18 L14 18 L20 32 L8 32 Z" fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" />
      <path d="M44 18 L50 18 L56 32 L44 32 Z" fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" />
      <rect x="22" y="50" width="20" height="4" rx="1.5" fill={color} />
    </g>
  </svg>
);

// Gear + wrench
const MaintenanceIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <path
        d="M32 8 L36 14 L43 12 L43 19 L50 22 L46 28 L50 34 L43 37 L43 44 L36 42 L32 48 L28 42 L21 44 L21 37 L14 34 L18 28 L14 22 L21 19 L21 12 L28 14 Z"
        fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" strokeLinejoin="round"
      />
      <circle cx="32" cy="28" r="6" fill="#0a1424" stroke={color} strokeWidth="1.5" />
      <path d="M40 50 L52 38 L56 42 L44 54 Z" fill={color} opacity="0.85" />
    </g>
  </svg>
);

// Receipt with squiggle bottom
const ReceiptsIcon = ({ size = 56, color, id }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs id={id} color={color} />
    <g filter={`url(#${id}-glow)`}>
      <path d="M16 8 H48 V52 L43 48 L38 52 L32 48 L26 52 L21 48 L16 52 Z"
        fill={`url(#${id}-grad)`} stroke={color} strokeOpacity="0.8" strokeLinejoin="round" />
      <line x1="22" y1="20" x2="42" y2="20" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="22" y1="28" x2="42" y2="28" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="22" y1="36" x2="36" y2="36" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="16" y="8" width="32" height="6" fill={`url(#${id}-shine)`} opacity="0.4" />
    </g>
  </svg>
);

const ICONS: Record<ModuleKey, (p: IconProps) => JSX.Element> = {
  cdb: CdbIcon,
  receipts: ReceiptsIcon,
  purchase: PurchaseIcon,
  sales: SalesIcon,
  ledger: LedgerIcon,
  trial: TrialIcon,
  maintenance: MaintenanceIcon,
};

export function ModuleIcon({ moduleKey, size = 56 }: { moduleKey: ModuleKey; size?: number }) {
  const { color } = MODULE_THEME[moduleKey];
  const Comp = ICONS[moduleKey];
  return <Comp id={`mi-${moduleKey}`} color={color} size={size} />;
}

export function ModuleIconCard({
  moduleKey,
  label,
  onClick,
}: {
  moduleKey: ModuleKey;
  label?: string;
  onClick?: () => void;
}) {
  const { color, label: defaultLabel } = MODULE_THEME[moduleKey];
  const style: CSSProperties = {
    boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15), 0 0 24px ${color}33`,
  };
  return (
    <button onClick={onClick} className="module-icon-card" style={style}>
      <ModuleIcon moduleKey={moduleKey} />
      <span className="module-icon-label">{label ?? defaultLabel}</span>
    </button>
  );
}
