/**
 * Step 7 — First Invoice (Activation Event)
 *
 * Cannot be skipped per spec §C.2.
 * Two paths:
 *   Quick path (default): Walk-in + first product + Cash → POST /sales → success
 *   Custom path: link to /sale with a wizard banner
 *
 * After success: caller patches onboarding and redirects.
 * Big profile → dashboard; small profile → /sale.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart, CheckCircle, Share2, ExternalLink,
  Loader2, AlertCircle, ChevronDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createSale, getInvoicePdfUrl } from '../../../services/sale';
import { formatRupees, parseRupees } from '../../../lib/decimal';
import api from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useOnboarding } from '../../../contexts/OnboardingContext';

// Payment modes available in quick path
const PAYMENT_MODES = ['cash', 'upi', 'card'];

export default function Step7FirstInvoice({ onSuccess }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { storeProfile } = useOnboarding();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState('');

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState('1');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [submitting, setSubmitting] = useState(false);

  // Success state
  const [sale, setSale] = useState(null);

  // Load first page of products for the picker
  useEffect(() => {
    let cancelled = false;
    api.get('/products', { params: { page: 1, limit: 20 } })
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data || res.data || [];
        setProducts(data);
        if (data.length > 0) setSelectedProduct(data[0]);
      })
      .catch(e => {
        if (!cancelled) setProductsError(e.response?.data?.message || t('onboarding.step7.loadError'));
      })
      .finally(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
  }, [t]);

  const selectedProductObj = products.find(p => p._id === selectedProduct?._id) || selectedProduct;
  const price = parseRupees(selectedProductObj?.pricePerUnit ?? selectedProductObj?.price ?? 0);
  const qtyNum = parseFloat(qty) || 0;
  const lineTotal = price * qtyNum;

  const buildSalePayload = () => ({
    lines: [
      {
        productId: selectedProductObj._id,
        qty: String(qtyNum),
        rate: String(price),
      },
    ],
    customer: null, // Walk-in
    payment: {
      mode: paymentMode,
      received: String(lineTotal),
    },
    notes: 'First invoice — onboarding activation',
  });

  const handleQuickSale = async () => {
    if (!selectedProductObj) {
      toast.error(t('onboarding.step7.noProduct'));
      return;
    }
    if (qtyNum <= 0) {
      toast.error(t('quickSale.qtyRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await createSale(buildSalePayload());
      const createdSale = res.data?.data || res.data;
      setSale(createdSale);
      toast.success(t('onboarding.step7.saleCreated'));
      if (onSuccess) onSuccess({ saleId: createdSale?._id });
    } catch (e) {
      toast.error(e.response?.data?.message || t('onboarding.step7.saleError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomPath = () => {
    // Navigate to Quick-Sale with a flag so it can complete onboarding on success
    navigate('/sale?onboarding=1');
  };

  // ─── WhatsApp share helper ─────────────────────────────────────────────────
  const handleWhatsAppShare = () => {
    if (!sale?._id) return;
    const pdfUrl = getInvoicePdfUrl(sale._id, 'thermal');
    const msg = encodeURIComponent(`${t('onboarding.step7.whatsappMsg')}\n${pdfUrl}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  // ─── Success screen ────────────────────────────────────────────────────────
  if (sale) {
    return (
      <div className="flex flex-col items-center gap-5 py-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/40 flex items-center justify-center">
          <CheckCircle size={30} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-ink dark:text-paper">{t('onboarding.step7.successTitle')}</h3>
          <p className="text-sm text-ink/60 dark:text-paper/60 leading-relaxed max-w-xs">
            {t('onboarding.step7.successDesc')}
          </p>
        </div>

        {/* Sale summary */}
        <div className="w-full max-w-xs p-4 rounded-xl border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink/60 dark:text-paper/60">{t('onboarding.step7.product')}</span>
            <span className="font-medium text-ink dark:text-paper truncate ml-2">{selectedProductObj?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink/60 dark:text-paper/60">{t('quickSale.grandTotal')}</span>
            <span className="font-bold text-ink dark:text-paper">{formatRupees(lineTotal)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 w-full max-w-xs">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#20b558] transition-colors"
          >
            <Share2 size={16} />
            {t('quickSale.shareWhatsApp')}
          </button>
          <a
            href={getInvoicePdfUrl(sale?._id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-200 dark:border-ink-rule text-ink dark:text-paper text-sm font-medium hover:bg-slate-50 dark:hover:bg-ink transition-colors"
          >
            <ExternalLink size={15} />
            {t('quickSale.viewInvoice')}
          </a>
        </div>

        <p className="text-xs text-ink/40 dark:text-paper/40 mt-1">
          {t('onboarding.step7.activation')}
        </p>
      </div>
    );
  }

  // ─── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Activation message */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 dark:bg-primary-soft/10 border border-primary/15 dark:border-primary-soft/20">
        <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary-soft/15 flex items-center justify-center flex-shrink-0">
          <ShoppingCart size={20} className="text-primary dark:text-primary-soft" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink dark:text-paper">{t('onboarding.step7.quickPath')}</p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">{t('onboarding.step7.quickDesc')}</p>
        </div>
      </div>

      {/* Product error */}
      {productsError && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10">
          <AlertCircle size={15} className="text-red-500 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{productsError}</p>
        </div>
      )}

      {/* Product picker */}
      {loadingProducts ? (
        <div className="h-12 bg-slate-100 dark:bg-ink-rule rounded-xl animate-pulse" />
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block">
            {t('onboarding.step7.product')} <span className="text-primary dark:text-primary-soft ml-0.5">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedProduct?._id || ''}
              onChange={e => {
                const prod = products.find(p => p._id === e.target.value);
                setSelectedProduct(prod || null);
              }}
              className="w-full h-11 pl-3.5 pr-9 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary appearance-none"
            >
              {products.length === 0 && (
                <option value="">{t('onboarding.step7.noProducts')}</option>
              )}
              {products.map(p => (
                <option key={p._id} value={p._id}>
                  {p.name} — {formatRupees(p.pricePerUnit ?? p.price, { paise: false })}/{p.unit || 'pcs'}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Qty */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block">
          {t('quickSale.quantity')}
        </label>
        <input
          type="number"
          min="0.001"
          step="1"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="w-full h-11 px-3.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Payment mode */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block">
          {t('onboarding.step7.payment')}
        </label>
        <div className="flex gap-2">
          {PAYMENT_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentMode(mode)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                paymentMode === mode
                  ? 'border-primary dark:border-primary-soft bg-primary/8 dark:bg-primary-soft/15 text-primary dark:text-primary-soft'
                  : 'border-paper-rule dark:border-ink-rule text-ink/70 dark:text-paper/70 hover:border-primary/40 dark:hover:border-primary-soft/50 hover:bg-primary/4 dark:hover:bg-primary-soft/10'
              }`}
            >
              {t(`quickSale.payment.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Line total preview */}
      {selectedProductObj && qtyNum > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-paper-rule dark:border-ink-rule bg-slate-50 dark:bg-ink">
          <span className="text-sm text-ink/60 dark:text-paper/60">{t('quickSale.grandTotal')}</span>
          <span className="text-base font-bold text-ink dark:text-paper">{formatRupees(lineTotal)}</span>
        </div>
      )}

      {/* Create invoice */}
      <button
        type="button"
        onClick={handleQuickSale}
        disabled={submitting || loadingProducts || !selectedProductObj}
        className="w-full py-3.5 rounded-xl bg-primary dark:bg-primary-soft text-white text-sm font-bold hover:bg-primary/90 dark:hover:bg-primary-soft/90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
      >
        {submitting ? (
          <><Loader2 size={16} className="animate-spin" /> {t('onboarding.step7.creating')}</>
        ) : (
          <><ShoppingCart size={16} /> {t('onboarding.step7.create')}</>
        )}
      </button>

      {/* Custom path */}
      <div className="text-center">
        <button
          type="button"
          onClick={handleCustomPath}
          className="text-xs text-ink/50 dark:text-paper/50 hover:text-primary dark:hover:text-primary-soft underline transition-colors"
        >
          {t('onboarding.step7.customPath')}
        </button>
      </div>
    </div>
  );
}
