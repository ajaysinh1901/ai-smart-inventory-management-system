/**
 * Step 5 — Opening Stock
 *
 * Lists every product (paginated 20 at a time) with a qty input.
 * Unit-aware: step and label depend on product.unit.
 * Pre-filled with 0 (sample-pack seeding already set stock server-side).
 * "Skip — count later" allowed per spec §C.2.
 * Mobile-first: full-width inputs, single column.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, BarChart2, AlertCircle } from 'lucide-react';
import { UNIT_STEP, UNIT_SUFFIX } from '../../../lib/weight';
import { formatRupees } from '../../../lib/decimal';
import api from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const PAGE_SIZE = 20;

export default function Step5OpeningStock({ onSkip, onSuccess }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qtys, setQtys] = useState({});   // { productId: string }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/products', { params: { page, limit: PAGE_SIZE } })
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data || res.data || [];
        const totalCount = res.data?.total || data.length;
        setProducts(data);
        setTotal(totalCount);
        // Pre-fill with current stock values from products
        const initQtys = {};
        data.forEach(p => {
          if (!(p._id in qtys)) {
            initQtys[p._id] = '';
          }
        });
        setQtys(prev => ({ ...initQtys, ...prev }));
      })
      .catch(e => {
        if (!cancelled) setError(e.response?.data?.message || t('onboarding.step5.loadError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, t]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleQtyChange = (productId, value) => {
    setQtys(prev => ({ ...prev, [productId]: value }));
  };

  const handleSubmit = async () => {
    const entries = Object.entries(qtys)
      .filter(([, v]) => v !== '' && parseFloat(v) > 0)
      .map(([productId, qty]) => ({ productId, qty: String(parseFloat(qty)) }));

    if (entries.length === 0) {
      // Nothing entered — treat as skip
      if (onSkip) onSkip();
      return;
    }

    setSaving(true);
    try {
      await api.post('/transactions/opening-stock', { entries });
      toast.success(t('onboarding.step5.saveSuccess', { count: entries.length }));
      if (onSuccess) onSuccess({ entries: entries.length });
    } catch (e) {
      toast.error(e.response?.data?.message || t('onboarding.step5.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-100 dark:bg-ink-rule rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10">
        <AlertCircle size={18} className="text-red-500 dark:text-red-400 flex-shrink-0" />
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  // ─── Empty state (no products yet) ────────────────────────────────────────
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-ink-rule flex items-center justify-center">
          <BarChart2 size={24} className="text-slate-400 dark:text-paper/40" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink/70 dark:text-paper/70">{t('onboarding.step5.noProducts')}</p>
          <p className="text-xs text-ink/40 dark:text-paper/40 mt-1">{t('onboarding.step5.noProductsHint')}</p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-primary dark:text-primary-soft underline hover:text-primary/80 dark:hover:text-primary-soft/80 transition-colors"
        >
          {t('onboarding.step5.countLater')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Skip banner */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700/40">
        <AlertCircle size={14} className="text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-slate-600 dark:text-slate-400">{t('onboarding.step5.skipExplain')}</p>
          <button
            type="button"
            onClick={onSkip}
            className="mt-1 text-xs text-primary dark:text-primary-soft underline hover:text-primary/80 dark:hover:text-primary-soft/80 transition-colors"
          >
            {t('onboarding.step5.countLater')}
          </button>
        </div>
      </div>

      {/* Product rows */}
      <div className="space-y-2">
        {products.map(product => {
          const unit = product.unit || 'pcs';
          const step = UNIT_STEP[unit] ?? 1;
          const suffix = UNIT_SUFFIX[unit] || unit;
          const isDecimal = step < 1;

          return (
            <div
              key={product._id}
              className="flex items-center gap-3 p-3 rounded-xl border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card"
            >
              {/* Product info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink dark:text-paper truncate">{product.name}</p>
                <p className="text-xs text-ink/50 dark:text-paper/50">
                  {formatRupees(product.pricePerUnit ?? product.price, { paise: false })} / {suffix}
                </p>
              </div>
              {/* Qty input */}
              <div className="flex-shrink-0 w-28 flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step={step}
                  value={qtys[product._id] ?? ''}
                  onChange={e => handleQtyChange(product._id, e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-right text-ink dark:text-paper bg-paper-card dark:bg-ink-card placeholder:text-ink/30 dark:placeholder:text-paper/30 outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary"
                />
                <span className="text-xs text-ink/50 dark:text-paper/50 w-6 flex-shrink-0">{suffix}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="flex items-center gap-1 text-xs text-ink/60 dark:text-paper/60 hover:text-primary dark:hover:text-primary-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} /> {t('onboarding.step5.prev')}
          </button>
          <p className="text-xs text-ink/50 dark:text-paper/50">
            {t('onboarding.step5.pageOf', { page, total: totalPages })}
          </p>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1 text-xs text-ink/60 dark:text-paper/60 hover:text-primary dark:hover:text-primary-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {t('onboarding.step5.next')} <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-primary dark:bg-primary-soft text-white text-sm font-semibold hover:bg-primary/90 dark:hover:bg-primary-soft/90 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
      >
        {saving ? (
          <><Loader2 size={15} className="animate-spin" /> {t('onboarding.step5.saving')}</>
        ) : t('onboarding.step5.saveStock')}
      </button>
    </div>
  );
}
