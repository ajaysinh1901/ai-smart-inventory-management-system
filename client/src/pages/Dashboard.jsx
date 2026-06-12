import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { fetchAiInsights } from '../services/aiService';
import { fetchSalesReport } from '../services/salesService';
import {
  Package, AlertTriangle, ArrowDown, ArrowUp, RefreshCw,
  TrendingUp, FileText, ShoppingCart, Activity, ShoppingBag, Copy,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { ErrorBanner, PageHeader, Skeleton, Money, KpiStrip } from '../components/ui';
import { fmtINR, fmtDate } from '../utils/format';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { lineStroke, lineDot, barFill, gridStroke, axisTickFill, tooltipStyle as chartTooltipStyle } from '../utils/chartTheme';

// (KpiStrip/KpiTile removed — using shared <KpiStrip> from components/ui)

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-xs shadow-pop"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#D2D6DC' }}
    >
      <p className="mb-1" style={{ color: '#5F6368' }}>{label}</p>
      <p className="font-semibold" style={{ color: '#0D1B2A' }}>
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </p>
    </div>
  );
}

// ─── Reorder helper ──────────────────────────────────────────────────────────
function buildReorderText(item) {
  const suggestedQty = Math.max((item.lowStockThreshold || 10) * 3, 20);
  return `Hi, please dispatch:\n${item.sku ? item.sku + ' — ' : ''}${item.name}\nQty: ${suggestedQty} units\n\nThank you!`;
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  const [data, setData] = useState(null);
  const [report, setReport] = useState(null);
  const [aiInsights, setAiInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const [dashRes, reportRes, aiRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        fetchSalesReport().catch(() => ({ data: { data: null } })),
        fetchAiInsights().catch(() => ({ data: { data: [] } })),
      ]);
      setData(dashRes.data.data);
      setReport(reportRes.data.data);
      setAiInsights(aiRes.data.data || []);
    } catch (err) {
      setError(t('dashboard.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const todayKey = new Date().toISOString().slice(0, 10);
  const last7 = report?.last7Days || [];
  const todayEntry = last7.find(d => (d._id || '').slice(0, 10) === todayKey);
  const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterdayEntry = last7.find(d => (d._id || '').slice(0, 10) === yesterdayKey);

  const todayRevenue = todayEntry?.revenue || 0;
  const yesterdayRevenue = yesterdayEntry?.revenue || 0;
  const revenueDelta = yesterdayRevenue > 0
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    : null;

  const gstThisMonth = report?.gstThisMonth ?? report?.taxAmountThisMonth ?? 0;
  const lowStockCount = data?.lowStock ?? 0;
  const totalInventoryVal = data?.totalInventoryValue ?? 0;

  const kpis = [
    {
      label: t('dashboard.kpi.todayRevenue'),
      value: todayRevenue,
      format: 'money',
      delta: revenueDelta == null ? undefined : {
        value: t('dashboard.kpi.vsYesterday', { pct: Math.abs(revenueDelta).toFixed(1) }),
        direction: revenueDelta >= 0 ? 'up' : 'down',
      },
    },
    {
      label: t('dashboard.kpi.gstMonth'),
      value: gstThisMonth,
      format: 'money',
    },
    {
      label: t('dashboard.kpi.lowStock'),
      value: lowStockCount,
      format: 'count',
      delta: lowStockCount > 0
        ? { value: t('common.actionNeeded'), direction: 'down' }
        : { value: t('common.stockHealthy'), direction: 'up' },
    },
    {
      label: t('dashboard.kpi.inventoryValue'),
      value: totalInventoryVal,
      format: 'money',
    },
  ];

  const chartData = last7.map(d => ({
    date: new Date(d._id).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
    revenue: d.revenue || 0,
  }));

  const topByRevenue = (report?.topProducts || []).slice(0, 5).map(p => ({
    name: (p._id || '').length > 22 ? (p._id || '').slice(0, 22) + '…' : p._id,
    fullName: p._id,
    revenue: p.totalRev || 0,
  }));

  const criticalInsights = (aiInsights || []).filter(i => i.type === 'critical' || i.type === 'warning').slice(0, 5);
  const criticalLowStock = (data?.lowStockItems || []).slice(0, 5);
  const recentTransactions = (data?.recentTransactions || []).slice(0, 8);

  // Chart theme-aware colors (from chartTheme.js)
  const grid = gridStroke(isDark);
  const tick = axisTickFill(isDark);
  const cardBg = isDark ? '#1B2A3D' : '#FFFFFF';
  const cardBorder = isDark ? '#2D3B4F' : '#D2D6DC';

  return (
    <div className="p-5 md:p-7 space-y-5 w-full pb-28 bg-app min-h-screen">

      <PageHeader
        title={t('dashboard.title')}
        meta={['SmartStock', 'FY 25–26', '₹ INR', t('common.live')]}
        actions={
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 h-8 px-3 text-xs font-semibold rounded-lg border transition-colors"
            style={{
              borderColor: '#D2D6DC',
              backgroundColor: '#FFFFFF',
              color: '#5F6368',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#51A2FF'; e.currentTarget.style.color = '#213467'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#D2D6DC'; e.currentTarget.style.color = '#5F6368'; }}
          >
            <RefreshCw size={12} /> {t('common.refresh')}
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadAll} onDismiss={() => setError(null)} />}

      {/* Dense KPI Strip — 4-up, no icon squares, shared primitive */}
      <KpiStrip items={kpis} loading={loading} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7-day revenue line chart */}
        <div
          className="lg:col-span-2 rounded-xl border p-5"
          style={{ backgroundColor: cardBg, borderColor: cardBorder, boxShadow: '0 1px 0 ' + cardBorder }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-[15px] leading-tight" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
                {t('dashboard.revenue7d')}
              </h3>
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] mt-0.5" style={{ color: '#5F6368' }}>{t('dashboard.dailySalesTotals')}</p>
            </div>
            <TrendingUp size={14} style={{ color: cardBorder, opacity: 0.6 }} />
          </div>
          {loading
            ? <Skeleton className="h-52 rounded-lg" />
            : chartData.length === 0
              ? (
                <div className="h-52 flex flex-col items-center justify-center gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#94A3B8' }}>
                    {t('common.khataEmpty')}
                  </p>
                  <p className="text-xs" style={{ color: '#5F6368' }}>
                    {t('common.noSales7d')}
                  </p>
                </div>
              )
              : (
                <ResponsiveContainer width="100%" height={208}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip formatter={fmtINR} />} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={lineStroke}
                      strokeWidth={1.5}
                      dot={{ fill: lineDot, r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: lineDot, strokeWidth: 2, stroke: cardBg }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )
          }
        </div>

        {/* Top 5 products bar chart */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: cardBg, borderColor: cardBorder, boxShadow: '0 1px 0 ' + cardBorder }}
        >
          <div className="mb-4">
            <h3 className="font-display font-semibold text-[15px] leading-tight" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
              {t('dashboard.topProducts')}
            </h3>
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] mt-0.5" style={{ color: '#5F6368' }}>{t('dashboard.byRevenue')}</p>
          </div>
          {loading
            ? <Skeleton className="h-52 rounded-lg" />
            : topByRevenue.length === 0
              ? (
                <div className="h-52 flex flex-col items-center justify-center gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#94A3B8' }}>
                    {t('common.noData')}
                  </p>
                  <p className="text-xs" style={{ color: '#5F6368' }}>
                    {t('dashboard.startSelling')}
                  </p>
                </div>
              )
              : (
                <ResponsiveContainer width="100%" height={208}>
                  <BarChart data={topByRevenue} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: tick, fontFamily: '"Poppins", system-ui, sans-serif' }} width={88} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={fmtINR} />} />
                    <Bar dataKey="revenue" fill={barFill} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )
          }
        </div>
      </div>

      {/* Transactions + Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent Transactions */}
        <div
          className="lg:col-span-3 rounded-xl border overflow-hidden"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
        >
          <div
            className="px-5 py-3 border-b flex items-center justify-between"
            style={{ borderColor: cardBorder }}
          >
            <div>
              <h3 className="font-display font-semibold text-[14px] leading-tight" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
                {t('dashboard.recentTx')}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] mt-0.5" style={{ color: '#5F6368' }}>
                {t('dashboard.last8Movements')}
              </p>
            </div>
            <button
              onClick={() => navigate('/transactions')}
              className="font-mono text-[11px] uppercase tracking-[0.06em] transition-colors"
              style={{ color: '#213467' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#51A2FF'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#213467'; }}
            >
              {t('common.viewAll')} →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                  {[
                    t('dashboard.table.product'),
                    t('dashboard.table.type'),
                    t('dashboard.table.qty'),
                    t('dashboard.table.date'),
                  ].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: '#5F6368', backgroundColor: isDark ? '#0D1B2A' : '#F0F4F8' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [1,2,3,4,5].map(i => (
                    <tr key={i}><td colSpan={4} className="px-4 py-2.5"><Skeleton className="h-4" /></td></tr>
                  ))
                  : recentTransactions.length === 0
                    ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center">
                          <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#94A3B8' }}>
                            {t('common.khataEmpty')}
                          </p>
                          <p className="text-xs mt-1" style={{ color: '#5F6368' }}>
                            {t('common.noTxYet')}
                          </p>
                        </td>
                      </tr>
                    )
                    : recentTransactions.map((tx, i) => (
                      <tr
                        key={tx._id}
                        style={{ borderBottom: i < recentTransactions.length - 1 ? `1px solid ${cardBorder}` : undefined }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(33,52,103,0.04)' : 'rgba(33,52,103,0.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium leading-tight truncate" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
                                {tx.productId?.name || 'Unknown'}
                              </p>
                              <p className="font-mono text-[10px] truncate mt-0.5" style={{ color: '#5F6368' }}>
                                {tx.productId?.sku || '—'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]"
                            style={{ color: tx.type === 'IN' ? '#2E7D32' : '#213467' }}
                          >
                            {tx.type === 'IN' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                            {tx.type}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2.5 font-mono text-[13px] font-medium tabular-nums"
                          style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}
                        >
                          {tx.quantity}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap" style={{ color: '#5F6368' }}>
                          {fmtDate(tx.createdAt)}
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Critical Alerts */}
        <div
          className="lg:col-span-2 rounded-xl border overflow-hidden"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
        >
          <div
            className="px-4 py-3 border-b flex items-center gap-2"
            style={{ borderColor: cardBorder }}
          >
            <AlertTriangle size={13} style={{ color: '#F57C00', flexShrink: 0 }} />
            <h3 className="font-display font-semibold text-[14px]" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
              {t('dashboard.criticalAlerts')}
            </h3>
            {!loading && (
              <span
                className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded border"
                style={{ color: '#F57C00', borderColor: '#F57C0040', backgroundColor: 'rgba(245,124,0,0.06)' }}
              >
                {criticalLowStock.length + criticalInsights.length}
              </span>
            )}
          </div>
          <div className="divide-y max-h-[340px] overflow-y-auto scrollbar-thin" style={{ divideColor: cardBorder }}>
            {loading
              ? [1,2,3].map(i => <div key={i} className="p-4"><Skeleton className="h-10 rounded-lg" /></div>)
              : (
                <>
                  {criticalLowStock.map(item => {
                    const supplierPhone = (item.supplier?.phone || '').replace(/\D/g, '');
                    const reorderText = buildReorderText(item);

                    const handleReorder = () => {
                      if (supplierPhone) {
                        const waPhone = supplierPhone.length === 10 ? '91' + supplierPhone : supplierPhone;
                        window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(reorderText)}`, '_blank', 'noopener');
                      } else {
                        navigator.clipboard.writeText(reorderText).then(() => {
                          toast.success('Order details copied — paste into any chat or email.');
                        }).catch(() => {
                          toast.info('Copy failed. Manually note: ' + item.name);
                        });
                      }
                    };

                    return (
                      <div
                        key={item._id}
                        className="px-4 py-3 transition-colors"
                        style={{ borderBottom: `1px solid ${cardBorder}` }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(33,52,103,0.04)' : 'rgba(33,52,103,0.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
                              {item.name}
                            </p>
                            <p className="font-mono text-[11px] mt-0.5" style={{ color: '#5F6368' }}>
                              {item.stock === 0
                                ? <span style={{ color: '#213467', fontWeight: 600 }}>○ OUT</span>
                                : <span style={{ color: '#51A2FF', fontWeight: 600 }}>◐ LOW · {item.stock}</span>
                              } units · threshold {item.lowStockThreshold}
                            </p>
                          </div>
                          <button
                            onClick={handleReorder}
                            title={supplierPhone ? `WhatsApp reorder to ${item.supplier?.name || 'supplier'}` : 'Copy order details to clipboard'}
                            className="flex-shrink-0 flex items-center gap-1 h-6 px-2 rounded font-mono text-[10px] uppercase tracking-[0.06em] border transition-colors"
                            style={{
                              backgroundColor: 'rgba(46,125,50,0.06)',
                              borderColor: 'rgba(46,125,50,0.25)',
                              color: '#2E7D32',
                            }}
                          >
                            {supplierPhone ? <ShoppingBag size={10} /> : <Copy size={10} />}
                            {supplierPhone ? 'Reorder' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {criticalInsights.map((ins, i) => (
                    <div
                      key={`ins-${i}`}
                      className="px-4 py-3 transition-colors"
                      style={{ borderBottom: `1px solid ${cardBorder}` }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(33,52,103,0.04)' : 'rgba(33,52,103,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: isDark ? '#D2D6DC' : '#0D1B2A' }}>
                            {ins.title}
                          </p>
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#5F6368' }}>{ins.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {criticalLowStock.length === 0 && criticalInsights.length === 0 && (
                    <div className="px-4 py-10 text-center">
                      <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#2E7D32' }}>
                        ✓ All systems healthy
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#5F6368' }}>
                        No critical alerts — stock levels look good
                      </p>
                    </div>
                  )}
                </>
              )
            }
          </div>
        </div>
      </div>

      {/* Floating Quick Action Bar */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30">
        <div
          className="backdrop-blur-sm rounded-xl border px-2 py-1.5 flex items-center gap-1"
          style={{
            backgroundColor: isDark ? 'rgba(27,42,61,0.95)' : 'rgba(255,255,255,0.95)',
            borderColor: '#D2D6DC',
            boxShadow: '0 8px 32px -8px rgba(13,27,42,0.2)',
          }}
        >
          <button
            onClick={() => navigate('/sales')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors text-white"
            style={{ backgroundColor: '#213467' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0D2240'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#213467'; }}
          >
            <FileText size={12} /> New Sale
          </button>
          <button
            onClick={() => navigate('/transactions')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors"
            style={{ color: isDark ? '#D2D6DC' : '#5F6368' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(33,52,103,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
          >
            <ArrowDown size={12} style={{ color: '#2E7D32' }} /> Stock In
          </button>
          <button
            onClick={() => navigate('/ai-insights')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors"
            style={{ color: isDark ? '#D2D6DC' : '#5F6368' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(33,52,103,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
          >
            <Activity size={12} style={{ color: '#51A2FF' }} /> Insights
          </button>
        </div>
      </div>
    </div>
  );
}
