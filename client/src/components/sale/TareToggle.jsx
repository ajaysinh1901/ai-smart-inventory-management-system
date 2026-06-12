/**
 * TareToggle.jsx
 * Tare on/off button. Shows current tare weight when active.
 * Props:
 *   active: boolean
 *   onChange(active: boolean)
 *   tareWeight: number  (in the product's unit, e.g. 0.020 for 20g tare on a kg product)
 *   unit: string
 */
import React from 'react';
import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatQty } from '../../lib/weight';

export default function TareToggle({ active, onChange, tareWeight = 0, unit = 'kg' }) {
  const { t } = useTranslation();
  const tare = parseFloat(String(tareWeight));
  if (!tare || tare <= 0) return null;

  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-semibold transition-all select-none ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-paper-rule bg-paper-card text-ink/60 hover:border-primary/50 hover:text-primary/70'
      }`}
    >
      <Scale size={12} />
      {active
        ? t('quickSale.tareActive', { tare: formatQty(tare, unit) })
        : t('quickSale.tareOff', { tare: formatQty(tare, unit) })
      }
    </button>
  );
}
