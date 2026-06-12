import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Check } from 'lucide-react';
import { SUPPORTED_LANGS } from '../i18n';
import { useTheme } from '../context/ThemeContext';

// Compact globe-button + popover. Drops into the TopNav next to the bell.
// Active language shows the native script ("हिन्दी"), not the English label,
// so the user always sees what they'll get if they pick it.
export default function LanguageSwitcher({ compact = true }) {
  const { i18n, t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = SUPPORTED_LANGS.find((l) => l.code === i18n.language) || SUPPORTED_LANGS[0];

  const change = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper hover:bg-paper dark:hover:bg-ink transition-colors"
        aria-label={t('common.language')}
        title={t('common.language')}
      >
        <Languages size={17} />
        {!compact && (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em]">
            {current.code}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 w-44 rounded-xl border shadow-pop py-1.5 animate-fade-in z-50"
          style={{
            backgroundColor: isDark ? '#1B2A3D' : '#FFFFFF',
            borderColor: isDark ? '#2D3B4F' : '#D2D6DC',
          }}
        >
          <div
            className="px-4 py-2 border-b font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{
              color: '#94A3B8',
              borderColor: isDark ? '#2D3B4F' : '#D2D6DC',
            }}
          >
            {t('common.language')}
          </div>
          {SUPPORTED_LANGS.map((lang) => {
            const active = lang.code === current.code;
            return (
              <button
                key={lang.code}
                onClick={() => change(lang.code)}
                className="w-full flex items-center justify-between gap-2.5 px-4 py-2 text-sm font-medium transition-colors text-left"
                style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(33,52,103,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
              >
                <span className="flex flex-col leading-tight">
                  <span className="text-[13px]">{lang.native}</span>
                  <span className="font-mono text-[10px] mt-0.5" style={{ color: '#5F6368' }}>
                    {lang.label}
                  </span>
                </span>
                {active && <Check size={14} style={{ color: '#213467' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
