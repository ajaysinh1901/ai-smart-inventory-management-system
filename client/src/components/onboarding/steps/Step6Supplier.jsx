/**
 * Step 6 — First Supplier
 *
 * Single form: name (required), phone (Indian +91), GSTIN (optional).
 * "Skip — add later" per spec §C.2 (most kirana skip on day 1).
 * Mobile-first.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Truck, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { Input } from '../../ui';
import { createSupplier } from '../../../services/supplierService';
import { useToast } from '../../../context/ToastContext';

const PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function normalisePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return '+91' + digits.slice(2);
  if (digits.length === 10) return '+91' + digits;
  return raw;
}

export default function Step6Supplier({ onSkip, onSuccess }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [form, setForm] = useState({ name: '', phone: '', gstin: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const patch = (p) => setForm(f => ({ ...f, ...p }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) {
      errs.name = t('onboarding.step6.nameRequired');
    }
    if (form.phone.trim()) {
      const norm = normalisePhone(form.phone.trim());
      if (!PHONE_REGEX.test(norm.replace(/\s/g, ''))) {
        errs.phone = t('onboarding.step6.phoneInvalid');
      }
    }
    if (form.gstin.trim()) {
      if (!GSTIN_REGEX.test(form.gstin.trim().toUpperCase())) {
        errs.gstin = t('onboarding.step6.gstinInvalid');
      }
    }
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);

    const payload = { name: form.name.trim() };
    if (form.phone.trim()) payload.phone = normalisePhone(form.phone.trim());
    if (form.gstin.trim()) payload.gstin = form.gstin.trim().toUpperCase();

    try {
      await createSupplier(payload);
      setSaved(true);
      toast.success(t('onboarding.step6.saveSuccess', { name: form.name.trim() }));
      if (onSuccess) onSuccess({ name: form.name.trim() });
    } catch (e) {
      toast.error(e.response?.data?.message || t('onboarding.step6.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Success state ────────────────────────────────────────────────────────
  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/40 flex items-center justify-center">
          <CheckCircle size={26} className="text-green-600 dark:text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink dark:text-paper">{t('onboarding.step6.savedTitle')}</p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-1">{t('onboarding.step6.savedDesc', { name: form.name })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Illustration */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 dark:bg-primary-soft/10 border border-primary/15 dark:border-primary-soft/20">
        <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary-soft/15 flex items-center justify-center flex-shrink-0">
          <Truck size={20} className="text-primary dark:text-primary-soft" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink dark:text-paper">{t('onboarding.step6.illustrationTitle')}</p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">{t('onboarding.step6.illustrationDesc')}</p>
        </div>
      </div>

      {/* Name */}
      <Input
        label={t('onboarding.step6.name')}
        required
        placeholder={t('onboarding.step6.namePlaceholder')}
        value={form.name}
        onChange={e => patch({ name: e.target.value })}
        error={errors.name}
        autoFocus
      />

      {/* Phone */}
      <Input
        label={t('onboarding.step6.phone')}
        placeholder="+91 98765 43210"
        value={form.phone}
        onChange={e => patch({ phone: e.target.value })}
        error={errors.phone}
        type="tel"
        inputMode="tel"
        helperText={t('onboarding.step6.phoneHelper')}
      />

      {/* GSTIN (optional) */}
      <Input
        label={t('onboarding.step6.gstin')}
        placeholder="27AAPFU0939F1ZV"
        value={form.gstin}
        onChange={e => patch({ gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) })}
        error={errors.gstin}
        helperText={t('onboarding.step6.gstinHelper')}
        className="font-mono tracking-widest uppercase"
        maxLength={15}
      />

      {/* Skip notice */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700/40">
        <AlertCircle size={14} className="text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-slate-600 dark:text-slate-400">{t('onboarding.step6.skipExplain')}</p>
          <button
            type="button"
            onClick={onSkip}
            className="mt-1 text-xs text-primary dark:text-primary-soft underline hover:text-primary/80 dark:hover:text-primary-soft/80 transition-colors"
          >
            {t('onboarding.skip')}
          </button>
        </div>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-primary dark:bg-primary-soft text-white text-sm font-semibold hover:bg-primary/90 dark:hover:bg-primary-soft/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? (
          <><Loader2 size={15} className="animate-spin" /> {t('onboarding.step6.saving')}</>
        ) : t('onboarding.step6.save')}
      </button>
    </div>
  );
}
