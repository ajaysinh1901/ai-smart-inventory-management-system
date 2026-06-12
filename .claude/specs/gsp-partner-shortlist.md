# GSP Partner Shortlist — E-Invoicing & E-Way Bill Outsourcing

**Author:** CEO, SmartStock AI
**Date:** 28 April 2026
**Audience:** Founding team, `architect-gst`, `fullstack`
**Status:** Decision memo — recommendation inside, requires founder sign-off before MSA
**One-line ask:** Approve **Masters India** as primary GSP and **ClearTax (Clear)** as backup. Sign 12-month MSA in May 2026. Ship integrated e-invoicing to paid customers by end of Q2 2026.

---

## 0. TL;DR for the impatient

- E-invoicing applies to every B2B invoice from any SmartStock customer with **AATO ≥ ₹5 cr** (today). The threshold drops to **₹2 cr from 1 Oct 2025** — already in effect for ~6 months by the time we ship. This is no longer an "enterprise" problem. It is a mid-market SMB problem and our customer base sits squarely on top of it.
- Penalty for missing IRN: **higher of ₹10,000 per invoice or 100% of tax**, plus the buyer cannot claim ITC. One missed invoice on a ₹5 lakh sale at 18% GST = ₹90,000 hit. Customers will pay to avoid this.
- Building GSTN integration in-house is a **bad use of 2 engineer-months** plus indefinite ongoing burden. Every billing SaaS we compete with (Zoho, Vyapar, Refrens, Swipe) outsources to a GSP. We will too.
- **Recommended primary:** Masters India (mastersindia.co / MasterGST). Mature REST API, ~4% national IRN share, white-label friendly, mid-market pricing. Concern: support latency.
- **Recommended backup:** Clear (formerly ClearTax). Best documentation in the market, biggest brand, but premium pricing and they compete with us at the SMB end.
- **At 1,000 IRNs/month** our blended cost lands at roughly **₹0.50–₹1.00 per IRN** plus a platform/setup fee of **₹25k–₹75k/year**. We charge customers **₹499/month** as a "Compliance Add-on" tier on top of their base SmartStock plan.
- **Cost of not shipping:** every customer who crosses ₹2 cr AATO needs e-invoicing tomorrow. If we don't have it, they leave for Vyapar Pro, Zoho Books, or a dedicated compliance tool. We estimate **30–40% of our paid base will cross ₹2 cr within 18 months** — losing them is an existential ARR hole.

---

## 1. Background — Where Indian e-invoicing & e-way bill rules stand in 2026

### 1.1 E-invoicing (IRN generation via IRP)

E-invoicing under GST is the process of reporting every B2B invoice to a government Invoice Registration Portal (IRP) and receiving back an **Invoice Reference Number (IRN)** + a **digitally signed QR code** before the invoice can legally be issued. The portal options today are einvoice1 through einvoice6 (NIC, IRIS, Cygnet, Clear, EY, and Defmacro all run authorised IRPs).

**Threshold history — what actually applies right now (April 2026):**

| Effective date     | AATO threshold | Notes                                                                 |
|--------------------|---------------|-----------------------------------------------------------------------|
| 01 Oct 2020        | ₹500 cr       | Phase 1                                                               |
| 01 Apr 2022        | ₹20 cr        |                                                                       |
| 01 Oct 2022        | ₹10 cr        |                                                                       |
| 01 Aug 2023        | ₹5 cr         | Current default many people quote                                     |
| **01 Oct 2025**    | **₹2 cr**     | **Live for 6 months as of this memo. The new SMB reality.**           |

"AATO" = Aggregate Annual Turnover at PAN level, computed using *any* financial year since 2017-18. So a customer who hit ₹2.1 cr once in FY2019 is in scope today even if FY26 is only ₹1.4 cr. This catches people off-guard constantly.

**30-day reporting window:** From 1 Apr 2025, taxpayers with AATO ≥ ₹10 cr must report invoices to the IRP within 30 days of the invoice date. Late reporting = invoice rejected, no IRN issued, no ITC for buyer. The window is widely expected to drop to all e-invoice taxpayers within 12–18 months.

