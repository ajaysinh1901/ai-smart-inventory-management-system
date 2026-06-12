import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, X, Send, Sparkles, HelpCircle, ExternalLink } from 'lucide-react';

/**
 * Floating Help Chatbot — explains SmartStock AI itself (features, pages,
 * GST behaviour, quick how-tos). Distinct from /ai-insights chat which
 * answers questions ABOUT inventory data.
 *
 * Self-contained: no backend calls. Intent matched against a knowledge base.
 */

const SUGGESTIONS = [
  'What is SmartStock AI?',
  'How do I create an invoice?',
  'How does GST work here?',
  'Explain the dashboard',
  'What can the AI Insights do?',
  'How do I add a new product?',
];

// ── Knowledge base — every answer is data-grounded for THIS software ──
const KNOWLEDGE = [
  {
    keys: ['what is smartstock', 'what is this', 'about software', 'about this app', 'introduce', 'overview of software', 'tell me about smartstock'],
    answer: () => `**SmartStock AI** is a complete inventory & sales platform built for Indian retailers.

**Core capabilities:**
• Product & supplier catalogue with HSN codes
• GST-compliant invoicing (CGST+SGST for intra-state, IGST for inter-state)
• Real-time stock tracking with IN/OUT transactions
• Analytics dashboard — revenue trends, top products, stock health
• AI Insights powered by Google Gemini — predictions, recommendations
• OCR Invoice Scanner (Tesseract) for quick data entry
• Role-based access (admin / manager / staff)

Built on the MERN stack with JWT auth and a strict GST tax engine.`,
    page: null,
  },
  {
    keys: ['dashboard', 'home page', 'main page', 'explain dashboard'],
    answer: () => `The **Dashboard** is your daily snapshot:
• Top KPIs — total revenue, orders, products, low-stock count
• Sales trend chart (last 30 days)
• Recent transactions feed
• Quick actions (new sale, new product)

It pulls live data from \`/analytics/dashboard\` and refreshes on every page visit. Best place to start your day.`,
    page: '/',
  },
  {
    keys: ['inventory', 'products page', 'product list', 'manage products', 'how to add product', 'add new product', 'add product', 'edit product', 'delete product'],
    answer: () => `The **Inventory** page (left sidebar → Inventory) is where you manage your product catalogue.

**To add a product:**
1. Click the **+ New Product** button
2. Fill in name, SKU (must be unique), category, price, stock, low-stock threshold
3. Pick a supplier from the dropdown
4. Save

**Other actions:**
• Search/filter by name or SKU
• Edit (pencil icon) updates price, stock, threshold
• Delete (trash icon) — reversible only via DB
• Stock badge shows green/amber/red based on threshold`,
    page: '/inventory',
  },
  {
    keys: ['sales', 'invoice', 'create invoice', 'how to create invoice', 'how do i create an invoice', 'new sale', 'billing', 'tax invoice'],
    answer: () => `The **Sales & Billing** page is for creating GST invoices and viewing history.

**To create a new invoice:**
1. Click **+ New Sale**
2. Enter customer (name, GSTIN if B2B, state — state determines tax type)
3. Add line items (search product → set qty → unit price autofills)
4. Toggle Inter-state if customer is in a different state
   • Intra-state → CGST 9% + SGST 9% (split equally)
   • Inter-state → IGST 18%
5. Apply discount if any
6. Save → invoice number is auto-generated atomically (\`INV-2026-00001\`)

Click any invoice in the list to view/print/save as PDF.`,
    page: '/sales',
  },
  {
    keys: ['gst', 'tax', 'cgst', 'sgst', 'igst', 'how does gst work', 'tax calculation', 'hsn'],
    answer: () => `**GST in SmartStock AI** follows India's standard rules:

• **Intra-state** (seller & buyer in same state) → split into **CGST 9% + SGST 9%** (total 18%).
• **Inter-state** (different states) → single **IGST 18%**.
• **HSN codes** are stored per line item (e.g., 8471 for computers, 8528 for monitors, 8542 for GPUs).
• **GSTIN** is captured for both seller and buyer on every invoice.
• **Invoice numbering** is atomic per fiscal year using a Counter doc — no duplicates even under load.

The toggle on the New Sale modal switches between intra/inter automatically based on the buyer's state, and you can override manually.`,
    page: '/sales',
  },
  {
    keys: ['analytics', 'analytics dashboard', 'charts', 'reports', 'revenue trend', 'kpi'],
    answer: () => `The **Analytics** page is your business intelligence hub.

**What you'll see:**
• **4 KPIs** — Total Revenue, Total Sales, Avg Order Value, Inventory Value
• **Monthly Revenue Trend** — line chart, last 6 months
• **Sales by Category** — donut chart
• **Inventory Health** — bar chart (Healthy / Low / Out of Stock)
• **Top Products by Revenue** — ranked list with progress bars
• **Stock Value by Category** — horizontal bar chart

All data updates live from \`/analytics/sales\`, \`/analytics/inventory\`, \`/analytics/profit\`. Ideal for weekly business reviews.`,
    page: '/analytics',
  },
  {
    keys: ['ai insights', 'ai page', 'ai features', 'what can the ai', 'ai do', 'gemini', 'predictions', 'predict demand', 'reorder suggestion', 'dead stock', 'ai chat'],
    answer: () => `**AI Insights** has 4 tabs powered by Google Gemini + live data:

1. **Insights** — automated alerts (low stock, dead stock, sales velocity, reorder candidates)
2. **Predict** — pick a product, get a 7-day demand forecast
3. **Dead Stock** — products that haven't sold in 60+ days (clearance candidates)
4. **Chat** — free-form questions about your store

**The chat falls back to live-data answers** when Gemini hits its free-tier limit, so you always get a useful response. Look for the badge:
• ✨ **Gemini** — answer from the AI model
• 📊 **Live Data** — answer computed directly from MongoDB

Try: *"which products need restocking"*, *"how to improve my sales"*, *"show me dead stock"*.`,
    page: '/ai-insights',
  },
  {
    keys: ['scanner', 'ocr', 'scan invoice', 'upload invoice', 'extract'],
    answer: () => `The **OCR Scanner** uses Tesseract.js to read invoice images and extract structured data.

**How to use:**
1. Click **OCR Scanner** in the sidebar
2. Upload an invoice image (JPG/PNG) or drag-and-drop
3. Wait a few seconds — text gets extracted
4. Review parsed fields (invoice #, date, amount, line items)
5. Edit if needed, then save

Best results with clear scans of printed invoices. Handwritten notes won't parse reliably.`,
    page: '/scanner',
  },
  {
    keys: ['supplier', 'vendor', 'add supplier'],
    answer: () => `The **Suppliers** page (currently embedded in Inventory) manages your vendor list.

**Each supplier record holds:**
• Company name + contact person
• Email & phone
• Full address
• GSTIN (validated format: 2 digit state + 10 PAN + 1 entity + 1 Z + 1 checksum)

Suppliers are linked to products via \`supplierId\`, so you can trace any product back to its source. The seed includes 6 real Indian distributors (Ingram Micro, Redington, Rashi, Compuage, Iris Global, Acro).`,
    page: '/suppliers',
  },
  {
    keys: ['transaction', 'stock movement', 'in out', 'audit'],
    answer: () => `The **Transactions** page is the audit log of all stock movements.

**Two types:**
• **IN** — stock arriving (purchase orders, returns from customer)
• **OUT** — stock leaving (sales, damages, returns to supplier)

Every sale you create automatically generates one OUT transaction per line item, linked back to the sale via \`saleId\`. This makes inventory math airtight — \`stock = sum(IN) - sum(OUT)\`.

Use it for stock audits or to investigate discrepancies.`,
    page: '/transactions',
  },
  {
    keys: ['settings', 'profile', 'change password', 'theme', 'dark mode', 'preferences'],
    answer: () => `The **Settings** page lets you manage your account and app preferences:

• **Profile** — update name, email
• **Password** — change with current password verification
• **Theme** — toggle dark / light mode (persisted in localStorage)
• **Notifications** — alert preferences
• **About** — version info

The theme toggle in the top-right also flips dark mode instantly without leaving Settings.`,
    page: '/settings',
  },
  {
    keys: ['role', 'permission', 'admin', 'manager', 'staff', 'access control'],
    answer: () => `**Role-based access control** has three tiers:

• **Admin** — full access, including user management
• **Manager** — can create/edit products, sales, suppliers; cannot manage users
• **Staff** — read-only on most pages, can create sales

Roles are enforced server-side via JWT middleware on every protected route. You can't bypass them by tweaking the frontend.`,
    page: null,
  },
  {
    keys: ['low stock', 'reorder', 'threshold', 'restock alert'],
    answer: () => `**Stock health** is computed per product:
• \`stock <= 0\` → **Out of stock** (red)
• \`stock <= lowStockThreshold\` → **Low stock** (amber)
• Otherwise → **Healthy** (green)

The threshold defaults to 10 units (5 for laptops/printers in the seeded data). You can edit it per product on the Inventory page. Low-stock products show on the Dashboard, Analytics, and AI Insights — three places that nudge you to reorder.`,
    page: '/inventory',
  },
  {
    keys: ['demo data', 'seed', 'sample data', 'populate', 'test data'],
    answer: () => `The seed populated your DB with realistic data for **Apex Electro Distributors**, a Gujarat-based electronics retailer:

• **6 suppliers** — Ingram Micro, Redington, Rashi, Compuage, Iris Global, Acro
• **41 products** across 8 categories (Laptops, Monitors, Components, Peripherals, Networking, Storage, Printers, Accessories)
• **110 sales** spanning Nov 2025 → Apr 2026 (~₹96.4 lakh revenue)
• **285 transactions** (41 IN + 244 OUT)

70% intra-state Gujarat customers, 30% inter-state — so you'll see both CGST+SGST and IGST invoices in the data.`,
    page: '/analytics',
  },
  {
    keys: ['login', 'sign in', 'register', 'sign up', 'authenticate', 'how to login'],
    answer: () => `**Authentication uses JWT** stored in an httpOnly cookie.

• **Login**: \`POST /auth/login\` with email + password
• **Register**: \`POST /auth/register\` (creates a manager-role user by default)
• **Logout**: \`POST /auth/logout\` (clears cookie)
• **Me**: \`GET /auth/me\` (returns current user, used to hydrate the app on load)

The current admin login (post-seed) is **admin@smartstock.ai / Admin@123**. Change it on the Settings page.`,
    page: '/login',
  },
  {
    keys: ['hello', 'hi', 'hey', 'help', 'help me', 'what can you do'],
    answer: () => `Hi! I'm the SmartStock AI **help bot** — I explain how the software works, where features live, and how to use them.

I'm different from the **AI Insights chat** (which answers questions about your inventory data using Gemini).

**Try asking me:**
• What is SmartStock AI?
• How do I create an invoice?
• How does GST work here?
• Explain the dashboard
• What can the AI Insights do?
• How do I add a product?

Or just type what you're trying to do.`,
    page: null,
  },
];

