import React, { useState, useRef } from 'react';
import { Upload, ScanLine, FileText, CheckCircle, Loader2, AlertTriangle, Plus, Trash2, Package, Save, X, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorBanner, PageHeader } from '../components/ui';

// ─── Static sample gallery ────────────────────────────────────────────────────
const SAMPLE_INVOICES = [
  { id: 'tally',    label: 'Tally invoice',         hint: 'Purchase entry · XML ledger format',  icon: '📋' },
  { id: 'hw',       label: 'Handwritten bill',       hint: 'Manual grocery / hardware bill',       icon: '✍️' },
  { id: 'thermal',  label: 'Thermal printer slip',   hint: 'POS receipt · narrow format',         icon: '🧾' },
  { id: 'gst-img',  label: 'GST invoice photo',      hint: 'GSTIN + HSN line items',              icon: '📄' },
];

// Recent scans are populated from actual saved sessions (no stub data).
// The array starts empty — entries are added on successful save within the session.

// ─── Fields we extract ────────────────────────────────────────────────────────
const EXTRACT_FIELDS = [
  { key: 'GSTIN',       desc: 'Vendor GST Identification Number' },
  { key: 'INVOICE NO',  desc: 'Invoice / bill reference number' },
  { key: 'DATE',        desc: 'Bill date extracted from document' },
  { key: 'LINE ITEMS',  desc: 'Product name, quantity, unit price per row' },
  { key: 'TAX BREAKUP', desc: 'CGST / SGST / IGST amounts per slab' },
  { key: 'TOTAL',       desc: 'Grand total after tax and discount' },
];