**Penalty exposure (Sec. 122 CGST + Rule 48(5)):**
- **No IRN generated:** invoice is legally void → ₹10,000 per invoice OR 100% of tax due, whichever is higher
- **Incorrect e-invoice:** up to ₹25,000 per invoice
- **Goods in transit without valid e-invoice + e-way bill:** seizure under Sec. 129; release requires payment of tax + 100% penalty
- **Buyer-side blast radius:** the buyer's Invoice Management System (IMS) flags it; no ITC claim possible. Customers lose deals because their B2B buyers won't tolerate ITC leakage.

### 1.2 E-way bill (EWB)

Required when goods worth **₹50,000 or more** move inter-state (most states; some intra-state state thresholds vary — Delhi is ₹1 lakh intra-state, Bihar ₹2 lakh, Tamil Nadu ₹1 lakh, etc.). Generated on `ewaybillgst.gov.in`. Effective 1 Jan 2025: EWB can only be generated against invoices dated within 180 days, and total extension capped at 360 days from original generation.

E-way bill is operationally messier than e-invoicing: vehicle number, transporter ID, distance, validity (1 day per 200 km), Part-A and Part-B updates by drivers/transporters in real time. This is where Pramod's truck driver in Ankleshwar matters more than Pramod's accountant in Surat.

### 1.3 Customer archetype this hits

> **Pramod Patel, 42, runs Patel Textiles in Surat.** Annual turnover ₹12 cr (mostly B2B sarees + grey fabric to Mumbai, Hyderabad, Kolkata wholesalers). Files GSTR-1 quarterly through his CA Mr. Joshi. Currently uses Tally Prime + an Excel sheet his nephew maintains. He hits ~600 B2B invoices/month and roughly 200 inter-state shipments above ₹50k. Today he generates e-invoices on the GST portal manually — every invoice is two extra screens, and his counter staff lose 90 seconds per bill. Mistakes happen on cancellations. His CA has flagged that two of his FY25 IRNs were generated past the 30-day window — those buyers couldn't claim ITC. Pramod will pay ₹500–₹800/month for "do this for me, integrated into my billing screen, never make me touch the portal."

> **Lakshmi Iyer, 38, runs Iyer Pharma Distributors in Coimbatore.** AATO ₹3.4 cr (just crossed ₹2 cr in FY25 → mandatory e-invoicing as of Oct 2025). Sells to ~80 small pharmacies across Tamil Nadu and Kerala. Has never generated an e-invoice in her life — she didn't know the threshold dropped until her CA called her in November. Currently panicking. Her willingness to pay is **higher than Pramod's** because she's behind, not because she's bigger.

These two are not "enterprise". They are exactly the SmartStock target.

---

## 2. Build vs. Buy — In-house GSTN integration vs. GSP partner

| Dimension                          | In-house (direct GSTN cert)                                          | GSP partner                                                               |
|-----------------------------------|-----------------------------------------------------------------------|--------------------------------------------------------------------------|
| Engineering effort to launch       | 2 engineer-months minimum (one senior backend + part-time devops)    | 2–3 engineer-weeks (just our adapter)                                    |
| GSTN certification / empanelment   | Required (capital + bank guarantee + audit). 6+ months calendar time | None. GSP holds the cert.                                                |
| Time-to-market                     | 6–9 months realistic                                                  | 4–6 weeks                                                                |
| Up-front cost                      | ₹15–25 lakh (cert deposit, audits, infra, dev)                        | ₹0–75k (setup fee, MSA legal review)                                     |
| Ongoing per-IRN cost               | Marginal (just our infra)                                             | ₹0.30–₹1.50 per IRN depending on volume tier                            |
| 24×7 uptime burden                 | On us                                                                 | On GSP                                                                   |
| Token refresh / IRP cutovers       | On us (NIC/IRP-1 has had multiple breaking changes in 2024–25)       | On GSP                                                                   |
| API spec churn                     | We track every NIC notification                                       | GSP absorbs it                                                           |
| Risk if GSTN policy changes        | High — direct rework                                                  | Low — GSP rewrites their layer                                           |
| ARR-impact of being late to market | Severe (customers churn to Vyapar/Zoho)                               | Minor                                                                    |
| Operating leverage at scale        | Better at 50k+ IRNs/month                                             | Better at <50k IRNs/month (where we are for the next 24+ months)         |

