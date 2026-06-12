/**
 * LineItemEditor.jsx
 * Modal/sheet for editing a single cart line item.
 * Handles both pcs-mode (stepper) and scale-mode (weight entry + chips + amount-first).
 *
 * Props:
 *   product: Product object from API
 *   existingLine: existing cart line (null = new)
 *   mode: 'phone' | 'counter'
 *   onSave(line: CartLine)
 *   onCancel()
 *   paiseDisplay: boolean
 *   weightDisplay: 'decimal' | 'mixed'
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Minus, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseRupees, formatRupees, toApiString } from '../../lib/decimal';
import { formatQty, UNIT_STEP, UNIT_DECIMALS, isWholeNumber, isWeightUnit } from '../../lib/weight';
import { previewSale } from '../../services/sale';
import WeightChip from './WeightChip';
import AmountFirstToggle from './AmountFirstToggle';
import TareToggle from './TareToggle';

export default function LineItemEditor({
  product,
  existingLine = null,
  mode = 'phone',
  onSave,
  onCancel,
  paiseDisplay = true,
  weightDisplay = 'decimal',
}) {
  const { t } = useTranslation();
  const unit = product?.unit || 'pcs';
  const isWeight = product?.saleByWeight && isWeightUnit(unit);
  const decimals = UNIT_DECIMALS[unit] ?? 0;
  const step = UNIT_STEP[unit] ?? 1;
  const pricePerUnit = parseRupees(product?.pricePerUnit || product?.price);

  // Qty state — stored as string to preserve decimal input
  const [qtyStr, setQtyStr] = useState(() => {
    if (existingLine) return String(existingLine.qty);
    return isWeight ? '0.250' : '1';
  });

  // Amount-first mode
  const [amountFirst, setAmountFirst] = useState(false);
  const [amountStr, setAmountStr] = useState('');

  // Tare state
  const tareWeight = parseFloat(String(product?.tareWeight || 0));
  const [tareActive, setTareActive] = useState(existingLine?.tareApplied > 0 || false);

  // Live preview
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef(null);

  // Error state
  const [error, setError] = useState('');
  const [qtyError, setQtyError] = useState('');

  const qty = parseFloat(qtyStr) || 0;
  const effectiveQty = qty;
  const lineAmount = pricePerUnit * qty;

  // Qty validation
  useEffect(() => {
    if (!isWeight && qtyStr && !isWholeNumber(parseFloat(qtyStr))) {
      setQtyError(t('productForm.errors.qtyMustBeWhole', { unit }));
    } else {
      setQtyError('');
    }
  }, [qtyStr, isWeight, unit, t]);

  // Live preview via /sales/preview — debounced 200ms
  const fetchPreview = useCallback(() => {
    if (!product?._id || effectiveQty <= 0) { setPreview(null); return; }

    const line = {
      productId: product._id,
      qty: toApiString(effectiveQty),
      tareApplied: tareActive ? toApiString(tareWeight) : '0',
      amountFirst: false,
      enteredAmount: null,
    };

    setPreviewLoading(true);
    previewSale({ lines: [line] })
      .then((res) => {
        const data = res.data?.data;
        if (data?.lines?.[0]) setPreview(data.lines[0]);
        else setPreview(null);
        setError('');
      })
      .catch((e) => {
        const msg = e.response?.data?.message || '';
        if (e.response?.status === 409) {
          setError(t('quickSale.insufficientStock'));
        } else if (msg) {
          setError(msg);
        }
        setPreview(null);
      })
      .finally(() => setPreviewLoading(false));
  }, [product?._id, effectiveQty, tareActive, tareWeight, t]);

  useEffect(() => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(fetchPreview, 200);
    return () => clearTimeout(previewTimer.current);
  }, [fetchPreview]);

  // Amount-first: user types an amount, compute qty via preview
  const previewAmountFirst = useCallback((amountVal) => {
    if (!product?._id || !amountVal || !pricePerUnit) return;
    const entered = parseRupees(amountVal);
    if (entered <= 0 || !pricePerUnit) return;

    // Back-compute qty = amount / pricePerUnit
    const backQty = entered / pricePerUnit;
    const rounded = parseFloat(backQty.toFixed(decimals));
    setQtyStr(String(rounded));
  }, [product?._id, pricePerUnit, decimals]);

  const handleAmountInput = (val) => {
    setAmountStr(val);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => previewAmountFirst(val), 300);
  };

  const handleQtyChange = (val) => {
    setQtyStr(val);
  };

  const handleIncrement = (delta) => {
    const current = parseFloat(qtyStr) || 0;
    const next = Math.max(0, current + delta);
    setQtyStr(next.toFixed(decimals));
  };

  const handleSave = () => {
    const finalQty = parseFloat(qtyStr) || 0;
    if (finalQty <= 0) { setError(t('quickSale.qtyRequired')); return; }
    if (!isWeight && !isWholeNumber(finalQty)) { setError(t('productForm.errors.qtyMustBeWhole', { unit })); return; }

    const line = {
      _id: existingLine?._id || String(Date.now()),
      productId: product._id,
      productName: product.name,
      unit,
      qty: toApiString(finalQty),
      pricePerUnit: toApiString(pricePerUnit),
      tareApplied: tareActive ? toApiString(tareWeight) : '0',
      amountFirst: false,
      enteredAmount: null,
      // UI display helpers (not sent to API directly)
      _displayQty: formatQty(finalQty, unit, weightDisplay),
      _displayPrice: formatRupees(pricePerUnit, { paise: paiseDisplay }),
      _lineTotal: preview?.lineTotal || toApiString(lineAmount),
      _lineSubtotal: preview?.lineSubtotal || toApiString(lineAmount),
      _lowStock: parseFloat(String(product.stock || 0)) < finalQty,
    };

    onSave(line);
  };

  const price0 = !pricePerUnit;
  const isPhone = mode === 'phone';

  return (
    <div className={`flex flex-col ${isPhone ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-paper-rule">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase tracking-wider text-ink/40 mb-0.5">{t('quickSale.addingItem')}</p>
          <h3 className="text-lg font-display font-semibold text-ink leading-tight truncate">{product?.name}</h3>
          <p className="text-sm text-ink/60 font-mono mt-0.5">
            {formatRupees(pricePerUnit, { paise: paiseDisplay })} / {unit}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-ink/40 hover:text-ink hover:bg-paper-rule transition-colors ml-3 flex-shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scale-mode vs pcs-mode */}
        {isWeight ? (
          <div className="space-y-4">
            {/* Mode toggle row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink/70">{t('quickSale.quantity')}</span>
              <div className="flex items-center gap-2">
                <AmountFirstToggle
                  active={amountFirst}
                  onChange={setAmountFirst}
                  disabled={price0}
                  disabledReason={t('quickSale.amountFirstDisabledHint')}
                />
                {tareWeight > 0 && (
                  <TareToggle
                    active={tareActive}
                    onChange={setTareActive}
                    tareWeight={tareWeight}
                    unit={unit}
                  />
                )}
              </div>
            </div>

            {amountFirst ? (
              /* Amount-first input */
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-display font-semibold text-ink/40">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={amountStr}
                    onChange={(e) => handleAmountInput(e.target.value)}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-4 text-3xl font-display font-semibold text-center text-ink bg-paper rounded-xl border border-paper-rule outline-none focus:border-primary transition-colors tabular-nums"
                    autoFocus
                  />
                </div>
                <p className="text-sm text-center text-ink/50 font-mono">
                  {qty > 0
                    ? `= ${formatQty(qty, unit, weightDisplay)}`
                    : t('quickSale.amountFirstHint')
                  }
                </p>
              </div>
            ) : (
              /* Qty-first input */
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={step}
                    value={qtyStr}
                    onChange={(e) => handleQtyChange(e.target.value)}
                    placeholder="0.000"
                    className="w-full px-4 pr-16 py-4 text-3xl font-display font-semibold text-center text-ink bg-paper rounded-xl border border-paper-rule outline-none focus:border-primary transition-colors tabular-nums"
                    autoFocus
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-mono text-ink/40">{unit}</span>
                </div>
                <WeightChip unit={unit} onAdd={(v) => handleIncrement(v)} />
              </div>
            )}
          </div>
        ) : (
          /* Pcs / discrete qty stepper */
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink/70">{t('quickSale.quantity')}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleIncrement(-1)}
                disabled={qty <= 1}
                className="w-12 h-12 rounded-xl border border-paper-rule bg-paper-card flex items-center justify-center text-ink/60 hover:border-primary hover:text-primary disabled:opacity-30 transition-all active:scale-95"
              >
                <Minus size={20} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={qtyStr}
                onChange={(e) => handleQtyChange(e.target.value)}
                className="flex-1 h-12 text-2xl font-display font-semibold text-center text-ink bg-paper rounded-xl border border-paper-rule outline-none focus:border-primary transition-colors tabular-nums"
              />
              <button
                type="button"
                onClick={() => handleIncrement(1)}
                className="w-12 h-12 rounded-xl border border-paper-rule bg-paper-card flex items-center justify-center text-ink/60 hover:border-primary hover:text-primary transition-all active:scale-95"
              >
                <Plus size={20} />
              </button>
            </div>
            {qtyError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <Info size={11} /> {qtyError}
              </p>
            )}
          </div>
        )}

        {/* Stock info + warnings */}
        {product?.stock != null && (
          <div className="text-xs font-mono text-ink/40 flex items-center gap-1.5">
            <Info size={11} />
            {t('quickSale.inStockLabel')}:{' '}
            <span className="font-semibold">{formatQty(product.stock, unit, weightDisplay)}</span>
            {parseFloat(String(product.stock)) < qty && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle size={10} />
                {t('quickSale.oversoldWarning')}
              </span>
            )}
          </div>
        )}

        {/* Reorder warning inline */}
        {product?.reorderLevel != null &&
          parseFloat(String(product.stock)) <= parseFloat(String(product.reorderLevel)) &&
          parseFloat(String(product.stock)) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle size={12} className="flex-shrink-0" />
            {t('quickSale.reorderWarning')}
          </div>
        )}

        {/* Live amount display */}
        <div className={`rounded-xl border border-paper-rule bg-paper px-4 py-3 flex items-center justify-between ${previewLoading ? 'opacity-60' : ''}`}>
          <span className="text-sm text-ink/60">{t('quickSale.amount')}</span>
          <span className="text-xl font-display font-semibold text-ink tabular-nums">
            {preview
              ? formatRupees(preview.lineSubtotal || preview.lineTotal, { paise: paiseDisplay })
              : formatRupees(lineAmount, { paise: paiseDisplay })
            }
          </span>
        </div>

        {/* Tare info */}
        {tareActive && tareWeight > 0 && (
          <div className="text-xs text-ink/50 font-mono flex items-center gap-1.5">
            <Info size={11} />
            {t('quickSale.tareDeducted', { tare: formatQty(tareWeight, unit, weightDisplay) })}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="px-6 pb-6 pt-3 border-t border-paper-rule bg-paper-card/50">
        <button
          type="button"
          onClick={handleSave}
          disabled={!!qtyError || qty <= 0}
          className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary-soft active:bg-primary-deep disabled:opacity-40 transition-colors"
        >
          {existingLine
            ? t('quickSale.updateItem')
            : t('quickSale.addToBill')
          }
          {qty > 0 && pricePerUnit > 0 && (
            <span className="ml-2 opacity-80 font-mono text-sm">
              {formatRupees(
                preview ? parseRupees(preview.lineSubtotal || preview.lineTotal) : lineAmount,
                { paise: paiseDisplay }
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
