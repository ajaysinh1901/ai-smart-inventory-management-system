# Indian SMB Market Review — SmartStock AI

**Status:** Draft
**Owner:** ceo
**Date:** 2026-04-28
**Horizon:** Next 90 days (May–July 2026)

---

## 1. Market Context (the half-page that anchors everything)

India has ~64 million MSMEs. The slice we sell to — businesses doing ₹40 lakh to ₹10 crore annual turnover with 1–10 staff — is roughly 8–10 million units. They are forced into formal accounting by GST, but most still run their day on a paper bill book, a WhatsApp group, and Tally on the accountant's laptop once a quarter.

The category is not empty. **Vyapar** (~30M downloads, ~₹3,599/year) owns the mind of the offline shopkeeper; **Khatabook** owns the credit-book mental model; **Tally Prime** owns the accountant; **Zoho Books** owns the digitally-native online seller; **Marg ERP** owns pharmacy and distribution. None of them is great at all four jobs simultaneously, and none has shipped genuinely useful AI yet — they have ML buzzwords on the marketing site and a flat ledger inside.

What's actually moving in the market right now (April 2026):

1. **E-invoicing threshold has dropped to ₹5 crore turnover** and is widely expected to drop to ₹1–2 crore within 12 months. Every Vyapar customer above ₹5 cr is a forced-migration candidate the day their CA sends the email.
2. **UPI is now ~70% of all retail payment volume**. A printed invoice without a "Scan to Pay" QR feels archaic to a buyer under 35.
3. **WhatsApp Business API pricing** has stabilised at roughly ₹0.30–0.80 per utility message — payment reminders are now economically viable to automate.
4. **Khatabook quietly de-emphasised lending** and left a gap: SMBs still want to track *who owes me what*, but with a real invoice trail, not a hand-typed name.
5. **Hindi/regional language UI** is no longer a "nice to have"; Tier-2/3 owners actively reject English-first apps. Vyapar ships in 12 languages.

Our edge today: a clean, modern dark-mode SaaS with **actually working AI insights (Gemini)** and **OCR ingestion** — both rare in this category. Our weakness: we look like a software product built for a software audience. The Indian SMB doesn't read documentation; they ask their nephew. Our next 90 days must close the trust gap with concrete, money-shaped features, not more polish.

---

## 2. Customer Archetypes (rupees, names, real pain)

### Persona A — Mehul, 38, Kirana + FMCG distribution, Pune
- Turnover **₹6.5 cr/yr**, 4 staff, 2,800 SKUs, ~120 invoices/day.
- Already crossed e-invoicing threshold. His CA emails him every 27th of the month asking "GSTR-1 ready ya nahi?"
- Pays Vyapar Premium ₹3,599/yr today. Open to switching for **two reasons only**: e-invoicing built-in, and stock that auto-deducts when he raises an invoice on his phone.
- **Willing to pay ₹4,800–6,000/year** if we kill his "manual upload to GST portal" workflow. **Lifetime value at this band: ~₹15,000 over 3 years.**

### Persona B — Sunita, 45, Single-doctor pharmacy, Indore
- Turnover **₹1.4 cr/yr**, 1 helper, 4,500 SKUs (every dose & strip is a different SKU).
- 60% of her business is **credit to nearby clinics + monthly families** — a classic "khata" pattern. She loses ~₹40,000/month to delayed/forgotten dues.
- Doesn't care about e-invoicing yet. Cares **deeply** about: (a) tracking customer credit, (b) batch + expiry warnings before a strip becomes scrap, (c) a barcode scan so she stops mistyping medicine names.
- Will pay **₹2,400–3,600/year** for a real customer credit ledger + expiry management. **LTV: ~₹9,000 over 3 years.** This is our volume segment.

### Persona C — Rohan, 29, D2C apparel + Instagram seller, Bengaluru
- Turnover **₹85 lakh/yr** across Shopify + Meesho + walk-in. 2 staff.
- Already digital-native. Currently uses Zoho Books (₹6,000/yr) but hates how it doesn't talk to his Insta DMs.
- His biggest pain is **inventory drift across channels** and **GSTR-1 reconciliation across marketplaces**. Will pay **₹6,000–9,000/year** if we save him 4 hours/week on reconciliation.
- This is a smaller TAM but the highest ARPU and the loudest on Twitter — strategic for word-of-mouth.

