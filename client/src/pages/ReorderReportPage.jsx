/**
 * ReorderReportPage.jsx — Route: /reorder-report
 *
 * Lists products where stock <= reorderLevel.
 * Columns: Name, Category, Current Stock (with unit), Reorder Level, Suggested Order Qty.
 * Suggested Order Qty = reorderLevel * 2 - stock, rounded up to packSize if set.
 *
 * CSV export + WhatsApp share (navigator.share when available, else clipboard).
 *
 * Data source: fetchProducts() from productService, filtered client-side for lowStock.
 * The backend supports ?stockStatus=low; we fall back to client-side if needed.
 *
 * Spec: setup-flow-and-units.md §D #10 (Chunk #10B)
 *
 * TODO(api): GET /api/v1/products?lowStock=true — server-side low-stock filter is
 *   not yet confirmed. Using ?stock_status=low (productService.fetchProducts) which
 *   matches the existing endpoint signature. If missing, client-side filter runs.
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download, Share2, Package, RefreshCw } from 'lucide-react';
import { fetchProducts } from '../services/productService';
import { parseRupees, formatRupees } from '../lib/decimal';
import { formatQty, UNIT_SUFFIX } from '../lib/weight';
import { EmptyState, ErrorBanner, PageHeader, KpiStrip } from '../components/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Suggested order qty: reorderLevel * 2 - stock, min 0, rounded up to packSize. */
function suggestedOrderQty(stock, reorderLevel, packSize) {
  const raw = Math.max(0, reorderLevel * 2 - stock);
  if (!packSize || packSize <= 0) return raw;
  return Math.ceil(raw / packSize) * packSize;
}

/** Build CSV text from low-stock products */
function buildCsv(rows) {
  const headers = ['Name', 'SKU', 'Category', 'Unit', 'Current Stock', 'Reorder Level', 'Suggested Order Qty'];
  const lines   = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      `"${r.name}"`,
      r.sku,
      `"${r.category || ''}"`,
      r.unit || 'pcs',
      r.stockNum.toFixed(3),
      r.reorderNum.toFixed(3),
      r.suggestedQty.toFixed(3),
    ].join(','));
  }
  return lines.join('\n');
}

/** Download a string as a .csv file */
function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build plain-text share message for WhatsApp */
function buildShareText(rows) {
  const header = `*Low Stock Alert — ${new Date().toLocaleDateString('en-IN')}*\n\n`;
  const items  = rows
    .map((r, i) => `${i + 1}. ${r.name} — Stock: ${formatQty(r.stockNum, r.unit)}, Order: ${formatQty(r.suggestedQty, r.unit)}`)
    .join('\n');
  return header + items + '\n\nPlease reorder urgently.';
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>
    {[200, 100, 100, 60, 110, 110, 130].map((w, i) => (
      <td key={i} className="px-5 py-4">
        <div className="h-4 bg-paper-rule dark:bg-ink-rule rounded animate-pulse" style={{ width: w }} />
      </td>
    ))}
  </tr>
);

