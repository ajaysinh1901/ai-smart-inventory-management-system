/**
 * QuickSalePage.jsx — Route: /sale
 * The activation surface for kirana shops.
 * Two density modes driven by workspace.storeProfile:
 *   small → phone/kirana layout (mobile-first)
 *   big   → counter/PC layout (2-column, keyboard shortcuts)
 *
 * Spec: setup-flow-and-units.md §A, §B.4, §B.6, §B.8
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, CheckCircle, Share2, FileText,
  RotateCcw, Keyboard, X, User, Search,
} from 'lucide-react';
import { Modal, Skeleton, ErrorBanner } from '../components/ui';
import ProductSearch from '../components/sale/ProductSearch';
import LineItemEditor from '../components/sale/LineItemEditor';
import BillCart from '../components/sale/BillCart';
import { useWorkspace } from '../hooks/useWorkspace';
import { createSale, searchCustomers, getInvoicePdfUrl } from '../services/sale';
import { parseRupees, formatRupees } from '../lib/decimal';
import { formatQty } from '../lib/weight';
import { useToast } from '../context/ToastContext';
import { completeStep7 } from '../services/onboardingService';
import { useOnboarding } from '../contexts/OnboardingContext';

// ─── Customer Picker modal content ──────────────────────────────────────────

function CustomerPicker({ onSelect, onClose }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(() => {
      setLoading(true);
      searchCustomers(q)
        .then((r) => setResults(r.data?.data || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-paper-rule">
        <h3 className="text-base font-semibold text-ink">{t('quickSale.selectCustomer')}</h3>
      </div>
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('quickSale.customerSearch')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-paper-rule bg-paper text-sm text-ink outline-none focus:border-primary"
            autoFocus
          />
        </div>
      </div>
      <div className="overflow-y-auto max-h-64 px-2 pb-2">
        {/* Walk-in always first */}
        <button
          onMouseDown={() => onSelect({ name: t('quickSale.walkIn'), phone: '' })}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-primary/5 text-left transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center">
            <User size={14} className="text-ink/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{t('quickSale.walkIn')}</p>
            <p className="text-xs text-ink/40">{t('quickSale.walkInDesc')}</p>
          </div>
        </button>
        {loading && <Skeleton className="mx-4 h-10 rounded-xl" />}
        {results.map((c) => (
          <button
            key={c._id}
            onMouseDown={() => onSelect({ name: c.name, phone: c.phone, _id: c._id })}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-primary/5 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={14} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{c.name}</p>
              {c.phone && <p className="text-xs text-ink/40 font-mono">{c.phone}</p>}
              {c.outstandingBalance > 0 && (
                <p className="text-[10px] font-mono text-amber-700">
                  {t('quickSale.outstanding')}: {formatRupees(c.outstandingBalance)}
                </p>
              )}
            </div>
          </button>
        ))}
        {!loading && q && results.length === 0 && (
          <p className="text-xs text-center text-ink/40 py-4">{t('quickSale.noCustomerFound')}</p>
        )}
      </div>
    </div>
  );
}

// ─── Success screen ─────────────────────────────────────────────────────────

function SuccessScreen({ sale, onNewSale, paiseDisplay }) {
  const { t } = useTranslation();
  const pdfUrl = getInvoicePdfUrl(sale._id, 'thermal');
  const grandTotal = parseRupees(sale.grandTotal);
  const invoiceText = `Your invoice ${sale.invoiceNumber} — ${formatRupees(grandTotal)} is ready. View: ${pdfUrl}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(invoiceText)}`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-6 animate-scaleIn">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle size={40} className="text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-display font-bold text-ink">{t('quickSale.saleSuccess')}</h2>
        <p className="text-sm text-ink/60 mt-1 font-mono">{sale.invoiceNumber}</p>
        <p className="text-3xl font-display font-bold text-ink mt-3 tabular-nums">
          {formatRupees(grandTotal, { paise: paiseDisplay })}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors"
        >
          <Share2 size={16} />
          {t('quickSale.shareWhatsApp')}
        </a>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-paper-rule bg-paper-card text-ink font-medium text-sm hover:bg-paper transition-colors"
        >
          <FileText size={16} />
          {t('quickSale.viewInvoice')}
        </a>
      </div>
      <button
        onClick={onNewSale}
        className="flex items-center gap-2 text-sm text-ink/60 hover:text-primary transition-colors"
      >
        <RotateCcw size={14} />
        {t('quickSale.newSale')}
      </button>
    </div>
  );
}

// ─── Keyboard shortcuts help panel ──────────────────────────────────────────