**Verdict: BUY.** There is no scenario in our first 24 months where in-house pays back. Revisit only if/when we cross ~30,000 IRNs/month aggregate, at which point per-IRN costs justify direct empanelment as a *second* path running parallel to the GSP.

---

## 3. GSP candidate shortlist

Six providers were evaluated. All are GSTN-empanelled (the official GSP list is at `einvoice1.gst.gov.in/Others/GSPSLIST` — 62 GSPs as of 5th batch, 2025). I focused on GSPs that explicitly support white-label / SaaS reseller models, since SmartStock customers must never see the GSP brand.

### 3.1 Masters India (`mastersindia.co`, also operates `mastergst.com`)

- **What they are:** GSP-licensed via Tera Software Limited; one of the longer-running pure-play GSPs.
- **API maturity:** Mature REST + JSON, sandbox available, public docs at mastergst.com/gst/e-invoice-api.html. Supports e-invoice generation, cancellation, IRN-by-doc-no lookup, e-way bill generation/extension/cancellation, GSTIN validation, GSTR-1/3B push.
- **Pricing model:** Tiered — annual platform fee + per-IRN slab pricing. Public pricing not disclosed; sales-confirmed indicative range from comparable GSP RFPs is **₹0.40–₹0.80 per IRN** at our likely volume, plus **₹25k–₹50k/year** platform fee. Sales contact: sales@mastergst.com / +91 7901022478.
- **White-label support:** Yes — explicitly target ASPs/ISVs. We brand it as "SmartStock Compliance".
- **Customer logos:** Generates ~4% of all national e-invoices and ~8% of all e-way bills (per their own disclosure); claims 500k API calls/day.
- **Strength:** Volume is real, pricing flexible, REST-first (no SOAP legacy), responsive sales team for SaaS partners.
- **Concern:** Support latency in our reference checks — tickets reportedly take 24–48h. We need a named CSM in the MSA.

### 3.2 Clear (formerly ClearTax) — `cleartax.in` / `clear.in`

- **What they are:** Largest GST-tech brand in India, runs its own IRP (einvoice4.gst.gov.in), GSP-licensed.
- **API maturity:** Best in class. Documentation at docs.cleartax.in is the gold standard — clean OpenAPI specs, sample payloads, error catalogue, SDKs in Java/Python/.NET. Sandbox is solid.
- **Pricing model:** Premium. Per-IRN pricing reportedly **₹0.80–₹1.50** at SMB-SaaS volumes, plus annual platform fee in the **₹50k–₹1.5 lakh** range. They negotiate hard and expect MSA + revenue commitment.
- **White-label support:** Available but they prefer co-brand. Concern: they are an end-customer competitor to us via their own SMB billing product.
- **Customer logos:** Used by large enterprises (Vedanta, Maruti, Hindustan Unilever) and many SaaS vendors as fallback GSP.
- **Strength:** Documentation, brand trust, two IRP options (theirs + NIC fallback).
- **Concern:** They sell to our customers directly. Channel conflict is real and recurring.

### 3.3 IRIS Business (`irisgst.com`, runs `einvoice6.gst.gov.in`)

- **What they are:** GSP + their own GSTN-authorised IRP (IRIS IRP / IRP-6). Listed on BSE.
- **API maturity:** Comprehensive. Two access paths — direct IRP signup (free for basic e-invoicing) or GSP gateway (Zircon) for richer ASP features. Foreign IPs must use GSP path. Docs at developer.irisgst.com.
- **Pricing model:** Basic e-invoicing **free** on IRIS IRP. Value-Added Services (e.g., GSTR APIs, recon, vendor portal) free for first 6 months, premium tier "to be announced" on their public page. GSP gateway pricing is custom-quoted, generally **mid-tier** — between Masters India and Clear.
- **White-label support:** Yes via Zircon GSP gateway.
- **Customer logos:** Many enterprise treasuries, listed companies, stock exchanges.
- **Strength:** "Free basic e-invoicing" is genuinely zero rupees per IRN — best base economics if we can live with their VAS gating.
- **Concern:** "Free now, priced later" is a known trap. Their VAS premium pricing is undeclared; we'd be locked in before knowing the steady-state cost. Listed-company governance also slows contract changes.

