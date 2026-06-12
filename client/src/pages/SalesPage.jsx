import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchProducts, lookupBarcode } from '../services/productService';
import { createSale, fetchSales, fetchSalesReport, exportTallyXml } from '../services/salesService';
import { getSettings } from '../services/settingsService';
import { ShoppingCart, DollarSign, BarChart3, CalendarDays, Printer, X, Eye, Search, FileText, AlertCircle, ChevronLeft, ChevronRight, Package, MessageCircle, Download, ScanBarcode, ChevronDown, User2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Button, Input, Textarea, EmptyState, ErrorBanner, PageHeader, Skeleton, PaywallOverlay, KpiStrip, StatusGlyph } from '../components/ui';
import { fmtINR2 as fmtINR, fmtDate } from '../utils/format';
import { parseRupees, formatRupees } from '../lib/decimal';
import { formatQty, WEIGHT_UNITS } from '../lib/weight';
import { useWorkspace } from '../hooks/useWorkspace';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

// ─── Number to Words (Indian) ────────────────────────────────────────────────
function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = 'Rupees ' + convert(rupees);
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  result += ' Only';
  return result;
}

// ─── Shared ────────────────────────────────────────────────────────────────────
const Overlay = ({ children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(13,27,42,0.55)', backdropFilter: 'blur(6px)' }}>{children}</div>
);
const Th = ({ children }) => (
  <th className="px-4 py-3 text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider text-left whitespace-nowrap">{children}</th>
);
const SkeletonRow = ({ cols }) => (
  <tr>{Array(cols).fill(0).map((_, i) => (
    <td key={i} className="px-4 py-4"><div className="h-4 bg-paper-rule dark:bg-ink-rule rounded animate-pulse" /></td>
  ))}</tr>
);

// Build a `upi://pay?...` deep link per NPCI spec. The QR encodes this string
// so any UPI app reads payee + amount + reference and pre-fills the screen.
function buildUpiLink({ upiId, payeeName, amount, invoiceNumber }) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName || 'Merchant',
    am: Number(amount || 0).toFixed(2),
    cu: 'INR',
    tn: `Invoice ${invoiceNumber || ''}`.trim(),
  });
  return `upi://pay?${params.toString()}`;
}

