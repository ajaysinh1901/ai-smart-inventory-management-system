import React, { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { Plus, Trash2, Receipt, ArrowDown, ArrowUp, CalendarDays, Search, X, AlertCircle, AlertTriangle, Package, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Input, Select, Textarea, EmptyState, ErrorBanner, PageHeader, Skeleton, KpiStrip, StatusGlyph } from '../components/ui';

// ─── Shared ────────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  const dt = new Date(d);
  const day = dt.getDate().toString().padStart(2, '0');
  const mon = dt.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
  const hh  = dt.getHours().toString().padStart(2, '0');
  const mm  = dt.getMinutes().toString().padStart(2, '0');
  return `${day} ${mon} · ${hh}:${mm}`;
};
const shortId = (id = '') => id.slice(-8).toUpperCase();

const Overlay = ({ children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(13,27,42,0.55)', backdropFilter: 'blur(6px)' }}>{children}</div>
);
const ModalBox = ({ children }) => (
  <div className="bg-paper-card dark:bg-ink-card rounded-xl shadow-2xl w-full max-w-lg border border-paper-rule dark:border-ink-rule overflow-hidden">{children}</div>
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

// ─── Add Transaction Modal ─────────────────────────────────────────────────────
function AddTransactionModal({ products, onClose, onSubmit }) {
  const [form, setForm]   = useState({ productId: '', type: 'IN', quantity: 1, notes: '' });
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const blur = (k) => setTouched(t => ({ ...t, [k]: true }));

  const selectedProduct = products.find(p => p._id === form.productId);
  const exceedsStock = selectedProduct && form.type === 'OUT' && form.quantity > selectedProduct.stock;

  const errors = {
    productId: !form.productId ? 'Please select a product.' : '',
    quantity: !form.quantity || form.quantity < 1
      ? 'Quantity must be at least 1.'
      : exceedsStock
        ? `Exceeds available stock (${selectedProduct.stock} units).`
        : '',
  };
  const isValid = !errors.productId && !errors.quantity;

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ productId: true, quantity: true });
    if (!isValid) return;
    setSaving(true);
    try { await onSubmit(form); onClose(); }
    catch (ex) { setErr(ex?.response?.data?.message || 'Failed to create transaction.'); setSaving(false); }
  };

  return (
    <Overlay>
      <ModalBox>
        <ModalHeader icon={<ArrowUpDown size={20} />} title="New Transaction" sub="Manually log a stock movement" onClose={onClose} />
        <form onSubmit={submit} className="p-6 space-y-4" noValidate>
          {err && (
            <div className="bg-primary/8 dark:bg-primary/15 text-primary text-sm px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-2">
              <AlertCircle size={18} />{err}
            </div>
          )}
          <Select label="Product" required value={form.productId}
            onChange={e => set('productId', e.target.value)}
            onBlur={() => blur('productId')}
            error={touched.productId ? errors.productId : ''}>
            <option value="">— Select product —</option>
            {products.map(p => (
              <option key={p._id} value={p._id}>{p.name} ({p.sku}) — Stock: {p.stock}</option>
            ))}
          </Select>
          {selectedProduct && (
            <div className="flex items-center gap-3 p-3 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule text-sm">
              <Package size={18} className="text-primary" />
              <div>
                <span className="text-ink/50 dark:text-paper/50">Current Stock: </span>
                <strong className="text-ink dark:text-paper">{selectedProduct.stock}</strong>
                <span className="text-ink/30 dark:text-paper/30 ml-2">/ min {selectedProduct.lowStockThreshold}</span>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-2">
              Transaction Type<span className="text-primary ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              {[['IN', '↓ STOCK IN', 'bg-brass text-ink border-brass'], ['OUT', '↑ STOCK OUT', 'bg-primary text-paper border-primary']].map(([t, label, active]) => (
                <button key={t} type="button" onClick={() => set('type', t)}
                  className={`flex-1 h-10 px-4 rounded-xl font-mono text-[12px] uppercase tracking-[0.08em] border transition-all flex items-center justify-center gap-2
                    ${form.type === t ? `${active} shadow-md` : 'border-paper-rule dark:border-ink-rule text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink-card'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Input label="Quantity" required type="number" min={1} value={form.quantity}
            onChange={e => set('quantity', Number(e.target.value))}
            onBlur={() => blur('quantity')}
            error={touched.quantity ? errors.quantity : ''}
            className="text-xl font-extrabold text-center" />
          {selectedProduct && form.type === 'OUT' && form.quantity > selectedProduct.stock && !touched.quantity && (
            <p className="text-xs text-primary font-semibold flex items-center gap-1">
              <AlertTriangle size={14} /> Exceeds available stock ({selectedProduct.stock} units)
            </p>
          )}
          <Textarea label="Notes (optional)" rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="e.g. Monthly restock from Apple Inc." />
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={saving || !isValid} className="flex-1">
              {saving ? 'Logging…' : 'Log Transaction'}
            </Button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteModal({ tx, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const go = async () => { setDeleting(true); try { await onConfirm(); onClose(); } catch { setDeleting(false); } };
  return (
    <Overlay>
      <div className="bg-paper-card dark:bg-ink-card rounded-xl shadow-2xl w-full max-w-sm border border-paper-rule dark:border-ink-rule p-8 text-center">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={28} className="text-primary" />
        </div>
        <h3 className="font-bold text-ink dark:text-paper text-lg mb-1">Delete Transaction?</h3>
        <p className="text-sm text-ink/60 dark:text-paper/60 mb-2">
          Transaction <strong className="font-mono text-ink/80 dark:text-paper/80">#{shortId(tx._id)}</strong> will be permanently removed.
        </p>
        <p className="text-xs text-brass-deep dark:text-brass bg-brass/8 dark:bg-brass/15 border border-brass/30 rounded-xl px-3 py-2 mb-6 flex items-center gap-1.5 justify-center">
          <AlertTriangle size={14} /> Stock will be automatically reverted.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors">Cancel</button>
          <button onClick={go} disabled={deleting} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-deep transition-colors disabled:opacity-60">
            {deleting ? 'Removing…' : 'Delete'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>{[120, 100, 60, 60, 100, 130, 90, 80, 32].map((w, i) => (
    <td key={i} className="px-4 py-4"><div className="h-4 bg-paper-rule dark:bg-ink-rule rounded animate-pulse" style={{ width: w }} /></td>
  ))}</tr>
);

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const {
    transactions, stats, products, meta, loading, error,
    search, filterType, dateFrom, dateTo, page,
    handleSearch, setFilterType, setDateFrom, setDateTo, setPage, resetFilters,
    modal, setModal,
    handleCreate, handleDelete,
  } = useTransactions();

  const hasFilter = search || filterType || dateFrom || dateTo;

  const kpiItems = [
    { label: 'Total Transactions', value: stats.total,                  format: 'count' },
    { label: 'Stock In (Units)',   value: stats.totalINQty,             format: 'count' },
    { label: 'Stock Out (Units)',  value: stats.totalOUTQty,            format: 'count' },
    { label: "Today's Activity",   value: stats.todayCount,             format: 'count' },
  ];

  return (
    <div className="p-6 md:p-8 min-h-screen">
      {modal?.type === 'add' && (
        <AddTransactionModal products={products} onClose={() => setModal(null)} onSubmit={handleCreate} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal tx={modal.tx} onClose={() => setModal(null)} onConfirm={() => handleDelete(modal.tx)} />
      )}

      <PageHeader
        icon={Receipt}
        title="Transaction Ledger"
        description="Complete audit trail of all stock movements"
        actions={
          <button onClick={() => setModal({ type: 'add' })}
            className="inline-flex items-center gap-2 h-10 bg-primary text-white px-4 rounded-xl font-semibold text-sm shadow-sm shadow-primary/25 hover:bg-primary-deep transition-colors">
            <Plus size={16} /> Log Transaction
          </button>
        }
      />

      {error && <div className="mb-6"><ErrorBanner message={error} onRetry={() => window.location.reload()} /></div>}

      {/* KPI Strip — no icon squares */}
      <div className="mb-6">
        <KpiStrip items={kpiItems} loading={loading} />
      </div>

      {/* Filters */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-4 mb-5">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40" />
            <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search by product name…"
              className="w-full pl-10 pr-4 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card placeholder:text-ink/30 dark:placeholder:text-paper/30 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none" />
          </div>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink/70 dark:text-paper/70 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none bg-paper-card dark:bg-ink-card min-w-[140px]">
            <option value="">All Types</option>
            <option value="IN">Stock In</option>
            <option value="OUT">Stock Out</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-ink/50 dark:text-paper/50 whitespace-nowrap">From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink/70 dark:text-paper/70 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none bg-paper-card dark:bg-ink-card" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-ink/50 dark:text-paper/50 whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink/70 dark:text-paper/70 focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none bg-paper-card dark:bg-ink-card" />
          </div>
          {hasFilter && (
            <button onClick={resetFilters}
              className="px-4 py-2.5 text-ink/50 dark:text-paper/50 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold hover:bg-paper dark:hover:bg-ink transition-colors flex items-center gap-1.5">
              <X size={16} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden">
        <div className="px-6 py-5 border-b border-paper-rule dark:border-ink-rule flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink dark:text-paper">Stock Movement Log</h3>
          <span className="text-xs text-ink/40 dark:text-paper/40">{loading ? '…' : `${meta.total} records`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                {['Txn ID', 'Product', 'Type', 'Qty', 'Supplier', 'Notes', 'User', 'Date & Time', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
              {loading
                ? [1,2,3,4,5,6,7,8,9,10].map(i => <SkeletonRow key={i} />)
                : transactions.length === 0
                  ? (
                    <tr><td colSpan={9} className="py-12">
                      <EmptyState
                        icon={Receipt}
                        title={hasFilter ? 'कुछ नहीं मिला · No transactions match.' : 'कोई transaction नहीं · No transactions.'}
                        description={hasFilter
                          ? 'Filters hatayein ya date range change karein.'
                          : 'Stock movement record karein to build your audit trail.'}
                        action={
                          hasFilter
                            ? <button onClick={resetFilters} className="inline-flex items-center gap-2 px-4 py-2 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors"><X size={16} /> Reset Filters</button>
                            : <button onClick={() => setModal({ type: 'add' })} className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"><Plus size={16} /> Log Transaction</button>
                        }
                      />
                    </td></tr>
                  )
                  : transactions.map(tx => (
                    <tr key={tx._id} className="hover:bg-paper/60 dark:hover:bg-ink/60 transition-colors group">
                      <td className="px-4 py-4">
                        <span className="font-mono text-[11px] text-ink/40 dark:text-paper/40 bg-paper dark:bg-ink px-2 py-0.5 rounded-md border border-paper-rule dark:border-ink-rule">#{shortId(tx._id)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-semibold text-ink dark:text-paper text-sm leading-tight">{tx.productId?.name || '—'}</p>
                          <p className="text-[10px] text-ink/40 dark:text-paper/40 font-mono">{tx.productId?.sku || ''}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusGlyph variant={tx.type === 'IN' ? 'stock-in' : 'stock-out'} />
                      </td>
                      <td className="px-4 py-4">
                        <span className={`font-mono text-sm font-bold tabular-nums ${tx.type === 'IN' ? 'text-brass dark:text-brass-soft' : 'text-primary dark:text-primary-soft'}`}>
                          {tx.type === 'IN' ? '+' : '−'}{tx.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-ink/50 dark:text-paper/50">
                        {tx.productId?.supplierId?.name || <span className="text-ink/25 dark:text-paper/25">—</span>}
                      </td>
                      <td className="px-4 py-4 text-sm text-ink/50 dark:text-paper/50 max-w-[160px]">
                        <p className="truncate">{tx.notes || <span className="text-ink/25 dark:text-paper/25">—</span>}</p>
                      </td>
                      <td className="px-4 py-4">
                        {tx.user ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-extrabold">
                              {(tx.user.name || tx.user.email || 'U')[0].toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-ink/60 dark:text-paper/60">{tx.user.name || tx.user.email}</span>
                          </div>
                        ) : <span className="text-ink/25 dark:text-paper/25 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-4 font-mono text-[11px] text-ink/60 dark:text-paper/60 whitespace-nowrap tracking-[0.04em]">{fmtDate(tx.createdAt)}</td>
                      <td className="px-4 py-4">
                        <button onClick={() => setModal({ type: 'delete', tx })}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-ink/25 dark:text-paper/25 hover:bg-primary/8 dark:hover:bg-primary/15 hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {!loading && transactions.length > 0 && (
          <div className="px-5 py-3.5 border-t border-paper-rule dark:border-ink-rule bg-paper/50 dark:bg-ink/30 flex items-center justify-between gap-4">
            <p className="text-xs text-ink/40 dark:text-paper/40">
              Showing <strong className="text-ink/70 dark:text-paper/70">{transactions.length}</strong> of <strong className="text-ink/70 dark:text-paper/70">{meta.total}</strong> transactions
            </p>
            {meta.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/50 dark:text-paper/50 hover:bg-paper dark:hover:bg-ink disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(meta.totalPages, 7) }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold border transition-colors
                      ${n === page ? 'bg-primary text-white border-primary shadow-sm' : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink'}`}>
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
