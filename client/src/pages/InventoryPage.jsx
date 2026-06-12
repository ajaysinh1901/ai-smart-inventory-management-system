import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../hooks/useInventory';
import { useWorkspace } from '../hooks/useWorkspace';
import { fmtINR } from '../utils/format';
import { parseRupees, formatRupees } from '../lib/decimal';
import { formatQty, UNIT_STEP, UNIT_SUFFIX, WEIGHT_UNITS, AUTO_WEIGHT_UNITS, isWeightUnit, isWholeNumber } from '../lib/weight';
import {
  Package, Search, X, Plus, Pencil, Trash2,
  Info, ArrowUpDown, MoreVertical, ChevronLeft, ChevronRight, RefreshCw,
  ExternalLink, AlertCircle, Warehouse
} from 'lucide-react';
import { Button, Input, Select, EmptyState, ErrorBanner, PageHeader, Skeleton, KpiStrip, StatusGlyph, Money } from '../components/ui';
import { createStockAdjustment } from '../services/stockAdjustmentService';

// ─── constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['Electronics', 'Display', 'Networking', 'Accessories', 'Storage', 'Audio', 'Other'];

const UNIT_CODES = ['pcs', 'kg', 'g', 'l', 'ml', 'dozen', 'box', 'packet'];

const HSN_REGEX = /^(\d{4}|\d{6}|\d{8}|)$/;

// stockStatus is a virtual returned by the backend; fall back to local calc for legacy docs.
const resolveStockStatus = (p) => {
  if (p.stockStatus) return p.stockStatus;
  const stock   = parseRupees(p.stock);
  const reorder = parseRupees(p.reorderLevel ?? p.lowStockThreshold);
  if (stock < 0) return 'oversold';
  if (stock === 0) return 'out';
  if (reorder > 0 && stock <= reorder) return 'low';
  return 'healthy';
};

// Map stockStatus → StatusGlyph variant (which uses in-stock/low-stock/out variants)
const statusVariantMap = { healthy: 'in-stock', low: 'low-stock', out: 'out', oversold: 'out' };
const getStatusVariant = (p) => statusVariantMap[resolveStockStatus(p)] || 'in-stock';

