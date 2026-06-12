/**
 * Step 2 — GST & Business
 *
 * Captures: GSTIN (validated), legal name, address, FY start.
 * Skip allowed → workspace.gstRegistered = false → invoices issue as Bill of Supply.
 * Big profile: shows e-invoice toggle if turnover > ₹5cr.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info } from 'lucide-react';
import { Input } from '../../ui';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGstin(value) {
  if (!value) return null;
  return GSTIN_REGEX.test(value.toUpperCase()) ? null : 'Enter a valid 15-character GSTIN (e.g. 27AAPFU0939F1ZV)';
}

export default function Step2GST({ data, onChange, errors, storeProfile }) {
  const { t } = useTranslation();

  const handleGstinChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    onChange({ gstin: val });
  };

  return (
    <div className="space-y-5">
      {/* GSTIN */}
      <div className="space-y-1.5">
        <Input
          label={t('onboarding.step2.gstin')}
          value={data.gstin || ''}
          onChange={handleGstinChange}
          error={errors?.gstin}
          placeholder="27AAPFU0939F1ZV"
          className="font-mono tracking-widest uppercase"
          helperText={t('onboarding.step2.gstinHelper')}
          maxLength={15}
        />
        {data.gstin && !errors?.gstin && data.gstin.length === 15 && (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
            <span>&#10003;</span> {t('onboarding.step2.gstinValid')}
          </p>
        )}
      </div>

      {/* Legal name */}
      <Input
        label={t('onboarding.step2.legalName')}
        value={data.legalName || ''}
        onChange={e => onChange({ legalName: e.target.value })}
        placeholder={t('onboarding.step2.legalNamePlaceholder')}
        helperText={t('onboarding.step2.legalNameHelper')}
      />

      {/* Address */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block">
          {t('onboarding.step2.address')}
        </label>
        <textarea
          value={data.address || ''}
          onChange={e => onChange({ address: e.target.value })}
          placeholder={t('onboarding.step2.addressPlaceholder')}
          rows={3}
          className="w-full px-3.5 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 outline-none transition-all bg-paper-card dark:bg-ink-card focus:ring-4 focus:ring-primary/20 focus:border-primary resize-none"
        />
      </div>

      {/* FY start — same for both profiles in step 2 (small didn't set it in step 1) */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block">
          {t('onboarding.step2.fyStart')}
        </label>
        <div className="flex gap-2">
          {[
            { label: t('onboarding.step2.fyApr'), value: '04-01' },
            { label: t('onboarding.step2.fyJan'), value: '01-01' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ fyStart: opt.value })}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                (data.fyStart || '04-01') === opt.value
                  ? 'border-primary dark:border-primary-soft bg-primary/8 dark:bg-primary-soft/15 text-primary dark:text-primary-soft'
                  : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 hover:border-primary/40 dark:hover:border-primary-soft/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink/50 dark:text-paper/50">{t('onboarding.step2.fyHelper')}</p>
      </div>

      {/* E-invoice toggle — big profile only, per C.4 */}
      {storeProfile === 'big' && (
        <div className="rounded-xl border border-paper-rule dark:border-ink-rule bg-paper dark:bg-ink p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info size={15} className="text-primary dark:text-primary-soft mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink dark:text-paper">
                {t('onboarding.step2.eInvoiceTitle')}
              </p>
              <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">
                {t('onboarding.step2.eInvoiceDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={!!data.eInvoiceEnabled}
              onClick={() => onChange({ eInvoiceEnabled: !data.eInvoiceEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                data.eInvoiceEnabled ? 'bg-primary dark:bg-primary-soft' : 'bg-paper-rule dark:bg-ink-rule'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                data.eInvoiceEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-sm text-ink/70 dark:text-paper/70">
              {data.eInvoiceEnabled ? t('onboarding.step2.eInvoiceOn') : t('onboarding.step2.eInvoiceOff')}
            </span>
          </div>
          {data.eInvoiceEnabled && (
            <Input
              label={t('onboarding.step2.annualTurnover')}
              value={data.annualTurnover || ''}
              onChange={e => onChange({ annualTurnover: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="50000000"
              helperText={t('onboarding.step2.turnoverHelper')}
              className="font-mono"
            />
          )}
        </div>
      )}

      {/* Warning — bill of supply notice when no GSTIN */}
      {!data.gstin && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t('onboarding.step2.billOfSupplyNotice')}
          </p>
        </div>
      )}
    </div>
  );
}
