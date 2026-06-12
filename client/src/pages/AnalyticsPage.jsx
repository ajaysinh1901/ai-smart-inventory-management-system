import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Package, DollarSign, ShoppingCart } from 'lucide-react';
import { ErrorBanner, PageHeader, Skeleton, KpiStrip, StatusGlyph } from '../components/ui';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../services/api';
import { fmtINR } from '../utils/format';
import { useTheme } from '../context/ThemeContext';
import {
  categorical, lineStroke, lineDot, barFill,
  gridStroke, axisTickFill, tooltipStyle,
  healthyFill, lowFill, outFill,
} from '../utils/chartTheme';

// Reusable empty-state for chart panels
const ChartEmpty = ({ icon: Icon = BarChart3, title = 'No data yet', height = 280 }) => (
  <div
    style={{ height }}
    className="flex flex-col items-center justify-center text-ink/30 dark:text-paper/30"
  >
    <Icon size={36} strokeWidth={1.4} />
    <p className="text-xs font-semibold text-ink/50 dark:text-paper/50 mt-2">{title}</p>
    <p className="text-[11px] text-ink/30 dark:text-paper/30 mt-0.5">Make a sale to populate this chart</p>
  </div>
);

export default function AnalyticsPage() {
  const [salesData, setSalesData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [profitData, setProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, iRes, pRes] = await Promise.all([
          api.get('/analytics/sales'),
          api.get('/analytics/inventory'),
          api.get('/analytics/profit'),
        ]);
        setSalesData(sRes.data.data);
        setInventoryData(iRes.data.data);
        setProfitData(pRes.data.data);
      } catch (err) {
        setError('Failed to load analytics data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const grid   = gridStroke(isDark);
  const tick   = axisTickFill(isDark);
  const ttStyle = tooltipStyle(isDark);

  if (loading) {
    return (
      <div className="p-6 md:p-8 min-h-screen space-y-6 w-full">
        <PageHeader
          icon={BarChart3}
          title="Analytics Dashboard"
          description="Comprehensive business intelligence and inventory metrics"
        />
        <KpiStrip loading items={[
          { label: 'Total Revenue', value: 0, format: 'money' },
          { label: 'Total Sales',   value: 0, format: 'count' },
          { label: 'Avg Order Value', value: 0, format: 'money' },
          { label: 'Inventory Value', value: 0, format: 'money' },
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
            <Skeleton className="h-5 w-48 mb-4" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
          <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <Skeleton className="h-5 w-44 mb-4" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Revenue',    value: profitData?.totalRevenue ?? 0,          format: 'money' },
    { label: 'Total Sales',      value: salesData?.totalOrders ?? 0,             format: 'count' },
    { label: 'Avg Order Value',  value: salesData?.avgOrderValue ?? 0,           format: 'money' },
    { label: 'Inventory Value',  value: inventoryData?.totalInventoryValue ?? 0, format: 'money' },
  ];

  const stockHealthArr = inventoryData?.stockHealth
    ? [
        { status: 'Healthy',     count: inventoryData.stockHealth.healthy ?? 0 },
        { status: 'Low Stock',   count: inventoryData.stockHealth.low ?? 0 },
        { status: 'Out of Stock', count: inventoryData.stockHealth.outOfStock ?? 0 },
      ]
    : [];

  const revenueTrend       = Array.isArray(profitData?.revenueTrend) ? profitData.revenueTrend : [];
  const salesByCategory    = Array.isArray(salesData?.salesByCategory) ? salesData.salesByCategory : [];
  const topProductsByRev   = Array.isArray(profitData?.topProductsByRevenue) ? profitData.topProductsByRevenue : [];
  const stockByCategory    = Array.isArray(inventoryData?.stockByCategory) ? inventoryData.stockByCategory : [];

  return (
    <div className="p-6 md:p-8 min-h-screen space-y-6 w-full">
      <PageHeader
        icon={BarChart3}
        title="Analytics Dashboard"
        description="Comprehensive business intelligence and inventory metrics"
      />

      {error && <ErrorBanner message={error} onRetry={() => window.location.reload()} onDismiss={() => setError(null)} />}

      {/* KPI Strip — no icon squares */}
      <KpiStrip items={kpis} loading={false} />

      {/* Charts Row 1: Revenue Trend + Sales by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Monthly Revenue Trend</h3>
          {revenueTrend.length === 0 ? <ChartEmpty icon={TrendingUp} title="No revenue data" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtINR(v)} contentStyle={ttStyle} />
                <Line type="monotone" dataKey="revenue" stroke={lineStroke} strokeWidth={1.5} dot={{ fill: lineDot, r: 3.5, strokeWidth: 0 }} activeDot={{ r: 5, fill: lineDot, strokeWidth: 2, stroke: isDark ? '#1B2A3D' : '#FFFFFF' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Sales by Category</h3>
          {salesByCategory.length === 0 ? <ChartEmpty icon={ShoppingCart} title="No category sales" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={salesByCategory} dataKey="revenue" nameKey="_id" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {salesByCategory.map((_, i) => (
                    <Cell key={i} fill={categorical[i % categorical.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtINR(v)} contentStyle={ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: tick, fontFamily: '"JetBrains Mono", monospace' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2: Inventory Health + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Inventory Health</h3>
          {stockHealthArr.length === 0 ? <ChartEmpty icon={Package} title="No inventory data" height={260} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stockHealthArr}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="status" tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {stockHealthArr.map((entry, i) => (
                  <Cell key={i} fill={entry.status === 'Healthy' ? healthyFill : entry.status === 'Low Stock' ? lowFill : outFill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
          <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Top Products by Revenue</h3>
          <div className="space-y-3">
            {topProductsByRev.slice(0, 8).map((p, i) => {
              const maxRev = topProductsByRev[0]?.totalRevenue || 1;
              return (
                <div key={p._id || i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-brass/60 dark:text-brass-soft/60 w-5 text-center">{i + 1}</span>
                      <span className="text-sm font-medium text-ink/85 dark:text-paper/85 truncate max-w-[200px]">{p.productName || p.sku || 'Unknown'}</span>
                    </div>
                    <span className="text-sm font-semibold text-ink/70 dark:text-paper/70 tabular-nums">{fmtINR(p.totalRevenue)}</span>
                  </div>
                  <div className="h-1.5 bg-paper-rule dark:bg-ink-rule rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(p.totalRevenue / maxRev) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            {topProductsByRev.length === 0 && (
              <p className="text-sm text-ink/40 dark:text-paper/40 text-center py-8">No sales data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Stock Value by Category */}
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-6 shadow-card">
        <h3 className="text-base font-display font-semibold text-ink dark:text-paper mb-5">Stock Value by Category</h3>
        {stockByCategory.length === 0 ? <ChartEmpty icon={DollarSign} title="No stock data" height={260} /> : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stockByCategory} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis type="number" tick={{ fontSize: 11, fill: tick, fontFamily: '"JetBrains Mono", monospace' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="_id" tick={{ fontSize: 11, fill: tick, fontFamily: '"Poppins", system-ui, sans-serif' }} width={100} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => fmtINR(v)} contentStyle={ttStyle} />
            <Bar dataKey="totalValue" fill={barFill} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
