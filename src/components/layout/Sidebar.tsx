import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, PiggyBank, Landmark, Briefcase,
  Wallet, CreditCard, Target, BarChart3, Calculator,
  Bell, Star, DollarSign, Settings,
} from 'lucide-react';
import clsx from 'clsx';

type NavItem = { to: string; label: string; icon: React.ElementType };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: '',
    items: [
      { to: '/', label: 'לוח בקרה', icon: LayoutDashboard },
    ],
  },
  {
    label: 'נכסים',
    items: [
      { to: '/stocks',  label: 'מניות וניירות ערך',   icon: TrendingUp },
      { to: '/savings', label: 'חסכונות ופיקדונות',   icon: PiggyBank  },
      { to: '/gemel',   label: 'קופות גמל',            icon: Landmark   },
      { to: '/pension', label: 'פנסיה',                icon: Briefcase  },
    ],
  },
  {
    label: 'תזרים',
    items: [
      { to: '/income',    label: 'הכנסות',           icon: DollarSign },
      { to: '/expenses',  label: 'הוצאות וחיובים',   icon: Wallet     },
      { to: '/recurring', label: 'חיובים קבועים',    icon: CreditCard },
    ],
  },
  {
    label: 'תכנון',
    items: [
      { to: '/goals',     label: 'יעדים ותקציב',      icon: Target    },
      { to: '/trends',    label: 'ניתוח מגמות',        icon: BarChart3 },
      { to: '/simulator', label: 'סימולטור מה אם',     icon: Calculator},
      { to: '/reminders', label: 'תזכורות',            icon: Bell      },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside
      className="w-64 min-h-screen flex flex-col fixed top-0 right-0 z-30"
      style={{
        background: 'linear-gradient(180deg, #0d1117 0%, #0f1623 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            boxShadow: '0 0 16px rgba(59,130,246,0.35)',
          }}
        >
          <Star size={16} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-lg leading-none tracking-tight">פינסטאר</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>ניהול פיננסי אישי</div>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {group.label && (
              <div
                className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'rgba(148,163,184,0.4)' }}
              >
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    )
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background: 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.06) 100%)',
                          boxShadow: 'inset 0 0 0 1px rgba(59,130,246,0.2)',
                        }
                      : {}
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className="shrink-0 transition-colors duration-150"
                        style={{ color: isActive ? '#60a5fa' : undefined }}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="truncate">{label}</span>
                      {isActive && (
                        <span
                          className="mr-auto w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: '#60a5fa', boxShadow: '0 0 6px rgba(96,165,250,0.8)' }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Settings + version ──────────────────────────────────────── */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              isActive
                ? 'text-white'
                : 'text-slate-400 hover:text-slate-200'
            )
          }
          style={({ isActive }) =>
            isActive
              ? {
                  background: 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.06) 100%)',
                  boxShadow: 'inset 0 0 0 1px rgba(59,130,246,0.2)',
                }
              : {}
          }
        >
          {({ isActive }) => (
            <>
              <span style={{ color: isActive ? '#60a5fa' : undefined }}>
                <Settings size={15} />
              </span>
              <span>הגדרות</span>
            </>
          )}
        </NavLink>
        <div className="text-[10px] px-3 pt-2" style={{ color: 'rgba(148,163,184,0.3)' }}>
          גרסה 1.0 • נתונים מקומיים
        </div>
      </div>
    </aside>
  );
}