// ─── Stock badge ──────────────────────────────────────────────────────────────
function StockBadge({ stockNum, reorderNum, unit }) {
  const isOut = stockNum <= 0;
  return (
    <span className={`font-mono font-semibold text-sm tabular-nums ${isOut ? 'text-primary' : 'text-amber-600 dark:text-amber-400'}`}>
      {formatQty(stockNum, unit)}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReorderReportPage() {
  const [allRows,  setAllRows]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [sharing,  setSharing]  = useState(false);
  const [copyMsg,  setCopyMsg]  = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    // Try server-side low-stock filter first; fall back to full list + client filter
    fetchProducts({ limit: 500, stockStatus: 'low' })
      .then((res) => {
        if (cancelled) return;
        const products = res.data?.data?.products || res.data?.products || res.data?.data || [];
        buildRows(products, cancelled);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: fetch all and filter client-side
        fetchProducts({ limit: 500 })
          .then((res) => {
            if (cancelled) return;
            const products = res.data?.data?.products || res.data?.products || res.data?.data || [];
            buildRows(products, cancelled, true);
          })
          .catch((e) => {
            if (!cancelled) {
              setError(e?.response?.data?.message || 'Failed to load products.');
              setLoading(false);
            }
          });
      });

    function buildRows(products, cancelled, clientFilter = false) {
      if (cancelled) return;
      const rows = products
        .filter((p) => {
          const stock   = parseRupees(p.stock);
          const reorder = parseRupees(p.reorderLevel ?? p.lowStockThreshold ?? 0);
          if (clientFilter) return reorder > 0 && stock <= reorder;
          return true; // already filtered server-side
        })
        .map((p) => {
          const stockNum   = parseRupees(p.stock);
          const reorderNum = parseRupees(p.reorderLevel ?? p.lowStockThreshold ?? 0);
          const packSize   = parseRupees(p.packSize);
          return {
            _id:          p._id,
            name:         p.name,
            sku:          p.sku,
            category:     p.category || '',
            unit:         p.unit || 'pcs',
            stockNum,
            reorderNum,
            suggestedQty: suggestedOrderQty(stockNum, reorderNum, packSize),
          };
        })
        .sort((a, b) => a.stockNum - b.stockNum); // most critical first

      setAllRows(rows);
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, []);

  const handleCsvExport = () => {
    if (!allRows.length) return;
    const csv = buildCsv(allRows);
    downloadCsv(csv, `reorder-report-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleShare = async () => {
    if (!allRows.length) return;
    const text = buildShareText(allRows);
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Low Stock Alert', text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopyMsg('Copied to clipboard!');
        setTimeout(() => setCopyMsg(''), 3000);
      }
    } catch {
      // User cancelled share or clipboard failed — silently ignore
    } finally {
      setSharing(false);
    }
  };

  const outCount  = allRows.filter(r => r.stockNum <= 0).length;
  const lowCount  = allRows.filter(r => r.stockNum > 0).length;

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <PageHeader
        title="Reorder Report"
        meta={['SmartStock', 'Low Stock Alert', `${allRows.length} SKUs`]}
        actions={
          <div className="flex items-center gap-2">
            {copyMsg && (
              <span className="text-xs text-[#2E7D32] font-semibold px-3 py-1.5 bg-[#2E7D32]/10 rounded-xl border border-[#2E7D32]/20">
                {copyMsg}
              </span>
            )}
            <button
              onClick={handleShare}
              disabled={sharing || loading || !allRows.length}
              className="inline-flex items-center gap-2 h-9 px-4 bg-[#2E7D32] text-white rounded-xl text-sm font-semibold hover:bg-[#1B5E20] transition-colors disabled:opacity-50 shadow-sm"
            >
              <Share2 size={16} />
              {sharing ? 'Sharing…' : 'WhatsApp Share'}
            </button>
            <button
              onClick={handleCsvExport}
              disabled={loading || !allRows.length}
              className="inline-flex items-center gap-2 h-9 px-4 border border-paper-rule dark:border-ink-rule rounded-xl text-sm font-semibold text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink transition-colors disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={() => window.location.reload()} />
        </div>
      )}

      {/* KPI Strip */}
      <div className="mb-6">
        <KpiStrip
          loading={loading}
          items={[
            { label: 'Total SKUs to Reorder', value: allRows.length, format: 'count' },
            { label: 'Out of Stock',           value: outCount,       format: 'count' },
            { label: 'Low Stock',              value: lowCount,       format: 'count' },
          ]}
        />
      </div>

      {/* Alert banner */}
      {!loading && allRows.length > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600/40 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {allRows.length} product{allRows.length !== 1 ? 's' : ''} need{allRows.length === 1 ? 's' : ''} to be reordered.
            Place orders before stock runs out.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                {['Product', 'SKU', 'Category', 'Unit', 'Current Stock', 'Reorder Level', 'Suggested Order Qty'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)
              ) : allRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <EmptyState
                      icon={Package}
                      title="सब ठीक है! No reorder needed."
                      description="Sabhi products ki stock reorder level se upar hai. Keep it up!"
                    />
                  </td>
                </tr>
              ) : (
                allRows.map((r) => (
                  <tr key={r._id} className="hover:bg-paper/60 dark:hover:bg-ink-card/60 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-sm text-ink dark:text-paper">{r.name}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink/50 dark:text-paper/50">{r.sku}</td>
                    <td className="px-5 py-3 text-sm text-ink/60 dark:text-paper/60">{r.category || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-block px-1.5 py-0.5 rounded-md bg-paper dark:bg-ink border border-paper-rule dark:border-ink-rule text-[10px] font-mono font-bold text-ink/50 dark:text-paper/50 uppercase">
                        {r.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StockBadge stockNum={r.stockNum} reorderNum={r.reorderNum} unit={r.unit} />
                    </td>
                    <td className="px-5 py-3 font-mono text-sm tabular-nums text-ink/70 dark:text-paper/70">
                      {formatQty(r.reorderNum, r.unit)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-lg font-mono text-sm font-bold tabular-nums">
                        {formatQty(r.suggestedQty, r.unit)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && allRows.length > 0 && (
          <div className="px-5 py-3.5 border-t border-paper-rule dark:border-ink-rule bg-paper/50 dark:bg-ink/30">
            <p className="text-xs text-ink/40 dark:text-paper/40">
              Showing <strong className="text-ink/70 dark:text-paper/70">{allRows.length}</strong> products below reorder level
              · Sorted by most critical first
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
