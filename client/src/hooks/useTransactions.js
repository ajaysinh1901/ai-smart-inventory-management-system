/** useTransactions.js — Custom hook for all transaction state + logic */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import {
  fetchTransactions, fetchTransactionStats,
  createTransaction, deleteTransaction,
} from '../services/transactionService';
import { fetchProducts } from '../services/productService';

const DEBOUNCE_MS = 400;

export function useTransactions() {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [stats,        setStats]        = useState({ total: 0, totalIN: 0, totalOUT: 0, todayCount: 0, totalINQty: 0, totalOUTQty: 0 });
  const [products,     setProducts]     = useState([]);
  const [meta,         setMeta]         = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  // Filters
  const [search,    setSearch]    = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [page,       setPage]       = useState(1);

  const [modal,  setModal]  = useState(null);
  const debounceRef = useRef(null);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedQ(val); setPage(1); }, DEBOUNCE_MS);
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [txRes, statsRes] = await Promise.all([
        fetchTransactions({ q: debouncedQ, type: filterType, dateFrom, dateTo, page, limit: 15 }),
        fetchTransactionStats(),
      ]);
      setTransactions(txRes.data.data);
      setMeta(txRes.data.meta || { total: 0, page: 1, totalPages: 1 });
      setStats(statsRes.data.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load transactions.');
    } finally { setLoading(false); }
  }, [debouncedQ, filterType, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  // Load product list for the Add form
  useEffect(() => {
    fetchProducts({ limit: 200 })
      .then(r => setProducts(r.data.data || []))
      .catch(() => {});
  }, []);

  const handleCreate = async (form) => {
    try {
      const { data } = await createTransaction(form);
      toast.success(`Transaction created — ${data.data.type} × ${data.data.quantity} units.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create transaction.');
      throw e;
    }
  };

  const handleDelete = async (tx) => {
    try {
      await deleteTransaction(tx._id);
      toast.success(`Transaction #${tx._id.slice(-6)} removed. Stock reverted.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete transaction.');
      throw e;
    }
  };

  const resetFilters = () => {
    setSearch(''); setDebouncedQ('');
    setFilterType(''); setDateFrom(''); setDateTo('');
    setPage(1);
  };

  return {
    transactions, stats, products, meta, loading, error,
    search, filterType, dateFrom, dateTo, page,
    handleSearch, setFilterType, setDateFrom, setDateTo, setPage, resetFilters,
    modal, setModal,
    handleCreate, handleDelete,
  };
}