// ─── Auto-SKU generator ───────────────────────────────────────────────────────
const genSKU = (name = '', category = '') => {
  const pfx = (category.slice(0, 3) || 'PRD').toUpperCase();
  const mid = name.replace(/\s+/g, '').slice(0, 4).toUpperCase() || 'ITEM';
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${pfx}-${mid}-${num}`;
};

// ─── Shared primitives ────────────────────────────────────────────────────────
const Overlay = ({ children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(13,27,42,0.55)', backdropFilter: 'blur(6px)' }}>
    {children}
  </div>
);
const ModalBox = ({ children, small }) => (
  <div className={`bg-paper-card dark:bg-ink-card rounded-xl shadow-2xl w-full border border-paper-rule dark:border-ink-rule overflow-hidden ${small ? 'max-w-sm' : 'max-w-lg'}`}>{children}</div>
);
const ModalHeader = ({ icon, title, sub, onClose }) => (
  <div className="flex items-center justify-between px-6 py-5 border-b border-paper-rule dark:border-ink-rule">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-primary/10 dark:bg-primary/20 text-primary rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="font-display font-semibold text-ink dark:text-paper">{title}</h3>
        <p className="text-xs text-ink/40 dark:text-paper/40">{sub}</p>
      </div>
    </div>
    <button onClick={onClose} className="text-ink/40 dark:text-paper/40 hover:text-ink/70 dark:hover:text-paper/70 p-1 rounded-lg hover:bg-paper dark:hover:bg-ink transition-colors">
      <X size={20} />
    </button>
  </div>
);
const ErrBox = ({ msg }) => (
  <div className="bg-primary/8 dark:bg-primary/15 text-primary text-sm px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-2">
    <AlertCircle size={18} />{msg}
  </div>
);

// ─── Product Form Modal ───────────────────────────────────────────────────────
function ProductModal({ product, suppliers = [], onClose, onSubmit }) {
  const { t } = useTranslation();
  const isEdit = !!product?._id;

  // Build initial form state — handle both legacy (price/lowStockThreshold) and
  // new schema (pricePerUnit/reorderLevel) field names from the API.
  const [form, setForm] = useState(() => {
    if (isEdit) {
      const unit        = product.unit || 'pcs';
      const sbw         = product.saleByWeight ?? false;
      return {
        name:         product.name,
        sku:          product.sku,
        category:     product.category,
        unit,
        saleByWeight: sbw,
        pricePerUnit: String(parseRupees(product.pricePerUnit ?? product.price)),
        costPrice:    product.costPrice != null ? String(parseRupees(product.costPrice)) : '',
        hsnCode:      product.hsnCode || '',
        barcode:      product.barcode || '',
        stock:        String(parseRupees(product.stock)),
        reorderLevel: String(parseRupees(product.reorderLevel ?? product.lowStockThreshold ?? 0)),
        packSize:     product.packSize != null ? String(parseRupees(product.packSize)) : '',
        tareWeight:   product.tareWeight != null ? String(parseRupees(product.tareWeight)) : '',
        supplierId:   product.supplierId?._id || product.supplierId || '',
      };
    }
    return {
      name: '', sku: '', category: 'Electronics',
      unit: 'pcs', saleByWeight: false,
      pricePerUnit: '', costPrice: '', hsnCode: '', barcode: '',
      stock: '', reorderLevel: '0', packSize: '', tareWeight: '',
      supplierId: '',
    };
  });

  const [touched, setTouched] = useState({});
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const unitSuffix   = UNIT_SUFFIX[form.unit] || form.unit;
  const unitStep     = UNIT_STEP[form.unit] || 1;
  const weightUnit   = isWeightUnit(form.unit);
  const showSBW      = weightUnit;
  const showPackSize = form.unit === 'packet' || form.unit === 'box';
  const showTare     = form.saleByWeight;
  const stockNum     = parseFloat(form.stock) || 0;
  const reorderNum   = parseFloat(form.reorderLevel) || 0;
  const tareNum      = parseFloat(form.tareWeight) || 0;
  const priceNum     = parseFloat(form.pricePerUnit) || 0;

  // Inline validation
  const errors = {
    name:         !form.name?.trim() ? 'Product name is required.' : '',
    sku:          !form.sku?.trim()  ? 'SKU is required.' : '',
    pricePerUnit: priceNum <= 0 ? t('productForm.errors.priceTooLow') : '',
    stock:        (!form.saleByWeight && form.stock !== '' && !isWholeNumber(stockNum))
                    ? t('productForm.errors.qtyMustBeWhole', { unit: unitSuffix })
                    : '',
    reorderLevel: (!form.saleByWeight && form.reorderLevel !== '' && reorderNum !== 0 && !isWholeNumber(reorderNum))
                    ? t('productForm.errors.qtyMustBeWhole', { unit: unitSuffix })
                    : '',
    hsnCode:      form.hsnCode && !HSN_REGEX.test(form.hsnCode.trim())
                    ? t('productForm.errors.hsnFormat')
                    : '',
    costPrice:    form.costPrice !== '' && parseFloat(form.costPrice) < 0
                    ? 'Cost price cannot be negative.'
                    : '',
    tareWeight:   showTare && tareNum > 0 && stockNum > 0 && tareNum >= stockNum
                    ? t('productForm.errors.tareTooLarge')
                    : '',
  };
  const isValid = Object.values(errors).every(e => !e);

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    // Auto-generate SKU on name/category change (create mode only)
    if ((k === 'name' || k === 'category') && !isEdit) {
      next.sku = genSKU(k === 'name' ? v : f.name, k === 'category' ? v : f.category);
    }
    // Unit change: auto-toggle saleByWeight for kg/l; force-off for integer units
    if (k === 'unit') {
      if (AUTO_WEIGHT_UNITS.has(v)) {
        next.saleByWeight = true;
      } else if (!WEIGHT_UNITS.has(v)) {
        next.saleByWeight = false;
        next.tareWeight   = '';
      }
      // Clear packSize when not applicable
      if (v !== 'packet' && v !== 'box') next.packSize = '';
    }
    return next;
  });
  const blur = (k) => setTouched(t => ({ ...t, [k]: true }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setTouched({ name: true, sku: true, pricePerUnit: true, stock: true, hsnCode: true });
    if (!isValid) return;
    setSaving(true);

    // Build API payload — send Decimal128 fields as strings
    const payload = {
      name:         form.name.trim(),
      sku:          form.sku.trim(),
      category:     form.category,
      unit:         form.unit,
      saleByWeight: form.saleByWeight,
      pricePerUnit: String(priceNum),
      costPrice:    form.costPrice !== '' ? String(parseFloat(form.costPrice)) : '0',
      hsnCode:      form.hsnCode.trim(),
      barcode:      form.barcode.trim(),
      stock:        String(stockNum),
      reorderLevel: String(reorderNum),
      ...(showPackSize && form.packSize !== '' ? { packSize: String(parseFloat(form.packSize)) } : { packSize: null }),
      ...(showTare && form.tareWeight !== '' ? { tareWeight: String(tareNum) } : { tareWeight: '0' }),
      supplierId:   form.supplierId || undefined,
    };

    try { await onSubmit(payload); onClose(); }
    catch (ex) { setErr(ex?.response?.data?.message || 'Failed to save.'); setSaving(false); }
  };

  return (
    <Overlay>
      <ModalBox>
        <ModalHeader
          icon={isEdit ? <Pencil size={20} /> : <Plus size={20} />}
          title={isEdit ? t('productForm.editTitle') : t('productForm.addTitle')}
          sub={isEdit ? `SKU: ${product.sku}` : 'Fill in product details'}
          onClose={onClose}
        />
        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto" noValidate>
          {err && <ErrBox msg={err} />}

          {/* Row 1: Name */}
          <Input
            label="Product Name"
            required
            value={form.name}
            onChange={e => set('name', e.target.value)}
            onBlur={() => blur('name')}
            error={touched.name ? errors.name : ''}
            placeholder="e.g. Wheat Flour Loose"
          />

          {/* Row 2: SKU + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                SKU<span className="text-primary ml-0.5">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  value={form.sku}
                  onChange={e => set('sku', e.target.value)}
                  onBlur={() => blur('sku')}
                  className={`flex-1 border rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper outline-none transition-colors font-mono bg-paper-card dark:bg-ink-card focus:ring-2 ${
                    touched.sku && errors.sku
                      ? 'border-primary/50 dark:border-primary/60 focus:ring-primary/20 focus:border-primary'
                      : 'border-paper-rule dark:border-ink-rule focus:ring-primary/15 focus:border-primary'
                  }`}
                />
                {!isEdit && (
                  <button type="button" onClick={() => set('sku', genSKU(form.name, form.category))}
                    className="px-3 py-2 bg-paper dark:bg-ink text-ink/50 dark:text-paper/50 rounded-xl text-xs font-bold hover:bg-paper-rule dark:hover:bg-ink-rule transition-colors" title="Regenerate SKU">
                    <RefreshCw size={16} />
                  </button>
                )}
              </div>
              {touched.sku && errors.sku && (
                <p className="text-xs text-primary font-medium mt-1">{errors.sku}</p>
              )}
            </div>
            <Select label="Category" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          {/* Row 3: Unit + saleByWeight toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div>
              <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                {t('productForm.unit')}
              </label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none"
              >
                {UNIT_CODES.map(code => (
                  <option key={code} value={code}>{t(`productForm.unitOptions.${code}`)}</option>
                ))}
              </select>
            </div>

            {showSBW && (
              <div className="flex flex-col justify-end gap-1">
                <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block">
                  {t('productForm.saleByWeight')}
                </label>
                <div className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.saleByWeight}
                    onClick={() => set('saleByWeight', !form.saleByWeight)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.saleByWeight ? 'bg-primary' : 'bg-paper-rule dark:bg-ink-rule'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      form.saleByWeight ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <span className="text-xs text-ink/60 dark:text-paper/60">{t('productForm.saleByWeightHint')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Row 4: Price per unit + Cost price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t('productForm.pricePerUnit', { unit: unitSuffix })}
              required
              type="number"
              value={form.pricePerUnit}
              onChange={e => set('pricePerUnit', e.target.value)}
              onBlur={() => blur('pricePerUnit')}
              error={touched.pricePerUnit ? errors.pricePerUnit : ''}
              placeholder="0.00"
              min={0.01}
              step={0.01}
            />
            <Input
              label="Cost Price (₹)"
              type="number"
              value={form.costPrice}
              onChange={e => set('costPrice', e.target.value)}
              onBlur={() => blur('costPrice')}
              error={touched.costPrice ? errors.costPrice : ''}
              placeholder="0.00"
              min={0}
              step={0.01}
              helperText="Used for margin and dead-stock reports."
            />
          </div>

          {/* Row 5: Stock + Reorder level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label={t('productForm.stock', { unit: unitSuffix })}
                required={!isEdit}
                type="number"
                value={form.stock}
                onChange={e => set('stock', e.target.value)}
                onBlur={() => blur('stock')}
                error={touched.stock ? errors.stock : ''}
                placeholder={unitStep < 1 ? '0.000' : '0'}
                step={unitStep}
              />
              {form.saleByWeight && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />{t('productForm.negativeStockHint')}
                </p>
              )}
            </div>
            <Input
              label={t('productForm.reorderLevel', { unit: unitSuffix })}
              type="number"
              value={form.reorderLevel}
              onChange={e => set('reorderLevel', e.target.value)}
              onBlur={() => blur('reorderLevel')}
              error={touched.reorderLevel ? errors.reorderLevel : ''}
              placeholder="0"
              min={0}
              step={unitStep}
              helperText={t('productForm.reorderLevelHint')}
            />
          </div>

          {/* Optional: Pack size (packet / box only) */}
          {showPackSize && (
            <Input
              label={t('productForm.packSize', { unit: unitSuffix })}
              type="number"
              value={form.packSize}
              onChange={e => set('packSize', e.target.value)}
              placeholder=""
              min={0.001}
              step={0.001}
              helperText={t('productForm.packSizeHint')}
            />
          )}

          {/* Optional: Tare weight (saleByWeight only) */}
          {showTare && (
            <Input
              label={t('productForm.tareWeight', { unit: unitSuffix })}
              type="number"
              value={form.tareWeight}
              onChange={e => set('tareWeight', e.target.value)}
              onBlur={() => blur('tareWeight')}
              error={touched.tareWeight ? errors.tareWeight : ''}
              placeholder="0.000"
              min={0}
              step={0.001}
              helperText={t('productForm.tareWeightHint')}
            />
          )}

          {/* Row: HSN + Barcode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label={
                  <span className="flex items-center gap-1">
                    HSN / SAC Code
                    {/* TODO: hook up to real CBIC lookup */}
                    <a
                      href="https://www.cbic.gov.in/resources//htdocs-cbec/gst/gst-goods-services-rates.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-[10px] font-semibold flex items-center gap-0.5 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      {t('productForm.hsnLookup')}<ExternalLink size={10} />
                    </a>
                  </span>
                }
                value={form.hsnCode}
                onChange={e => set('hsnCode', e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                onBlur={() => blur('hsnCode')}
                error={touched.hsnCode ? errors.hsnCode : ''}
                placeholder="e.g. 1101"
                className="font-mono"
                helperText="4, 6, or 8 digits. Required for GST invoices."
              />
            </div>
            <Input
              label="Barcode (EAN/UPC)"
              value={form.barcode}
              onChange={e => set('barcode', e.target.value)}
              placeholder="Scan or enter manually"
              className="font-mono"
            />
          </div>

          {/* Supplier */}
          <Select label="Supplier" value={form.supplierId} onChange={e => set('supplierId', e.target.value)}>
            <option value="">— No Supplier —</option>
            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={saving || !isValid}
              className="flex-1"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Product'}
            </Button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteModal({ product, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const go = async () => { setDeleting(true); try { await onConfirm(); onClose(); } catch { setDeleting(false); } };
  return (
    <Overlay>
      <ModalBox small>
        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={28} className="text-primary" />
          </div>
          <h3 className="font-bold text-ink dark:text-paper text-lg mb-1">Delete Product?</h3>
          <p className="text-sm text-ink/60 dark:text-paper/60 mb-6">Permanently remove <strong className="text-ink/80 dark:text-paper/80">{product.name}</strong> from the inventory ledger. This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors">Cancel</button>
            <button onClick={go} disabled={deleting} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-deep transition-colors disabled:opacity-60">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Stock-in Variance Modal (Spec §B.5, §D #10) ─────────────────────────────
// When a shop receives a purchase, they enter invoiced qty and actual (received) qty.
// If they differ, the UI shows a yellow variance banner and posts a StockAdjustment
// with reason='purchase-variance'. If the product is NOT saleByWeight, only one qty
// field is shown (invoiced = received; no variance workflow needed).
const PURCHASE_VARIANCE_REASONS = [
  { value: 'purchase-variance', label: 'Purchase Variance (supplier underdelivered)' },
  { value: 'damage',            label: 'Damage / Spoilage' },
];

function StockInVarianceModal({ product, suppliers = [], onClose }) {
  const unit         = product.unit || 'pcs';
  const unitSuffix   = UNIT_SUFFIX[unit] || unit;
  const unitStep     = UNIT_STEP[unit] || 1;
  const isWeight     = isWeightUnit(unit);

  const [invoicedQty, setInvoicedQty] = useState('');
  const [actualQty,   setActualQty]   = useState('');
  const [reason,      setReason]      = useState('purchase-variance');
  const [reasonDetail, setReasonDetail] = useState('');
  const [supplierId,  setSupplierId]  = useState(product.supplierId?._id || product.supplierId || '');
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const [success,     setSuccess]     = useState(false);

  const invNum  = parseFloat(invoicedQty) || 0;
  const actNum  = parseFloat(actualQty)   || 0;
  // variance = actual - invoiced. Negative means short delivery.
  const variance     = isWeight ? actNum - invNum : 0;
  const hasVariance  = isWeight && invoicedQty !== '' && actualQty !== '' && Math.abs(variance) >= 0.001;
  const effectiveQty = isWeight ? actNum : invNum; // what actually goes to stock

  const canSubmit = isWeight
    ? invNum > 0 && actNum > 0
    : invNum > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErr('');
    try {
      // Always post the actual received qty as stock-in
      await createStockAdjustment({
        productId:    product._id,
        qtyChange:    String(effectiveQty),
        reason:       hasVariance ? reason : 'manual',
        reasonDetail: hasVariance
          ? (reasonDetail || `Invoiced: ${invNum} ${unitSuffix}, Received: ${actNum} ${unitSuffix}`)
          : `Stock-in: ${actNum || invNum} ${unitSuffix}`,
        supplierId:   supplierId || undefined,
      });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (ex) {
      setErr(ex?.response?.data?.message || 'Failed to record stock-in. Please retry.');
      setSaving(false);
    }
  };

  return (
    <Overlay>
      <ModalBox>
        <ModalHeader
          icon={<Warehouse size={20} />}
          title="Stock In — Purchase Received"
          sub={`${product.name} · ${product.sku}`}
          onClose={onClose}
        />
        <div className="p-6 space-y-5">
          {success ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-[#2E7D32]/15 flex items-center justify-center mx-auto mb-3">
                <Package size={22} className="text-[#2E7D32]" />
              </div>
              <p className="font-semibold text-ink dark:text-paper">Stock updated!</p>
              <p className="text-sm text-ink/50 dark:text-paper/50 mt-1">
                +{formatQty(effectiveQty, unit)} added to {product.name}
              </p>
            </div>
          ) : (
            <>
              {err && <ErrBox msg={err} />}

              {/* Supplier picker */}
              {suppliers.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                    Supplier (optional)
                  </label>
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none"
                  >
                    <option value="">— No Supplier —</option>
                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Invoiced qty — always shown */}
              <div>
                <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                  {isWeight ? `Invoiced Qty (${unitSuffix}) — what supplier billed` : `Qty Received (${unitSuffix})`}
                </label>
                <input
                  type="number"
                  min={unitStep}
                  step={unitStep}
                  value={invoicedQty}
                  onChange={e => {
                    setInvoicedQty(e.target.value);
                    // Default actual = invoiced when user hasn't typed it yet
                    if (!isWeight) setActualQty(e.target.value);
                  }}
                  placeholder={unitStep < 1 ? '0.000' : '0'}
                  className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-3 text-xl font-bold text-center text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none"
                />
              </div>

              {/* Actual / received qty — only for weight products */}
              {isWeight && (
                <div>
                  <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                    Actual Received Qty ({unitSuffix}) — what your scale showed
                  </label>
                  <input
                    type="number"
                    min={unitStep}
                    step={unitStep}
                    value={actualQty}
                    onChange={e => setActualQty(e.target.value)}
                    placeholder={unitStep < 1 ? '0.000' : '0'}
                    className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-3 text-xl font-bold text-center text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none"
                  />
                </div>
              )}

              {/* Variance banner — shown when actual ≠ invoiced */}
              {hasVariance && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                      Variance: {variance >= 0 ? '+' : ''}{formatQty(variance, unit)}
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                    {variance < 0
                      ? `Supplier delivered ${formatQty(Math.abs(variance), unit)} less than invoiced. Stock will be updated with actual received qty.`
                      : `Supplier delivered ${formatQty(variance, unit)} more than invoiced.`}
                  </p>

                  {/* Reason selector — auto-selected to purchase-variance */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                      Variance Reason
                    </label>
                    {PURCHASE_VARIANCE_REASONS.map(r => (
                      <label key={r.value} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="variance-reason"
                          value={r.value}
                          checked={reason === r.value}
                          onChange={() => setReason(r.value)}
                          className="accent-amber-600"
                        />
                        <span className="text-sm text-amber-800 dark:text-amber-300">{r.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Optional detail note */}
                  <div className="mt-3">
                    <input
                      type="text"
                      value={reasonDetail}
                      onChange={e => setReasonDetail(e.target.value)}
                      placeholder="Optional note (e.g. wet sack, transit damage)"
                      className="w-full border border-amber-300 dark:border-amber-600/50 rounded-xl px-3 py-2 text-sm text-amber-900 dark:text-amber-200 bg-white dark:bg-amber-900/30 placeholder:text-amber-400 focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Preview */}
              {canSubmit && (
                <div className="flex items-center justify-between p-3 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule text-sm">
                  <span className="text-ink/50 dark:text-paper/50">Stock will increase by:</span>
                  <span className="font-extrabold text-lg tabular-nums font-mono text-[#2E7D32] dark:text-[#4CAF50]">
                    +{formatQty(effectiveQty, unit)}
                  </span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={saving || !canSubmit}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {saving ? 'Recording…' : 'Confirm Stock In'}
                </button>
              </div>
            </>
          )}
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Stock Adjust ─────────────────────────────────────────────────────────────
function StockModal({ product, onClose, onConfirm }) {
  const unit         = product.unit || 'pcs';
  // For weight-based units (kg, l) allow decimal adjustments (e.g. 0.5 kg).
  // For whole-unit products (pcs, dozen, box, packet) enforce minimum of 1.
  const unitStep     = UNIT_STEP[unit] || 1;
  const minQty       = isWeightUnit(unit) ? unitStep : 1;

  const [qty,  setQty]  = useState(minQty);
  const [type, setType] = useState('increase');
  const [saving, setSaving] = useState(false);

  const go = async () => {
    if (qty < minQty) return;
    setSaving(true);
    try { await onConfirm(qty, type); onClose(); } catch { setSaving(false); }
  };

  const currentStock = parseRupees(product.stock);
  const newStock     = type === 'increase' ? currentStock + qty : currentStock - qty;

  return (
    <Overlay>
      <ModalBox small>
        <ModalHeader icon={<ArrowUpDown size={20} />} title="Adjust Stock" sub={`${product.name} · Current: ${formatQty(currentStock, unit)}`} onClose={onClose} />
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            {[['increase', '+ Stock In', 'bg-brass text-ink border-brass'],
              ['decrease', '− Stock Out', 'bg-primary text-white border-primary']].map(([t, label, active]) => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${type === t ? active : 'border-paper-rule dark:border-ink-rule text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink'}`}>
                {label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">Quantity</label>
            <input
              type="number"
              min={minQty}
              step={unitStep}
              value={qty}
              onChange={e => setQty(Math.max(minQty, Number(e.target.value)))}
              className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-3 text-2xl font-extrabold text-center text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none" />
          </div>
          <div className="flex items-center justify-between p-3 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule text-sm">
            <span className="text-ink/50 dark:text-paper/50">New stock after adjustment:</span>
            <span className={`font-extrabold text-lg tabular-nums font-mono ${newStock < 0 ? 'text-primary' : newStock === 0 ? 'text-primary' : 'text-[#2E7D32] dark:text-[#4CAF50]'}`}>
              {formatQty(newStock, unit)}
            </span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors">Cancel</button>
            <button onClick={go} disabled={saving}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? 'Updating…' : 'Confirm'}
            </button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Product Detail Drawer ────────────────────────────────────────────────────
