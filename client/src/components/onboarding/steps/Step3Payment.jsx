/**
 * Step 3 — Payment
 *
 * Captures: UPI ID (validated), bank account last 4 (optional).
 * Skip allowed → invoices print without QR code.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QrCode, AlertCircle } from 'lucide-react';
import { Input } from '../../ui';

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export function validateUpi(value) {
  if (!value) return null;
  return UPI_REGEX.test(value) ? null : 'Enter a valid UPI ID (e.g. yourstore@upi or yourstore@okaxis)';
}

export default function Step3Payment({ data, onChange, errors }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      {/* UPI illustration */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 dark:bg-primary-soft/10 border border-primary/15 dark:border-primary-soft/20">
        <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary-soft/15 flex items-center justify-center flex-shrink-0">
          <QrCode size={20} className="text-primary dark:text-primary-soft" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink dark:text-paper">
            {t('onboarding.step3.qrTitle')}
          </p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">
            {t('onboarding.step3.qrDesc')}
          </p>
        </div>
      </div>

      {/* UPI ID */}
      <Input
        label={t('onboarding.step3.upiId')}
        value={data.upiId || ''}
        onChange={e => onChange({ upiId: e.target.value.trim() })}
        error={errors?.upiId}
        placeholder="yourstore@upi"
        className="font-mono"
        helperText={t('onboarding.step3.upiHelper')}
        autoFocus
      />

      {/* UPI validated indicator */}
      {data.upiId && !errors?.upiId && UPI_REGEX.test(data.upiId) && (
        <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
          <span>&#10003;</span> {t('onboarding.step3.upiValid')}
        </p>
      )}

      {/* Bank account last 4 (optional) */}
      <Input
        label={t('onboarding.step3.bankLast4')}
        value={data.bankLast4 || ''}
        onChange={e => onChange({ bankLast4: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
        placeholder="4242"
        helperText={t('onboarding.step3.bankHelper')}
        className="font-mono tracking-widest"
        maxLength={4}
      />

      {/* Skip notice */}
      {!data.upiId && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700/40">
          <AlertCircle size={14} className="text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {t('onboarding.step3.skipNotice')}
          </p>
        </div>
      )}
    </div>
  );
}