function ShortcutsPanel({ onClose }) {
  const { t } = useTranslation();
  const shortcuts = [
    { key: 'Enter', desc: t('quickSale.shortcut.enter') },
    { key: 'F2',    desc: t('quickSale.shortcut.f2') },
    { key: 'F4',    desc: t('quickSale.shortcut.f4') },
    { key: 'F9',    desc: t('quickSale.shortcut.f9') },
    { key: 'Esc',   desc: t('quickSale.shortcut.esc') },
  ];
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Keyboard size={14} />
          {t('quickSale.shortcuts')}
        </h4>
        <button onClick={onClose} className="text-ink/40 hover:text-ink p-1 rounded">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-1.5">
        {shortcuts.map((s) => (
          <div key={s.key} className="flex items-center gap-3 text-xs">
            <kbd className="px-2 py-0.5 rounded bg-ink/8 border border-paper-rule font-mono text-ink/60 flex-shrink-0">
              {s.key}
            </kbd>
            <span className="text-ink/60">{s.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function QuickSalePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { prefs, loading: wsLoading } = useWorkspace();
  const { toast } = useToast();
  const { isComplete: onboardingComplete, storeProfile: onboardingProfile, markStepComplete } = useOnboarding();

  // If launched from onboarding wizard custom path (?onboarding=1)
  const isOnboardingFlow = searchParams.get('onboarding') === '1';

  const paiseDisplay = prefs?.paiseDisplay ?? true;
  const weightDisplay = prefs?.weightDisplay ?? 'decimal';
  const storeProfile = prefs?.storeProfile || 'small';
  const isCounter = storeProfile === 'big';

  // Cart state
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState(null); // null = walk-in
  const [paymentMode, setPaymentMode] = useState('cash');

  // UI state
  const [selectedProduct, setSelectedProduct] = useState(null); // product being edited
  const [editingLine, setEditingLine] = useState(null); // existing line being edited
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Sale submission
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState('');
  const [completedSale, setCompletedSale] = useState(null);

  // Counter mode: USB HID scanner focus trap
  const scannerInputRef = useRef(null);
  const scanBuffer = useRef('');
  const scanTimer = useRef(null);
  const handleChargeRef = useRef(null); // stable ref for F9 keyboard shortcut

  // Keep scanner input focused on counter mode
  useEffect(() => {
    if (!isCounter) return;
    const keepFocus = (e) => {
      // Don't steal focus from modals or inputs
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (scannerInputRef.current) scannerInputRef.current.focus();
    };
    document.addEventListener('click', keepFocus);
    return () => document.removeEventListener('click', keepFocus);
  }, [isCounter]);

  const handleScanInput = (e) => {
    // USB HID scanners send characters rapidly ending in Enter
    const char = e.key;
    if (char === 'Enter') {
      const code = scanBuffer.current.trim();
      scanBuffer.current = '';
      clearTimeout(scanTimer.current);
      if (code) {
        // Try barcode lookup
        import('../services/sale').then(({ lookupBarcode }) => {
          lookupBarcode(code)
            .then((r) => {
              const p = r.data?.data;
              if (p) setSelectedProduct(p);
              else toast.error(t('quickSale.barcodeNotFound', { code }));
            })
            .catch(() => toast.error(t('quickSale.barcodeNotFound', { code })));
        });
      }
    } else if (char.length === 1) {
      scanBuffer.current += char;
      clearTimeout(scanTimer.current);
      scanTimer.current = setTimeout(() => { scanBuffer.current = ''; }, 200);
    }
  };

  // Keyboard shortcuts (counter mode) — use ref to avoid stale closure on handleCharge
  useEffect(() => {
    if (!isCounter) return;
    const handler = (e) => {
      if (e.key === 'F9') { e.preventDefault(); handleChargeRef.current?.(); }
      if (e.key === 'Escape') { e.preventDefault(); setSelectedProduct(null); setEditingLine(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isCounter]);

  const handleProductSelect = (product) => {
    setEditingLine(null);
    setSelectedProduct(product);
  };

  const handleSaveLine = (line) => {
    setLines((prev) => {
      const existing = prev.findIndex((l) => l._id === line._id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = line;
        return next;
      }
      return [...prev, line];
    });
    setSelectedProduct(null);
    setEditingLine(null);
  };

  const handleEditLine = (line) => {
    // We need the original product data — reconstruct a minimal product object from the line
    const product = {
      _id: line.productId,
      name: line.productName,
      unit: line.unit,
      pricePerUnit: line.pricePerUnit,
      saleByWeight: parseFloat(String(line.qty)) !== Math.floor(parseFloat(String(line.qty))),
    };
    setEditingLine(line);
    setSelectedProduct(product);
  };

  const handleRemoveLine = (lineId) => {
    setLines((prev) => prev.filter((l) => l._id !== lineId));
  };

  const handleCharge = handleChargeRef.current = async () => {
    if (paymentMode === 'credit' && (!customer?.name || customer.name === t('quickSale.walkIn'))) {
      setChargeError(t('quickSale.creditNeedsCustomer'));
      return;
    }
    setCharging(true);
    setChargeError('');
    try {
      const payload = {
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          tareApplied: l.tareApplied || '0',
          amountFirst: false,
          enteredAmount: null,
        })),
        customer: customer?.phone
          ? { name: customer.name, phone: customer.phone }
          : { name: t('quickSale.walkIn') },
        payment: {
          mode: paymentMode,
        },
      };
      const res = await createSale(payload);
      const sale = res.data?.data;
      if (sale) {
        setCompletedSale(sale);
        setLines([]);
        setCustomer(null);
        setPaymentMode('cash');

        // If this was the onboarding activation sale, complete step 7
        if (isOnboardingFlow && !onboardingComplete) {
          await completeStep7().catch(() => {});
          markStepComplete(7);
          toast.success(t('onboarding.step7.activationToast'));
          if (onboardingProfile === 'big') {
            toast.info(t('onboarding.step7.addStaffNudge'), { duration: 8000 });
          }
        }
      }
    } catch (e) {
      const msg = e.response?.data?.message || t('quickSale.chargeError');
      setChargeError(msg);
      toast.error(msg);
    } finally {
      setCharging(false);
    }
  };

  const handleNewSale = () => {
    setCompletedSale(null);
    setLines([]);
    setCustomer(null);
    setPaymentMode('cash');
    setChargeError('');
  };

  if (wsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (completedSale) {
    return (
      <div className="min-h-screen bg-app">
        <SuccessScreen sale={completedSale} onNewSale={handleNewSale} paiseDisplay={paiseDisplay} />
      </div>
    );
  }

  /* ─── Phone / kirana layout ──────────────────────────────────────── */
  if (!isCounter) {
    return (
      <div className="min-h-screen bg-app pb-44">
        {/* Onboarding wizard banner — shown when opened from custom path */}
        {isOnboardingFlow && !onboardingComplete && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5">
              <ShoppingCart size={14} className="text-primary flex-shrink-0" />
              <p className="text-xs font-medium text-primary/80 flex-1">
                {t('onboarding.step7.activation')}
              </p>
            </div>
          </div>
        )}
        {/* Top search bar */}
        <div className="sticky top-0 z-20 bg-paper-card border-b border-paper-rule px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ProductSearch onSelect={handleProductSelect} mode="phone" autoFocus />
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <ShoppingCart size={14} className="text-white" />
            </div>
          </div>
        </div>

        {/* Error */}
        {chargeError && (
          <div className="px-4 pt-3">
            <ErrorBanner message={chargeError} onDismiss={() => setChargeError('')} />
          </div>
        )}

        {/* Empty state */}
        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <ShoppingCart size={48} className="text-ink/15 mb-4" />
            <p className="text-base font-medium text-ink/40">{t('quickSale.searchToStart')}</p>
            <p className="text-sm text-ink/30 mt-1">{t('quickSale.searchHint')}</p>
          </div>
        )}

        {/* Cart bill list (visible rows above the bottom sheet) */}
        {lines.length > 0 && (
          <div className="px-4 pt-4 space-y-2">
            {lines.map((line) => (
              <div key={line._id} className="rounded-xl border border-paper-rule bg-paper-card px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{line.productName}</p>
                  <p className="text-xs text-ink/50 font-mono mt-0.5">
                    {formatQty(line.qty, line.unit || 'pcs', weightDisplay)}
                    {' '}×{' '}
                    {formatRupees(line.pricePerUnit, { paise: paiseDisplay })}
                  </p>
                </div>
                <p className="text-sm font-bold text-ink tabular-nums flex-shrink-0">
                  {formatRupees(line._lineSubtotal || line._lineTotal, { paise: paiseDisplay })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Bottom cart sheet */}
        <BillCart
          lines={lines}
          onEditLine={handleEditLine}
          onRemoveLine={handleRemoveLine}
          customer={customer}
          onChangeCustomer={() => setShowCustomerPicker(true)}
          paymentMode={paymentMode}
          onChangePaymentMode={setPaymentMode}
          onCharge={handleCharge}
          charging={charging}
          mode="phone"
          paiseDisplay={paiseDisplay}
          weightDisplay={weightDisplay}
          showCostMargin={false}
        />

        {/* Line item editor modal */}
        <Modal
          open={!!selectedProduct}
          onClose={() => { setSelectedProduct(null); setEditingLine(null); }}
          hideCloseButton
          size="md"
        >
          {selectedProduct && (
            <LineItemEditor
              product={selectedProduct}
              existingLine={editingLine}
              mode="phone"
              onSave={handleSaveLine}
              onCancel={() => { setSelectedProduct(null); setEditingLine(null); }}
              paiseDisplay={paiseDisplay}
              weightDisplay={weightDisplay}
            />
          )}
        </Modal>

        {/* Customer picker modal */}
        <Modal
          open={showCustomerPicker}
          onClose={() => setShowCustomerPicker(false)}
          size="sm"
          hideCloseButton
        >
          <CustomerPicker
            onSelect={(c) => { setCustomer(c); setShowCustomerPicker(false); }}
            onClose={() => setShowCustomerPicker(false)}
          />
        </Modal>
      </div>
    );
  }

  /* ─── Counter / desktop layout ───────────────────────────────────── */
  return (
    <div className="h-full flex flex-col bg-app">
      {/* Top bar */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-paper-rule flex items-center gap-4">
        <h1 className="text-lg font-display font-semibold text-ink">{t('quickSale.title')}</h1>
        <div className="flex-1">
          <ProductSearch onSelect={handleProductSelect} mode="counter" inputRef={scannerInputRef} />
        </div>
        <button
          onClick={() => setShowShortcuts((s) => !s)}
          className="h-8 px-3 rounded-xl border border-paper-rule text-xs font-mono text-ink/50 hover:border-primary/40 hover:text-ink/70 flex items-center gap-1.5 transition-colors flex-shrink-0"
        >
          <Keyboard size={13} />
          {t('quickSale.shortcuts')}
        </button>
      </div>

      {/* Shortcuts panel */}
      {showShortcuts && (
        <div className="mx-6 mt-3 rounded-xl border border-paper-rule bg-paper-card">
          <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
        </div>
      )}

      {/* Hidden USB scanner input */}
      <input
        ref={scannerInputRef}
        className="sr-only"
        onKeyDown={handleScanInput}
        readOnly
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* 2-column layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: search results + cart table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {chargeError && (
            <ErrorBanner message={chargeError} onDismiss={() => setChargeError('')} className="mb-4" />
          )}
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ShoppingCart size={40} className="text-ink/15 mb-3" />
              <p className="text-sm text-ink/40">{t('quickSale.searchToStart')}</p>
              <p className="text-xs text-ink/30 mt-1">{t('quickSale.counterHint')}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-paper-rule bg-paper-card overflow-hidden">
              <BillCart
                lines={lines}
                onEditLine={handleEditLine}
                onRemoveLine={handleRemoveLine}
                customer={customer}
                onChangeCustomer={() => setShowCustomerPicker(true)}
                paymentMode={paymentMode}
                onChangePaymentMode={setPaymentMode}
                onCharge={handleCharge}
                charging={charging}
                mode="counter"
                paiseDisplay={paiseDisplay}
                weightDisplay={weightDisplay}
                showCostMargin={true}
              />
            </div>
          )}
        </div>

        {/* Right: bill totals + payment (always visible on counter) */}
        {lines.length > 0 && (
          <div className="w-80 flex-shrink-0 border-l border-paper-rule bg-paper-card overflow-y-auto">
            {/* Print preview stub */}
            <div className="px-4 pt-4 pb-2">
              <button className="w-full h-8 rounded-xl border border-paper-rule text-xs font-mono text-ink/50 hover:border-primary/40 hover:text-ink/70 flex items-center justify-center gap-1.5 transition-colors">
                <FileText size={12} />
                {t('quickSale.printPreview')}
                <span className="ml-1 opacity-50">(F9)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Line item editor modal */}
      <Modal
        open={!!selectedProduct}
        onClose={() => { setSelectedProduct(null); setEditingLine(null); }}
        hideCloseButton
        size="md"
      >
        {selectedProduct && (
          <LineItemEditor
            product={selectedProduct}
            existingLine={editingLine}
            mode="counter"
            onSave={handleSaveLine}
            onCancel={() => { setSelectedProduct(null); setEditingLine(null); }}
            paiseDisplay={paiseDisplay}
            weightDisplay={weightDisplay}
          />
        )}
      </Modal>

      {/* Customer picker modal */}
      <Modal
        open={showCustomerPicker}
        onClose={() => setShowCustomerPicker(false)}
        size="sm"
        hideCloseButton
      >
        <CustomerPicker
          onSelect={(c) => { setCustomer(c); setShowCustomerPicker(false); }}
          onClose={() => setShowCustomerPicker(false)}
        />
      </Modal>
    </div>
  );
}