function DetailModal({ product, onClose, onEdit, onAdjust }) {
  const stVariant   = getStatusVariant(product);
  const unit        = product.unit || 'pcs';
  const stockNum    = parseRupees(product.stock);
  const priceNum    = parseRupees(product.pricePerUnit ?? product.price);
  const reorderNum  = parseRupees(product.reorderLevel ?? product.lowStockThreshold ?? 0);
  const totalValue  = priceNum * stockNum;

  return (
    <Overlay>
      <ModalBox>
        <ModalHeader icon={<Info size={20} />} title="Product Details" sub={`SKU: ${product.sku}`} onClose={onClose} />
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="text-xl font-bold text-ink dark:text-paper">{product.name}</h3>
              <p className="text-sm text-ink/50 dark:text-paper/50">
                {product.category} · {unit.toUpperCase()} · {product.supplierId?.name || 'No Supplier'}
              </p>
              <div className="mt-1.5">
                <StatusGlyph variant={stVariant} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: `Price/${unit}`, value: fmtINR(priceNum) },
              { label: 'Stock', value: formatQty(stockNum, unit) },
              { label: 'Total Value', value: fmtINR(totalValue) },
            ].map(s => (
              <div key={s.label} className="bg-paper dark:bg-ink rounded-xl p-3 text-center border border-paper-rule dark:border-ink-rule">
                <p className="text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase mb-1">{s.label}</p>
                <p className="text-base font-extrabold text-ink dark:text-paper">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-paper dark:bg-ink rounded-xl p-4 border border-paper-rule dark:border-ink-rule space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/50 dark:text-paper/50">Reorder Level</span>
              <strong className="text-ink dark:text-paper">{formatQty(reorderNum, unit)}</strong>
            </div>
            {product.tareWeight && parseRupees(product.tareWeight) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink/50 dark:text-paper/50">Tare Weight</span>
                <strong className="text-ink dark:text-paper">{formatQty(parseRupees(product.tareWeight), unit)}</strong>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink/50 dark:text-paper/50">Stock Health</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-paper-rule dark:bg-ink-rule rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stVariant === 'in-stock' ? 'bg-brass' : stVariant === 'low-stock' ? 'bg-primary' : 'bg-ink/30 dark:bg-paper/30'}`}
                    style={{ width: `${Math.min(100, Math.max(0, (stockNum / Math.max(reorderNum, 1)) * 100))}%` }}
                  />
                </div>
                <span className="font-bold text-ink dark:text-paper">
                  {Math.round(Math.max(0, (stockNum / Math.max(reorderNum, 1)) * 100))}%
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50 dark:text-paper/50">Created</span>
              <strong className="text-ink dark:text-paper">{new Date(product.createdAt).toLocaleDateString()}</strong>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { onEdit(product); onClose(); }}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors">Edit Product</button>
            <button onClick={() => { onAdjust(product); onClose(); }}
              className="flex-1 py-2.5 border border-paper-rule dark:border-ink-rule text-ink/70 dark:text-paper/70 rounded-xl text-sm font-bold hover:bg-paper dark:hover:bg-ink transition-colors">Adjust Stock</button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Action Menu (3-dot) ──────────────────────────────────────────────────────
function ActionMenu({ product, onEdit, onDelete, onDetail, onAdjust, onStockIn }) {
  const [open, setOpen] = useState(false);
  const actions = [
    { icon: <Info size={16} />, label: 'View Details', fn: onDetail, color: 'text-ink/70 dark:text-paper/70' },
    { icon: <Warehouse size={16} />, label: 'Stock In (Purchase)', fn: onStockIn, color: 'text-[#2E7D32] dark:text-[#4CAF50]' },
    { icon: <ArrowUpDown size={16} />, label: 'Adjust Stock', fn: onAdjust, color: 'text-primary' },
    { icon: <Pencil size={16} />, label: 'Edit Product', fn: onEdit, color: 'text-ink/70 dark:text-paper/70' },
    { icon: <Trash2 size={16} />, label: 'Delete Product', fn: onDelete, color: 'text-primary' },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-ink/40 dark:text-paper/40 hover:bg-paper dark:hover:bg-ink transition-colors">
        <MoreVertical size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-[70] bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl shadow-xl w-44 overflow-hidden py-1">
            {actions.map(a => (
              <button key={a.label} onClick={() => { a.fn(product); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-paper dark:hover:bg-ink transition-colors ${a.color}`}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>{[180, 80, 90, 70, 40, 80, 80, 70, 80, 40].map((w, i) => (
    <td key={i} className="px-5 py-4"><div className="h-4 bg-paper-rule dark:bg-ink-rule rounded animate-pulse" style={{ width: w }} /></td>
  ))}</tr>
);

// ─── Stock cell — color-coded by stockStatus ──────────────────────────────────
function StockCell({ product, onAdjust }) {
  const unit   = product.unit || 'pcs';
  const status = resolveStockStatus(product);
  const qty    = parseRupees(product.stock);

  const colorClass = {
    healthy:  'text-ink dark:text-paper',
    low:      'text-amber-600 dark:text-amber-400',
    out:      'text-primary',
    oversold: 'text-primary',
  }[status] || 'text-ink dark:text-paper';

  return (
    <button
      onClick={() => onAdjust(product)}
      className="group/stock inline-flex items-center gap-2 px-2.5 h-7 rounded-lg border border-paper-rule dark:border-ink-rule hover:border-primary/40 hover:bg-primary/5 transition-colors"
    >
      <span className={`font-mono font-semibold text-sm tabular-nums ${colorClass}`}>
        {formatQty(qty, unit)}
      </span>
      <ArrowUpDown size={11} className="text-ink/30 group-hover/stock:text-primary transition-colors" />
    </button>
  );
}

// ─── Price cell — respects paiseDisplay workspace preference ─────────────────
function PriceCell({ product, paiseDisplay }) {
  const price = parseRupees(product.pricePerUnit ?? product.price);
  const unit  = product.unit || 'pcs';
  return (
    <span className="tabular-nums text-sm font-mono text-ink/80 dark:text-paper/80">
      {formatRupees(price, { paise: paiseDisplay })}
      <span className="text-ink/30 dark:text-paper/30 text-[10px] ml-0.5">/{unit}</span>
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const inv = useInventory();
  const { prefs } = useWorkspace();
  const {
    products, suppliers, meta, loading, error,
    totalValue, lowCount, outCount,
    search, filterCat, filterStatus, page,
    handleSearch, setFilterCat, setFilterStatus, setPage, resetFilters,
    modal, setModal,
    handleCreate, handleUpdate, handleDelete, handleAdjustStock,
  } = inv;

  return (
    <div className="p-6 md:p-8 min-h-screen">
      {/* Modals */}
      {modal?.type === 'add' && (
        <ProductModal suppliers={suppliers} onClose={() => setModal(null)}
          onSubmit={handleCreate} />
      )}
      {modal?.type === 'edit' && (
        <ProductModal product={modal.product} suppliers={suppliers} onClose={() => setModal(null)}
          onSubmit={(form) => handleUpdate(modal.product._id, form)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal product={modal.product} onClose={() => setModal(null)}
          onConfirm={() => handleDelete(modal.product)} />
      )}
      {modal?.type === 'stock' && (
        <StockModal product={modal.product} onClose={() => setModal(null)}
          onConfirm={(qty, type) => handleAdjustStock(modal.product, qty, type)} />
      )}
      {modal?.type === 'stockIn' && (
        <StockInVarianceModal
          product={modal.product}
          suppliers={suppliers}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'detail' && (
        <DetailModal product={modal.product} onClose={() => setModal(null)}
          onEdit={(p) => setModal({ type: 'edit', product: p })}
          onAdjust={(p) => setModal({ type: 'stock', product: p })} />
      )}

      <PageHeader
        icon={Package}
        title="Global Inventory"
        description={`Manage and track all stock in real-time · ${meta.total} total SKUs`}
        actions={
          <button onClick={() => setModal({ type: 'add' })}
            className="inline-flex items-center gap-2 h-10 bg-primary text-white px-4 rounded-xl font-semibold text-sm shadow-sm shadow-primary/25 hover:bg-primary-deep transition-colors">
            <Plus size={16} /> Add Product
          </button>
        }
      />

      {error && <div className="mb-6"><ErrorBanner message={error} onRetry={() => window.location.reload()} /></div>}

      {/* KPI Strip — no icon squares */}
      <div className="mb-6">
        <KpiStrip
          loading={loading}
          items={[
            { label: 'Total SKUs',      value: meta.total,   format: 'count' },
            { label: 'Inventory Value', value: totalValue,   format: 'money' },
            { label: 'Low Stock',       value: lowCount,     format: 'count' },
            { label: 'Out of Stock',    value: outCount,     format: 'count' },
          ]}
        />
      </div>

      {/* Filters */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40" />
            <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name or SKU…"
              className="w-full pl-10 pr-4 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card placeholder:text-ink/30 dark:placeholder:text-paper/30 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none" />
          </div>
          <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}
            className="border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink/70 dark:text-paper/70 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none bg-paper-card dark:bg-ink-card min-w-[160px]">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink/70 dark:text-paper/70 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none bg-paper-card dark:bg-ink-card min-w-[150px]">
            <option value="">All Status</option>
            <option value="healthy">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          {(search || filterCat || filterStatus) && (
            <button onClick={resetFilters}
              className="px-4 py-2.5 text-ink/50 dark:text-paper/50 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold hover:bg-paper dark:hover:bg-ink transition-colors flex items-center gap-1.5">
              <X size={16} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                {[
                  { label: 'Product',   cls: '' },
                  { label: 'SKU',       cls: 'col-tablet-hide' },
                  { label: 'Category',  cls: 'col-mobile-hide' },
                  { label: 'Supplier',  cls: 'col-desktop-only' },
                  { label: 'Unit',      cls: 'col-tablet-hide' },
                  { label: 'Price',     cls: 'col-mobile-hide' },
                  { label: 'Stock',     cls: '' },
                  { label: 'Status',    cls: '' },
                  { label: 'Value',     cls: 'col-tablet-hide' },
                  { label: '',          cls: '' },
                ].map(h => (
                  <th key={h.label || 'actions'} className={`px-5 py-3.5 text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider whitespace-nowrap ${h.cls}`}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
              {loading
                ? [1,2,3,4,5,6,7,8].map(i => <SkeletonRow key={i} />)
                : products.length === 0
                  ? (
                    <tr><td colSpan={10} className="py-12">
                      <EmptyState
                        icon={Package}
                        title={search || filterCat || filterStatus ? 'कुछ नहीं मिला · No items match.' : 'स्टॉक खाली है · Stock empty.'}
                        description={search || filterCat || filterStatus
                          ? 'Stock add karein ya filter hatayein.'
                          : 'Naya item add karein to start tracking inventory.'}
                        action={
                          (search || filterCat || filterStatus)
                            ? <button onClick={resetFilters} className="inline-flex items-center gap-2 px-4 py-2 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors"><X size={16} /> Reset Filters</button>
                            : <button onClick={() => setModal({ type: 'add' })} className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"><Plus size={16} /> Add Product</button>
                        }
                      />
                    </td></tr>
                  )
                  : products.map(p => {
                    const stVariant  = getStatusVariant(p);
                    const unit       = p.unit || 'pcs';
                    const priceNum   = parseRupees(p.pricePerUnit ?? p.price);
                    const stockNum   = parseRupees(p.stock);
                    return (
                      <tr key={p._id} className="hover:bg-paper/60 dark:hover:bg-ink-card/60 transition-colors group">
                        <td className="px-5 py-2">
                          <span className="font-semibold text-ink dark:text-paper text-sm leading-tight">{p.name}</span>
                        </td>
                        <td className="px-5 py-2 font-mono text-xs text-ink/50 dark:text-paper/50 col-tablet-hide">{p.sku}</td>
                        <td className="px-5 py-2 col-mobile-hide">
                          <span className="font-mono text-[11px] text-ink/60 dark:text-paper/60">{p.category}</span>
                        </td>
                        <td className="px-5 py-2 text-sm text-ink/60 dark:text-paper/60 col-desktop-only">{p.supplierId?.name || <span className="text-ink/25 dark:text-paper/25">—</span>}</td>
                        <td className="px-5 py-2 col-tablet-hide">
                          <span className="inline-block px-1.5 py-0.5 rounded-md bg-paper dark:bg-ink border border-paper-rule dark:border-ink-rule text-[10px] font-mono font-bold text-ink/50 dark:text-paper/50 uppercase">
                            {unit}
                          </span>
                        </td>
                        <td className="px-5 py-2 col-mobile-hide">
                          <PriceCell product={p} paiseDisplay={prefs.paiseDisplay} />
                        </td>
                        <td className="px-5 py-2">
                          <StockCell product={p} onAdjust={(p) => setModal({ type: 'stock', product: p })} />
                        </td>
                        <td className="px-5 py-2">
                          <StatusGlyph variant={stVariant} />
                        </td>
                        <td className="px-5 py-2 text-sm tabular-nums col-tablet-hide">
                          <span className="font-mono text-ink/70 dark:text-paper/70">
                            {formatRupees(priceNum * stockNum, { paise: prefs.paiseDisplay })}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <ActionMenu product={p}
                            onDetail={(p) => setModal({ type: 'detail', product: p })}
                            onEdit={(p) => setModal({ type: 'edit', product: p })}
                            onDelete={(p) => setModal({ type: 'delete', product: p })}
                            onAdjust={(p) => setModal({ type: 'stock', product: p })}
                            onStockIn={(p) => setModal({ type: 'stockIn', product: p })}
                          />
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Footer: count + pagination */}
        {!loading && products.length > 0 && (
          <div className="px-5 py-3.5 border-t border-paper-rule dark:border-ink-rule bg-paper/50 dark:bg-ink/30 flex items-center justify-between gap-4">
            <p className="text-xs text-ink/40 dark:text-paper/40">
              Showing <strong className="text-ink/70 dark:text-paper/70">{products.length}</strong> of <strong className="text-ink/70 dark:text-paper/70">{meta.total}</strong> products
              · Value: <strong className="text-ink/70 dark:text-paper/70">{formatRupees(totalValue, { paise: prefs.paiseDisplay })}</strong>
            </p>
            {meta.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold border transition-colors
                      ${n === page ? 'bg-primary text-white border-primary shadow-md shadow-primary/20' : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
