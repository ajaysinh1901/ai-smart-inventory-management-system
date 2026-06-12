import React, { useState, useEffect } from 'react';
import { useSuppliers } from '../hooks/useSuppliers';
import { fetchSupplierProducts, fetchSupplierTransactions } from '../services/supplierService';
import { fmtINR } from '../utils/format';
import { Plus, Pencil, Trash2, Store, BadgeCheck, Award, Search, X, MoreVertical, Info, ArrowDown, ArrowUp, User, Phone, Mail, MapPin, FileText, Calendar, AlertCircle, Truck } from 'lucide-react';
import { Button, Input, Textarea, EmptyState, ErrorBanner, PageHeader, Skeleton } from '../components/ui';

// ─── Shared Primitives ────────────────────────────────────────────────────────
const Overlay = ({ children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(13,27,42,0.55)', backdropFilter: 'blur(6px)' }}>{children}</div>
);
const ModalBox = ({ children, wide }) => (
  <div className={`bg-paper-card dark:bg-ink-card rounded-xl shadow-2xl w-full border border-paper-rule dark:border-ink-rule overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-md'}`}>{children}</div>
);
const ModalHeader = ({ icon, title, sub, onClose }) => (
  <div className="flex items-center justify-between px-6 py-5 border-b border-paper-rule dark:border-ink-rule">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
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

// ─── Supplier Form Modal ───────────────────────────────────────────────────────
function SupplierModal({ supplier, onClose, onSubmit }) {
  const isEdit = !!supplier?._id;
  const empty  = { name: '', contactPerson: '', phone: '', email: '', address: '', gst: '' };
  const [form, setForm] = useState(isEdit ? {
    name: supplier.name || '', contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '', email: supplier.email || '',
    address: supplier.address || '', gst: supplier.gst || '',
  } : empty);
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const blur = (k) => () => setTouched(t => ({ ...t, [k]: true }));

  const errors = {
    name: !form.name?.trim() ? 'Supplier name is required.' : '',
    email: form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? 'Enter a valid email address.' : '',
  };
  const isValid = !errors.name && !errors.email;

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true });
    if (!isValid) return;
    setSaving(true);
    try { await onSubmit(form); onClose(); }
    catch (ex) { setErr(ex?.response?.data?.message || 'Failed to save.'); setSaving(false); }
  };

  return (
    <Overlay>
      <ModalBox>
        <ModalHeader icon={isEdit ? <Pencil size={20} /> : <Store size={20} />} title={isEdit ? 'Edit Supplier' : 'Add New Supplier'} sub={isEdit ? supplier.name : 'Enter supplier details'} onClose={onClose} />
        <form onSubmit={submit} className="p-6 space-y-4" noValidate>
          {err && <ErrBox msg={err} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Company Name"
                required
                value={form.name}
                onChange={set('name')}
                onBlur={blur('name')}
                error={touched.name ? errors.name : ''}
                placeholder="e.g. Apple Inc."
              />
            </div>
            <Input
              label="Contact Person"
              value={form.contactPerson}
              onChange={set('contactPerson')}
              placeholder="e.g. John Doe"
            />
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="+91 98765 43210"
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={set('email')}
              onBlur={blur('email')}
              error={touched.email ? errors.email : ''}
              placeholder="contact@supplier.com"
            />
            <Input
              label="GST / Tax ID (optional)"
              value={form.gst}
              onChange={set('gst')}
              placeholder="e.g. 22AAAAA0000A1Z5"
            />
            <div className="col-span-2">
              <Textarea
                label="Address"
                rows={2}
                value={form.address}
                onChange={set('address')}
                placeholder="Full address…"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={saving || !isValid}
              className="flex-1"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteModal({ supplier, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const go = async () => { setDeleting(true); try { await onConfirm(); onClose(); } catch { setDeleting(false); } };
  return (
    <Overlay>
      <ModalBox>
        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={28} className="text-primary" />
          </div>
          <h3 className="font-display font-semibold text-ink dark:text-paper text-lg mb-1">Remove Supplier?</h3>
          <p className="text-sm text-ink/60 dark:text-paper/60 mb-6">
            Permanently remove <strong className="text-ink dark:text-paper">{supplier.name}</strong> from the system.
            Products linked to this supplier will become unassigned.
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink transition-colors">Cancel</button>
            <button onClick={go} disabled={deleting} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-deep transition-colors disabled:opacity-60">
              {deleting ? 'Removing…' : 'Remove Supplier'}
            </button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Supplier Detail Drawer ───────────────────────────────────────────────────
function DetailModal({ supplier, onClose, onEdit }) {
  const [products, setProducts]   = useState([]);
  const [txns, setTxns]           = useState([]);
  const [tab, setTab]             = useState('products');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSupplierProducts(supplier._id),
      fetchSupplierTransactions(supplier._id),
    ]).then(([pRes, tRes]) => {
      setProducts(pRes.data.data);
      setTxns(tRes.data.data);
    }).finally(() => setLoading(false));
  }, [supplier._id]);

  const getStockStatus = (p) => {
    const stock   = parseFloat(p.stock)   || 0;
    // Support both new-schema reorderLevel and legacy lowStockThreshold
    const reorder = parseFloat(p.reorderLevel ?? p.lowStockThreshold) || 0;
    if (stock === 0) return { label: 'Out', color: 'text-primary bg-primary/8 dark:bg-primary/15' };
    if (reorder > 0 && stock <= reorder) return { label: 'Low', color: 'text-brass-deep dark:text-brass bg-brass/10' };
    return { label: 'OK', color: 'text-[#2E7D32] dark:text-[#4CAF50] bg-[#2E7D32]/10' };
  };

  const infoFields = [
    { label: 'Contact Person', value: supplier.contactPerson || '—', icon: <User size={14} className="text-ink/40 dark:text-paper/40" /> },
    { label: 'Phone',          value: supplier.phone         || '—', icon: <Phone size={14} className="text-ink/40 dark:text-paper/40" /> },
    { label: 'Email',          value: supplier.email         || '—', icon: <Mail size={14} className="text-ink/40 dark:text-paper/40" /> },
    { label: 'Address',        value: supplier.address       || '—', icon: <MapPin size={14} className="text-ink/40 dark:text-paper/40" /> },
    { label: 'GST / Tax ID',   value: supplier.gst           || '—', icon: <FileText size={14} className="text-ink/40 dark:text-paper/40" /> },
    { label: 'Since',          value: new Date(supplier.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), icon: <Calendar size={14} className="text-ink/40 dark:text-paper/40" /> },
  ];

  return (
    <Overlay>
      <ModalBox wide>
        <ModalHeader icon={<Store size={20} />} title={supplier.name} sub={`${supplier.productCount || 0} products · ${supplier.email || 'No email'}`} onClose={onClose} />
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {infoFields.map(f => (
              <div key={f.label} className="bg-paper dark:bg-ink rounded-xl p-3 border border-paper-rule dark:border-ink-rule">
                <div className="flex items-center gap-1.5 mb-1">
                  {f.icon}
                  <p className="text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-wider">{f.label}</p>
                </div>
                <p className="text-sm font-semibold text-ink dark:text-paper truncate">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-paper dark:bg-ink p-1 rounded-xl w-fit">
            {['products', 'transactions'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${tab === t ? 'bg-paper-card dark:bg-ink-card text-primary shadow-sm' : 'text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper'}`}>
                {t === 'products' ? `Products (${products.length})` : `Transactions (${txns.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-paper-rule dark:bg-ink-rule rounded-xl animate-pulse" />)}</div>
          ) : tab === 'products' ? (
            products.length === 0 ? (
              <p className="text-ink/40 dark:text-paper/40 text-sm text-center py-6">No products linked to this supplier yet.</p>
            ) : (
              <div className="border border-paper-rule dark:border-ink-rule rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                    <tr>
                      {['Product', 'SKU', 'Category', 'Price', 'Stock', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
                    {products.map(p => {
                      const st = getStockStatus(p);
                      return (
                        <tr key={p._id} className="hover:bg-paper/60 dark:hover:bg-ink/60 transition-colors">
                          <td className="px-4 py-3 font-semibold text-ink dark:text-paper">{p.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-ink/40 dark:text-paper/40">{p.sku}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-paper-rule/60 dark:bg-ink-rule/40 text-ink/60 dark:text-paper/60 px-2 py-0.5 rounded-lg font-semibold">{p.category}</span></td>
                          <td className="px-4 py-3 font-bold text-ink dark:text-paper">{fmtINR(p.pricePerUnit ?? p.price)}</td>
                          <td className="px-4 py-3 font-bold text-ink dark:text-paper">{p.stock}</td>
                          <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            txns.length === 0 ? (
              <p className="text-ink/40 dark:text-paper/40 text-sm text-center py-6">No transactions recorded for this supplier's products.</p>
            ) : (
              <div className="border border-paper-rule dark:border-ink-rule rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                    <tr>
                      {['Product', 'Type', 'Qty', 'Date'].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
                    {txns.map(t => (
                      <tr key={t._id} className="hover:bg-paper/60 dark:hover:bg-ink/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-ink dark:text-paper">{t.productId?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${t.type === 'IN' ? 'bg-brass/10 text-brass-deep dark:text-brass' : 'bg-primary/8 dark:bg-primary/15 text-primary'}`}>
                            {t.type === 'IN' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                            {t.type === 'IN' ? 'Stock In' : 'Stock Out'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-ink dark:text-paper">{t.quantity}</td>
                        <td className="px-4 py-3 text-ink/40 dark:text-paper/40 text-xs">{new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          <div className="flex justify-end pt-2">
            <button onClick={() => { onEdit(supplier); onClose(); }}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors">
              <Pencil size={18} /> Edit Supplier
            </button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Action Menu ──────────────────────────────────────────────────────────────
function ActionMenu({ supplier, onEdit, onDelete, onDetail }) {
  const [open, setOpen] = useState(false);
  const items = [
    { icon: <Info size={16} />,   label: 'View Details',    fn: onDetail, color: 'text-ink/70 dark:text-paper/70' },
    { icon: <Pencil size={16} />, label: 'Edit Supplier',   fn: onEdit,   color: 'text-ink/70 dark:text-paper/70' },
    { icon: <Trash2 size={16} />, label: 'Remove Supplier', fn: onDelete, color: 'text-primary' },
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
            {items.map(a => (
              <button key={a.label} onClick={() => { a.fn(supplier); setOpen(false); }}
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>{[200, 130, 120, 120, 60, 50, 40].map((w, i) => (
    <td key={i} className="px-5 py-4"><div className="h-4 bg-paper-rule dark:bg-ink-rule rounded animate-pulse" style={{ width: w }} /></td>
  ))}</tr>
);

// ─── Avatar ───────────────────────────────────────────────────────────────────
const SupplierAvatar = ({ name }) => {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const color    = name.charCodeAt(0) % 2 === 0 ? 'bg-brass/15 text-brass-deep dark:text-brass' : 'bg-primary/10 text-primary';
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-xs flex-shrink-0 ${color}`}>{initials}</div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const {
    suppliers, stats, loading, error,
    search, handleSearch,
    modal, setModal,
    handleCreate, handleUpdate, handleDelete,
  } = useSuppliers();

  return (
    <div className="p-6 md:p-8 min-h-screen">
      {/* Modals */}
      {modal?.type === 'add' && (
        <SupplierModal onClose={() => setModal(null)} onSubmit={handleCreate} />
      )}
      {modal?.type === 'edit' && (
        <SupplierModal supplier={modal.supplier} onClose={() => setModal(null)}
          onSubmit={(form) => handleUpdate(modal.supplier._id, form)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal supplier={modal.supplier} onClose={() => setModal(null)}
          onConfirm={() => handleDelete(modal.supplier)} />
      )}
      {modal?.type === 'detail' && (
        <DetailModal supplier={modal.supplier} onClose={() => setModal(null)}
          onEdit={(s) => setModal({ type: 'edit', supplier: s })} />
      )}

      <PageHeader
        icon={Truck}
        title="Supplier Management"
        description="Manage vendor relationships and supply chain partners"
        actions={
          <button onClick={() => setModal({ type: 'add' })}
            className="inline-flex items-center gap-2 h-10 bg-primary text-white px-4 rounded-xl font-semibold text-sm shadow-sm shadow-primary/25 hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Add Supplier
          </button>
        }
      />

      {error && <div className="mb-6"><ErrorBanner message={error} onRetry={() => window.location.reload()} /></div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <div className="w-11 h-11 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">
            <Store size={22} />
          </div>
          <p className="text-xs text-ink/50 dark:text-paper/50 font-medium">Total Suppliers</p>
          {loading
            ? <Skeleton className="h-7 w-20 mt-1.5" />
            : <p className="text-2xl font-bold text-ink dark:text-paper mt-1 tracking-tight tabular-nums">{stats.total}</p>}
        </div>
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <div className="w-11 h-11 bg-[#2E7D32]/10 text-[#2E7D32] dark:text-[#4CAF50] rounded-xl flex items-center justify-center mb-4">
            <BadgeCheck size={22} />
          </div>
          <p className="text-xs text-ink/50 dark:text-paper/50 font-medium">Active Suppliers</p>
          {loading
            ? <Skeleton className="h-7 w-20 mt-1.5" />
            : <p className="text-2xl font-bold text-ink dark:text-paper mt-1 tracking-tight tabular-nums">{stats.active}</p>}
        </div>
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <div className="w-11 h-11 bg-brass/10 text-brass rounded-xl flex items-center justify-center mb-4">
            <Award size={22} />
          </div>
          <p className="text-xs text-ink/50 dark:text-paper/50 font-medium">Top Supplier</p>
          {loading ? <Skeleton className="h-7 w-32 mt-1.5" /> : (
            <div className="mt-1">
              <p className="text-lg font-bold text-ink dark:text-paper truncate leading-tight">{stats.topSupplier?.name || '—'}</p>
              {stats.topSupplier && <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">{stats.topSupplier.productCount} products</p>}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-4 mb-5">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40" />
          <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search by company name or email…"
            className="w-full pl-10 pr-4 py-2.5 border border-paper-rule dark:border-ink-rule rounded-xl text-sm text-ink dark:text-paper bg-paper dark:bg-ink placeholder:text-ink/30 dark:placeholder:text-paper/30 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                {['Supplier', 'Contact Person', 'Phone', 'Email', 'Products', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
              {loading
                ? [1,2,3,4,5,6].map(i => <SkeletonRow key={i} />)
                : suppliers.length === 0
                  ? (
                    <tr><td colSpan={7} className="py-12">
                      <EmptyState
                        icon={Truck}
                        title={search ? 'No suppliers match your search' : 'No suppliers yet'}
                        description={search
                          ? 'Try a different search term to find your vendor.'
                          : 'Add your first supplier to start tracking vendor relationships.'}
                        action={
                          search
                            ? null
                            : <button onClick={() => setModal({ type: 'add' })} className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"><Plus size={16} /> Add Supplier</button>
                        }
                      />
                    </td></tr>
                  )
                  : suppliers.map(s => (
                    <tr key={s._id} className="hover:bg-paper/60 dark:hover:bg-ink/60 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <SupplierAvatar name={s.name} />
                          <div>
                            <p className="font-semibold text-ink dark:text-paper text-sm">{s.name}</p>
                            {s.address && <p className="text-[10px] text-ink/40 dark:text-paper/40 truncate max-w-[180px]">{s.address}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-ink/70 dark:text-paper/70">{s.contactPerson || <span className="text-ink/30 dark:text-paper/30">—</span>}</td>
                      <td className="px-5 py-4 text-sm text-ink/70 dark:text-paper/70 font-mono text-xs">{s.phone || <span className="text-ink/30 dark:text-paper/30">—</span>}</td>
                      <td className="px-5 py-4 text-sm text-ink/70 dark:text-paper/70">{s.email || <span className="text-ink/30 dark:text-paper/30">—</span>}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-ink dark:text-paper tabular-nums">{s.productCount ?? 0}</span>
                          <span className="text-xs text-ink/50 dark:text-paper/50">SKUs</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#2E7D32]/10 text-[#2E7D32] dark:text-[#4CAF50] border border-[#2E7D32]/25">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32]" /> Active
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <ActionMenu supplier={s}
                          onDetail={(s) => setModal({ type: 'detail', supplier: s })}
                          onEdit={(s)   => setModal({ type: 'edit',   supplier: s })}
                          onDelete={(s) => setModal({ type: 'delete', supplier: s })}
                        />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        {!loading && suppliers.length > 0 && (
          <div className="px-5 py-3 border-t border-paper-rule dark:border-ink-rule bg-paper/50 dark:bg-ink/50">
            <p className="text-xs text-ink/40 dark:text-paper/40">
              Showing <strong className="text-ink dark:text-paper">{suppliers.length}</strong> supplier{suppliers.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
