import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, Bell, Menu, User as UserIcon, LogOut, X,
  Package, Truck, ShoppingCart, Loader2, ChevronDown, Moon, Sun,
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchProducts } from '../services/productService';
import { fetchSuppliers } from '../services/supplierService';
import { fetchSales } from '../services/salesService';
import LanguageSwitcher from './LanguageSwitcher';
import { useOnboarding } from '../contexts/OnboardingContext';

/**
 * TopNav — Carta editorial top bar.
 *
 * • Sticky, paper-card surface with a hairline rule.
 * • Search input is a flat, monochrome field with a black focus border.
 * • Avatar pill is mono-tone with a sharp 1px ring.
 * • All hover/focus/transitions use the carta easing.
 */

const SEARCH_DEBOUNCE_MS = 250;

export default function TopNav({ onOpenMobileMenu }) {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  const { showResumePill, currentStep: onboardingStep, openWizard } = useOnboarding();

  const [q, setQ] = useState('');
  const [results, setResults] = useState({ products: [], suppliers: [], sales: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const debounceRef = useRef(null);

  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const bellRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMobileSearchOpen(true);
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setBellOpen(false);
        setUserOpen(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults({ products: [], suppliers: [], sales: [] });
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [pRes, sRes, slRes] = await Promise.all([
          fetchProducts({ q, limit: 5 }).catch(() => ({ data: { data: [] } })),
          fetchSuppliers({ q }).catch(() => ({ data: { data: [] } })),
          fetchSales({ q, limit: 5 }).catch(() => ({ data: { data: [] } })),
        ]);
        setResults({
          products: (pRes.data.data || []).slice(0, 5),
          suppliers: (sRes.data.data || []).slice(0, 5),
          sales: (slRes.data.data || []).slice(0, 5),
        });
      } catch {
        setResults({ products: [], suppliers: [], sales: [] });
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const goTo = (path) => {
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setQ('');
    navigate(path);
  };

  const totalResults = results.products.length + results.suppliers.length + results.sales.length;
  const userInitial = (user?.name || user?.email || 'U')[0].toUpperCase();

  return (
    <header className="sticky top-0 h-16 backdrop-blur-md bg-paper-card/90 dark:bg-ink-card/90 border-b border-paper-rule dark:border-ink-rule flex items-center justify-between gap-3 px-4 md:px-6 z-40">
      {/* Mobile hamburger */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onOpenMobileMenu}
          className="w-10 h-10 flex items-center justify-center text-ink/60 dark:text-paper/60 hover:bg-paper-soft dark:hover:bg-ink-soft hover:text-ink dark:hover:text-paper transition-colors duration-200 ease-carta"
          aria-label={t('nav.openMenu')}
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Desktop search */}
      <div ref={searchContainerRef} className="relative flex-1 max-w-md hidden md:block">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none" />
        <input
          ref={searchInputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder={t('nav.searchPlaceholder')}
          className="w-full h-10 pl-10 pr-16 text-sm font-medium outline-none transition-all duration-200 ease-carta bg-paper-soft dark:bg-ink-soft border border-paper-rule dark:border-ink-rule text-ink dark:text-paper placeholder:text-ink/40 dark:placeholder:text-paper/40 rounded-btn focus:border-ink dark:focus:border-paper focus:shadow-[inset_0_0_0_1px_#1A1A1A] dark:focus:shadow-[inset_0_0_0_1px_#F1F1F1] focus:bg-paper-card dark:focus:bg-ink-card"
          type="text"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex font-mono text-[10px] font-semibold text-ink/50 dark:text-paper/50 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-md px-1.5 py-0.5 leading-none">⌘K</kbd>

        {searchOpen && q.trim() && (
          <SearchResults
            results={results}
            searching={searching}
            totalResults={totalResults}
            onPick={goTo}
            t={t}
          />
        )}
      </div>

      {/* Mobile search trigger */}
      <button
        onClick={() => { setMobileSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
        className="md:hidden ml-auto w-10 h-10 flex items-center justify-center text-ink/60 dark:text-paper/60 hover:bg-paper-soft dark:hover:bg-ink-soft hover:text-ink dark:hover:text-paper transition-colors duration-200 ease-carta"
        aria-label={t('common.search')}
      >
        <Search size={18} />
      </button>

      {/* Onboarding resume pill */}
      {showResumePill && (
        <button
          type="button"
          onClick={openWizard}
          className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] bg-paper-soft dark:bg-ink-soft text-ink dark:text-paper border-l-2 border-ink dark:border-paper hover:bg-ink hover:text-paper dark:hover:bg-paper dark:hover:text-ink transition-colors duration-200 ease-carta flex-shrink-0 max-w-[10rem] overflow-hidden"
          title={t('onboarding.resumeBtn')}
        >
          <span className="flex-shrink-0">⚙</span>
          <span className="hidden md:inline truncate">{t('onboarding.resumeBtn')}</span>
          <span className="inline md:hidden tabular-nums">{onboardingStep - 1}/7</span>
        </button>
      )}

      {/* Right side */}
      <div className="flex items-center gap-1 md:gap-1.5">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? t('common.themeLight') : t('common.themeDark')}
          className="w-10 h-10 flex items-center justify-center text-ink/60 dark:text-paper/60 hover:text-ink dark:hover:text-paper hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <LanguageSwitcher />

        {/* Notifications */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => { setBellOpen(o => !o); setUserOpen(false); }}
            className="relative w-10 h-10 flex items-center justify-center text-ink/60 dark:text-paper/60 hover:text-ink dark:hover:text-paper hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta"
            aria-label={t('nav.notifications')}
          >
            <Bell size={17} />
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-12 w-80 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-btn shadow-pop py-1 animate-fade-in">
              <div className="px-4 py-3 border-b border-paper-rule dark:border-ink-rule">
                <p className="font-display text-base text-ink dark:text-paper tracking-tightish">
                  {t('nav.notifications')}
                </p>
              </div>
              <div className="px-4 py-10 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40 dark:text-paper/40">
                  {t('nav.noNotifications')}
                </p>
                <p className="text-xs mt-2 text-ink/50 dark:text-paper/50">{t('nav.alertsAppearHere')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-paper-rule dark:bg-ink-rule hidden sm:block mx-1" />

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => { setUserOpen(o => !o); setBellOpen(false); }}
            className="flex items-center gap-2.5 cursor-pointer p-1.5 hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta"
            aria-label={t('nav.userMenu')}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-display font-semibold text-sm flex-shrink-0 bg-ink text-paper dark:bg-paper dark:text-ink">
              {userInitial}
            </div>
            <div className="text-left hidden sm:block min-w-0">
              <p className="text-[13px] font-semibold text-ink dark:text-paper leading-none truncate max-w-[100px]">
                {user?.name || t('nav.account')}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/50 dark:text-paper/50 mt-1">
                {user?.role || t('nav.user')}
              </p>
            </div>
            <ChevronDown size={14} className="text-ink/40 dark:text-paper/40 hidden sm:block" />
          </button>
          {userOpen && (
            <div className="absolute right-0 top-14 w-64 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-btn shadow-pop py-1 animate-fade-in">
              <div className="px-4 py-3 border-b border-paper-rule dark:border-ink-rule">
                <p className="text-[13px] font-semibold truncate text-ink dark:text-paper">{user?.name || t('nav.account')}</p>
                <p className="font-mono text-[11px] truncate mt-0.5 text-ink/50 dark:text-paper/50">{user?.email || ''}</p>
              </div>
              <button
                onClick={() => { setUserOpen(false); navigate('/settings'); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink/70 dark:text-paper/70 hover:bg-paper-soft dark:hover:bg-ink-soft hover:text-ink dark:hover:text-paper transition-colors duration-200 ease-carta"
              >
                <UserIcon size={15} /> {t('nav.profileSettings')}
              </button>
              <div className="border-t border-paper-rule dark:border-ink-rule my-1" />
              <button
                onClick={() => { setUserOpen(false); logout?.(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink dark:text-paper hover:bg-ink hover:text-paper dark:hover:bg-paper dark:hover:text-ink transition-colors duration-200 ease-carta"
              >
                <LogOut size={15} /> {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile full-screen search overlay */}
      {mobileSearchOpen && (
        <div className="md:hidden fixed inset-0 z-50 animate-fade-in flex flex-col bg-paper dark:bg-ink">
          <div className="flex items-center gap-3 p-3 border-b border-paper-rule dark:border-ink-rule">
            <button
              onClick={() => { setMobileSearchOpen(false); setQ(''); }}
              className="w-10 h-10 flex items-center justify-center text-ink/60 dark:text-paper/60 hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('nav.searchPlaceholder')}
                className="w-full h-11 pl-10 pr-4 text-sm font-medium outline-none transition-all duration-200 ease-carta bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-btn text-ink dark:text-paper focus:border-ink dark:focus:border-paper"
                type="text"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {q.trim() ? (
              <SearchResults
                results={results}
                searching={searching}
                totalResults={totalResults}
                onPick={goTo}
                inline
                t={t}
              />
            ) : (
              <div className="p-12 text-center text-ink/40 dark:text-paper/40 text-sm font-mono uppercase tracking-[0.18em]">
                {t('nav.startTyping')}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function SearchResults({ results, searching, totalResults, onPick, inline = false, t = (k) => k }) {
  const wrap = inline
    ? ''
    : 'absolute top-[calc(100%+8px)] left-0 right-0 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-btn shadow-pop max-h-[480px] overflow-y-auto z-50 scrollbar-thin';

  return (
    <div className={`${wrap} animate-fade-in`}>
      {searching && (
        <div className="flex items-center gap-2 px-4 py-3 font-mono text-[11px] text-ink/50 dark:text-paper/50">
          <Loader2 size={12} className="animate-spin" /> {t('nav.searching')}
        </div>
      )}
      {!searching && totalResults === 0 && (
        <div className="px-4 py-12 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40 dark:text-paper/40">
          {t('nav.noMatches')}
        </div>
      )}
      {results.products.length > 0 && (
        <Group title={t('nav.products')} icon={<Package size={10} />}>
          {results.products.map(p => (
            <button key={p._id} onClick={() => onPick('/inventory')}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta text-ink dark:text-paper"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{p.name}</p>
                <p className="font-mono text-[10px] truncate mt-0.5 text-ink/50 dark:text-paper/50">{p.sku} · Stock {p.stock}</p>
              </div>
            </button>
          ))}
        </Group>
      )}
      {results.suppliers.length > 0 && (
        <Group title={t('nav.suppliers')} icon={<Truck size={10} />}>
          {results.suppliers.map(s => (
            <button key={s._id} onClick={() => onPick('/suppliers')}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta text-ink dark:text-paper"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{s.name}</p>
                <p className="font-mono text-[10px] truncate mt-0.5 text-ink/50 dark:text-paper/50">{s.email || s.phone || '—'}</p>
              </div>
            </button>
          ))}
        </Group>
      )}
      {results.sales.length > 0 && (
        <Group title={t('nav.invoices')} icon={<ShoppingCart size={10} />}>
          {results.sales.map(s => (
            <button key={s._id} onClick={() => onPick('/sales')}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-paper-soft dark:hover:bg-ink-soft transition-colors duration-200 ease-carta text-ink dark:text-paper"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{s.invoiceNumber}</p>
                <p className="font-mono text-[10px] truncate mt-0.5 text-ink/50 dark:text-paper/50">{s.customer?.name || 'Walk-in'}</p>
              </div>
            </button>
          ))}
        </Group>
      )}
    </div>
  );
}

const Group = ({ title, icon, children }) => (
  <div className="border-b border-paper-rule dark:border-ink-rule last-of-type:border-b-0">
    <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 dark:text-paper/50">
      {icon} {title}
    </div>
    {children}
  </div>
);