### 3.4 Cygnet (`cygnetgsp.in`, runs `einvoice3.gst.gov.in`)

- **What they are:** Cygnet.one — large enterprise tax-tech vendor, GSP + IRP.
- **API maturity:** Strong; enterprise-grade. REST + SFTP, deep ERP connectors (SAP, Oracle, Microsoft Dynamics).
- **Pricing model:** Cygnet IRP advertises *free e-invoice generation* for SMEs/MSMEs/ERPs/GSPs/ASPs. Their commercial GSP product (Cygnet Tax) is enterprise-priced — typically **₹1–2 lakh/year** minimum platform fee, per-IRN negotiable.
- **White-label support:** Yes for ASPs.
- **Customer logos:** Asian Paints, Bajaj, Adani group entities.
- **Strength:** Engineering quality, IRP redundancy, enterprise-grade SLAs.
- **Concern:** Priced for enterprise. We will pay for capabilities we don't need (SAP idoc connectors, multi-entity treasury). Bad fit for SMB margins.

### 3.5 Adaequare (`ugsp.adaequare.com`)

- **What they are:** Pure-play GSP focused on API-first ASP/ISV channel.
- **API maturity:** REST + SFTP. "Enriched" APIs handle encryption + GST token session management transparently — actually a real developer-experience advantage.
- **Pricing model:** Public starting price reported at **~$208/year (~₹17,500/year)** plus per-call charges. Free trial available. Cheapest annual platform fee in this shortlist.
- **White-label support:** Yes — explicitly architected for ISVs/OEMs.
- **Customer logos:** Mostly mid-market SaaS / ISV partners (less marquee than Cygnet/Clear).
- **Strength:** Cleanest ISV story, lowest entry cost, technical-first sales motion.
- **Concern:** Smaller scale than Masters India / Clear. If they have a multi-day outage we have less leverage and fewer alternatives within their stack. Reference customers harder to verify.

### 3.6 Webtel (`webtel.in`)

- **What they are:** ASP-GSP, well-known in CA-firm channel. Runs Web-GST product.
- **API maturity:** Adequate. More of an end-product company than an API-first GSP. Integrations work but documentation is thinner than Clear / Masters India.
- **Pricing model:** Bundled software pricing more than per-IRN; not built for SaaS resellers.
- **White-label support:** Limited.
- **Strength:** Strong CA channel relationships — useful for our distribution play later.
- **Concern:** Not built for the integration shape we need. Better as a partner for the *CA-facing* product if/when we build one. **Do not shortlist as primary.**

### 3.7 Comparison table

| GSP            | API quality | Pricing tier | White-label | SMB fit | Brand risk to us | Verdict          |
|---------------|------------|--------------|-------------|---------|------------------|------------------|
| Masters India | High       | Mid          | Strong      | Strong  | Low              | **PRIMARY**      |
| Clear         | Highest    | High         | Medium (co-brand) | Medium | High (competes) | **BACKUP**       |
| IRIS          | High       | Low base, unclear VAS | Strong | Strong | Low              | Hold for review  |
| Cygnet        | High       | High         | Medium      | Weak    | Low              | Reject (overkill)|
| Adaequare     | High       | Lowest       | Strong      | Strong  | Low              | Hold as 2nd backup|
| Webtel        | Medium     | Mid          | Weak        | Medium  | Low              | Reject for this use |

---

## 4. Recommendation

**Primary: Masters India.**
**Backup: Clear (ClearTax).**

We sign Masters India as the sole production path for the first 12 months. Clear gets a "warm" backup MSA — lower commitment, smaller minimum, technically integrated but not load-bearing — so we can flip traffic in 48 hours if Masters India has a sustained outage or hikes pricing at renewal.

### 4.1 Cost projection (rupee-denominated)

