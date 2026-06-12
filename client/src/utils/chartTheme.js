/**
 * chartTheme.js — Single source of truth for all Recharts palette values.
 * Import from here; never inline colour hex in chart components.
 */

export const categorical = [
  '#213467', // Deep navy — brand primary
  '#51A2FF', // Bright blue — secondary accent
  '#406EB5', // Mid navy
  '#2E7BD6', // Active blue
  '#80C4FF', // Light blue
];

export const lineStroke   = '#213467';
export const lineDot      = '#51A2FF';
export const barFill      = '#213467';

// Grid and axis helpers — consumed at render time with isDark flag
export const gridStrokeLight = '#D2D6DC';
export const gridStrokeDark  = '#2D3B4F';
export const axisTickLight   = '#5F6368';
export const axisTickDark    = '#94A3B8';

export const gridStroke  = (isDark) => isDark ? gridStrokeDark  : gridStrokeLight;
export const axisTickFill = (isDark) => isDark ? axisTickDark   : axisTickLight;

/**
 * tooltipStyle(isDark) — returns a contentStyle object for Recharts <Tooltip>.
 * Matches the ZT navy/blue palette; JetBrains Mono for numbers.
 */
export function tooltipStyle(isDark) {
  return isDark
    ? {
        backgroundColor: '#1B2A3D',
        border: '1px solid #2D3B4F',
        borderRadius: 10,
        color: '#E8EDF3',
        fontSize: 12,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      }
    : {
        backgroundColor: '#FFFFFF',
        border: '1px solid #D2D6DC',
        borderRadius: 10,
        color: '#0D1B2A',
        fontSize: 12,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      };
}

// Inventory Health — semantic cell fills
export const healthyFill  = '#2E7D32'; // Success green — healthy
export const lowFill      = '#F57C00'; // Warning orange — low stock
export const outFill      = 'rgba(13,27,42,0.35)'; // Deep navy @ 35% — out of stock
