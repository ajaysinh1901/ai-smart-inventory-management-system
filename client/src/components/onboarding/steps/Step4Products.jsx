/**
 * Step 4 — First Products
 *
 * Two paths per spec §C.4:
 *   small profile: prominent sample-pack picker (3 big cards)
 *   big profile:   "Import from Excel/Tally" primary CTA + sample pack secondary
 *
 * Manual fallback: inline 3-row mini-form (min 3 products to advance).
 * Cannot be skipped — must have ≥1 product.
 * Shows "Already used" banner when sampleSeedUsed is set.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Package, Pill, ShoppingBag, Upload, Plus, Trash2,
  CheckCircle, AlertTriangle, Loader2, RefreshCcw, ChevronDown,
} from 'lucide-react';
import { Input } from '../../ui';
import api from '../../../services/api';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { useToast } from '../../../context/ToastContext';

// ─── Unit options ─────────────────────────────────────────────────────────────
const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'dozen', 'box', 'packet'];

// ─── Sample pack definitions (driven by API response) ─────────────────────────
const PACK_ICONS = {
  kirana:   Package,
  pharmacy: Pill,
  general:  ShoppingBag,
};

// ─── Inline manual product row ────────────────────────────────────────────────
function ProductRow({ row, index, onChange, onRemove, showRemove }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <Input
          label={index === 0 ? t('onboarding.step4.manualName') : undefined}
          placeholder={t('onboarding.step4.manualNamePlaceholder')}
          value={row.name}
          onChange={e => onChange({ name: e.target.value })}
        />
      </div>
      <div className="w-28 flex-shrink-0">
        <Input
          label={index === 0 ? t('onboarding.step4.manualPrice') : undefined}
          placeholder="0.00"
          type="number"
          min="0"
          step="0.01"
          value={row.price}
          onChange={e => onChange({ price: e.target.value })}
        />
      </div>
      <div className="w-24 flex-shrink-0">
        {index === 0 && (
          <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block mb-1.5">
            {t('onboarding.step4.manualUnit')}
          </label>
        )}
        <div className="relative">
          <select
            value={row.unit}
            onChange={e => onChange({ unit: e.target.value })}
            className="w-full h-10 pl-3 pr-7 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary appearance-none"
          >
            {UNIT_OPTIONS.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none" />
        </div>
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-paper-rule dark:border-ink-rule text-ink/40 dark:text-paper/40 hover:border-red-200 dark:hover:border-red-800/50 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Step4Products({ onSuccess }) {
  const { t } = useTranslation();
  const { storeProfile } = useOnboarding();
  const { toast } = useToast();

  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [packsError, setPacksError] = useState('');
  const [seeding, setSeeding] = useState(null); // packId being seeded
  const [seeded, setSeeded] = useState(null);   // packId successfully seeded
  const [clearing, setClearing] = useState(false);

  // "Already used" state — pulled from onboarding context via API on mount
  const [sampleSeedUsed, setSampleSeedUsed] = useState(null);

  // Manual form mode
  const [showManual, setShowManual] = useState(false);
  const [manualRows, setManualRows] = useState([
    { name: '', price: '', unit: 'pcs' },
    { name: '', price: '', unit: 'pcs' },
    { name: '', price: '', unit: 'pcs' },
  ]);
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState('');

  // Load packs + check sampleSeedUsed
  useEffect(() => {
    let cancelled = false;
    setLoadingPacks(true);
    setPacksError('');

    Promise.all([
      api.get('/sample-packs'),
      api.get('/workspace/onboarding').catch(() => ({ data: null })),
    ])
      .then(([packsRes, onbRes]) => {
        if (cancelled) return;
        setPacks(packsRes.data?.data || packsRes.data || []);
        const onbData = onbRes?.data?.data;
        if (onbData?.sampleSeedUsed) setSampleSeedUsed(onbData.sampleSeedUsed);
      })
      .catch(e => {
        if (!cancelled) setPacksError(e.response?.data?.message || t('onboarding.step4.loadError'));
      })
      .finally(() => { if (!cancelled) setLoadingPacks(false); });

    return () => { cancelled = true; };
  }, [t]);

  const handleSeedPack = async (packId) => {
    setSeeding(packId);
    try {
      await api.post('/sample-packs/seed', { packId });
      setSeeded(packId);
      setSampleSeedUsed(packId);
      toast.success(t('onboarding.step4.seedSuccess'));
      if (onSuccess) onSuccess({ packId });
    } catch (e) {
      toast.error(e.response?.data?.message || t('onboarding.step4.seedError'));
    } finally {
      setSeeding(null);
    }
  };

  const handleClearSample = async () => {
    setClearing(true);
    try {
      await api.delete('/sample-packs');
      setSeeded(null);
      setSampleSeedUsed(null);
      toast.info(t('onboarding.step4.clearSuccess'));
    } catch (e) {
      toast.error(e.response?.data?.message || t('onboarding.step4.clearError'));
    } finally {
      setClearing(false);
    }
  };

  const patchRow = (idx, patch) => {
    setManualRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const addRow = () => {
    setManualRows(rows => [...rows, { name: '', price: '', unit: 'pcs' }]);
  };

  const removeRow = (idx) => {
    setManualRows(rows => rows.filter((_, i) => i !== idx));
  };

  const handleSaveManual = async () => {
    setManualError('');
    const valid = manualRows.filter(r => r.name.trim() && parseFloat(r.price) > 0);
    if (valid.length < 3) {
      setManualError(t('onboarding.step4.manualMin3'));
      return;
    }

    setSavingManual(true);
    try {
      // POST products one at a time per spec
      await Promise.all(valid.map(row =>
        api.post('/products', {
          name: row.name.trim(),
          pricePerUnit: String(parseFloat(row.price) || 0),
          unit: row.unit,
          saleByWeight: ['kg', 'g', 'l', 'ml'].includes(row.unit),
          stock: '0',
        })
      ));
      toast.success(t('onboarding.step4.manualSuccess', { count: valid.length }));
      if (onSuccess) onSuccess({ manual: valid.length });
    } catch (e) {
      setManualError(e.response?.data?.message || t('onboarding.step4.manualError'));
    } finally {
      setSavingManual(false);
    }
  };

  const isBig = storeProfile === 'big';

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Already used banner */}
      {sampleSeedUsed && !seeded && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
              {t('onboarding.step4.alreadyUsed', { pack: sampleSeedUsed })}
            </p>
            <button
              type="button"
              onClick={handleClearSample}
              disabled={clearing}
              className="mt-1 text-xs text-amber-700 dark:text-amber-400 underline hover:text-amber-900 dark:hover:text-amber-200 disabled:opacity-50 flex items-center gap-1"
            >
              {clearing ? (
                <><Loader2 size={11} className="animate-spin" /> {t('onboarding.step4.clearing')}</>
              ) : (
                <><RefreshCcw size={11} /> {t('onboarding.step4.clearAndRepick')}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Big profile: Import from Excel/Tally primary CTA */}
      {isBig && (
        <div className="p-4 rounded-xl border-2 border-dashed border-primary/30 dark:border-primary-soft/35 bg-primary/3 dark:bg-primary-soft/8 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 dark:bg-primary-soft/15 flex items-center justify-center flex-shrink-0">
            <Upload size={22} className="text-primary dark:text-primary-soft" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink dark:text-paper">
              {t('onboarding.step4.importExcel')}
            </p>
            <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">{t('onboarding.step4.importExcelDesc')}</p>
          </div>
          {/* TODO: Excel/Tally import is stub-only in v1. File upload UX is anti-scope §E. */}
          <button
            type="button"
            disabled
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-primary/10 dark:bg-primary-soft/15 text-primary/50 dark:text-primary-soft/60 text-sm font-semibold cursor-not-allowed border border-primary/20 dark:border-primary-soft/25"
          >
            {t('common.comingSoon')}
          </button>
        </div>
      )}

      {/* Sample pack section label */}
      <div>
        <p className={`text-xs font-semibold text-ink/50 dark:text-paper/50 uppercase tracking-wider mb-3 ${isBig ? '' : 'text-ink/70 dark:text-paper/70'}`}>
          {t('onboarding.step4.pickPack')}
        </p>

        {loadingPacks ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-slate-100 dark:bg-ink-rule rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : packsError ? (
          <div className="p-4 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-300">
            {packsError}
          </div>
        ) : (
          <div className={`grid gap-3 ${isBig ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {packs.map(pack => {
              const Icon = PACK_ICONS[pack.id] || Package;
              const isSeeded = seeded === pack.id;
              const isThisSeeding = seeding === pack.id;
              return (
                <div
                  key={pack.id}
                  className={`flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all ${
                    isSeeded
                      ? 'border-green-500 dark:border-green-500/60 bg-green-50 dark:bg-green-900/15'
                      : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card hover:border-primary/40 dark:hover:border-primary-soft/50 hover:bg-primary/3 dark:hover:bg-primary-soft/8'
                  } ${isBig ? 'p-3' : 'p-4'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSeeded ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary/8 dark:bg-primary-soft/15'
                    }`}>
                      {isSeeded
                        ? <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
                        : <Icon size={18} className="text-primary dark:text-primary-soft" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink dark:text-paper truncate">{pack.label}</p>
                      <p className="text-xs text-ink/50 dark:text-paper/50">{pack.sku_count} {t('onboarding.step4.skus')}</p>
                    </div>
                  </div>
                  <p className="text-xs text-ink/60 dark:text-paper/60 leading-relaxed flex-1">{pack.description}</p>
                  <button
                    type="button"
                    onClick={() => !isSeeded && handleSeedPack(pack.id)}
                    disabled={isThisSeeding || !!seeded || !!seeding}
                    className={`w-full py-2 px-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      isSeeded
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
                        : 'bg-primary dark:bg-primary-soft text-white hover:bg-primary/90 dark:hover:bg-primary-soft/90 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isThisSeeding ? (
                      <><Loader2 size={14} className="animate-spin" /> {t('onboarding.step4.seeding')}</>
                    ) : isSeeded ? (
                      <><CheckCircle size={14} /> {t('onboarding.step4.seededDone')}</>
                    ) : (
                      t('onboarding.step4.usePack')
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual entry fallback */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowManual(v => !v)}
          className="text-xs text-ink/50 dark:text-paper/50 hover:text-primary dark:hover:text-primary-soft underline transition-colors"
        >
          {t('onboarding.step4.typeYourOwn')}
        </button>

        {showManual && (
          <div className="mt-4 space-y-3 p-4 rounded-xl border border-paper-rule dark:border-ink-rule bg-slate-50 dark:bg-ink">
            <p className="text-xs font-semibold text-ink/60 dark:text-paper/60 uppercase tracking-wider mb-2">
              {t('onboarding.step4.manualTitle')}
            </p>
            <div className="space-y-2">
              {manualRows.map((row, idx) => (
                <ProductRow
                  key={idx}
                  row={row}
                  index={idx}
                  onChange={patch => patchRow(idx, patch)}
                  onRemove={() => removeRow(idx)}
                  showRemove={manualRows.length > 3}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-primary dark:text-primary-soft hover:text-primary/80 dark:hover:text-primary-soft/80 font-medium transition-colors mt-1"
            >
              <Plus size={13} /> {t('onboarding.step4.addRow')}
            </button>
            {manualError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{manualError}</p>
            )}
            <button
              type="button"
              onClick={handleSaveManual}
              disabled={savingManual}
              className="w-full py-2.5 rounded-xl bg-primary dark:bg-primary-soft text-white text-sm font-semibold hover:bg-primary/90 dark:hover:bg-primary-soft/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingManual ? (
                <><Loader2 size={14} className="animate-spin" /> {t('onboarding.step4.saving')}</>
              ) : t('onboarding.step4.saveManual')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