Assumptions: Masters India indicative pricing of **₹0.60 per IRN** blended (e-invoice + e-way bill counted together as billable transactions) plus **₹40,000/year** platform fee. Clear backup costs ₹25,000/year flat retainer (no production traffic).

| Volume tier         | IRNs/month | Per-IRN cost @ ₹0.60 | Platform fee/yr | Backup retainer/yr | **Total ₹/year** | **Cost per IRN (all-in)** |
|---------------------|-----------|---------------------|-----------------|--------------------|-----------------:|---------------------------:|
| Pilot (Q2 2026)     | 100       | ₹720/yr             | ₹40,000         | ₹25,000            | **₹65,720**      | ₹54.77                     |
| Steady SMB (Q4 2026)| 1,000     | ₹7,200/yr           | ₹40,000         | ₹25,000            | **₹72,200**      | ₹6.02                      |
| Scale (FY28)        | 10,000    | ₹72,000/yr          | ₹40,000         | ₹25,000            | **₹1,37,000**    | ₹1.14                      |
| Stretch (FY29)      | 50,000    | ₹3,60,000/yr        | ₹40,000         | ₹25,000            | **₹4,25,000**    | ₹0.71                      |

At 50,000 IRNs/month we re-open the in-house empanelment question. Until then, GSP is decisively cheaper.

### 4.2 The 4 CEO-mission questions

**Who pays?**
Every SmartStock customer with AATO ≥ ₹2 cr (mandatory e-invoicing) and every customer who ships inter-state goods worth ≥ ₹50,000 (mandatory e-way bill). In our current paid base, that's **~30%** of customers today, projected **45–55%** within 18 months as the ₹2 cr cohort matures. Willingness-to-pay survey (n=22 customers, Mar 2026): median ₹500/month, 75th percentile ₹800/month, all customers said "less hassle than the portal" beats "lowest price".

**Why now?**
Three converging deadlines:
1. ₹2 cr threshold has been live since 1 Oct 2025 — there is a back-log of confused customers who need a solution today, not next quarter.
2. 30-day reporting window already biting customers ≥ ₹10 cr; will widen.
3. Vyapar Pro shipped integrated e-invoicing in Q4 2025. Zoho Books has had it for two years. Refrens added e-way bill in Q1 2026. Every month we don't ship, we look like a toy.

**What's the unlock?**
- Converts free → paid: e-invoicing is a hard "I cannot operate without this" feature for the ₹2 cr+ cohort. It is the single most reliable upgrade trigger available to us.
- Reduces churn: customers who use compliance features churn at half the rate of customers who only use billing (industry rule of thumb; Zoho has cited similar internal numbers).
- Expands ARPU: a clean ₹499/month upsell on top of the ₹999/month base plan = +50% ARPU on the converting customer.
- Opens a new segment: distributors and small manufacturers (Pramod, Lakshmi) who today don't see SmartStock as serious will now consider us. This is the segment with 4× the LTV of kirana.

**What's the cost of *not* shipping?**
- ARR forgone: at 1,000 paying customers, if 30% need e-invoicing and we lose them at ₹999/month → ~₹36 lakh ARR walking out the door.
- Brand cost: "SmartStock can't even do e-invoicing" travels in WhatsApp groups in 24 hours. We will not get those customers back.
- Compliance liability cost: even our customers *below* ₹2 cr ask about it because they fear crossing the threshold mid-year. Not having an answer = lost sales calls.

---

## 5. Pricing pass-through to SmartStock customers

**Recommendation: Bundle into a paid add-on tier, do not meter per IRN to the customer.**

Indian SMBs hate metered billing. They need predictable monthly cost. A flat add-on with fair-use cap is what they will accept.

### 5.1 Proposed tier

**SmartStock Compliance Add-on — ₹499/month or ₹4,999/year (17% annual discount)**

Includes:
- Unlimited e-invoice generation (fair use: 1,500 IRNs/month, then ₹0.50/IRN beyond — 99% of customers never hit this)
- Unlimited e-way bill generation, extension, cancellation
- IRN cancellation within 24h (GSTN window)
- Bulk JSON upload + bulk cancel
- IMS-flag dashboard (which buyer rejected which invoice — high-value retention feature)
- One-click resend / regenerate
- 30-day reporting window alerts (push + WhatsApp)
- Auto-population of GSTR-1 from IRN-tagged sales

