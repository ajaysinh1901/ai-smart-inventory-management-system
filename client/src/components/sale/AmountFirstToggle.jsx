/**
 * AmountFirstToggle.jsx
 * Toggle between "qty first" and "amount first ₹" entry modes.
 * Props:
 *   active: boolean
 *   onChange(active: boolean)
 *   disabled: boolean
 *   disabledReason: string — tooltip text when disabled
 */
import React from 'react';
import { IndianRupee } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AmountFirstToggle({ active, onChange, disabled = false, disabledReason = '' }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!active)}
      disabled={disabled}
      title={disabled ? disabledReason : t('quickSale.amountFirstHint')}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-semibold transition-all select-none ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-paper-rule text-ink/40'
          : active
          ? 'border-brass bg-brass/10 text-brass-deep'
          : 'border-paper-rule bg-paper-card text-ink/60 hover:border-brass/50 hover:text-brass'
      }`}
    >
      <IndianRupee size={12} />
      {t('quickSale.amountFirst')}
    </button>
  );
}
