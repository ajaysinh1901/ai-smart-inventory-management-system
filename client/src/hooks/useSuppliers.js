/**
 * useSuppliers.js  — Custom hook encapsulating all supplier state + logic
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import {
  fetchSuppliers, fetchSupplierStats,
  createSupplier, updateSupplier, deleteSupplier,
} from '../services/supplierService';

const DEBOUNCE_MS = 400;

export function useSuppliers() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [stats,     setStats]     = useState({ total: 0, active: 0, topSupplier: null });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [modal,     setModal]     = useState(null);

  const debounceRef = useRef(null);

  // Debounce search
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val), DEBOUNCE_MS);
  };

  // Load suppliers
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [suppRes, statsRes] = await Promise.all([
        fetchSuppliers({ q: debouncedQ }),
        fetchSupplierStats(),
      ]);
      setSuppliers(suppRes.data.data);
      setStats(statsRes.data.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load suppliers.');
    } finally { setLoading(false); }
  }, [debouncedQ]);

  useEffect(() => { load(); }, [load]);

  // CRUD handlers
  const handleCreate = async (form) => {
    try {
      const { data } = await createSupplier(form);
      toast.success(`"${data.data.name}" added as supplier.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add supplier.');
      throw e;
    }
  };

  const handleUpdate = async (id, form) => {
    try {
      const { data } = await updateSupplier(id, form);
      toast.success(`"${data.data.name}" updated.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update supplier.');
      throw e;
    }
  };

  const handleDelete = async (supplier) => {
    try {
      await deleteSupplier(supplier._id);
      toast.success(`"${supplier.name}" removed.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete supplier.');
      throw e;
    }
  };

  return {
    suppliers, stats, loading, error,
    search, handleSearch,
    modal, setModal,
    handleCreate, handleUpdate, handleDelete,
  };
}