function findAnswer(query) {
  const q = query.toLowerCase();
  // Score each entry by how many keywords match
  let best = { score: 0, entry: null };
  for (const entry of KNOWLEDGE) {
    let score = 0;
    for (const k of entry.keys) {
      if (q.includes(k)) score += k.length; // longer matches win
    }
    if (score > best.score) best = { score, entry };
  }
  if (best.entry) return best.entry;

  // Fallback: keyword tokens overlap
  for (const entry of KNOWLEDGE) {
    if (entry.keys.some(k => k.split(' ').some(w => w.length > 3 && q.includes(w)))) {
      return entry;
    }
  }
  return null;
}

export default function HelpChatbot() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: "👋 Hi! I'm your SmartStock AI guide. Ask me anything about how this software works — features, pages, GST rules, anything." }
  ]);
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);

  // Don't render on /login or /ai-insights (redundant there — page has its own chat)
  const onLoginPage = location.pathname === '/login';
  const onInsightsPage = location.pathname === '/ai-insights';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const send = (text) => {
    const t = (text || input).trim();
    if (!t) return;
    setMessages(m => [...m, { role: 'user', text: t }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const match = findAnswer(t);
      const reply = match
        ? { role: 'bot', text: match.answer(), goto: match.page }
        : { role: 'bot', text: `I'm not sure about that one yet. I can explain features like the **dashboard**, **inventory**, **sales/invoicing**, **GST**, **analytics**, **AI insights**, **scanner**, **suppliers**, **transactions**, **settings**, and **roles**. Try one of the suggestions below.` };
      setMessages(m => [...m, reply]);
      setTyping(false);
    }, 350);
  };

  if (onLoginPage || onInsightsPage) return null;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-pop hover:scale-105 active:scale-95 transition-all flex items-center justify-center group"
          title="मदद · Help"
          aria-label="मदद · Help"
        >
          <MessageCircle size={24} />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#2E7D32] border-2 border-paper dark:border-ink rounded-full animate-pulse" />
          <span className="absolute right-16 px-3 py-1.5 rounded-lg bg-ink text-paper text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
            Need help? Ask me!
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(580px,calc(100vh-2.5rem))] bg-paper-card dark:bg-ink-card rounded-xl shadow-pop border border-paper-rule dark:border-ink-rule flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-primary to-primary-deep text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">SmartStock Guide</p>
                <p className="text-[10px] opacity-80 leading-tight">Software help & how-to</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Close help"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin bg-paper dark:bg-ink">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                {m.role === 'bot' && (
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5 border border-primary/15">
                    <HelpCircle size={14} />
                  </div>
                )}
                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-tr-sm'
                    : 'bg-paper-card dark:bg-ink-card text-ink dark:text-paper border border-paper-rule dark:border-ink-rule rounded-tl-sm'
                }`}>
                  {/* Render bold (**...**) and italic (*...*) inline */}
                  <FormattedText text={m.text} />
                  {m.goto && (
                    <button
                      onClick={() => { navigate(m.goto); setOpen(false); }}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-[11px] font-semibold transition-colors"
                    >
                      <ExternalLink size={11} /> Open this page
                    </button>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 border border-primary/15">
                  <HelpCircle size={14} />
                </div>
                <div className="bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
                  {[0, 150, 300].map(d => (
                    <div key={d} className="w-1.5 h-1.5 rounded-full bg-ink/40 dark:bg-paper/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 2 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 bg-paper dark:bg-ink">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule text-ink/70 dark:text-paper/70 hover:border-primary hover:text-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask about a feature…"
                className="flex-1 h-9 px-3 text-sm bg-paper dark:bg-ink border border-paper-rule dark:border-ink-rule rounded-xl focus:ring-2 focus:ring-primary/15 focus:border-primary outline-none text-ink dark:text-paper placeholder:text-ink/40 dark:placeholder:text-paper/40"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Send"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Lightweight inline markdown renderer (bold + italic + line breaks).
// We don't pull in a markdown library because the answers are constrained.
function FormattedText({ text }) {
  // Split on lines first to preserve line breaks
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {renderInline(line)}
          {li < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}

function renderInline(line) {
  // Match **bold** then *italic* then `code`
  const parts = [];
  let remaining = line;
  let i = 0;
  while (remaining.length > 0) {
    const bold = remaining.match(/^\*\*(.+?)\*\*/);
    const italic = remaining.match(/^\*(.+?)\*/);
    const code = remaining.match(/^`(.+?)`/);
    if (bold) {
      parts.push(<strong key={i++} className="font-bold">{bold[1]}</strong>);
      remaining = remaining.slice(bold[0].length);
    } else if (italic) {
      parts.push(<em key={i++} className="italic">{italic[1]}</em>);
      remaining = remaining.slice(italic[0].length);
    } else if (code) {
      parts.push(<code key={i++} className="px-1 py-0.5 rounded bg-paper-rule dark:bg-ink-rule font-mono text-[11px]">{code[1]}</code>);
      remaining = remaining.slice(code[0].length);
    } else {
      // Take chars until next special token
      const next = remaining.search(/\*\*|\*|`/);
      if (next === -1) {
        parts.push(<span key={i++}>{remaining}</span>);
        remaining = '';
      } else {
        parts.push(<span key={i++}>{remaining.slice(0, next)}</span>);
        remaining = remaining.slice(next);
      }
    }
  }
  return parts;
}
