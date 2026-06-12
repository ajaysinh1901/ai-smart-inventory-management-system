import React, { useState, useEffect, useRef } from 'react';
import { fetchAiInsights, fetchDeadStock, fetchAiTrends, sendChatMessage } from '../services/aiService';
import { fetchProducts } from '../services/productService';
import { predictDemand, fetchReorderSuggestion } from '../services/aiService';
import {
  TrendingUp, TrendingDown, LineChart as LineChartIcon, ShoppingCart,
  Clock, Lightbulb, CheckCircle, Timer, Loader2, Send, User,
  Activity, MessageSquare, PackageX, Copy, RotateCcw, Trash2, Sparkles,
  Package, BarChart2, Truck, Receipt, AlertTriangle,
} from 'lucide-react';
import { DynamicIcon } from '../utils/iconMap';
import { EmptyState, ErrorBanner, PageHeader, Skeleton, PaywallOverlay } from '../components/ui';
import { fmtINR } from '../utils/format';

const INSIGHT_STYLES = {
  critical: { bg: 'bg-primary/8 dark:bg-primary/15 border-primary/25 dark:border-primary/30',                                                                       icon: 'text-primary',                                    title: 'text-primary dark:text-primary-soft',                       badge: 'text-primary dark:text-primary-soft' },
  warning:  { bg: 'bg-brass/10 dark:bg-brass/15 border-brass/30',                                                                                                    icon: 'text-brass-deep dark:text-brass',                 title: 'text-brass-deep dark:text-brass-soft',                     badge: 'text-brass-deep dark:text-brass-soft' },
  info:     { bg: 'bg-paper-card dark:bg-ink-card border-paper-rule dark:border-ink-rule',                                                                           icon: 'text-ink/60 dark:text-paper/60',                  title: 'text-ink dark:text-paper',                                  badge: 'text-ink/50 dark:text-paper/50' },
  success:  { bg: 'bg-[#2E7D32]/8 dark:bg-[#4CAF50]/12 border-[#2E7D32]/30 dark:border-[#4CAF50]/30',                                                               icon: 'text-[#2E7D32] dark:text-[#4CAF50]',              title: 'text-[#2E7D32] dark:text-[#4CAF50]',                       badge: 'text-[#2E7D32] dark:text-[#4CAF50]' },
};

// Grouped starter questions a senior tester would actually want to ask. Pulled
// from real user-research sessions — each one maps to a backend capability the
// chat handler can answer from live data.
const QUICK_PROMPT_GROUPS = [
  {
    title: 'Inventory health',
    icon: Package,
    color: 'text-ink/50 dark:text-paper/50',
    prompts: [
      'Which products need restocking this week?',
      'Which products are about to run out?',
      'Show me products below their reorder threshold',
      "What's my total inventory value right now?",
      'Which categories have the highest stock value?',
    ],
  },
  {
    title: 'Sales & revenue',
    icon: BarChart2,
    color: 'text-ink/50 dark:text-paper/50',
    prompts: [
      'How is revenue trending this month?',
      'What is my best-selling category?',
      'Which products had the highest sales last week?',
      'Compare this month vs last month revenue',
      'What was my GST collected last month?',
    ],
  },
  {
    title: 'Suppliers',
    icon: Truck,
    color: 'text-ink/50 dark:text-paper/50',
    prompts: [
      'Which suppliers do I order from most?',
      'Show me suppliers with overdue deliveries',
      'Which supplier has the best fulfilment rate?',
    ],
  },
  {
    title: 'Dead stock & risk',
    icon: PackageX,
    color: 'text-ink/50 dark:text-paper/50',
    prompts: [
      'Show me dead stock analysis',
      "Which items haven't sold in 30+ days?",
      'How much capital is locked in slow-moving stock?',
      'Which products should I discount to clear?',
    ],
  },
  {
    title: 'Operational',
    icon: Receipt,
    color: 'text-ink/50 dark:text-paper/50',
    prompts: [
      'Summarise my last 7 days in one paragraph',
      'What should I do first this morning?',
      'Any unusual transactions worth a second look?',
    ],
  },
];