---

## 3. Top 7 Features, Ranked by 90-Day Profitability

Ranking criteria: ARPU lift × addressable %  −  build cost  −  regulatory/tech risk. Each row is mandatory for inclusion in the build queue.

### Rank 1 — **UPI deep-link "Scan to Pay" QR on every invoice**
- **Who pays:** All 3 personas. This is table-stakes that we are missing.
- **Why now:** UPI is 70% of retail payments. Every invoice we print today without a QR is a customer who walks across the street to a competitor who has one. It's also the cheapest signal that we are "made for India."
- **Unlock:** Conversion driver, not ARPU. Removes the "but my customers won't pay digitally" objection in every demo. **Reduces cash-handling friction → drives invoice frequency → drives engagement → drives renewal.**
- **Cost of NOT shipping:** Every Vyapar/Swipe demo wins this comparison. We literally cannot win the kirana segment without it.
- **Effort estimate:** **S** — UPI is `upi://pay?pa=<vpa>&pn=<name>&am=<amt>&tn=<invoice#>`. Generate QR client-side with `qrcode` lib, render on existing `InvoiceModal`. Add `vpa` + `payeeName` to `Settings.workspace`. **2–3 days.** No new schema, no new endpoint.

### Rank 2 — **Customer credit ledger ("Khata") with WhatsApp reminders**
- **Who pays:** Persona B (pharmacy, ~50% of our SMB market) and Persona A (distribution).
- **Why now:** Khatabook backed off lending and left an unmet need. Our existing `Sale` model already has `customer.phone`; we just don't track *paid vs unpaid*. WhatsApp invoice share already works. A reminder is the same code path with different copy.
- **Unlock:** Direct ARPU. **This single feature is the difference between ₹0 and ₹3,000/yr** for Sunita. It is our wedge into the largest persona.
- **Cost of NOT shipping:** Sunita installs Khatabook *alongside* us, then realises Khatabook is simpler, then leaves. We become "the GST one" — a commodity.
- **Effort estimate:** **M** — Need a real `Customer` model (currently embedded in Sale only), `payment` sub-doc on Sale (`{ method, amount, date }`), `paymentStatus: 'paid' | 'partial' | 'unpaid'`, a `/customers/:id/ledger` endpoint, a "Send reminder" CTA, and a WhatsApp template. **6–8 days end-to-end.**

### Rank 3 — **E-invoicing (IRP) + auto QR + IRN on invoice**
- **Who pays:** Persona A (₹5 cr+) and ~15% of Persona C. Also a **trust signal** to anyone who asks "are you compliant?"
- **Why now:** E-invoicing is the #1 GST nightmare for businesses crossing the threshold. The threshold has dropped 6 times in 5 years and will drop again. **The CA tells the SMB to switch tools** when this kicks in — so the trigger is a forced moment, not a pull moment. We must be on the shortlist when that happens.
- **Unlock:** Tier-1 paid plan justification. Lets us charge ₹4,800–7,200/yr (Vyapar parity + 30%) without pushback. Also unlocks a B2B sales motion to CAs as a referral channel.
- **Cost of NOT shipping:** We forfeit Persona A entirely — ~25% of SMB revenue and the highest-ARPU segment.
- **Effort estimate:** **L** — IRP integration via a sandbox-certified GSP (ClearTax/Masters India/IRIS). Schema additions (IRN, AckNo, AckDate, signed QR), error-handling, retry queue, and a "regenerate IRN" action. **12–18 days, requires `architect-gst` to own the spec.** Note: GSP onboarding has a 7–14 day cert lag — start the paperwork in week 1.