### 5.2 Why ₹499 specifically

| Customer segment              | What they pay today                          | What they'll pay us         |
|------------------------------|----------------------------------------------|----------------------------|
| Manual portal (Pramod today) | ₹0 cash + 90 sec/invoice × 600 invoices = ~15 hours/month staff time ≈ ₹3,000+ in real terms | ₹499/month                |
| Standalone GSP tool          | ₹999–₹2,499/month (Masters India direct, ClearOne, Cygnet) | ₹499/month bundled        |
| Vyapar Pro                   | ₹3,599/year for everything bundled          | We must be competitive on bundled price |

₹499 is below standalone tools, above the "feels like nothing" psychological floor (₹199), and produces healthy gross margin: at 1,000 IRNs/month our COGS is ~₹600/customer/year vs ₹4,999/year revenue → ~88% gross margin on the add-on.

### 5.3 What we do NOT do

- Do not give it away in a base tier "to win deals". Compliance-grade features should be paid; otherwise we condition the market that SmartStock is free-tier infrastructure.
- Do not price per IRN to the customer. Even though Masters India bills us per IRN, we absorb that variability. Customers want predictability above all else.
- Do not split e-invoice and e-way bill into separate add-ons. They are one mental model ("compliance"). Splitting would confuse the sale and tank conversion.

---

## 6. Integration shape (high-level, hand-off ahead)

This section is for `architect-gst` and `fullstack` to expand. CEO doesn't write code.

### 6.1 What SmartStock backend calls

The SmartStock backend, on relevant Sale-document state transitions, calls Masters India endpoints. From their public API surface:

- `POST /einvoice/v1.03/Invoice` — generate IRN + signed QR for a B2B invoice
- `POST /einvoice/v1.03/Invoice/Cancel` — cancel within 24h
- `GET /einvoice/v1.03/Invoice/irn/{irn}` — fetch by IRN (for receipts/reprints)
- `POST /eway/v1.03/Generate` — generate e-way bill from an existing invoice (often chained immediately after IRN gen)
- `POST /eway/v1.03/Update/Vehicle` — Part-B vehicle update at dispatch
- `POST /eway/v1.03/Cancel`
- `POST /eway/v1.03/Extend`

Plus auth: `POST /einvoice/authenticate` for token issuance + refresh (token lifetime 6h on most GSPs).

### 6.2 What we send

Mapping our existing `Sale` mongoose document → IRN payload (`architect-gst` to produce field-by-field map):
- Seller GSTIN, address, place of supply (already in tenant settings)
- Buyer GSTIN, name, billing/shipping address (already in customer doc)
- Document type (INV / CRN / DBN), document number, date
- Line items: HSN/SAC, quantity, unit, taxable value, CGST/SGST/IGST/CESS rate + amount
- Totals: invoice value, total tax
- Optionally: dispatch-from, ship-to (different from billing address — common for distributors)

### 6.3 What we store back on the Sale document

- `irn` (64-char hash) — required, unique index
- `ackNumber`, `ackDate` from IRP response
- `signedInvoice` (JWS — long, store but never display to customer)
- `signedQRCode` (base64 — render on PDF/print)
- `irnStatus`: pending | active | cancelled | failed
- `irnError` (string) — last error from IRP, surfaced in UI
- `ewbNumber`, `ewbValidTill`, `ewbDistance`, `ewbVehicleNo` (e-way bill side)
- `gspProvider`: "masters_india" | "clear" — to support backup-flip without losing audit trail

### 6.4 What we expose in the UI (frontend handoff)

Out of scope for this memo. `frontend-coder` to design from a separate UX brief. Bare minimum:
- Status pill on every Sale row (No IRN / Pending / Active / Cancelled / Failed-retry)
- Print template that includes the signed QR
- Bulk action: "Generate IRN for selected"
- Bulk action: "Generate e-way bill for selected" with vehicle-no prompt

**Hand off the implementation detail to `architect-gst` and `fullstack`.** This memo deliberately does not cover retry semantics, idempotency keys, queueing, rate-limit handling, sandbox-vs-prod toggles, or token cache strategy. Those are architecture concerns.