export default function ScannerPage() {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  // Recent scans recorded within this browser session (replaced fake stub data)
  const [recentScans, setRecentScans] = useState([]);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setExtractedData(null);
    setSaved(false);
    setError('');
    setSelectedSample(null);
    if (selected.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(selected));
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setExtractedData(null);
      setSaved(false);
      setError('');
      setSelectedSample(null);
      if (dropped.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(dropped));
      } else {
        setPreview(null);
      }
    }
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('invoice', file);
      const uploadRes = await api.post('/ocr/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const extractRes = await api.post('/ocr/extract', {
        filename: uploadRes.data.data.filename
      });
      // Normalise the API response key: backend returns `lineItems`, UI reads `items`.
      // Alias lineItems → items so the rest of the component stays consistent.
      const rawData = extractRes.data.data || {};
      const normalised = {
        ...rawData,
        items: rawData.items ?? rawData.lineItems ?? [],
      };
      setExtractedData(normalised);
      const itemCount = normalised.items.length;
      toast.success(`Extracted ${itemCount} line item${itemCount === 1 ? '' : 's'} from invoice.`);
    } catch (err) {
      const msg = err.response?.data?.message || 'OCR extraction failed. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!extractedData) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/ocr/save', {
        items: extractedData.items,
        vendor: extractedData.vendor
      });
      setSaved(true);
      const count = extractedData.items?.length || 0;
      toast.success(`Saved ${count} item${count === 1 ? '' : 's'} to inventory.`);
      // Record this scan in the session history (replaces hardcoded stub data)
      const now = new Date();
      const dateLabel = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase()
        + ' · ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
      setRecentScans(prev => [{
        date: dateLabel,
        supplier: extractedData.vendor?.name || extractedData.vendorName || 'Unknown Vendor',
        total: extractedData.grandTotal != null ? `₹${Number(extractedData.grandTotal).toLocaleString('en-IN')}` : '—',
        status: 'saved',
        items: count,
      }, ...prev].slice(0, 10));
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save to inventory.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index, field, value) => {
    setExtractedData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  const removeItem = (index) => {
    setExtractedData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const addItem = () => {
    setExtractedData(prev => ({
      ...prev,
      items: [...(prev?.items || []), { name: '', quantity: 1, unitPrice: 0, total: 0 }]
    }));
  };

  return (
    <div className="p-6 md:p-8 min-h-screen space-y-6 w-full">
      <PageHeader
        icon={ScanLine}
        title="OCR Invoice Scanner"
        description="Upload invoices — AI extracts product data automatically"
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* ── Sample Invoice Gallery ── */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/50 dark:text-paper/50 mb-3">
          Try a sample
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SAMPLE_INVOICES.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSample(selectedSample === s.id ? null : s.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                selectedSample === s.id
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card hover:border-primary/40 hover:bg-paper dark:hover:bg-ink'
              }`}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="font-body text-sm font-semibold text-ink dark:text-paper leading-tight">{s.label}</p>
              <p className="font-body text-[11px] text-ink/50 dark:text-paper/50 mt-0.5 leading-snug">{s.hint}</p>
              <span className={`mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                selectedSample === s.id ? 'text-primary dark:text-primary-soft' : 'text-ink/30 dark:text-paper/30'
              }`}>
                {selectedSample === s.id ? '● Selected' : '○ Try this sample'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Upload + Preview ── */}
        <div className="space-y-5">
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-primary bg-primary/8 dark:bg-primary/12'
                : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card hover:border-primary/50 hover:bg-paper dark:hover:bg-ink'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleFileSelect} />
            <Upload size={36} className={`mb-4 transition-colors ${dragOver ? 'text-primary' : 'text-ink/30 dark:text-paper/30'}`} />
            <h4 className="font-display font-semibold text-base text-ink dark:text-paper">
              {dragOver ? 'Release to upload' : 'Drop your bill here'}
            </h4>
            <p className="font-body text-sm text-ink/50 dark:text-paper/50 mt-1">
              Drop your invoice here <span className="text-ink/30 dark:text-paper/30 mx-1">·</span> JPG, PNG
            </p>
            {file && (
              <div className="mt-4 flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl font-mono text-[12px] font-semibold">
                <FileText size={14} /> {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule overflow-hidden">
              <div className="px-5 py-3 border-b border-paper-rule dark:border-ink-rule flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/60 dark:text-paper/60">Document Preview</span>
              </div>
              <div className="p-4 bg-paper dark:bg-ink flex items-center justify-center max-h-[400px] overflow-auto">
                <img src={preview} alt="Invoice preview" className="max-w-full rounded-lg shadow-md" />
              </div>
            </div>
          )}

          {/* Extract Button */}
          {file && !extractedData && (
            <button onClick={handleExtract} disabled={extracting}
              className="w-full h-11 bg-primary text-paper rounded-xl font-semibold text-sm shadow-sm shadow-primary/25 hover:bg-primary-deep transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {extracting ? <><Loader2 size={18} className="animate-spin" /> Extracting…</> : <><ScanLine size={18} /> Extract Invoice Data</>}
            </button>
          )}

          {/* Recently Scanned List */}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/50 dark:text-paper/50 mb-3">
              Recently scanned
            </p>
            {recentScans.length === 0 ? (
              <div className="bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl p-6 text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40">
                  No recent scans · Upload an invoice to begin.
                </p>
              </div>
            ) : (
              <div className="bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-paper-rule dark:border-ink-rule">
                      {['Date', 'Supplier', 'Total', 'Items', 'Status'].map(h => (
                        <th key={h} className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
                    {recentScans.map((row, i) => (
                      <tr key={i} className="hover:bg-paper dark:hover:bg-ink transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-ink/60 dark:text-paper/60 whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-3 font-body text-sm text-ink dark:text-paper">{row.supplier}</td>
                        <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-brass dark:text-brass-soft">{row.total}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink/50 dark:text-paper/50">{row.items} items</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#2E7D32] dark:text-[#4CAF50]">
                            ● SAVED
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Extracted Data OR Annotation Panel ── */}
        <div className="bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule flex flex-col">
          <div className="px-6 py-4 border-b border-paper-rule dark:border-ink-rule">
            <h3 className="font-display font-semibold text-base text-ink dark:text-paper">
              {extractedData ? 'Extracted Data' : 'What we extract'}
            </h3>
            <p className="font-body text-xs text-ink/50 dark:text-paper/50 mt-0.5">
              {extractedData ? 'Review and edit before saving to inventory' : 'Upload an invoice to see results here'}
            </p>
          </div>

          {!extractedData ? (
            /* ── Annotation panel — shown when nothing is uploaded ── */
            <div className="flex-1 p-6 space-y-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40 mb-4">
                Fields extracted automatically
              </p>
              {EXTRACT_FIELDS.map((f, i) => (
                <div
                  key={f.key}
                  className="flex items-start gap-4 py-3 border-b border-paper-rule dark:border-ink-rule last:border-b-0"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/80 dark:text-paper/80 w-28 flex-shrink-0 pt-px">
                    {f.key}
                  </span>
                  <span className="font-body text-[12px] text-ink/50 dark:text-paper/50 leading-snug">{f.desc}</span>
                </div>
              ))}
              <div className="pt-5">
                <p className="font-body text-xs text-ink/40 dark:text-paper/40 italic">
                  Supports handwritten bills and printed invoices (JPG, PNG photos). Confidence scores shown per field.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Vendor Info */}
              {extractedData.vendor?.name && (
                <div className="space-y-3">
                  <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40 block">Vendor Details</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-xs font-semibold text-ink/70 dark:text-paper/70 block mb-1">Company</label>
                      <input value={extractedData.vendor.name || ''} readOnly
                        className="w-full text-sm border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2 bg-paper dark:bg-ink text-ink dark:text-paper outline-none" />
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-ink/70 dark:text-paper/70 block mb-1">Tax ID</label>
                      <input value={extractedData.vendor.taxId || ''} readOnly
                        className="w-full font-mono text-sm border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2 bg-paper dark:bg-ink text-ink dark:text-paper outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Invoice Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs font-semibold text-ink/70 dark:text-paper/70 block mb-1">Invoice #</label>
                  <input value={extractedData.invoiceNumber || '—'} readOnly
                    className="w-full font-mono text-sm border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2 bg-paper dark:bg-ink text-ink dark:text-paper outline-none" />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-ink/70 dark:text-paper/70 block mb-1">Date</label>
                  <input value={extractedData.date || '—'} readOnly
                    className="w-full font-mono text-sm border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2 bg-paper dark:bg-ink text-ink dark:text-paper outline-none" />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40">Line Items</label>
                  <button onClick={addItem} className="flex items-center gap-1 text-primary text-xs font-bold hover:underline">
                    <Plus size={13} /> Add Item
                  </button>
                </div>
                <div className="border border-paper-rule dark:border-ink-rule rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40">Item</th>
                        <th className="px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40 w-16">Qty</th>
                        <th className="px-3 py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40 w-24">Price</th>
                        <th className="px-3 py-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
                      {extractedData.items?.map((item, i) => (
                        <tr key={i} className={item.confidence && item.confidence < 0.7 ? 'bg-brass/5 dark:bg-brass/8' : ''}>
                          <td className="px-3 py-2.5">
                            <input value={item.name || ''} onChange={(e) => updateItem(i, 'name', e.target.value)}
                              className="w-full text-sm border border-paper-rule dark:border-ink-rule rounded-lg px-2 py-1.5 bg-paper-card dark:bg-ink-card text-ink dark:text-paper focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors" />
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="number" value={item.quantity || 0} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                              className="w-full font-mono text-sm border border-paper-rule dark:border-ink-rule rounded-lg px-2 py-1.5 text-center bg-paper-card dark:bg-ink-card text-ink dark:text-paper focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors" />
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="number" value={item.unitPrice || 0} onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))}
                              className="w-full font-mono text-sm border border-paper-rule dark:border-ink-rule rounded-lg px-2 py-1.5 text-right bg-paper-card dark:bg-ink-card text-ink dark:text-paper focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors tabular-nums" />
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => removeItem(i)} className="text-ink/25 dark:text-paper/25 hover:text-primary transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-paper dark:bg-ink rounded-xl p-4 border border-paper-rule dark:border-ink-rule space-y-2 text-sm tabular-nums">
                <div className="flex justify-between">
                  <span className="text-ink/60 dark:text-paper/60">Subtotal</span>
                  <span className="font-mono font-semibold text-ink/80 dark:text-paper/80">₹{(extractedData.subtotal || 0).toFixed(2)}</span>
                </div>
                {extractedData.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink/60 dark:text-paper/60">Tax</span>
                    <span className="font-mono font-semibold text-ink/80 dark:text-paper/80">₹{(extractedData.tax || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-paper-rule dark:border-ink-rule pt-2.5 mt-1">
                  <span className="text-ink dark:text-paper">Total</span>
                  <span className="font-mono text-primary">₹{(extractedData.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          {extractedData && (
            <div className="px-6 py-4 border-t border-paper-rule dark:border-ink-rule flex gap-3">
              <button onClick={() => { setExtractedData(null); setFile(null); setPreview(null); setSaved(false); }}
                className="flex-1 h-10 border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 rounded-xl font-semibold text-sm hover:bg-paper dark:hover:bg-ink hover:border-ink-rule dark:hover:border-paper-rule transition-colors">
                Discard
              </button>
              <button onClick={handleSave} disabled={saving || saved}
                className="flex-1 h-10 bg-primary text-paper rounded-xl font-semibold text-sm shadow-sm shadow-primary/25 hover:bg-primary-deep transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  : saved ? <><CheckCircle size={16} /> Saved to Inventory!</>
                  : <><Save size={16} /> Save to Inventory</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
