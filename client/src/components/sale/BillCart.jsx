/**
 * BillCart.jsx
 * The bill cart panel — shows line items, live totals via /preview, customer picker,
 * and the Charge button.
 *
 * Props:
 *   lines: CartLine[]
 *   onEditLine(line)
 *   onRemoveLine(lineId)
 *   customer: { name, phone } | null
 *   onChangeCustomer()
 *   paymentMode: string
 *   onChangePaymentMode(mode)
 *   onCharge()
 *   charging: boolean
 *   mode: 'phone' | 'counter'
 *   paiseDisplay: boolean
 *   weightDisplay: 'decimal' | 'mixed'
 *   showCostMargin: boolean  — big store only
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart, User, Edit2, Trash2, AlertTriangle, ChevronDown,
  ChevronUp, Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseRupees, formatRupees, toApiString } from '../../lib/decimal';
import { formatQty } from '../../lib/weight';
import { previewSale } from '../../services/sale';
import PaymentModePicker from './PaymentModePicker';

export default function BillCart({
  lines = [],
  onEditLine,
  onRemoveLine,
  customer,
  onChangeCustomer,
  paymentMode,
  onChangePaymentMode,
  onCharge,
  charging = false,
  mode = 'phone',
  paiseDisplay = true,
  weightDisplay = 'decimal',
  showCostMargin = false,
}) {
  const { t } = useTranslation();
  const isPhone = mode === 'phone';

  const [expanded, setExpanded] = useState(false);
  const [totals, setTotals] = useState(null);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const previewTimer = useRef(null);

  const fetchTotals = useCallback(() => {
    if (lines.length === 0) { setTotals(null); return; }

    const payload = {
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        tareApplied: l.tareApplied || '0',
        amountFirst: false,
        enteredAmount: null,
      })),
      customer: customer?.phone ? { phone: customer.phone, name: customer.name } : undefined,
    };

    setTotalsLoading(true);
    previewSale(payload)
      .then((res) => {
        const d = res.data?.data;
        if (d) setTotals(d);
      })
      .catch(() => {})
      .finally(() => setTotalsLoading(false));
  }, [lines, customer]);

  useEffect(() => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(fetchTotals, 200);
    return () => clearTimeout(previewTimer.current);
  }, [fetchTotals]);

  const subtotal = totals ? parseRupees(totals.subtotal) : lines.reduce((s, l) => s + parseRupees(l._lineSubtotal || l._lineTotal), 0);
  const taxTotal = totals ? parseRupees(totals.taxTotal) : 0;
  const roundOff = totals ? parseRupees(totals.roundOff) : 0;
  const grandTotal = totals ? parseRupees(totals.grandTotal) : subtotal;
  const intraState = totals?.intraState;

  const creditNeedsCustomer = paymentMode === 'credit' && (!customer?.name || customer.name === t('quickSale.walkIn'));
  const canCharge = lines.length > 0 && !creditNeedsCustomer;

  if (lines.length === 0) {
    if (isPhone) return null; // Phone: don't render empty cart
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-ink/30">
        <ShoppingCart size={40} className="mb-3" />
        <p className="text-sm font-mono">{t('quickSale.cartEmpty')}</p>
      </div>
    );
  }

  /* ─── Phone layout (bottom sheet) ────────────────────────── */
  if (isPhone) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-30 bg-paper-card border-t border-paper-rule shadow-pop">
        {/* Collapsed summary bar */}
        <button
          className="w-full px-4 py-3 flex items-center justify-between"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" />
            <span className="text-sm font-semibold text-ink">
              {lines.length} {t('quickSale.items')}
            </span>
            {totalsLoading && <Loader2 size={12} className="animate-spin text-ink/40" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-display font-bold text-ink tabular-nums">
              {formatRupees(grandTotal, { paise: paiseDisplay })}
            </span>
            {expanded ? <ChevronDown size={16} className="text-ink/50" /> : <ChevronUp size={16} className="text-ink/50" />}
          </div>
        </button>

        {expanded && (
          <div className="max-h-[70vh] overflow-y-auto pb-safe">
            <CartLinesTable
              lines={lines}
              onEditLine={onEditLine}
              onRemoveLine={onRemoveLine}
              weightDisplay={weightDisplay}
              paiseDisplay={paiseDisplay}
              showCostMargin={false}
              t={t}
            />
            <TotalsSection
              subtotal={subtotal}
              taxTotal={taxTotal}
              roundOff={roundOff}
              grandTotal={grandTotal}
              intraState={intraState}
              loading={totalsLoading}
              paiseDisplay={paiseDisplay}
              t={t}
            />
            <div className="px-4 py-3 border-t border-paper-rule space-y-3">
              <CustomerRow customer={customer} onChangeCustomer={onChangeCustomer} t={t} />
              <PaymentModePicker
                value={paymentMode}
                onChange={onChangePaymentMode}
                customer={customer}
                mode="phone"
              />
            </div>
            <div className="px-4 pb-4 pt-2">
              <ChargeButton
                grandTotal={grandTotal}
                paiseDisplay={paiseDisplay}
                canCharge={canCharge}
                charging={charging}
                onCharge={onCharge}
                t={t}
              />
            </div>
          </div>
        )}

        {/* Always-visible charge button when collapsed */}
        {!expanded && (
          <div className="px-4 pb-4">
            <ChargeButton
              grandTotal={grandTotal}
              paiseDisplay={paiseDisplay}
              canCharge={canCharge}
              charging={charging}
              onCharge={onCharge}
              t={t}
            />
          </div>
        )}
      </div>
    );
  }

  /* ─── Counter / desktop layout (right panel) ─────────────── */
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <CartLinesTable
          lines={lines}
          onEditLine={onEditLine}
          onRemoveLine={onRemoveLine}
          weightDisplay={weightDisplay}
          paiseDisplay={paiseDisplay}
          showCostMargin={showCostMargin}
          t={t}
        />
      </div>
      <div className="border-t border-paper-rule">
        <TotalsSection
          subtotal={subtotal}
          taxTotal={taxTotal}
          roundOff={roundOff}
          grandTotal={grandTotal}
          intraState={intraState}
          loading={totalsLoading}
          paiseDisplay={paiseDisplay}
          t={t}
        />
        <div className="px-4 py-3 space-y-3">
          <CustomerRow customer={customer} onChangeCustomer={onChangeCustomer} t={t} />
          <PaymentModePicker
            value={paymentMode}
            onChange={onChangePaymentMode}
            customer={customer}
            mode="counter"
          />
          <ChargeButton
            grandTotal={grandTotal}
            paiseDisplay={paiseDisplay}
            canCharge={canCharge}
            charging={charging}
            onCharge={onCharge}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function CartLinesTable({ lines, onEditLine, onRemoveLine, weightDisplay, paiseDisplay, showCostMargin, t }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-paper-rule">
          <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-ink/40">{t('quickSale.item')}</th>
          <th className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-ink/40">{t('quickSale.qty')}</th>
          <th className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-ink/40">{t('quickSale.price')}</th>
          <th className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-ink/40">{t('quickSale.total')}</th>
          {showCostMargin && (
            <th className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-ink/40">{t('quickSale.margin')}</th>
          )}
          <th className="w-16" />
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line._id} className="border-b border-paper-rule/50 hover:bg-primary/3 transition-colors">
            <td className="px-4 py-2.5">
              <p className="font-medium text-ink leading-tight truncate max-w-[150px]">{line.productName}</p>
              {line._lowStock && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 mt-0.5">
                  <AlertTriangle size={9} /> {t('quickSale.oversoldWarning')}
                </span>
              )}
            </td>
            <td className="px-2 py-2.5 text-right font-mono text-xs text-ink/70 whitespace-nowrap">
              {formatQty(line.qty, line.unit || 'pcs', weightDisplay)}
            </td>
            <td className="px-2 py-2.5 text-right font-mono text-xs text-ink/70 whitespace-nowrap">
              {formatRupees(line.pricePerUnit, { paise: paiseDisplay })}
            </td>
            <td className="px-2 py-2.5 text-right font-mono text-sm font-semibold text-ink whitespace-nowrap tabular-nums">
              {formatRupees(line._lineSubtotal || line._lineTotal, { paise: paiseDisplay })}
            </td>
            {showCostMargin && (
              <td className="px-2 py-2.5 text-right font-mono text-xs text-ink/50 whitespace-nowrap">
                —
              </td>
            )}
            <td className="px-2 py-2.5">
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => onEditLine(line)}
                  className="p-1 rounded text-ink/40 hover:text-primary hover:bg-primary/5 transition-colors"
                  title={t('common.edit')}
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => onRemoveLine(line._id)}
                  className="p-1 rounded text-ink/40 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title={t('common.delete')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsSection({ subtotal, taxTotal, roundOff, grandTotal, intraState, loading, paiseDisplay, t }) {
  return (
    <div className={`px-4 py-3 space-y-1.5 text-sm ${loading ? 'opacity-60' : ''}`}>
      <div className="flex justify-between text-ink/60">
        <span>{t('quickSale.subtotal')}</span>
        <span className="font-mono tabular-nums">{formatRupees(subtotal, { paise: paiseDisplay })}</span>
      </div>
      {taxTotal > 0 && (
        <>
          {intraState ? (
            <>
              <div className="flex justify-between text-ink/50 text-xs">
                <span>CGST</span>
                <span className="font-mono tabular-nums">{formatRupees(taxTotal / 2, { paise: paiseDisplay })}</span>
              </div>
              <div className="flex justify-between text-ink/50 text-xs">
                <span>SGST</span>
                <span className="font-mono tabular-nums">{formatRupees(taxTotal / 2, { paise: paiseDisplay })}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-ink/50 text-xs">
              <span>IGST</span>
              <span className="font-mono tabular-nums">{formatRupees(taxTotal, { paise: paiseDisplay })}</span>
            </div>
          )}
        </>
      )}
      {roundOff !== 0 && (
        <div className="flex justify-between text-ink/40 text-xs">
          <span>{t('quickSale.roundOff')}</span>
          <span className="font-mono tabular-nums">{roundOff > 0 ? '+' : ''}{formatRupees(roundOff, { paise: paiseDisplay })}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-base text-ink border-t border-paper-rule pt-2 mt-1">
        <span>{t('quickSale.grandTotal')}</span>
        <span className="font-display tabular-nums">{formatRupees(grandTotal, { paise: paiseDisplay })}</span>
      </div>
    </div>
  );
}

function CustomerRow({ customer, onChangeCustomer, t }) {
  return (
    <button
      type="button"
      onClick={onChangeCustomer}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-paper-rule bg-paper hover:border-primary/40 transition-colors text-left"
    >
      <User size={15} className="text-ink/40 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{customer?.name || t('quickSale.walkIn')}</p>
        {customer?.phone && (
          <p className="text-xs text-ink/40 font-mono truncate">{customer.phone}</p>
        )}
      </div>
      <ChevronDown size={14} className="text-ink/30 flex-shrink-0" />
    </button>
  );
}

function ChargeButton({ grandTotal, paiseDisplay, canCharge, charging, onCharge, t }) {
  return (
    <button
      type="button"
      onClick={onCharge}
      disabled={!canCharge || charging}
      className="w-full h-13 py-3.5 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary-soft active:bg-primary-deep disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
    >
      {charging && <Loader2 size={16} className="animate-spin" />}
      {charging
        ? t('quickSale.charging')
        : `${t('quickSale.charge')} ${formatRupees(grandTotal, { paise: paiseDisplay })}`
      }
    </button>
  );
}