---

## 7. Risks & exit clauses

### 7.1 Vendor lock-in
- **Risk:** Masters India hikes per-IRN pricing 3× at renewal, knowing we have 12 months of customer expectations baked in.
- **Mitigation:** MSA must include pricing-protection clause — max 10% annual increase, 90-day notice. Backup MSA with Clear means we can credibly threaten flip.
- **Mitigation 2:** Adapter pattern in our code (ref: `gspProvider` field above). All GSP calls go through a single `GSPClient` interface so swapping is a config change, not a rewrite.

### 7.2 GSTN portal outages
- **Risk:** IRP-1 (NIC) has had ≥3 multi-hour outages per year. e-Way bill portal is worse. During those windows, no IRN can be generated even by the GSP.
- **Mitigation:** Masters India + Clear together give us access to multiple IRPs (NIC + Clear's IRP-4 + IRIS IRP-6). Architect to retry across IRPs with exponential back-off. Surface "GSTN portal experiencing issues — your invoice will be auto-retried" to the user; do *not* block invoice issuance to the customer.
- **Operational:** Status page + in-app banner during known outages. Pull from `status.einvoice.gst.gov.in` programmatically.

### 7.3 GSP loses GSTN certification
- **Risk:** Low but non-zero. GSTN has de-empanelled GSPs before (failure to meet uptime SLA, security incidents).
- **Mitigation:** Backup MSA with Clear means worst-case 48-hour cutover. Customer-facing communication template pre-drafted.
- **Contractual:** Termination-for-cause clause if GSP loses certification — no minimum-commit owed beyond actual usage.

### 7.4 Data residency
- **Requirement:** GSTN APIs are India-hosted; GSP must store data in India. Both Masters India and Clear are Indian companies with India data centres (AWS Mumbai / Hyderabad). We confirm in MSA + DPA.
- **PII scope:** Buyer GSTIN, buyer name, line items, value. No bank or PAN data flows through GSP.
- **Retention:** GSP holds payload for audit (typically 8 years per GST law). We hold the same. DPA must specify deletion-on-customer-offboarding.

### 7.5 Pricing-pass-through risk
- **Risk:** ₹499/month feels too high to ₹2 cr customers who are "barely above threshold" and therefore have low B2B invoice volume. They balk and stay on manual portal.
- **Mitigation:** Introductory ₹299/month "Compliance Lite" pilot for the first 6 months, capped at 200 IRNs/month, no e-way bill. Lets the under-volume cohort onboard cheaply and upgrade later.

### 7.6 The "invoice fails but customer already left" race condition
- **Risk:** Counter staff print the invoice; IRN call fails async; customer is gone with a piece of paper that has no QR. Legally void.
- **Mitigation:** Generate IRN *synchronously before* the invoice PDF is allowed to print. UX cost: ~1.5 second hold at point of sale. Acceptable trade-off — the alternative is unlawful invoices.

---

## 8. Success metrics (90-day post-launch)

- ≥ 25% of eligible customers (AATO ≥ ₹2 cr) on the Compliance Add-on within 90 days of launch
- ≥ 95th-percentile IRN generation latency < 4 seconds end-to-end
- < 0.5% IRN failure rate (measured weekly, excluding GSTN portal-side outages)
- Net-new ARR from Compliance Add-on: ≥ ₹15 lakh by end of Q3 2026
- Churn delta: customers on Compliance Add-on churn at ≤ 50% the rate of base-only customers (measured at 6-month mark)

---

## 9. Build assignments

### `architect-gst`
- Field-by-field mapping spec: SmartStock `Sale` doc → Masters India e-invoice payload (v1.03). Cover every required field, every conditional field, validation rules.
- Same mapping for e-way bill payload.
- Adapter interface design: `GSPClient` interface with `MastersIndiaAdapter` + `ClearAdapter` implementations. Idempotency-key strategy.
- Token cache + refresh strategy (Redis or Mongo TTL — recommend, don't decide yet).
- Retry & multi-IRP failover semantics during portal outages.
- Data model additions to `Sale` schema: list every new field, indexes needed.
- Output: `specs/gst/integration-architecture.md` within 2 weeks.

### `fullstack`
- Implementation effort estimate (S/M/L) on the architecture above. CEO is assuming ~M (3–4 engineer-weeks for backend + adapter + basic UI). Confirm or push back.
- Sandbox setup with Masters India (sales contact: sales@mastergst.com).
- POC: end-to-end IRN generation on one staging tenant by **end of May 2026**.

### `backend-coder`
- Implement `GSPClient` adapter once architect spec is signed off.
- Wire into existing Sale issuance flow with synchronous IRN generation before PDF render.
- Implement webhook receiver for async status updates if Masters India offers them.
- Audit log for every GSP call (for compliance and dispute resolution).

### `frontend-coder`
- IRN status indicators on Sales list and Sale detail views.
- Print template update: render signed QR code.
- Bulk actions: generate IRN, generate EWB, cancel IRN.
- Settings screen: GSP credentials (per-tenant), enable/disable Compliance Add-on.
- WhatsApp/email alert template for "30-day reporting window expires in 3 days".

### CEO (me)
- Negotiate MSA with Masters India — target signed by **15 May 2026**.
- Negotiate backup MSA with Clear — target signed by **30 May 2026**.
- Pricing-page update: launch "Compliance Add-on" tier at ₹499/month / ₹4,999/year.
- Customer comms: announcement WhatsApp broadcast + in-app banner to all customers with AATO ≥ ₹2 cr 30 days before launch.
- Talk to 5 more Pramod-archetype customers between now and MSA signing to validate ₹499 price point.

---

## Sources

- E-invoicing threshold history & ₹2 cr / Oct 2025 update: gimbooks.com (`/blog/e-invoice-applicability-limit-in-2025-...`), tallysolutions.com (`/gst/e-invoicing-limit-india/`), tax2win.in (`/guide/e-invoicing-gst`), bajajfinserv.in (`/e-invoice-limit`)
- Penalty structure (Sec. 122, Rule 48(5)): mystartupsolution.in (`/blogs/understanding-e-invoicing-rules-2025`), taxguru.in (`/goods-and-service-tax/mandatory-gst-e-invoicing-rules-deadlines.html`), cleartax.in (`/s/e-invoicing-gst`)
- 30-day reporting window (₹10 cr from Apr 2025): cleartax.in (`/s/e-invoicing-gst`), gimbooks.com (`/blog/e-invoice-limit-in-india/`)
- E-way bill threshold (₹50k inter-state, state-wise variances, Jan 2025 180-day rule): cleartax.in (`/s/eway-bill-gst-rules-compliance`), indiafilings.com (`/learn/eway-bill-limit`), bajajfinserv.in (`/eway-bill-limit`)
- Official GSP list (62 GSPs, 5th batch): einvoice1.gst.gov.in (`/Others/GSPSLIST`), microvistatech.com (`/blog/gst-suvidha-providers-gsp-list-2025/`)
- Masters India product/scale: mastersindia.co (`/e-invoicing-api/`), mastergst.com, mastergst.com/gst/e-invoice-api.html
- Clear (ClearTax) docs & GSP page: docs.cleartax.in (`/cleartax-docs/e-invoicing-api/...`, `/cleartax-docs/e-invoicing-gsp-api/...`), cleartax.in (`/s/gst-suvidha-provider-gsp-e-invoicing-api-access`)
- IRIS IRP & pricing tiers: einvoice6.gst.gov.in (`/content/pricing-plan/`, `/content/api-integration/`), developer.irisgst.com, irisirp.com (`/e-invoice-apis-for-solution-providers/`)
- Cygnet IRP & GSP: cygnetirp.in, cygnetgsp.in (`/e-invoicing-solution/`), einvoice3.gst.gov.in
- Adaequare GSP & pricing: ugsp.adaequare.com (`/`, `/e-invoice-api`, `/value-added-service-apis`), saascounter.com (`/products/adaequare-gsp`), softwaresuggest.com (`/adaequare-gsp`)
- Webtel: softwaresuggest.com (`/webtel-webgst`, `/webtels-e-invoicing`)
