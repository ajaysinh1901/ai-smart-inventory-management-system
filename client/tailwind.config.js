/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ─── Brand — ZT Navy (preserved for product recognition) ──────────────
        primary:       '#213467',   // Deep navy — brand primary (buttons, links)
        'primary-soft':'#406EB5',   // Lighter navy — hover, dark active
        'primary-deep':'#0D2240',   // Pressed / active dark

        // ─── Accent — Bright Blue (kept) ─────────────────────────────────────
        brass:         '#51A2FF',
        'brass-soft':  '#80C4FF',
        'brass-deep':  '#2E7BD6',

        // ─── Editorial accent (Carta coral) — sparing use for AI insights ────
        coral:         '#FF7D55',
        'coral-soft':  '#FFA48A',
        'coral-deep':  '#E55A30',

        // ─── Neutrals — Carta-grade monochrome (light theme) ─────────────────
        paper:         '#FFFFFF',   // Page background — pure white
        'paper-card':  '#FFFFFF',   // Card surface
        'paper-soft':  '#F1F1F1',   // Soft gray card panel (Carta's #F1F1F1)
        'paper-mute':  '#DEDFDF',   // Muted panel
        'paper-rule':  '#E5E5E5',   // Hairline rule (lighter than before)

        // ─── Neutrals — dark theme ───────────────────────────────────────────
        ink:           '#1A1A1A',   // Near-black page bg (Carta's body color)
        'ink-card':    '#212121',   // Card surface dark
        'ink-soft':    '#2A2A2A',   // Hover surface dark
        'ink-rule':    '#333333',   // Rule lines dark
        'ink-mute':    '#394040',   // Carta's dark-green-gray section bg

        // ─── Legacy aliases (kept for cascade safety) ────────────────────────
        'background-light': '#FFFFFF',
        'surface-light':    '#FFFFFF',
      },
      fontFamily: {
        // Editorial serif — hero / display headings (Carta's SangBleuVersailles vibe)
        display: ['Fraunces', 'Cormorant Garamond', 'Georgia', 'serif'],
        serif:   ['Fraunces', 'Cormorant Garamond', 'Georgia', 'serif'],
        // UI sans — everything else
        body:    ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        sans:    ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Monospace — invoice numbers, GSTIN, tabular figures
        mono:    ['"IBM Plex Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Editorial display scale (Carta-style tight tracking)
        'display-2xl': ['72px', { lineHeight: '1.2',  letterSpacing: '-0.03em', fontWeight: '400' }],
        'display-xl':  ['56px', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '400' }],
        'display-lg':  ['44px', { lineHeight: '1.2',  letterSpacing: '-0.025em', fontWeight: '400' }],
        'display-md':  ['36px', { lineHeight: '1.2',  letterSpacing: '-0.02em', fontWeight: '400' }],
        'display-sm':  ['28px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '400' }],
      },
      letterSpacing: {
        'editorial': '-0.03em', // Carta's -2.16px @ 72px = -3%
        'tightish':  '-0.02em',
      },
      borderRadius: {
        // Carta uses 8px on buttons, sharp 0px on most surfaces
        'btn':  '8px',
      },
      transitionTimingFunction: {
        // Carta's CTA easing — fast out, gentle settle
        'carta':   'cubic-bezier(0, 0, 0.2, 1)',
        'carta-in':'cubic-bezier(0.4, 0, 1, 1)',
      },
      keyframes: {
        fadeIn:     { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:    { '0%': { transform: 'translateY(16px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        shimmer:    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        modalFade:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        modalSlide: {
          '0%':   { transform: 'translateY(24px) scale(0.97)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        pulseSoft:  { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        scaleIn:    { '0%': { transform: 'scale(0.94)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        // Carta-style restrained reveals
        editorialFade: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        underlineGrow: { '0%': { width: '0%' }, '100%': { width: '100%' } },
      },
      animation: {
        fadeIn:        'fadeIn 220ms ease-out',
        slideUp:       'slideUp 260ms ease-out',
        shimmer:       'shimmer 1.8s infinite linear',
        modalFade:     'modalFade 180ms ease-out',
        modalSlide:    'modalSlide 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        pulseSoft:     'pulseSoft 2.4s ease-in-out infinite',
        scaleIn:       'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        editorialFade: 'editorialFade 480ms cubic-bezier(0, 0, 0.2, 1)',
        underlineGrow: 'underlineGrow 360ms cubic-bezier(0, 0, 0.2, 1) forwards',
      },
      boxShadow: {
        // Carta's signature 2px inset border on buttons
        'btn':        'inset 0 0 0 2px #1A1A1A',
        'btn-light':  'inset 0 0 0 2px #FFFFFF',
        'btn-primary':'inset 0 0 0 2px #213467',
        // Quiet card shadows (Carta uses almost none)
        'card':       '0 1px 2px 0 rgba(26, 26, 26, 0.04)',
        'card-hover': '0 6px 20px -6px rgba(26, 26, 26, 0.08), 0 2px 4px -2px rgba(26, 26, 26, 0.04)',
        'pop':        '0 16px 40px -8px rgba(26, 26, 26, 0.18), 0 4px 12px -4px rgba(26, 26, 26, 0.08)',
        'inner-sm':   'inset 0 1px 2px 0 rgba(26, 26, 26, 0.05)',
        'ledger':     '0 1px 0 #E5E5E5',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
};
