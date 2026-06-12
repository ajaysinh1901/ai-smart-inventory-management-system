/**
 * useInventory.js  — Custom hook encapsulating all inventory state + logic
 * The InventoryPage stays as a pure UI shell; all data logic lives here.
 */
import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  fetchProducts, fetchLowStock, createProduct,
  updateProduct, deleteProduct, adjustStock,
} from '../services/productService';
import { fetchSuppliers } from '../services/supplierService';
import { parseRupees } from '../lib/decimal';

const DEBOUNCE_MS = 450;

export function useInventory() {
  const { user } = useContext(AuthContext);
  const { toast } = useToast();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [products,  setProducts]  = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [meta,      setMeta]      = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  // Full-inventory KPI counts (not paged) — fetched separately
  const [lowCount,  setLowCount]  = useState(0);
  const [outCount,  setOutCount]  = useState(0);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [debouncedQ,   setDebouncedQ]   = useState('');
  const [filterCat,    setFilterCat]    = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page,         setPage]         = useState(1);
  const LIMIT = 10;

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [modal, setModal] = useState(null); // { type, product? }

  // ── Debounce search input ─────────────────────────────────────────────────────
  const debounceRef = useRef(null);
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(val);
      setPage(1);
    }, DEBOUNCE_MS);
  };

  // ── Load products ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch paged product list and full-inventory KPI counts in parallel.
      // The KPI counts must NOT use the paged array — they need the full collection.
      const [res, lowRes, outRes] = await Promise.all([
        fetchProducts({ page, limit: LIMIT, q: debouncedQ, category: filterCat, stockStatus: filterStatus }),
        fetchLowStock().catch(() => null),
        fetchProducts({ page: 1, limit: 1, stockStatus: 'out' }).catch(() => null),
      ]);
      setProducts(res.data.data);
      setMeta(res.data.meta || { total: res.data.data.length, page: 1, totalPages: 1 });
      // Low count = total products returned by /products/low-stock (full, not paged)
      if (lowRes) setLowCount((lowRes.data.data || []).length);
      // Out count = meta.total from a filtered query (stock_status=out)
      if (outRes) setOutCount(outRes.data.meta?.total ?? 0);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load inventory. Check your connection.');
    } finally { setLoading(false); }
  }, [page, debouncedQ, filterCat, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Load suppliers once (for the form dropdown)
  useEffect(() => {
    fetchSuppliers()
      .then(r => setSuppliers(r.data.data || []))
      .catch(() => {});
  }, []);

  // ── CRUD handlers ─────────────────────────────────────────────────────────────
  const handleCreate = async (formData) => {
    try {
      const { data } = await createProduct(formData);
      toast.success(`"${data.data.name}" added to inventory.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add product.');
      throw e;
    }
  };

  const handleUpdate = async (id, formData) => {
    try {
      const { data } = await updateProduct(id, formData);
      toast.success(`"${data.data.name}" updated.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update product.');
      throw e;
    }
  };

  const handleDelete = async (product) => {
    try {
      await deleteProduct(product._id);
      toast.success(`"${product.name}" removed from inventory.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete product.');
      throw e;
    }
  };

  const handleAdjustStock = async (product, quantity, type) => {
    try {
      await adjustStock(product, quantity, type, user?._id);
      const dir = type === 'increase' ? `+${quantity}` : `-${quantity}`;
      toast.success(`Stock adjusted (${dir}) for "${product.name}".`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to adjust stock.');
      throw e;
    }
  };

  // ── Filter helpers ────────────────────────────────────────────────────────────
  const resetFilters = () => {
    setSearch(''); setDebouncedQ('');
    setFilterCat(''); setFilterStatus('');
    setPage(1);
  };

  // ── Derived values from current page ─────────────────────────────────────────
  // pricePerUnit and stock are Decimal128 strings from the API (e.g. "65.00", "24.500").
  // Use parseRupees() to safely convert to JS number before arithmetic.
  // NOTE: totalValue is page-scoped (display only). lowCount/outCount come from
  // full-inventory API calls above so the KPI cards show accurate numbers.
  const totalValue = products.reduce((s, p) => {
    const price = parseRupees(p.pricePerUnit ?? p.price);
    const stock  = parseRupees(p.stock);
    return s + price * stock;
  }, 0);

  return {
    // data
    products, suppliers, meta, loading, error,
    totalValue, lowCount, outCount,
    // filters
    search, filterCat, filterStatus, page,
    handleSearch, setFilterCat, setFilterStatus,
    setPage, resetFilters,
    // modal
    modal, setModal,
    // actions
    handleCreate, handleUpdate, handleDelete, handleAdjustStock,
  };
}