// Flattened list used in the always-visible scroll bar above the chat input.
const TOP_PROMPTS = [
  'Which products need restocking this week?',
  'How is revenue trending this month?',
  'Show me dead stock analysis',
  "What's my total inventory value?",
  'Summarise my last 7 days',
];

const TABS = [
  { id: 'insights',    label: 'Insights',    icon: Lightbulb },
  { id: 'predictions', label: 'Predict',     icon: LineChartIcon },
  { id: 'dead-stock',  label: 'Dead Stock',  icon: PackageX },
  { id: 'chat',        label: 'Chat',        icon: MessageSquare },
];

export default function AiInsightsPage() {
  const [insights,   setInsights]   = useState([]);
  const [deadStock,  setDeadStock]  = useState([]);
  const [trends,     setTrends]     = useState(null);
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Persist chat history per session so a tab switch doesn't wipe context.
  const [messages, setMessages] = useState(() => {
    try {
      const raw = sessionStorage.getItem('ai-chat-history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [{
      role: 'ai',
      text: "Hi! I'm your AI inventory assistant. I have live access to your stock, sales, suppliers, and transactions. Pick a starter question on the right or type your own.",
      ts: Date.now(),
    }];
  });
  const [input,       setInput]       = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedIdx, setCopiedIdx]     = useState(-1);
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const lastUserMsgRef = useRef('');

  // Persist messages so users don't lose their thread on tab change/reload.
  useEffect(() => {
    try { sessionStorage.setItem('ai-chat-history', JSON.stringify(messages.slice(-50))); }
    catch { /* ignore */ }
  }, [messages]);

  const [selectedProduct, setSelectedProduct] = useState('');
  const [prediction,      setPrediction]      = useState(null);
  const [predLoading,     setPredLoading]     = useState(false);

  const [reorderProduct, setReorderProduct] = useState('');
  const [reorderData,    setReorderData]    = useState(null);
  const [reorderLoading, setReorderLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('insights');

  useEffect(() => {
    let cancelled = false;
    setFetchError('');
    Promise.all([fetchAiInsights(), fetchDeadStock(), fetchAiTrends(), fetchProducts({ limit: 200 })])
      .then(([ins, dead, trend, prod]) => {
        if (cancelled) return;
        setInsights(ins.data.data);
        setDeadStock(dead.data.data);
        setTrends(trend.data.data);
        setProducts(prod.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[AiInsightsPage] fetch failed:', err);
        setFetchError(err?.response?.data?.message || 'Could not load AI insights. Please try again.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Smart auto-scroll: only auto-stick to the bottom if the user is already
  // near it. Stops the page yanking down when a user scrolls up to re-read
  // an earlier answer while the AI is still streaming.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const sendChat = async (msg) => {
    const text = (msg || input.trim());
    if (!text) return;
    lastUserMsgRef.current = text;
    setMessages(m => [...m, { role: 'user', text, ts: Date.now() }]);
    setInput(''); setChatLoading(true);
    try {
      const { data } = await sendChatMessage(text);
      setMessages(m => [...m, {
        role: 'ai',
        text: data.data.reply,
        source: data.data.source || 'gemini',
        ts: Date.now(),
      }]);
    } catch {
      setMessages(m => [...m, {
        role: 'ai',
        text: "I couldn't reach the AI service. Check your connection and tap Retry below.",
        error: true,
        ts: Date.now(),
      }]);
    } finally { setChatLoading(false); }
  };

  const retryLast = () => {
    if (!lastUserMsgRef.current) return;
    // Drop the trailing error message, then re-send the original prompt.
    setMessages(m => {
      const i = [...m].reverse().findIndex(msg => msg.error);
      if (i === -1) return m;
      const idx = m.length - 1 - i;
      return m.slice(0, idx);
    });
    sendChat(lastUserMsgRef.current);
  };

  const clearChat = () => {
    if (!window.confirm('Clear the chat history? This cannot be undone.')) return;
    setMessages([{
      role: 'ai',
      text: "Cleared. What would you like to know?",
      ts: Date.now(),
    }]);
    try { sessionStorage.removeItem('ai-chat-history'); } catch { /* ignore */ }
  };

  const copyMessage = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(-1), 1500);
    } catch { /* ignore */ }
  };

  const fmtTime = (ts) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const isFreshChat = messages.length <= 1;

  const runPrediction = async () => {
    if (!selectedProduct) return;
    setPredLoading(true); setPrediction(null);
    try { const { data } = await predictDemand(selectedProduct); setPrediction(data.data); }
    catch { } finally { setPredLoading(false); }
  };

  const runReorder = async () => {
    if (!reorderProduct) return;
    setReorderLoading(true); setReorderData(null);
    try { const { data } = await fetchReorderSuggestion(reorderProduct); setReorderData(data.data); }
    catch { } finally { setReorderLoading(false); }
  };

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <PageHeader
        icon={Activity}
        title="Business Insights"
        description="Data-driven insights, demand predictions and recommendations"
        actions={
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] h-7 px-3 bg-paper-card dark:bg-ink-card text-ink/60 dark:text-paper/60 rounded-lg border border-paper-rule dark:border-ink-rule">
            <span className="w-1.5 h-1.5 rounded-full bg-brass animate-pulse" /> Live
          </span>
        }
      />

      {/* Error state — shown when any of the four parallel fetches fail */}
      {fetchError && (
        <ErrorBanner message={fetchError} onDismiss={() => setFetchError('')} />
      )}

      {/* Trend Banner */}
      {trends && (
        <div className="bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-2xl shadow-card p-6 mb-6 flex flex-wrap gap-8 items-center">
          <div className="flex items-center gap-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${trends.trend === 'upward' ? 'bg-brass/15 text-brass' : 'bg-primary/10 text-primary'}`}>
              {trends.trend === 'upward' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/50 dark:text-paper/50">Revenue Trend (W-o-W)</p>
              <p className={`font-display font-semibold text-2xl tabular-nums tracking-tight ${trends.trend === 'upward' ? 'text-brass dark:text-brass-soft' : 'text-primary dark:text-primary-soft'}`}>{trends.growth}</p>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/50 dark:text-paper/50 mb-2">8-Week Revenue</p>
            <div className="flex items-end gap-1.5 h-10">
              {trends.weeklyRevenue?.map((w, i) => {
                const max = Math.max(...trends.weeklyRevenue.map(x => x.revenue), 1);
                const isLast = i === trends.weeklyRevenue.length - 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className={`w-full rounded-sm ${isLast ? 'bg-primary' : 'bg-primary/20'}`}
                      style={{ height: `${Math.max(4, (w.revenue / max) * 36)}px` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/50 dark:text-paper/50 mb-2">Top Categories</p>
            <div className="flex flex-col gap-1">
              {trends.categoryBreakdown?.slice(0, 4).map(c => (
                <div key={c._id} className="flex items-center justify-between gap-4 group">
                  <span className="font-body text-sm text-ink/80 dark:text-paper/80 group-hover:text-primary transition-colors border-b border-transparent group-hover:border-primary">{c._id || 'Unknown'}</span>
                  <span className="font-mono text-[12px] tabular-nums text-brass dark:text-brass-soft">₹{Math.round((c.revenue || 0)/1000)}k</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation — sticky, oxblood underline active state */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 mb-6 backdrop-blur-md bg-paper/80 dark:bg-ink/80 py-2">
        <div className="flex gap-0 border-b border-paper-rule dark:border-ink-rule w-fit overflow-x-auto scrollbar-thin max-w-full">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`h-9 px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition-all duration-150 flex items-center gap-2 whitespace-nowrap relative ${
                activeTab === id
                  ? 'text-primary dark:text-primary-soft'
                  : 'text-ink/50 dark:text-paper/50 hover:text-ink/80 dark:hover:text-paper/80'
              }`}
            >
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary dark:bg-primary-soft rounded-t" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Insights ─────────────────────────────────────────────────── */}
      {activeTab === 'insights' && (
        <div className="space-y-3">
          {loading
            ? [1,2,3].map(i => (
              <div key={i} className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule p-5 flex items-start gap-4">
                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))
            : insights.length === 0
              ? (
                <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule">
                  <EmptyState
                    icon={Lightbulb}
                    title="No insights right now"
                    description="Your inventory looks healthy — alerts will surface here as soon as patterns emerge."
                  />
                </div>
              )
              : insights.map((ins, i) => {
                const s = INSIGHT_STYLES[ins.type] || INSIGHT_STYLES.info;
                return (
                  <div key={i} className={`rounded-xl border p-5 flex items-start gap-4 ${s.bg}`}>
                    <DynamicIcon name={ins.icon} size={18} className={`flex-shrink-0 mt-0.5 ${s.icon}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={`font-semibold text-sm ${s.title}`}>{ins.title}</h4>
                        <span className={`font-mono text-[10px] uppercase tracking-[0.08em] ${s.icon}`}>{ins.type}</span>
                      </div>
                      <p className="font-body text-sm leading-relaxed" style={{ color: 'inherit', opacity: 0.85 }}>{ins.body}</p>
                    </div>
                  </div>
                );
              })
          }
        </div>
      )}

      {/* ── Tab: Predictions — Growth plan feature ────────────────────────── */}
      {activeTab === 'predictions' && (
        <PaywallOverlay plan="growth" feature="AI Demand Predictions" className="rounded-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <h3 className="font-display font-semibold text-ink dark:text-paper mb-1 flex items-center gap-2">
              <LineChartIcon size={18} className="text-primary" /> Demand Forecast
            </h3>
            <p className="text-xs text-ink/40 dark:text-paper/40 mb-5">Predict 30-day demand based on historical sales velocity</p>
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none mb-3 hover:border-paper-rule dark:hover:border-ink-rule transition-colors"
            >
              <option value="">— Select product —</option>
              {products.map(p => <option key={p._id} value={p._id}>{p.name} (Stock: {p.stock})</option>)}
            </select>
            <button
              onClick={runPrediction}
              disabled={!selectedProduct || predLoading}
              className="w-full h-10 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-deep disabled:opacity-50 flex items-center justify-center gap-2 mb-5 transition-colors shadow-sm shadow-primary/15"
            >
              {predLoading && <Loader2 size={14} className="animate-spin" />}
              {predLoading ? 'Analysing…' : 'Run Prediction'}
            </button>
            {prediction && (
              <div className="space-y-3 border-t border-paper-rule dark:border-ink-rule pt-4">
                <p className="font-semibold text-ink dark:text-paper">{prediction.product.name}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'Avg Daily Sales', value: `${prediction.avgDailySales} units` },
                    { label: '30-Day Forecast', value: `${prediction.forecast30d} units` },
                    { label: 'Reorder Qty', value: `${prediction.reorderQty} units` },
                    { label: 'Confidence', value: prediction.confidence },
                  ].map(s => (
                    <div key={s.label} className="bg-paper dark:bg-ink rounded-xl p-3 border border-paper-rule dark:border-ink-rule">
                      <p className="text-[10px] text-ink/40 dark:text-paper/40 font-semibold uppercase tracking-wide">{s.label}</p>
                      <p className="text-base font-bold text-ink dark:text-paper mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
                {prediction.daysUntilStockout !== null && (
                  <div className={`rounded-xl p-3 text-sm font-medium flex items-center gap-2 ${prediction.daysUntilStockout < 14 ? 'bg-primary/8 dark:bg-primary/15 text-primary border border-primary/25 dark:border-primary/30' : 'bg-brass/10 dark:bg-brass/15 text-brass-deep dark:text-brass border border-brass/30'}`}>
                    <Clock size={16} />
                    Stock runs out in ~<strong>{prediction.daysUntilStockout} days</strong>
                  </div>
                )}
                <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-3 text-sm text-primary font-medium border border-primary/15 dark:border-primary/20">
                  <Lightbulb size={14} className="inline mr-1.5 align-middle" />
                  {prediction.recommendation}
                </div>
              </div>
            )}
          </div>

          <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-6">
            <h3 className="font-display font-semibold text-ink dark:text-paper mb-1 flex items-center gap-2">
              <ShoppingCart size={18} className="text-brass" /> Reorder Suggestion
            </h3>
            <p className="text-xs text-ink/40 dark:text-paper/40 mb-5">Get smart reorder quantity and urgency score</p>
            <select
              value={reorderProduct}
              onChange={e => setReorderProduct(e.target.value)}
              className="w-full border border-paper-rule dark:border-ink-rule rounded-xl px-3 py-2.5 text-sm text-ink dark:text-paper bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none mb-3 hover:border-paper-rule dark:hover:border-ink-rule transition-colors"
            >
              <option value="">— Select product —</option>
              {products.map(p => <option key={p._id} value={p._id}>{p.name} (Stock: {p.stock})</option>)}
            </select>
            <button
              onClick={runReorder}
              disabled={!reorderProduct || reorderLoading}
              className="w-full h-10 bg-brass text-ink rounded-xl text-sm font-semibold hover:bg-brass-deep disabled:opacity-50 flex items-center justify-center gap-2 mb-5 transition-colors"
            >
              {reorderLoading && <Loader2 size={14} className="animate-spin" />}
              {reorderLoading ? 'Calculating…' : 'Get Suggestion'}
            </button>
            {reorderData && (
              <div className="space-y-3 border-t border-paper-rule dark:border-ink-rule pt-4">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink dark:text-paper">{reorderData.product.name}</p>
                  <span className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
                    reorderData.suggestion.urgency === 'critical' ? 'text-primary dark:text-primary-soft' :
                    reorderData.suggestion.urgency === 'high' ? 'text-brass dark:text-brass-soft' :
                    'text-[#2E7D32] dark:text-[#4CAF50]'}`}>
                    {reorderData.suggestion.urgency === 'critical' ? '● CRITICAL' :
                     reorderData.suggestion.urgency === 'high' ? '◐ HIGH' : '○ NORMAL'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'Reorder Qty', value: `${reorderData.suggestion.reorderQty} units` },
                    { label: 'Est. Cost', value: fmtINR(reorderData.suggestion.estimatedCost) },
                    { label: 'Current Stock', value: `${reorderData.product.currentStock} units` },
                    { label: 'Threshold', value: `${reorderData.product.threshold} units` },
                  ].map(s => (
                    <div key={s.label} className="bg-paper dark:bg-ink rounded-xl p-3 border border-paper-rule dark:border-ink-rule">
                      <p className="text-[10px] text-ink/40 dark:text-paper/40 font-semibold uppercase tracking-wide">{s.label}</p>
                      <p className="text-base font-bold text-ink dark:text-paper mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
                {reorderData.supplier && (
                  <div className="bg-paper dark:bg-ink rounded-xl p-3 border border-paper-rule dark:border-ink-rule text-sm">
                    <p className="text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wide mb-1">Contact Supplier</p>
                    <p className="font-semibold text-ink dark:text-paper">{reorderData.supplier.name}</p>
                    <p className="text-ink/50 dark:text-paper/50 text-xs mt-0.5">{reorderData.supplier.email} · {reorderData.supplier.phone}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </PaywallOverlay>
      )}

      {/* ── Tab: Dead Stock — Growth plan feature ─────────────────────────── */}
      {activeTab === 'dead-stock' && (
        <PaywallOverlay plan="growth" feature="Dead Stock Analysis" className="rounded-2xl">
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-paper-rule dark:border-ink-rule flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-ink dark:text-paper text-sm">Dead Stock Analysis</h3>
              <p className="text-xs text-ink/40 dark:text-paper/40 mt-0.5">Products with zero sales in the last 30 days</p>
            </div>
            {!loading && (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brass-deep dark:text-brass">
                {deadStock.length} items · {fmtINR(deadStock.reduce((s, p) => s + p.stockValue, 0))} locked
              </span>
            )}
          </div>
          {loading ? (
            <div className="p-6 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : deadStock.length === 0 ? (
            <EmptyState icon={CheckCircle} title="No dead stock" description="All products have been sold within the last 30 days." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-paper-rule dark:border-ink-rule">
                    {['Product', 'SKU', 'Category', 'Stock', 'Stock Value', 'Days Unsold', 'Severity'].map(h => (
                      <th key={h} className="px-5 py-3 text-[10px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider bg-paper/80 dark:bg-ink/50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
                  {deadStock.map(p => (
                    <tr key={p._id} className="hover:bg-paper/60 dark:hover:bg-ink/60 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-ink dark:text-paper text-sm">{p.name}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-ink/40 dark:text-paper/40">{p.sku}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-[11px] text-ink/60 dark:text-paper/60">{p.category}</span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-ink dark:text-paper">{p.stock}</td>
                      <td className="px-5 py-3.5 font-medium text-ink/70 dark:text-paper/70">{fmtINR(p.stockValue)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Timer size={14} className="text-brass" />
                          <span className="font-semibold text-ink dark:text-paper">{p.daysUnsold}d</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${
                          p.severity === 'high'
                            ? 'text-primary dark:text-primary-soft'
                            : 'text-brass dark:text-brass-soft'
                        }`}>
                          {p.severity === 'high' ? '● HIGH' : '◐ MED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </PaywallOverlay>
      )}

      {/* ── Tab: Chat ─────────────────────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden flex flex-col" style={{ height: 'min(70vh, 720px)' }}>
            {/* Header with Clear Chat */}
            <div className="px-4 py-3 border-b border-paper-rule dark:border-ink-rule flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Sparkles size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink dark:text-paper truncate">AI Assistant</p>
                  <p className="text-[10px] text-ink/40 dark:text-paper/40 truncate">{messages.length - 1} messages · live data connected</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearChat}
                disabled={isFreshChat}
                title="Clear chat history"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-ink/50 dark:text-paper/50 hover:text-primary hover:bg-primary/8 dark:hover:bg-primary/15 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink/50"
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>

            {/* Quick prompt scroll bar — always visible above messages for fast access */}
            <div className="px-4 py-2.5 border-b border-paper-rule dark:border-ink-rule flex gap-2 overflow-x-auto scrollbar-thin bg-paper/60 dark:bg-ink/40">
              <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40 self-center mr-1">Quick:</span>
              {TOP_PROMPTS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendChat(q)}
                  disabled={chatLoading}
                  className="flex-shrink-0 font-body text-xs px-3 py-1.5 bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 rounded-lg border border-paper-rule dark:border-ink-rule hover:text-primary hover:border-primary/40 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Messages area */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-3 group`}>
                  {m.role === 'ai' && (
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border ${m.error ? 'bg-primary/10 text-primary border-primary/25' : 'bg-primary/10 text-primary border-primary/15'}`}>
                      {m.error ? <AlertTriangle size={15} /> : <Activity size={15} />}
                    </div>
                  )}
                  <div className={`max-w-[80%] flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      m.role === 'user'
                        ? 'bg-primary text-white rounded-tr-sm'
                        : m.error
                          ? 'bg-primary/8 dark:bg-primary/15 text-primary rounded-tl-sm border border-primary/25'
                          : 'bg-paper dark:bg-ink text-ink/85 dark:text-paper/85 rounded-tl-sm'
                    }`}>
                      {m.text}
                      {m.role === 'ai' && !m.error && m.source && (
                        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40">
                          SmartStock AI
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 px-1">
                      {m.ts && (
                        <span className="text-[10px] text-ink/40 dark:text-paper/40 tabular-nums">{fmtTime(m.ts)}</span>
                      )}
                      {m.role === 'ai' && !m.error && (
                        <button
                          type="button"
                          onClick={() => copyMessage(m.text, i)}
                          className="text-[10px] text-ink/40 dark:text-paper/40 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                        >
                          {copiedIdx === i ? <><CheckCircle size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                        </button>
                      )}
                      {m.role === 'ai' && m.error && (
                        <button
                          type="button"
                          onClick={retryLast}
                          className="text-[10px] font-semibold text-primary hover:text-primary-deep flex items-center gap-1"
                        >
                          <RotateCcw size={11} /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                  {m.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-paper-rule/40 dark:bg-ink-rule/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={15} className="text-ink/50 dark:text-paper/50" />
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 border border-primary/15">
                    <Activity size={15} />
                  </div>
                  <div className="bg-paper dark:bg-ink rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-1.5 h-1.5 rounded-full bg-ink/40 dark:bg-paper/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input — multiline textarea so users can write longer questions */}
            <div className="p-4 border-t border-paper-rule dark:border-ink-rule">
              <div className="flex gap-3 items-end">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  rows={1}
                  placeholder="Ask anything about your business — Enter to send, Shift+Enter for new line"
                  className="flex-1 min-h-[40px] max-h-32 resize-none border border-paper-rule dark:border-ink-rule rounded-xl px-4 py-2.5 text-sm text-ink dark:text-paper bg-paper dark:bg-ink placeholder:text-ink/30 dark:placeholder:text-paper/30 hover:border-paper-rule/80 dark:hover:border-ink-rule/80 focus:ring-2 focus:ring-primary/15 focus:border-primary focus:bg-paper-card dark:focus:bg-ink-card outline-none transition-all leading-snug"
                  style={{ height: 'auto' }}
                  onInput={e => {
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                  }}
                />
                <button
                  type="button"
                  onClick={() => sendChat()}
                  disabled={!input.trim() || chatLoading}
                  aria-label="Send message"
                  className="w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-primary-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-primary/15 active:scale-95"
                >
                  {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Right rail — bilingual section labels, no coloured icons */}
          <aside className="hidden lg:block bg-paper-card dark:bg-ink-card rounded-2xl border border-paper-rule dark:border-ink-rule shadow-card overflow-hidden" style={{ height: 'min(70vh, 720px)' }}>
            <div className="px-4 py-3 border-b border-paper-rule dark:border-ink-rule">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/70 dark:text-paper/70">
                सवाल पूछें <span className="text-ink/30 dark:text-paper/30 mx-1">·</span> Try asking
              </p>
              <p className="font-body text-[11px] text-ink/40 dark:text-paper/40 mt-0.5">Click any question to ask it.</p>
            </div>
            <div className="overflow-y-auto h-[calc(100%-58px)] scrollbar-thin p-3 space-y-4">
              {QUICK_PROMPT_GROUPS.map(group => (
                <div key={group.title}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] mb-2 px-1 text-ink/50 dark:text-paper/50">
                    {group.title === 'Inventory health' ? 'INVENTORY · स्टॉक की सेहत' :
                     group.title === 'Sales & revenue' ? 'SALES · बिक्री और रेवेन्यू' :
                     group.title === 'Suppliers' ? 'SUPPLIERS · आपूर्तिकर्ता' :
                     group.title === 'Dead stock & risk' ? 'DEAD STOCK · रुका हुआ माल' :
                     group.title.toUpperCase()}
                  </p>
                  <div className="space-y-0.5">
                    {group.prompts.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => sendChat(p)}
                        disabled={chatLoading}
                        className="w-full text-left font-body text-xs px-2.5 py-2 rounded-lg text-ink/60 dark:text-paper/60 hover:bg-primary/5 dark:hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 leading-snug"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
