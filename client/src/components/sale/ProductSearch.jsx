/**
 * ProductSearch.jsx
 * Debounced search box + results dropdown for the Quick-Sale screen.
 * Props:
 *   onSelect(product) — called when a result row is tapped/clicked
 *   mode: 'phone' | 'counter'
 *   autoFocus: boolean
 *   inputRef: forwarded ref (for USB scanner focus trap)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Camera, X, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchProducts } from '../../services/sale';
import { formatRupees } from '../../lib/decimal';
import { formatQty } from '../../lib/weight';
import { Skeleton } from '../ui';

export default function ProductSearch({ onSelect, mode = 'phone', autoFocus = false, inputRef: externalRef }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const internalRef = useRef(null);
  const inputRef = externalRef || internalRef;
  const timerRef = useRef(null);
  const dropdownRef = useRef(null);

  const doSearch = useCallback((q) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    searchProducts(q)
      .then((res) => {
        const items = res.data?.data || [];
        setResults(items);
        setOpen(items.length > 0 || q.trim().length > 0);
      })
      .catch(() => {
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inputRef]);

  const handleSelect = (product) => {
    onSelect(product);
    setQuery('');
    setOpen(false);
    setResults([]);
  };

  const handleCameraClick = () => {
    // TODO: v1.6 — wire getUserMedia barcode scan
    alert(t('quickSale.cameraTodo'));
  };

  const isCounter = mode === 'counter';

  return (
    <div className="relative w-full">
      {/* Search input */}
      <div className={`relative flex items-center rounded-xl border border-paper-rule bg-paper-card shadow-inner-sm ${isCounter ? '' : ''}`}>
        <Search size={16} className="absolute left-3 text-ink/40 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={t('quickSale.searchPlaceholder')}
          autoFocus={autoFocus}
          className={`w-full bg-transparent pl-9 pr-10 text-ink placeholder-ink/35 outline-none font-body rounded-xl ${
            isCounter ? 'py-2 text-sm' : 'py-3 text-base'
          }`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); setOpen(false); setResults([]); inputRef.current?.focus(); }}
            className="absolute right-3 text-ink/40 hover:text-ink/70 transition-colors p-0.5 rounded"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            onClick={handleCameraClick}
            className="absolute right-3 text-ink/40 hover:text-primary transition-colors p-0.5 rounded"
            title={t('quickSale.cameraBarcode')}
          >
            <Camera size={16} />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl border border-paper-rule bg-paper-card shadow-pop overflow-hidden max-h-72 overflow-y-auto"
        >
          {loading && (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="px-4 py-8 text-center">
              <Package size={28} className="mx-auto mb-2 text-ink/20" />
              <p className="text-sm text-ink/50">{t('quickSale.noProducts', { q: query })}</p>
            </div>
          )}
          {!loading && results.map((product) => (
            <button
              key={product._id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(product); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-paper-rule last:border-0 hover:bg-primary/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Package size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                <p className="text-xs text-ink/50 font-mono mt-0.5">
                  {formatRupees(product.pricePerUnit || product.price, { paise: true })}
                  <span className="ml-1 opacity-60">/ {product.unit || 'pcs'}</span>
                  {product.stock != null && (
                    <span className="ml-2 opacity-60">
                      · {formatQty(product.stock, product.unit || 'pcs')} {t('quickSale.inStock')}
                    </span>
                  )}
                </p>
              </div>
              {product.saleByWeight && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-brass bg-brass/10 px-1.5 py-0.5 rounded flex-shrink-0">
                  {t('quickSale.weightBadge')}
                </span>
              )}
              {/* Low-stock inline warning per spec §B.6 */}
              {product.reorderLevel != null &&
                parseFloat(product.stock) <= parseFloat(product.reorderLevel) &&
                parseFloat(product.stock) > 0 && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  {t('quickSale.lowStock')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