### Rank 4 — **Hindi + 4 regional languages (HI, MR, GU, TA, TE)**
- **Who pays:** All three personas, but mostly the Tier-2 ones. Vyapar's 30M downloads are largely on the strength of being Hindi-first.
- **Why now:** It's the lowest-cost trust signal in the Indian market. Owners forward demos to their accountant *and their wife*; if either sees English-only, the demo dies. Auto-translation with a native review pass is feasible in 90 days for the top 5 Indian languages.
- **Unlock:** Doubles the addressable market for free demos. Reduces onboarding drop-off by an estimated 30–40% in Tier-2/3 cities.
- **Cost of NOT shipping:** Permanent ceiling at the English-comfortable Tier-1 segment, which is also the most over-served segment.
- **Effort estimate:** **M** — `react-i18next` + `i18next-browser-languagedetector` on the client; extract strings to `locales/{en,hi,mr,gu,ta,te}.json`. AI-translate the first pass, native-speaker QA the top 200 strings (settings, invoice, errors). Add `language` to `Settings.preferences`. Invoice PDF needs Devanagari/regional font. **8–10 days build + native-review week.**

### Rank 5 — **Barcode scan-to-sell + thermal printer (58mm/80mm) support**
- **Who pays:** Persona B (pharmacy is unworkable without barcode), 30% of Persona A.
- **Why now:** A pharmacy with 4,500 SKUs cannot type product names on a phone keyboard at the counter. **This is the #1 reason Sunita stays on her current desktop POS instead of switching to mobile.** Thermal printer output is what every kirana actually expects — A4 print is a desktop-era artefact.
- **Unlock:** Unlocks the entire **counter / point-of-sale** workflow as a use-case. We graduate from "back-office tool" to "front-of-shop tool" — that doubles daily active usage and slashes churn.
- **Cost of NOT shipping:** Persona B is structurally unreachable.
- **Effort estimate:** **M** — Web: `@zxing/browser` for camera-based barcode scan. Add `barcode` field to `Product`. Thermal print: build a 58mm-width invoice template (string-based, ESC/POS for native; for now, browser print to thermal). **6–8 days.** Native ESC/POS via Bluetooth is L and can be deferred to v2.

### Rank 6 — **GSTR-1 / GSTR-3B JSON export + Tally XML export**
- **Who pays:** Persona A and Persona C — and crucially, **their CAs**. CAs are a referral multiplier; one happy CA brings 10–30 clients.
- **Why now:** Tally is the default export format every CA in India expects. Asking a CA to copy-paste from a CSV is how you get fired by the SMB. GSTR-1 JSON is the same export served two ways.
- **Unlock:** Removes the **single biggest churn risk**: "my CA said this app doesn't work with Tally." Also opens a CA channel partnership programme — refer SmartStock, get ₹300/customer/year recurring.
- **Cost of NOT shipping:** We lose any customer whose CA has an opinion. That's ~80% of customers above ₹2 cr turnover.
- **Effort estimate:** **M** — GSTR-1 JSON spec is published and stable; GSTR-3B is a smaller summary export. Tally XML is well-documented (`<TALLYMESSAGE>` / `<VOUCHER>` blocks). Build as a "Reports → Export" page. **7–10 days, owned by `architect-gst`.**

### Rank 7 — **Multi-branch / multi-warehouse with consolidated reporting**
- **Who pays:** The top 10–15% of Persona A and Persona B (anyone with a second shop, godown, or franchise). These are our **highest-LTV customers** — they pay ₹9,600–15,000/yr.
- **Why now:** It's the natural upgrade path: a customer who succeeds with 1 shop opens a 2nd in 12–18 months. We need this *before* their 2nd shop, or they'll switch to Tally/Marg out of necessity and never come back.
- **Unlock:** Top tier of pricing (Pro+, ₹9,600/yr). Also our retention story: customers who add a 2nd branch don't churn.
- **Cost of NOT shipping:** Capped LTV. We become a single-shop tool forever, which is exactly the segment competitors fight us on.
- **Effort estimate:** **L** — Schema-wide change: `branchId` on `Product`, `Sale`, `Transaction`, `Counter`. Branch picker in nav. Consolidated dashboard. Permission scoping. **15–20 days.** Should be the **last** of the 90-day list; ship in days 70–90.