// ─── GST Tax Invoice Modal ──────────────────────────────────────────────────
// NOTE: The invoice body uses inline styles intentionally — they are required
// for window.print() to produce a styled PDF without dark mode interference.
//
// Chunk #11 updates:
//   1. Weight display — formatQty(qty, unit, mode) for kg/g/l/ml lines
//   2. Paise toggle — formatRupees(amount, paiseDisplay) from workspace settings
//   3. Round-off line — shown when sale.roundOff is non-zero
//   4. CGST/SGST/IGST split — reads sale.intraState or gst.isInterstate
function InvoiceModal({ sale, upi, onClose }) {
  // [CP] Read workspace prefs for weightDisplay and paiseDisplay (Spec §B.3, §B.8)
  const { prefs } = useWorkspace();
  const weightDisplayMode = prefs.weightDisplay || 'decimal'; // 'mixed' | 'decimal'
  const paiseMode = prefs.paiseDisplay;                       // boolean (true = show paise)

  // Derive intraState from multiple possible field shapes the API may return
  const isInterstate = sale.intraState === false
    ? false
    : (sale.gst?.isInterstate ?? false);

  const upiId = (upi?.upiId || '').trim();
  const showUpiQr = !!upiId && Number(sale.total) > 0;
  const upiLink = showUpiQr
    ? buildUpiLink({
        upiId,
        payeeName: upi?.payeeName || sale.seller?.companyName,
        amount: sale.total,
        invoiceNumber: sale.invoiceNumber,
      })
    : '';

  // GST compliance guard: never show fake seller data on a legal invoice.
  // If seller details are missing, show a clear warning and block PDF/Print/WA.
  const sellerMissing = !sale.seller?.companyName || !sale.seller?.gstin;

  const print = () => window.print();

  // Tax amounts — sum per-line cgst/sgst/igst (new schema) from items[].
  // The legacy top-level sale.gst.cgstAmount is always 0 (never populated by
  // the controller), so we must sum the line-level values instead.
  const cgstAmt = (sale.items || []).reduce((s, it) => s + parseRupees(it.cgst ?? 0), 0);
  const sgstAmt = (sale.items || []).reduce((s, it) => s + parseRupees(it.sgst ?? 0), 0);
  const igstAmt = (sale.items || []).reduce((s, it) => s + parseRupees(it.igst ?? 0), 0);

  // Round-off line (spec §B.3): shown when non-zero, display-only
  const roundOff = parseRupees(sale.roundOff ?? 0);
  const showRoundOff = Math.abs(roundOff) >= 0.005;

  // ── Invoice-specific formatters ──────────────────────────────────────────────

  /** Format a money value respecting workspace paiseDisplay preference */
  const fmtMoney = (val) => {
    const n = parseRupees(val);
    if (!paiseMode) {
      // 'never' mode: round to nearest rupee for display only
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(Math.round(n));
    }
    // 'when-non-zero': show paise only if non-zero fractional part
    const hasPaise = Math.round((n % 1) * 100) !== 0;
    if (paiseMode === 'when-non-zero' && !hasPaise) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(n);
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);
  };

  /** Format a line item qty using the product's unit and workspace weightDisplay mode */
  const fmtLineQty = (qty, unit) => {
    const u = unit || 'pcs';
    if (WEIGHT_UNITS.has(u)) {
      return formatQty(qty, u, weightDisplayMode);
    }
    return formatQty(qty, u, 'decimal');
  };

  const shareWhatsApp = () => {
    const total = sale.totals?.grandTotal ?? sale.totalAmount ?? 0;
    const seller = sale.seller?.companyName || '';
    const text = encodeURIComponent(
      `*Tax Invoice ${sale.invoiceNumber}*\n` +
      `From: ${seller}\n` +
      `Date: ${fmtDate(sale.createdAt)}\n` +
      `Amount: ${fmtINR(total)}\n\n` +
      `Thank you for your business!`
    );
    const phone = (sale.customer?.phone || '').replace(/\D/g, '');
    const url = phone ? `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <Overlay>
      {/* Modal chrome: bg-white in both modes — the invoice must print white */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-paper-rule overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-paper-rule no-print gap-4">
          <div className="min-w-0">
            <h3 className="font-bold text-ink text-sm leading-tight">Tax Invoice</h3>
            <p className="text-xs text-ink/50 font-mono mt-0.5">{sale.invoiceNumber}</p>
          </div>
          {/* Action buttons — WhatsApp left (primary), Print right (secondary), per CEO #3 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* PRIMARY — WhatsApp CTA uses ledger-green as it's brand-specific */}
            <button
              onClick={shareWhatsApp}
              disabled={sellerMissing}
              title={sellerMissing ? 'Configure company details in Settings first' : 'Send invoice via WhatsApp'}
              className="flex items-center gap-2 h-10 px-5 bg-[#2E7D32] text-white rounded-xl text-sm font-bold hover:bg-[#1B5E20] transition-colors active:scale-[0.98] shadow-sm shadow-[#2E7D32]/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageCircle size={16} />
              <span>Send on WhatsApp</span>
            </button>
            {/* SECONDARY — Print */}
            <button
              onClick={print}
              disabled={sellerMissing}
              title={sellerMissing ? 'Configure company details in Settings first' : 'Print / Save PDF'}
              className="flex items-center gap-1.5 h-10 px-4 border border-paper-rule text-ink rounded-xl text-sm font-semibold hover:bg-paper hover:border-paper-rule/80 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-ink/40 hover:bg-paper flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        </div>
        {/* GST compliance warning when seller details are missing */}
        {sellerMissing && (
          <div className="no-print px-6 py-3 bg-primary/8 border-b border-primary/25 flex items-center gap-3">
            <AlertCircle size={16} className="text-primary flex-shrink-0" />
            <p className="text-sm text-primary font-medium">
              Your company details (name, GSTIN) are missing.{' '}
              <a href="/settings" className="underline font-bold">Configure in Settings</a>
              {' '}before printing or sharing this invoice. Invoices with missing GSTIN are not legally valid.
            </p>
          </div>
        )}
        <div className="invoice-print overflow-y-auto p-6">
          {/* Tax Invoice Title */}
          <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 900, letterSpacing: '2px', borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '16px' }}>
            TAX INVOICE
          </div>

          {/* Seller + Buyer Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            {/* Seller */}
            <div style={{ width: '48%' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Seller</p>
              <p style={{ fontWeight: 900, fontSize: '16px', color: '#4f46e5' }}>{sale.seller?.companyName || '—'}</p>
              <p style={{ fontSize: '11px', color: '#64748b' }}>GSTIN: {sale.seller?.gstin || '—'}</p>
              {sale.seller?.address && <p style={{ fontSize: '11px', color: '#64748b' }}>{sale.seller.address}</p>}
              {sale.seller?.state && <p style={{ fontSize: '11px', color: '#64748b' }}>State: {sale.seller.state}</p>}
            </div>
            {/* Buyer */}
            <div style={{ width: '48%' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Buyer</p>
              <p style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{sale.customer?.name || 'Walk-in Customer'}</p>
              {sale.customer?.gstin && <p style={{ fontSize: '11px', color: '#64748b' }}>GSTIN: {sale.customer.gstin}</p>}
              {sale.customer?.address && <p style={{ fontSize: '11px', color: '#64748b' }}>{sale.customer.address}</p>}
              {sale.customer?.state && <p style={{ fontSize: '11px', color: '#64748b' }}>State: {sale.customer.state}</p>}
              {sale.customer?.email && <p style={{ fontSize: '11px', color: '#64748b' }}>{sale.customer.email}</p>}
              {sale.customer?.phone && <p style={{ fontSize: '11px', color: '#64748b' }}>Phone: {sale.customer.phone}</p>}
            </div>
          </div>

          {/* Invoice Meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Invoice No: </span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{sale.invoiceNumber}</span>
            </div>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Date: </span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmtDate(sale.createdAt)}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#2E7D32]/15 text-[#2E7D32]">{sale.status}</span>
            </div>
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'center', width: '30px' }}>#</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'center' }}>HSN</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'center' }}>Qty</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'right' }}>Rate</th>
                {isInterstate ? (
                  <>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'center' }}>IGST %</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'right' }}>IGST Amt</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'center' }}>CGST %</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'right' }}>CGST Amt</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'center' }}>SGST %</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'right' }}>SGST Amt</th>
                  </>
                )}
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', textTransform: 'uppercase', color: '#475569', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, i) => {
                // [CP] Chunk #11 — use item-level CGST/SGST/IGST if present (set by
                // new sale API); otherwise compute from invoice-level rates for backward
                // compatibility with sales created before the schema update.
                const qty          = parseRupees(item.quantity ?? item.qty ?? 0);
                const unitPrice    = parseRupees(item.unitPrice ?? item.price ?? 0);
                const lineSubtotal = unitPrice * qty;

                const cgstRate = item.cgstRate ?? sale.gst?.cgstRate ?? 9;
                const sgstRate = item.sgstRate ?? sale.gst?.sgstRate ?? 9;
                const igstRate = item.igstRate ?? sale.gst?.igstRate ?? 18;

                // Read per-line tax amounts from correct field names (cgst/sgst/igst,
                // not the legacy cgstAmount/sgstAmount). Fall back to computed only if
                // these fields are genuinely absent (pre-migration invoices).
                const lineCgst = isInterstate ? 0
                  : (parseRupees(item.cgst ?? item.cgstAmount ?? null) || (lineSubtotal * cgstRate) / 100);
                const lineSgst = isInterstate ? 0
                  : (parseRupees(item.sgst ?? item.sgstAmount ?? null) || (lineSubtotal * sgstRate) / 100);
                const lineIgst = isInterstate
                  ? (parseRupees(item.igst ?? item.igstAmount ?? null) || (lineSubtotal * igstRate) / 100)
                  : 0;
                const lineTotal = lineSubtotal + (isInterstate ? lineIgst : lineCgst + lineSgst);

                // [CP] Chunk #11 — weight display: for kg/g/l/ml use formatQty with mode
                const itemUnit = item.unit || 'pcs';
                const qtyDisplay = fmtLineQty(qty, itemUnit);

                return (
                  <tr key={i}>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      {item.productName}
                      <br /><span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{item.sku}</span>
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11px' }}>{item.hsnCode || '—'}</td>
                    {/* [CP] Chunk #11 — qty cell uses weight-aware display */}
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontFamily: 'monospace' }}>{qtyDisplay}</td>
                    {/* [CP] Chunk #11 — price uses fmtMoney (paise toggle) */}
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{fmtMoney(unitPrice)}</td>
                    {isInterstate ? (
                      <>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{igstRate}%</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{fmtMoney(lineIgst)}</td>
                      </>
                    ) : (
                      <>
                        {/* [CP] Chunk #11 — CGST and SGST shown separately (not combined) */}
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{cgstRate}%</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{fmtMoney(lineCgst)}</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{sgstRate}%</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{fmtMoney(lineSgst)}</td>
                      </>
                    )}
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{fmtMoney(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tax Summary + UPI QR (when configured) */}
          <div style={{ display: 'flex', justifyContent: showUpiQr ? 'space-between' : 'flex-end', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
            {showUpiQr && (
              <div style={{ flex: '0 0 auto', textAlign: 'center', padding: '10px 12px', border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: '8px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Scan & Pay via UPI</p>
                <div style={{ background: '#ffffff', padding: '8px', display: 'inline-block', borderRadius: '6px', border: '1px solid #e0e7ff' }}>
                  <QRCodeSVG value={upiLink} size={120} level="M" includeMargin={false} />
                </div>
                <p style={{ fontSize: '10px', color: '#475569', marginTop: '6px' }}>UPI ID: <strong style={{ fontFamily: 'monospace', color: '#1e293b' }}>{upiId}</strong></p>
                <p style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Works with PhonePe / GPay / Paytm</p>
              </div>
            )}
            <table style={{ width: '300px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                {/* [CP] Chunk #11 — all money cells use fmtMoney (paise toggle) */}
                <tr>
                  <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', color: '#475569' }}>Subtotal</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(sale.subtotal)}</td>
                </tr>
                {parseRupees(sale.discount) > 0 && (
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', color: '#059669' }}>Discount</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600, color: '#059669' }}>-{fmtMoney(sale.discount)}</td>
                  </tr>
                )}
                {/* [CP] Chunk #11 — CGST/SGST shown separately (intraState); IGST for interstate */}
                {isInterstate ? (
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', color: '#475569' }}>IGST ({sale.gst?.igstRate || 18}%)</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(igstAmt)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', color: '#475569' }}>CGST ({sale.gst?.cgstRate || 9}%)</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(cgstAmt)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', color: '#475569' }}>SGST ({sale.gst?.sgstRate || 9}%)</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(sgstAmt)}</td>
                    </tr>
                  </>
                )}
                {/* [CP] Chunk #11 — Round-off line: shown between tax and grand total when non-zero */}
                {showRoundOff && (
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', color: '#64748b', fontStyle: 'italic' }}>Round Off</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600, color: roundOff >= 0 ? '#059669' : '#dc2626' }}>
                      {roundOff >= 0 ? '+' : ''}{fmtMoney(roundOff)}
                    </td>
                  </tr>
                )}
                <tr style={{ background: '#f1f5f9' }}>
                  <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', fontWeight: 900, fontSize: '14px' }}>Grand Total</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 900, fontSize: '14px', color: '#4f46e5' }}>{fmtMoney(sale.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Amount in Words — [CP] Chunk #11: grand total includes round-off */}
          <div style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Amount in Words: </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', fontStyle: 'italic' }}>
              {numberToWords(parseRupees(sale.total))}
            </span>
          </div>

          {/* Notes */}
          {sale.notes && (
            <div style={{ marginBottom: '16px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
              <strong>Notes:</strong> {sale.notes}
            </div>
          )}

          {/* Terms & Conditions */}
          <div style={{ marginTop: '20px', fontSize: '10px', color: '#94a3b8' }}>
            <p style={{ fontWeight: 700, marginBottom: '4px' }}>Terms &amp; Conditions:</p>
            <ol style={{ paddingLeft: '16px', margin: 0 }}>
              <li>Goods once sold will not be taken back or exchanged.</li>
              <li>Payment is due within 30 days of invoice date.</li>
              <li>Interest at 18% p.a. will be charged on overdue amounts.</li>
              <li>Subject to local jurisdiction only.</li>
            </ol>
          </div>

          {/* Authorized Signatory */}
          <div style={{ marginTop: '50px', textAlign: 'right', paddingRight: '40px' }}>
            <div style={{ borderTop: '1px solid #cbd5e1', display: 'inline-block', paddingTop: '8px', minWidth: '200px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Authorized Signatory</p>
              <p style={{ fontSize: '10px', color: '#94a3b8' }}>{sale.seller?.companyName || ''}</p>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── New Sale / Cart Modal (GST) ─────────────────────────────────────────────
function NewSaleModal({ products, onClose, onSubmit }) {
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', gstin: '', address: '', state: '' });
  const [cartItems, setCart] = useState([]);
  const [isInterstate, setIsInterstate] = useState(false);
  const [cgstRate, setCgstRate] = useState(9);
  const [sgstRate, setSgstRate] = useState(9);
  const [igstRate, setIgstRate] = useState(18);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [scan, setScan] = useState('');
  const [scanMsg, setScanMsg] = useState({ kind: '', text: '' });
  // Collapsible customer details — most kirana sales are walk-ins
  const [showCustomer, setShowCustomer] = useState(false);

  // Refs for keyboard shortcuts
  const scanInputRef = useRef(null);

  // Global keyboard shortcuts while modal is open:
  //   F2  → focus scanner/search input
  //   F4  → toggle GST interstate/intrastate
  //   F9  → save invoice
  //   Esc → close (handled by Overlay/parent)
  useEffect(() => {
    const handleKey = (e) => {
      if (saving) return;
      if (e.key === 'F2') {
        e.preventDefault();
        scanInputRef.current?.focus();
        scanInputRef.current?.select();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        setIsInterstate(v => !v);
      }
      if (e.key === 'F9') {
        e.preventDefault();
        if (cartItems.length > 0) submit();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, cartItems.length]);

  const filteredProducts = products.filter(p =>
    p.stock > 0 && (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredStates = INDIAN_STATES.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()));

  const addToCart = (product) => {
    setCart(c => {
      const exists = c.find(i => i.productId === product._id);
      if (exists) return c.map(i => i.productId === product._id ? { ...i, quantity: Math.min(i.quantity + 1, product.stock) } : i);
      return [...c, { productId: product._id, productName: product.name, sku: product.sku, quantity: 1, unitPrice: product.price, maxStock: product.stock, hsnCode: '' }];
    });
    // Auto-park focus back to scanner after every cart add (F2 flow)
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  // USB barcode scanners "type" the code then send Enter — we capture both in
  // one input. Local pre-loaded products are checked first (instant); on miss
  // we fall back to the by-barcode endpoint so larger inventories still work.
  const handleScan = async () => {
    const code = scan.trim();
    if (!code) return;
    setScanMsg({ kind: '', text: '' });

    const local = products.find(p => p.barcode && p.barcode === code);
    if (local) {
      if (local.stock <= 0) {
        setScanMsg({ kind: 'err', text: `${local.name} is out of stock.` });
      } else {
        addToCart(local);
        setScanMsg({ kind: 'ok', text: `Added: ${local.name}` });
      }
      setScan('');
      return;
    }

    try {
      const { data } = await lookupBarcode(code);
      const p = data?.data;
      if (!p) {
        setScanMsg({ kind: 'err', text: `No product matches barcode ${code}.` });
      } else if (p.stock <= 0) {
        setScanMsg({ kind: 'err', text: `${p.name} is out of stock.` });
      } else {
        addToCart(p);
        setScanMsg({ kind: 'ok', text: `Added: ${p.name}` });
      }
    } catch (e) {
      setScanMsg({ kind: 'err', text: e?.response?.data?.message || `No product matches barcode ${code}.` });
    } finally {
      setScan('');
    }
  };

  const updateQty = (productId, qty) => {
    if (qty < 1) return removeFromCart(productId);
    setCart(c => c.map(i => i.productId === productId ? { ...i, quantity: Math.min(qty, i.maxStock) } : i));
  };

  const updateHsn = (productId, hsnCode) => {
    setCart(c => c.map(i => i.productId === productId ? { ...i, hsnCode } : i));
  };

  const removeFromCart = (productId) => setCart(c => c.filter(i => i.productId !== productId));

  const subtotal = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const taxableAmount = subtotal - discount;
  const cgstAmount = isInterstate ? 0 : (taxableAmount * cgstRate) / 100;
  const sgstAmount = isInterstate ? 0 : (taxableAmount * sgstRate) / 100;
  const igstAmount = isInterstate ? (taxableAmount * igstRate) / 100 : 0;
  const taxAmount = isInterstate ? igstAmount : cgstAmount + sgstAmount;
  const total = taxableAmount + taxAmount;
  const taxRate = isInterstate ? igstRate : cgstRate + sgstRate;

  const submit = async () => {
    if (cartItems.length === 0) return setErr('Add at least one product to the cart.');
    setSaving(true); setErr('');
    try {
      await onSubmit({
        customer: { name: customer.name, email: customer.email, phone: customer.phone, gstin: customer.gstin, address: customer.address, state: customer.state },
        items: cartItems.map(({ maxStock, productName, sku, ...rest }) => ({ ...rest, unitPrice: Number(rest.unitPrice), quantity: Number(rest.quantity), hsnCode: rest.hsnCode || '' })),
        taxRate,
        gst: { isInterstate, cgstRate, sgstRate, igstRate, cgstAmount, sgstAmount, igstAmount },
        discount,
        notes,
      });
      onClose();
    } catch (ex) { setErr(ex?.response?.data?.message || 'Failed to create sale.'); setSaving(false); }
  };

  return (
    <Overlay>
      <div className="bg-paper-card dark:bg-ink-card rounded-xl shadow-2xl w-full max-w-5xl border border-paper-rule dark:border-ink-rule overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-paper-rule dark:border-ink-rule">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center"><FileText size={20} /></div>
            <div>
              <h3 className="font-display font-semibold text-ink dark:text-paper">New GST Invoice</h3>
              <p className="text-xs text-ink/40 dark:text-paper/40">Build cart and generate tax invoice</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Keyboard shortcut hints */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-ink/40 dark:text-paper/40">
              <span><kbd className="px-1.5 py-0.5 rounded bg-paper-rule dark:bg-ink-rule font-mono">F2</kbd> Scan</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-paper-rule dark:bg-ink-rule font-mono">F4</kbd> GST</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-paper-rule dark:bg-ink-rule font-mono">F9</kbd> Save</span>
            </div>
            <button onClick={onClose} className="text-ink/40 dark:text-paper/40 hover:text-ink/70 dark:hover:text-paper/70 p-1 rounded-lg hover:bg-paper dark:hover:bg-ink transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Product Picker */}
          <div className="w-1/2 border-r border-paper-rule dark:border-ink-rule flex flex-col p-4 gap-3">
            {/* Barcode scan-to-sell — autoFocus so a USB scanner just types the
                code and presses Enter. The cashier never has to click.
                F2 always returns focus here. */}
            <div>
              <div className="relative">
                <ScanBarcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2E7D32] dark:text-[#4CAF50]" />
                <input
                  ref={scanInputRef}
                  value={scan}
                  onChange={e => setScan(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
                  autoFocus
                  placeholder="Scan barcode / F2 to focus"
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-[#2E7D32]/30 dark:border-[#2E7D32]/50 rounded-xl text-sm bg-[#2E7D32]/5 dark:bg-[#2E7D32]/10 text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 focus:ring-2 focus:ring-[#2E7D32]/30 focus:border-[#2E7D32] outline-none transition-colors font-mono"
                />
              </div>
              {scanMsg.text && (
                <p className={`mt-1.5 text-[11px] font-medium px-2 ${scanMsg.kind === 'ok' ? 'text-[#2E7D32] dark:text-[#4CAF50]' : 'text-primary'}`}>
                  {scanMsg.text}
                </p>
              )}
            </div>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm bg-paper dark:bg-ink text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors" />
            </div>
            <div className="overflow-y-auto space-y-1.5 flex-1 pr-1">
              {filteredProducts.map(p => {
                const inCart = cartItems.find(i => i.productId === p._id);
                return (
                  <button key={p._id} onClick={() => addToCart(p)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${inCart ? 'border-primary/30 bg-primary/5 dark:bg-primary/10' : 'border-paper-rule dark:border-ink-rule hover:border-paper-rule/80 dark:hover:border-ink-rule/80 hover:bg-paper dark:hover:bg-ink'}`}>
                    <Package size={18} className="text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink dark:text-paper text-sm truncate">{p.name}</p>
                      <p className="text-[10px] text-ink/40 dark:text-paper/40 font-mono">{p.sku} · {p.stock} in stock</p>
                    </div>
                    <span className="font-bold text-sm text-ink dark:text-paper flex-shrink-0">{fmtINR(p.price)}</span>
                    {inCart && <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">{inCart.quantity}</span>}
                  </button>
                );
              })}
              {filteredProducts.length === 0 && <p className="text-center text-sm text-ink/40 dark:text-paper/40 py-8">No products in stock match your search</p>}
            </div>
          </div>

          {/* Right: Cart + Summary — scrollable area + sticky action bar */}
          <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex flex-col p-4 gap-3 overflow-y-auto flex-1">
            {/* Customer Info — collapsible. Walk-in is default; toggle for GST buyers. */}
            <div className="rounded-xl border border-paper-rule dark:border-ink-rule overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCustomer(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-paper dark:hover:bg-ink transition-colors"
              >
                <div className="flex items-center gap-2">
                  <User2 size={15} className="text-ink/40 dark:text-paper/40" />
                  <span className="text-xs font-semibold text-ink/70 dark:text-paper/70">
                    {customer.name ? customer.name : 'Walk-in Customer'}
                  </span>
                  {customer.name && (
                    <span className="text-[10px] font-bold text-[#2E7D32] dark:text-[#4CAF50] bg-[#2E7D32]/10 px-1.5 py-0.5 rounded-full">
                      Added
                    </span>
                  )}
                </div>
                <ChevronDown size={14} className={`text-ink/40 dark:text-paper/40 transition-transform duration-150 ${showCustomer ? 'rotate-180' : ''}`} />
              </button>
              {showCustomer && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-paper-rule dark:border-ink-rule pt-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <Input
                      placeholder="Customer Name"
                      value={customer.name}
                      onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))}
                    />
                    <Input
                      placeholder="GSTIN"
                      value={customer.gstin}
                      onChange={e => setCustomer(c => ({ ...c, gstin: e.target.value.toUpperCase() }))}
                      className="font-mono"
                    />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={customer.email}
                      onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))}
                    />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="Phone"
                      value={customer.phone}
                      onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))}
                    />
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Address"
                    value={customer.address}
                    onChange={e => setCustomer(c => ({ ...c, address: e.target.value }))}
                  />
                  <div className="relative">
                    <Input
                      placeholder="State"
                      value={customer.state}
                      onChange={e => { setCustomer(c => ({ ...c, state: e.target.value })); setStateSearch(e.target.value); setShowStateDropdown(true); }}
                      onFocus={() => { setShowStateDropdown(true); setStateSearch(customer.state); }}
                      onBlur={() => setTimeout(() => setShowStateDropdown(false), 200)}
                    />
                    {showStateDropdown && filteredStates.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl shadow-lg max-h-40 overflow-y-auto">
                        {filteredStates.map(s => (
                          <button key={s} type="button"
                            onMouseDown={(e) => { e.preventDefault(); setCustomer(c => ({ ...c, state: s })); setShowStateDropdown(false); }}
                            className="w-full text-left px-3 py-2 text-sm text-ink/70 dark:text-paper/70 hover:bg-primary/5 dark:hover:bg-primary/10 hover:text-primary transition-colors">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cart */}
            <div>
              <p className="text-xs font-semibold text-ink/70 dark:text-paper/70 mb-2">Cart ({cartItems.length})</p>
              {cartItems.length === 0 ? (
                <div className="border-2 border-dashed border-paper-rule dark:border-ink-rule rounded-xl p-6 text-center text-ink/40 dark:text-paper/40 text-sm">Click products on the left to add them</div>
              ) : (
                <div className="space-y-2">
                  {cartItems.map(item => (
                    <div key={item.productId} className="p-3 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-ink dark:text-paper text-sm truncate">{item.productName}</p>
                          <p className="text-xs text-ink/40 dark:text-paper/40">{fmtINR(item.unitPrice)} each</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateQty(item.productId, item.quantity - 1)}
                            className="w-6 h-6 rounded-lg bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink text-sm font-bold flex items-center justify-center transition-colors">-</button>
                          <span className="w-8 text-center font-bold text-ink dark:text-paper text-sm">{item.quantity}</span>
                          <button onClick={() => updateQty(item.productId, item.quantity + 1)}
                            className="w-6 h-6 rounded-lg bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink text-sm font-bold flex items-center justify-center transition-colors">+</button>
                        </div>
                        <span className="font-bold text-ink dark:text-paper text-sm w-20 text-right">{fmtINR(item.unitPrice * item.quantity)}</span>
                        <button onClick={() => removeFromCart(item.productId)} className="text-ink/20 dark:text-paper/20 hover:text-primary transition-colors"><X size={16} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-ink/40 dark:text-paper/40 whitespace-nowrap">HSN:</label>
                        <input type="text" placeholder="HSN Code" value={item.hsnCode} onChange={e => updateHsn(item.productId, e.target.value)}
                          className="w-28 border border-paper-rule dark:border-ink-rule rounded-lg px-2 py-1 text-xs text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* GST Type Toggle */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink/70 dark:text-paper/70">GST Type</p>
              <div className="grid grid-cols-2 gap-2 p-1 bg-paper dark:bg-ink rounded-xl">
                <button onClick={() => setIsInterstate(false)}
                  className={`h-9 px-3 rounded-lg text-sm font-semibold transition-all text-center ${!isInterstate ? 'bg-paper-card dark:bg-ink-card text-primary shadow-sm' : 'text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper'}`}>
                  Intra-State (CGST+SGST)
                </button>
                <button onClick={() => setIsInterstate(true)}
                  className={`h-9 px-3 rounded-lg text-sm font-semibold transition-all text-center ${isInterstate ? 'bg-paper-card dark:bg-ink-card text-primary shadow-sm' : 'text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper'}`}>
                  Inter-State (IGST)
                </button>
              </div>
            </div>

            {/* GST Slab Quick-Select — 5 standard Indian rates */}
            <div>
              <label className="text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-wider block mb-1.5">GST Slab</label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 5, 12, 18, 28].map(rate => {
                  const active = isInterstate ? igstRate === rate : (cgstRate + sgstRate) === rate;
                  return (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        if (isInterstate) setIgstRate(rate);
                        else { setCgstRate(rate / 2); setSgstRate(rate / 2); }
                      }}
                      className={`px-3 h-8 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                        active
                          ? 'bg-primary text-white shadow-sm shadow-primary/25'
                          : 'bg-paper dark:bg-ink text-ink/60 dark:text-paper/60 hover:bg-paper-rule/60 dark:hover:bg-ink-rule/40'
                      }`}
                    >
                      {rate}%
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tax Rates + Discount */}
            <div className="grid grid-cols-3 gap-3">
              {isInterstate ? (
                <Input
                  label="IGST Rate %"
                  type="number"
                  min={0}
                  max={100}
                  value={igstRate}
                  onChange={e => setIgstRate(Number(e.target.value))}
                  className="text-center font-bold"
                />
              ) : (
                <>
                  <Input
                    label="CGST %"
                    type="number"
                    min={0}
                    max={100}
                    value={cgstRate}
                    onChange={e => setCgstRate(Number(e.target.value))}
                    className="text-center font-bold"
                  />
                  <Input
                    label="SGST %"
                    type="number"
                    min={0}
                    max={100}
                    value={sgstRate}
                    onChange={e => setSgstRate(Number(e.target.value))}
                    className="text-center font-bold"
                  />
                </>
              )}
              <Input
                label="Discount (₹)"
                type="number"
                min={0}
                value={discount}
                onChange={e => setDiscount(Number(e.target.value))}
                className="text-center font-bold"
              />
            </div>

            {/* Totals */}
            <div className="bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule p-4 space-y-2 text-sm tabular-nums">
              <div className="flex justify-between text-ink/60 dark:text-paper/60">
                <span>Subtotal</span><span>{fmtINR(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[#2E7D32] dark:text-[#4CAF50]">
                  <span>Discount</span><span>-{fmtINR(discount)}</span>
                </div>
              )}
              {isInterstate ? (
                <div className="flex justify-between text-ink/60 dark:text-paper/60">
                  <span>IGST ({igstRate}%)</span><span>{fmtINR(igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-ink/60 dark:text-paper/60">
                    <span>CGST ({cgstRate}%)</span><span>{fmtINR(cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-ink/60 dark:text-paper/60">
                    <span>SGST ({sgstRate}%)</span><span>{fmtINR(sgstAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-ink dark:text-paper text-base border-t border-paper-rule dark:border-ink-rule pt-2.5 mt-1">
                <span>Total</span><span className="text-primary">{fmtINR(total)}</span>
              </div>
            </div>

            {/* Notes */}
            <Textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)..."
            />
          </div>

          {/* ─── Sticky bottom action bar ─────────────────────────────────── */}
          {/* Always visible: item count, GST toggle, total, F9 Save shortcut   */}
          <div className="flex-shrink-0 border-t border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card px-4 py-3">
            {err && (
              <div className="bg-primary/8 dark:bg-primary/15 text-primary text-xs px-3 py-2 rounded-xl border border-primary/25 flex items-center gap-1.5 mb-3">
                <AlertCircle size={14} />{err}
              </div>
            )}
            <div className="flex items-center gap-3">
              {/* Cart summary */}
              <div className="flex items-center gap-3 flex-1 min-w-0 text-sm text-ink/60 dark:text-paper/60">
                <span className="font-semibold tabular-nums">
                  {cartItems.length === 0 ? 'Cart empty' : `${cartItems.length} item${cartItems.length > 1 ? 's' : ''}`}
                </span>
                <span className="text-ink/20 dark:text-paper/20">·</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-paper dark:bg-ink text-ink/60 dark:text-paper/60">
                  {isInterstate ? `IGST ${igstRate}%` : `GST ${cgstRate + sgstRate}%`}
                </span>
                <span className="font-bold text-ink dark:text-paper tabular-nums">{fmtINR(total)}</span>
              </div>
              {/* Keyboard hint */}
              <span className="hidden md:flex items-center gap-1 text-[10px] text-ink/40 dark:text-paper/40 flex-shrink-0">
                <kbd className="px-1.5 py-0.5 rounded bg-paper-rule dark:bg-ink-rule font-mono">F9</kbd> Save
              </span>
              <Button
                onClick={submit}
                variant="primary"
                loading={saving}
                disabled={saving || cartItems.length === 0}
                size="lg"
                className="flex-shrink-0"
              >
                {saving ? 'Creating…' : 'Create Invoice'}
              </Button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Tally Export Modal ──────────────────────────────────────────────────────
// CAs and accountants will pick a date range (typically a GST month or quarter)
// and download a TallyPrime "Import Data" XML envelope. The server defaults
// to the current month when both fields are blank — keep that as the silent
// default so casual users don't have to think about dates.
function TallyExportModal({ onClose }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const [from, setFrom] = useState(fmt(firstOfMonth));
  const [to, setTo] = useState(fmt(today));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const download = async () => {
    setBusy(true); setErr('');
    try {
      const res = await exportTallyXml({ from, to });
      const blob = new Blob([res.data], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-sales-${from}-to-${to}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Export failed. Try a smaller date range.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="bg-paper-card dark:bg-ink-card rounded-xl shadow-2xl w-full max-w-md border border-paper-rule dark:border-ink-rule overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-paper-rule dark:border-ink-rule">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brass/10 text-brass rounded-xl flex items-center justify-center"><Download size={20} /></div>
            <div>
              <h3 className="font-display font-semibold text-ink dark:text-paper">Export to TallyPrime</h3>
              <p className="text-xs text-ink/40 dark:text-paper/40">XML voucher import for your CA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink/40 dark:text-paper/40 hover:text-ink/70 dark:hover:text-paper/70 p-1 rounded-lg hover:bg-paper dark:hover:bg-ink transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-ink/50 dark:text-paper/50 leading-relaxed">
            Generates a TallyPrime <strong>Import Data</strong> envelope of all <strong>completed</strong> sales in the chosen range. Open Tally → Gateway → Import Data → Vouchers, then point it at the downloaded file.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} max={to} />
            <Input label="To"   type="date" value={to}   onChange={e => setTo(e.target.value)}   min={from} max={fmt(today)} />
          </div>
          <div className="rounded-xl bg-brass/8 dark:bg-brass/15 border border-brass/30 p-3 text-[11px] text-brass-deep dark:text-brass leading-relaxed">
            <strong>Note:</strong> The default ledger names are <code className="font-mono">Sales Account</code>, <code className="font-mono">CGST @ 9%</code>, <code className="font-mono">SGST @ 9%</code>, <code className="font-mono">IGST @ 18%</code>. Make sure these exist in your Tally company, or the import will skip vouchers silently.
          </div>
          {err && (
            <div className="bg-primary/8 dark:bg-primary/15 text-primary text-xs px-3 py-2 rounded-xl border border-primary/25 flex items-center gap-1.5">
              <AlertCircle size={14} />{err}
            </div>
          )}
          <Button onClick={download} variant="primary" loading={busy} disabled={busy || !from || !to} className="w-full py-3">
            {busy ? 'Generating XML...' : 'Download Tally XML'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

// (KPI icon map removed — KpiStrip has no icons)

// ─── Main Sales Page ───────────────────────────────────────────────────────────
export default function SalesPage() {
  const { toast } = useToast();
  const [sales, setSales] = useState([]);
  const [report, setReport] = useState(null);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [page, setPage] = useState(1);
  // Cached so the QR renders instantly when an invoice is opened — settings
  // rarely change and missing them shouldn't block the rest of the page.
  const [upi, setUpi] = useState({ upiId: '', payeeName: '' });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [sRes, rRes, pRes] = await Promise.all([
        fetchSales({ page, limit: 15 }),
        fetchSalesReport(),
        fetchProducts({ limit: 200 }),
      ]);
      setSales(sRes.data.data); setMeta(sRes.data.meta);
      setReport(rRes.data.data); setProducts(pRes.data.data);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.message || 'Failed to load sales data.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  // Settings are scoped to the logged-in user, not paginated like sales —
  // fetch once on mount and keep across pagination.
  useEffect(() => {
    getSettings()
      .then(res => {
        const w = res.data?.data?.workspace || {};
        setUpi({ upiId: w.upiId || '', payeeName: w.payeeName || '' });
      })
      .catch(() => {});
  }, []);

  const handleCreate = async (form) => {
    try {
      const { data } = await createSale(form);
      toast.success(`Invoice ${data.data.invoiceNumber} created — ${fmtINR(data.data.total)}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create invoice.');
      throw e;
    }
  };

  const kpiItems = [
    { label: 'Total Sales',     value: report?.totalSales ?? 0,      format: 'count' },
    { label: 'Total Revenue',   value: report?.totalRevenue ?? 0,    format: 'money' },
    { label: 'Avg Order Value', value: report?.avgOrderValue ?? 0,   format: 'money' },
    { label: "Today's Sales",   value: report?.todaySales ?? 0,      format: 'count' },
  ];

  return (
    <div className="p-6 md:p-8 min-h-screen">
      {modal?.type === 'new' && <NewSaleModal products={products} onClose={() => setModal(null)} onSubmit={handleCreate} />}
      {modal?.type === 'invoice' && <InvoiceModal sale={modal.sale} upi={upi} onClose={() => setModal(null)} />}
      {modal?.type === 'tally' && <TallyExportModal onClose={() => setModal(null)} />}

      <PageHeader
        icon={ShoppingCart}
        title="Sales & Billing"
        description="GST invoice management and revenue tracking"
        actions={
          <div className="flex items-center gap-2">
            <PaywallOverlay plan="growth" feature="Tally Export" className="rounded-xl">
              <button
                onClick={() => setModal({ type: 'tally' })}
                title="Export sales to TallyPrime XML"
                className="inline-flex items-center gap-2 h-10 bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 px-4 rounded-xl font-semibold text-sm border border-paper-rule dark:border-ink-rule hover:bg-paper dark:hover:bg-ink hover:border-paper-rule/80 transition-colors"
              >
                <Download size={16} /> Tally Export
              </button>
            </PaywallOverlay>
            <button onClick={() => setModal({ type: 'new' })}
              className="inline-flex items-center gap-2 h-10 bg-primary text-white px-4 rounded-xl font-semibold text-sm shadow-sm shadow-primary/25 hover:bg-primary/90 transition-colors">
              <FileText size={16} /> New Invoice
            </button>
          </div>
        }
      />

      {error && <div className="mb-5"><ErrorBanner message={error} onRetry={load} onDismiss={() => setError(null)} /></div>}

      {/* KPI Strip — no icon squares */}
      <div className="mb-6">
        <KpiStrip items={kpiItems} loading={loading} />
      </div>

      {/* Top Products + 7-Day Revenue side by side */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top Products */}
          <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Top Selling Products</h3>
            <div className="space-y-3">
              {report.topProducts?.length === 0 && <p className="text-ink/40 dark:text-paper/40 text-sm">No sales data yet.</p>}
              {report.topProducts?.map((p, i) => {
                const maxRev = report.topProducts[0]?.totalRev || 1;
                return (
                  <div key={p._id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-brass/60 dark:text-brass-soft/60 w-4">{i + 1}</span>
                        <span className="text-sm font-semibold text-ink/85 dark:text-paper/85 truncate max-w-[180px]">{p._id}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-ink dark:text-paper">{fmtINR(p.totalRev)}</span>
                        <span className="text-xs text-ink/40 dark:text-paper/40 ml-2">{p.totalQty} units</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-paper-rule dark:bg-ink-rule rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(p.totalRev / maxRev) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7-Day Revenue */}
          <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Last 7 Days Revenue</h3>
            {report.last7Days?.length === 0
              ? <p className="text-ink/40 dark:text-paper/40 text-sm">No sales in the last 7 days.</p>
              : (
                <div className="space-y-2.5">
                  {report.last7Days?.map(d => {
                    const maxRev = Math.max(...(report.last7Days?.map(x => x.revenue) || [1]), 1);
                    return (
                      <div key={d._id} className="flex items-center gap-3">
                        <span className="text-xs text-ink/40 dark:text-paper/40 w-24 flex-shrink-0">{new Date(d._id).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <div className="flex-1 h-2 bg-paper-rule dark:bg-ink-rule rounded-full overflow-hidden">
                          <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(d.revenue / maxRev) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-ink dark:text-paper w-20 text-right">{fmtINR(d.revenue)}</span>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* Sales Table */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden">
        <div className="px-6 py-5 border-b border-paper-rule dark:border-ink-rule flex items-center justify-between">
          <h3 className="text-base font-display font-semibold text-ink dark:text-paper">Invoice History</h3>
          <span className="text-xs text-ink/40 dark:text-paper/40">{loading ? '...' : `${meta.total} invoices`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                {['Invoice #', 'Customer', 'Items', 'Subtotal', 'GST', 'Total', 'Status', 'Date', ''].map(h => <Th key={h}>{h}</Th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
              {loading ? [1, 2, 3, 4, 5, 6].map(i => <SkeletonRow key={i} cols={9} />) :
                sales.length === 0
                  ? <tr><td colSpan={9} className="py-12">
                      <EmptyState
                        icon={ShoppingCart}
                        title="अभी तक कोई बिक्री नहीं · No sales yet."
                        description="Pehla invoice banayein to start tracking revenue."
                        action={
                          <button onClick={() => setModal({ type: 'new' })}
                            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-primary/25 hover:bg-primary/90 transition-colors">
                            <FileText size={16} /> New Invoice
                          </button>
                        }
                      />
                    </td></tr>
                  : sales.map(sale => (
                    <tr key={sale._id} className="hover:bg-paper/60 dark:hover:bg-ink-card/60 transition-colors group">
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-ink/60 dark:text-paper/60 tracking-[0.04em]">{sale.invoiceNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink dark:text-paper text-sm">{sale.customer?.name || 'Walk-in'}</p>
                        {sale.customer?.email && (
                          <p className="font-mono text-xs text-ink/60 dark:text-paper/60">{sale.customer.email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink/60 dark:text-paper/60">{sale.items.length} item{sale.items.length !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 font-mono text-sm text-ink/70 dark:text-paper/70 tabular-nums">{fmtINR(sale.subtotal)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-ink/50 dark:text-paper/50 tabular-nums">{fmtINR(sale.taxAmount)}</td>
                      <td className="px-4 py-3 font-mono font-bold text-ink dark:text-paper tabular-nums">{fmtINR(sale.total)}</td>
                      <td className="px-4 py-3">
                        <StatusGlyph variant={
                          sale.status === 'paid' || sale.status === 'completed' ? 'paid'
                          : sale.status === 'void' || sale.status === 'cancelled' ? 'void'
                          : 'due'
                        } label={sale.status?.toUpperCase()} />
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink/60 dark:text-paper/60 whitespace-nowrap">{fmtDate(sale.createdAt)}</td>
                      <td className="px-4 py-4">
                        <button onClick={() => setModal({ type: 'invoice', sale })}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-ink/20 dark:text-paper/20 hover:bg-primary hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        {!loading && meta.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-paper-rule dark:border-ink-rule bg-paper/50 dark:bg-ink/50 flex items-center justify-between">
            <p className="text-xs text-ink/40 dark:text-paper/40">Showing {sales.length} of {meta.total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink disabled:opacity-40 transition-colors">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold border transition-colors ${n === page ? 'bg-primary text-white border-primary' : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink'}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink disabled:opacity-40 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
