/**
 * ShrinkagePage.jsx — Route: /shrinkage
 *
 * Reads GET /api/v1/stock-adjustments?reason=damage&from=...&to=...
 * and aggregates client-side.
 *
 * Shows:
 *   - Total damage value (sum of |qty| * pricePerUnit at time of adjustment)
 *   - Top 5 products by damage qty (bar chart via recharts)
 *   - Period filter: last 7 days / 30 days / custom date range
 *
 * If the endpoint returns empty → kirana-friendly empty state.
 *
 * Spec: setup-flow-and-units.md §D #10 (Chunk #10C)
 *
 * TODO(api): GET /api/v1/stock-adjustments?reason=damage&from=...&to=... — not yet
 *   implemented server-side. Endpoint shape:
 *     GET /api/v1/stock-adjustments
 *     Query: { reason: 'damage', from: ISO8601, to: ISO8601 }
 *     Response: { success: true, data: Array<{ _id, productId: { name, unit, pricePerUnit }, qtyChange, createdAt, reasonDetail }>, meta: {...} }
 *   When this endpoint ships, remove the mocked-empty fallback below.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PackageX, TrendingDown, AlertTriangle, Calendar } from 'lucide-react';
import { fetchStockAdjustments } from '../services/stockAdjustmentService';
import { parseRupees, formatRupees } from '../lib/decimal';
import { formatQty } from '../lib/weight';
import { EmptyState, ErrorBanner, PageHeader, KpiStrip } from '../components/ui';

// ─── Period helpers ───────────────────────────────────────────────────────────
function getPeriodDates(period, customFrom, customTo) {
  const now = new Date();
  const to  = customTo  && period === 'custom' ? new Date(customTo)  : new Date(now);
  let from;
  if (period === '7d')     from = new Date(now.setDate(now.getDate() - 7));
  else if (period === '30d') from = new Date(new Date().setDate(new Date().getDate() - 30));
  else if (period === 'custom' && customFrom) from = new Date(customFrom);
  else from = new Date(new Date().setDate(new Date().getDate() - 30));
  return { from: from.toISOString(), to: to.toISOString() };
}

const PERIOD_OPTIONS = [
  { value: '7d',     label: 'Last 7 Days' },
  { value: '30d',    label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range' },
];

// ─── Recharts custom tooltip ──────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-800 mb-1 truncate max-w-[160px]">{label}</p>
      <p className="text-primary font-mono">Damage qty: <strong>{payload[0]?.value?.toFixed(3)}</strong></p>
    </div>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const KpiSkeleton = () => (
  <div className="h-8 w-28 bg-paper-rule dark:bg-ink-rule rounded animate-pulse" />
);

// ─── Aggregation ──────────────────────────────────────────────────────────────
function aggregate(adjustments) {
  // qtyChange for damage is negative (stock removed); take absolute value
  const byProduct = {};
  let totalValue  = 0;

  for (const adj of adjustments) {
    const qty      = Math.abs(parseRupees(adj.qtyChange));
    const price    = parseRupees(adj.productId?.pricePerUnit ?? adj.productId?.price ?? 0);
    const name     = adj.productId?.name || 'Unknown';
    const unit     = adj.productId?.unit || 'pcs';
    const value    = qty * price;

    totalValue += value;

    if (!byProduct[name]) {
      byProduct[name] = { name, unit, qty: 0, value: 0 };
    }
    byProduct[name].qty   += qty;
    byProduct[name].value += value;
  }

  const topProducts = Object.values(byProduct)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return { totalValue, topProducts, totalRecords: adjustments.length };
}

// ─── Chart colors ─────────────────────────────────────────────────────────────
const BAR_COLORS = ['#482de1', '#6b52e8', '#8f7aef', '#b3a3f5', '#d7ccfb'];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ShrinkagePage() {
  const [period,     setPeriod]     = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    const { from, to } = getPeriodDates(period, customFrom, customTo);

    fetchStockAdjustments({ reason: 'damage', from, to, limit: 500 })
      .then((res) => {
        const items = res.data?.data || [];
        setData(aggregate(items));
      })
      .catch((e) => {
        // If the endpoint doesn't exist yet, show empty state (not error)
        // A 404 means endpoint not deployed; treat as zero damage records.
        if (e?.response?.status === 404) {
          setData(aggregate([]));
        } else {
          setError(e?.response?.data?.message || 'Failed to load shrinkage data.');
        }
      })
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo]);

  useEffect(() => {
    // Don't fetch for custom until both dates provided
    if (period === 'custom' && (!customFrom || !customTo)) return;
    loadData();
  }, [loadData, period, customFrom, customTo]);

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label || '';

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <PageHeader
        title="Shrinkage Report"
        meta={['SmartStock', 'Damage & Loss', periodLabel]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`h-9 px-4 rounded-xl text-sm font-semibold transition-colors border ${
                  period === opt.value
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'border-paper-rule dark:border-ink-rule text-ink/70 dark:text-paper/70 hover:bg-paper dark:hover:bg-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Custom date range picker */}
      {period === 'custom' && (
        <div className="mb-6 bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                From
              </label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-ink/50 dark:text-paper/50 uppercase tracking-wider block mb-1">
                To
              </label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none"
              />
            </div>
            <button
              onClick={loadData}
              disabled={!customFrom || !customTo}
              className="h-10 px-5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={loadData} />
        </div>
      )}

      {/* KPI Strip */}
      <div className="mb-6">
        <KpiStrip
          loading={loading}
          items={[
            {
              label: 'Total Damage Value',
              value: data?.totalValue ?? 0,
              format: 'money',
            },
            {
              label: 'Damage Records',
              value: loading ? 0 : (data?.totalRecords ?? 0),
              format: 'count',
            },
            {
              label: 'Products Affected',
              value: loading ? 0 : (data?.topProducts?.length ?? 0),
              format: 'count',
            },
          ]}
        />
      </div>

      {!loading && data && (data.totalRecords === 0 || data.topProducts.length === 0) ? (
        /* Empty state — kirana-friendly tone */
        <div className="bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule shadow-card">
          <EmptyState
            icon={PackageX}
            title="Koi nuksan nahi! No damage recorded."
            description={`No damage entries found for ${periodLabel.toLowerCase()}. Keep it up — your stock is safe!`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart — Top 5 by damage qty */}
          <div className="bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <TrendingDown size={20} className="text-primary" />
              <h2 className="text-lg font-semibold text-ink dark:text-paper">Top 5 Damaged Products</h2>
            </div>
            {loading ? (
              <div className="h-48 bg-paper dark:bg-ink rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data?.topProducts || []}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  barSize={32}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-paper-rule dark:text-ink-rule"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-ink/50 dark:text-paper/50"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    width={60}
                    tickFormatter={(v) => v.length > 12 ? v.slice(0, 11) + '…' : v}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-ink/50 dark:text-paper/50"
                    tickLine={false}
                    axisLine={false}
                    width={45}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(72,45,225,0.05)' }} />
                  <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                    {(data?.topProducts || []).map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top products detail table */}
          <div className="bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle size={20} className="text-amber-500" />
              <h2 className="text-lg font-semibold text-ink dark:text-paper">Damage Breakdown</h2>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-paper-rule dark:bg-ink-rule rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-1 divide-y divide-paper-rule dark:divide-ink-rule">
                {(data?.topProducts || []).map((p, i) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-ink dark:text-paper truncate">{p.name}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="font-mono text-sm font-bold text-primary tabular-nums">
                        {formatQty(p.qty, p.unit)}
                      </p>
                      <p className="font-mono text-[11px] text-ink/50 dark:text-paper/50">
                        {formatRupees(p.value)} lost
                      </p>
                    </div>
                  </div>
                ))}
                {!data?.topProducts?.length && (
                  <p className="text-sm text-ink/40 dark:text-paper/40 py-4 text-center">No data for this period.</p>
                )}
              </div>
            )}
          </div>

          {/* Period summary card */}
          <div className="lg:col-span-2 bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={20} className="text-ink/50 dark:text-paper/50" />
              <h2 className="text-lg font-semibold text-ink dark:text-paper">Period Summary — {periodLabel}</h2>
            </div>
            {loading ? (
              <div className="h-12 bg-paper-rule dark:bg-ink-rule rounded-xl animate-pulse" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-paper dark:bg-ink rounded-xl p-4 border border-paper-rule dark:border-ink-rule text-center">
                  <p className="text-xs font-mono uppercase tracking-wider text-ink/50 dark:text-paper/50 mb-1">Total Loss Value</p>
                  <p className="text-xl font-bold text-primary font-mono">
                    {formatRupees(data?.totalValue ?? 0)}
                  </p>
                </div>
                <div className="bg-paper dark:bg-ink rounded-xl p-4 border border-paper-rule dark:border-ink-rule text-center">
                  <p className="text-xs font-mono uppercase tracking-wider text-ink/50 dark:text-paper/50 mb-1">Adjustment Records</p>
                  <p className="text-xl font-bold text-ink dark:text-paper font-mono">{data?.totalRecords ?? 0}</p>
                </div>
                <div className="bg-paper dark:bg-ink rounded-xl p-4 border border-paper-rule dark:border-ink-rule text-center">
                  <p className="text-xs font-mono uppercase tracking-wider text-ink/50 dark:text-paper/50 mb-1">Products Affected</p>
                  <p className="text-xl font-bold text-ink dark:text-paper font-mono">{data?.topProducts?.length ?? 0}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
