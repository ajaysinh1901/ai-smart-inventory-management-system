/**
 * PaymentModePicker.jsx
 * Big payment mode buttons: Cash / UPI / Card / Credit (Khata).
 * Credit mode shows a customer-required validation.
 * Props:
 *   value: 'cash' | 'upi' | 'card' | 'credit'
 *   onChange(mode)
 *   customer: { name, phone } | null  — needed for credit validation
 *   mode: 'phone' | 'counter'
 */
import React from 'react';
import { Banknote, Smartphone, CreditCard, BookOpen, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MODES = [
  { key: 'cash',   icon: Banknote,    labelKey: 'quickSale.payment.cash',   primary: true },
  { key: 'upi',    icon: Smartphone,  labelKey: 'quickSale.payment.upi',    primary: true },
  { key: 'card',   icon: CreditCard,  labelKey: 'quickSale.payment.card',   primary: false },
  { key: 'credit', icon: BookOpen,    labelKey: 'quickSale.payment.credit', primary: false },
];

export default function PaymentModePicker({ value, onChange, customer, mode = 'phone' }) {
  const { t } = useTranslation();
  const isPhone = mode === 'phone';

  const needsCustomerForCredit = value === 'credit' && (!customer?.name || customer.name === t('quickSale.walkIn'));

  return (
    <div>
      <div className={`grid gap-2 ${isPhone ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {MODES.map(({ key, icon: Icon, labelKey, primary }) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border transition-all select-none ${
                isPhone ? 'py-3 px-2' : 'py-2 px-2'
              } ${
                selected
                  ? key === 'credit'
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-primary bg-primary/10 text-primary'
                  : 'border-paper-rule bg-paper-card text-ink/60 hover:border-primary/40 hover:text-ink/80'
              }`}
            >
              <Icon size={isPhone && primary ? 22 : 18} />
              <span className={`font-semibold ${isPhone && primary ? 'text-sm' : 'text-xs'}`}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </div>
      {/* Credit requires a named customer */}
      {needsCustomerForCredit && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{t('quickSale.creditNeedsCustomer')}</span>
        </div>
      )}
    </div>
  );
}
