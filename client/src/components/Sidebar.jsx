import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Package, BarChart3, Activity,
  Truck, Receipt, ShoppingCart, ScanLine, Settings,
  LogOut, ChevronsLeft, ChevronsRight, X,
} from 'lucide-react';

/**
 * Sidebar — Carta editorial nav.
 *
 * • Surfaces are monochrome (paper-card / ink-card) with a hairline rule.
 * • Active row gets the soft-canvas fill + a 2px ink left bar (Carta accent).
 * • Brand wordmark is Fraunces serif; section labels are IBM Plex Mono uppercase.
 * • All transitions use the carta easing curve.
 */
const NAV_ITEMS = [
  { to: '/', end: true, icon: LayoutDashboard, key: 'dashboard' },
  { to: '/inventory', icon: Package, key: 'inventory' },
  { to: '/analytics', icon: BarChart3, key: 'analytics' },
  { to: '/ai-insights', icon: Activity, key: 'insights' },
  { to: '/suppliers', icon: Truck, key: 'suppliers', roles: ['admin', 'manager'] },
  { to: '/transactions', icon: Receipt, key: 'transactions' },
  { to: '/sale', icon: ShoppingCart, key: 'quickSale' },
  { to: '/sales', icon: ShoppingCart, key: 'sales' },
  { to: '/scanner', icon: ScanLine, key: 'scanner' },
  { to: '/settings', icon: Settings, key: 'settings' },
];

export default function Sidebar({ collapsed = false, onToggleCollapse, mobileOpen = false, onMobileClose }) {
  const { user, logout } = useContext(AuthContext);
  const { t: i18n } = useTranslation();

  const handleNavClick = () => {
    if (mobileOpen) onMobileClose?.();
  };

  const widthClass = collapsed ? 'w-[60px]' : 'w-60';

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role))
  );

  const body = (
    <>
      {/* Brand wordmark */}
      <div className={`px-4 py-5 flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} border-b border-paper-rule dark:border-ink-rule`}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[20px] font-normal tracking-tight leading-none text-ink dark:text-paper">
              SmartStock
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] mt-1 leading-none text-ink/50 dark:text-paper/50">
              STOCK LEDGER
            </p>
          </div>
        )}

        {collapsed && (
          <span
            className="font-display font-normal text-[22px] leading-none select-none text-ink dark:text-paper"
            title="SmartStock"
          >
            S
          </span>
        )}

        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="ml-auto md:hidden w-7 h-7 flex items-center justify-center rounded-btn text-ink/60 dark:text-paper/60 hover:text-ink dark:hover:text-paper hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta"
            aria-label={i18n('nav.closeMenu')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {!collapsed && (
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] px-3 pb-2 pt-1 text-ink/40 dark:text-paper/40">
            {i18n('nav.menu')}
          </p>
        )}
        {visibleNavItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={handleNavClick}
              title={collapsed ? i18n(`nav.${item.key}`) : undefined}
              className={`relative flex items-center gap-3 px-3 py-2 transition-all duration-200 ease-carta ${collapsed ? 'justify-center' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-0 ${isActive ? 'bg-paper-soft dark:bg-ink-soft' : 'hover:bg-paper-soft/60 dark:hover:bg-ink-soft/60'}`}
                  />
                  {isActive && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-ink dark:bg-paper"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    size={15}
                    strokeWidth={isActive ? 2 : 1.6}
                    className={`flex-shrink-0 relative z-10 transition-colors duration-200 ease-carta ${
                      isActive ? 'text-ink dark:text-paper' : 'text-ink/55 dark:text-paper/55'
                    }`}
                  />
                  {!collapsed && (
                    <span
                      className={`text-[13px] whitespace-nowrap relative z-10 transition-colors duration-200 ease-carta ${
                        isActive
                          ? 'text-ink dark:text-paper font-semibold'
                          : 'text-ink/65 dark:text-paper/65 font-medium'
                      }`}
                    >
                      {i18n(`nav.${item.key}`)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-paper-rule dark:border-ink-rule space-y-0.5">
        <button
          onClick={logout}
          title={collapsed ? i18n('nav.logout') : undefined}
          className={`w-full py-2 text-[13px] font-medium flex justify-center items-center gap-2.5 text-ink/65 dark:text-paper/65 hover:bg-paper-soft dark:hover:bg-ink-soft hover:text-ink dark:hover:text-paper transition-colors duration-200 ease-carta ${collapsed ? 'px-0' : 'px-3 justify-start'}`}
        >
          <LogOut size={14} className="flex-shrink-0" />
          {!collapsed && <span>{i18n('nav.logout')}</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          title={collapsed ? i18n('nav.expandSidebar') : i18n('nav.collapseSidebar')}
          className="hidden md:flex w-full py-2 items-center justify-center text-ink/40 dark:text-paper/40 hover:text-ink dark:hover:text-paper hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta"
          aria-label={collapsed ? i18n('nav.expandSidebar') : i18n('nav.collapseSidebar')}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={`hidden md:flex flex-shrink-0 flex-col z-30 transition-[width] duration-300 ease-carta ${widthClass} bg-paper-card dark:bg-ink-card border-r border-paper-rule dark:border-ink-rule`}
      >
        {body}
      </aside>

      {/* Mobile */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 backdrop-blur-sm bg-ink/40 z-40 animate-fade-in"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside
            className="md:hidden fixed top-0 left-0 bottom-0 w-60 flex flex-col z-50 shadow-pop animate-drawer-in bg-paper-card dark:bg-ink-card border-r border-paper-rule dark:border-ink-rule"
            role="dialog"
            aria-label="Navigation menu"
          >
            {body}
          </aside>
        </>
      )}
    </>
  );
}