> Honourable mentions deliberately **deprioritised** (see §6 "What NOT to build"):
> - E-way bill (only ₹50k+ inter-state movement, low daily frequency, regulatory complexity high — defer to Q3)
> - Shopify/Meesho integration (Persona C only, narrow TAM, integration brittleness — defer)
> - SMS notifications (WhatsApp is dominant; SMS is dying; don't pay Twilio rent)

---

## 4. Pricing Recommendation

### Free (current beta) → "Starter" (₹0 forever)
Up to **50 invoices/month, 1 user, 200 SKUs, 1 branch.** No e-invoicing, no Tally export, no credit ledger reminders (manual only). Strategy: a real free tier that converts **the kirana** who can't pay a SaaS fee but will tell five friends.

### **Growth — ₹2,499/year (~₹208/mo)**
- Unlimited invoices and SKUs, 3 users, **UPI Scan-to-Pay**, **Customer credit ledger + WhatsApp reminders**, AI insights, OCR scanner, dark mode.
- Targets **Persona B (Sunita)**. Beats Khatabook (free, but no GST) and Vyapar Silver (₹1,899) on AI + WhatsApp automation. **Annual prepay only** — Indian SMBs hate monthly debits.

### **Pro — ₹4,800/year (~₹400/mo)** ← our "headline" tier
- Everything in Growth + **e-invoicing (IRN/QR)**, **GSTR-1/3B + Tally export**, **barcode scan**, **thermal print**, 5 users, **Hindi + regional languages**.
- Targets **Persona A (Mehul)**. Priced **34% above Vyapar Premium (₹3,599)** because we save him the upload-to-GST-portal workflow. The premium is justified by the e-invoicing automation alone.

### **Pro+ — ₹9,600/year (~₹800/mo)**
- Everything in Pro + **multi-branch (up to 5)**, 10 users, **API access**, priority support, dedicated onboarding call.
- Targets the multi-shop owner and Persona C. This is where the **AI advantage** earns its premium — competitors at this band (Marg, Busy) have no AI at all.

### Lifetime / Annual prepay incentive
Offer **20% off** on annual prepay (not month-to-month) for the first 12 months. This is psychologically the same as Vyapar's pitch, but the discount is real instead of fake — Indian SMBs sniff out fake discounts in a single demo.

### CA partner programme
Refer a paid customer = **₹400/customer/year recurring** to the CA. CAs become our distribution channel. Cost is offset by the 90%+ retention CAs drive.

---

## 5. 90-Day Roadmap

### **Days 1–30 — "Win the demo"**
Goal: every demo of SmartStock should *feel* unmistakably Indian and clearly ahead of Vyapar on at least three concrete points.

- Week 1: **UPI Scan-to-Pay QR** on every invoice (Rank 1). Add `vpa`, `payeeName` to settings. Ship.
- Week 1–2: **Hindi UI** ships (Rank 4, English + Hindi only in this phase). Marathi/Gujarati/Tamil/Telugu come in week 9–10 after native review.
- Week 2–4: **Customer credit ledger** (Rank 2) — `Customer` model, `paymentStatus` on Sale, ledger view, manual "Send WhatsApp reminder" CTA. **No automated WhatsApp API yet** — use the existing `wa.me` deep-link the user clicks. WhatsApp Business API (auto-send) defers to Q3.
- Week 3–4: Pricing page goes live. Beta users grandfathered onto Growth tier free for 6 months.
- **Quarter milestone:** Public launch of paid plans. Target: **first 50 paying customers, ₹1.25L MRR.**

### **Days 31–60 — "Win the CA"**
Goal: become the tool a CA recommends, not the tool a CA tolerates.

- Week 5–7: **GSTR-1 / GSTR-3B JSON + Tally XML export** (Rank 6). Owned by `architect-gst`.
- Week 6–8: **E-invoicing (IRP) integration** (Rank 3). GSP onboarding starts **week 1** in parallel — paperwork is the long pole.
- Week 7–8: CA partner programme launches with 10 hand-picked CAs in Pune/Indore/Ahmedabad.
- **Quarter milestone:** **₹3 cr+ turnover SMBs converting**. Target: 200 paying customers, ₹6L MRR, 30% of new signups via CA referral.

### **Days 61–90 — "Win the counter and the second shop"**
Goal: stop being a back-office tool. Be where the sale happens.

- Week 9–10: **Barcode scan-to-sell + thermal printer (58mm)** (Rank 5).
- Week 9–10: Marathi, Gujarati, Tamil, Telugu UI ship.
- Week 11–13: **Multi-branch** (Rank 7).
- Week 13: Pro+ tier opens. Outbound to top decile of Growth/Pro customers ("you have a 2nd shop now — here's the upgrade").
- **Quarter milestone:** 500 paying customers, ₹15L MRR, average ARPU ₹3,000, churn under 4%/month.

---

## 6. What NOT to Build (and why)

| Not building | Why not |
|---|---|
| **E-way bill in this 90 days** | Used <2x/week even by Persona A. Defer to Q3. The opportunity cost vs e-invoicing is clear. |
| **Per-seat pricing** | Indian SMBs hate it. They see it as a tax on their growth. We use **flat tier with seat caps**. |
| **Monthly billing as default** | Annual prepay is the cultural norm. Monthly billing erodes our cash float and increases churn. Offer monthly only on Pro+ with a 20% premium. |
| **Marketplace integrations (Shopify/Amazon/Meesho)** | Persona C is small TAM. Integration maintenance cost is high. **Defer 6 months.** Build it when we have 2,000 paying customers and Rohan-types are demanding it loudly. |
| **SMS notifications** | WhatsApp wins. SMS deliverability is poor and Twilio/MSG91 is expensive. Skip. |
| **A "Lite" mobile app in this 90 days** | The web app on a Pixel/Redmi browser is sufficient for now. A real React Native app is 60+ days alone. **Q3 priority** once we know which features actually drive daily usage. |
| **Generic AI chat ("Ask anything")** | We already have it. Don't expand it. **Narrow it** — make it answer 5 specific questions perfectly: "what's selling?", "what's dead?", "who owes me money?", "should I reorder X?", "what's my GST liability this month?" |

---

## 7. Success Metrics (90-day)

| Metric | Target |
|---|---|
| Paying customers | 500 |
| MRR | ₹15 lakh |
| Average ARPU | ₹3,000/year |
| Free → Paid conversion | 8% |
| Logo churn | < 4% / month |
| CA-referred signups | 30% of new signups |
| Invoices generated/customer/month (engagement proxy) | > 40 |
| % invoices with UPI QR | > 80% |
| % customers using credit ledger weekly | > 35% |

---

### Build assignments

| Feature | Rank | Owner agent | Notes |
|---|---|---|---|
| UPI Scan-to-Pay QR on invoice | 1 | **fullstack** | Add `vpa`/`payeeName` to `Settings.workspace`, render QR in `InvoiceModal`. No GST logic. |
| Customer credit ledger (Khata) + manual WA reminder | 2 | **fullstack** | New `Customer` model, `paymentStatus` + `payments[]` on `Sale`, ledger UI, reuse existing `wa.me` flow. |
| E-invoicing (IRP) + IRN/QR on invoice | 3 | **architect-gst** (spec) → **fullstack** (impl) | architect-gst owns the IRP integration spec, error states, retry queue, GSP selection. fullstack implements once spec is approved. Start GSP paperwork week 1. |
| Hindi + regional language UI | 4 | **fullstack** | i18n scaffolding + EN/HI in phase 1; MR/GU/TA/TE in phase 2 after native QA. Devanagari font in invoice PDF. |
| Barcode scan-to-sell + thermal print | 5 | **fullstack** | `@zxing/browser` for scan, `barcode` on `Product`, 58mm invoice template. Native ESC/POS deferred. |
| GSTR-1 / GSTR-3B + Tally XML export | 6 | **architect-gst** (spec + impl) | Pure data-mapping work; the spec *is* the implementation. architect-gst owns end-to-end. |
| Multi-branch / multi-warehouse | 7 | **architect-gst** (schema spec) → **fullstack** (impl) | Schema-wide change; architect-gst writes the migration spec, fullstack ships it in days 70–90. |
| Pricing page + paywall + plan-gating middleware | n/a | **fullstack** | Required before any paid feature ships. Day-30 milestone gate. |
| CA partner programme (referral codes, payout tracker) | n/a | **fullstack** | Day-45. Lightweight: a `referralCode` on User and an admin payout report. |

**Out of scope for this 90-day cycle (do NOT start):** e-way bill, Shopify/Meesho integrations, SMS notifications, native mobile app, per-seat pricing, generic AI chat expansion.

---

*Memo author: ceo agent. Review with founders before week-1 kickoff. Hand off Rank-1 (UPI QR) to fullstack on day 1 — it's the cheapest, fastest credibility win we have.*
