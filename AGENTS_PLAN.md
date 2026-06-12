# 🤖 Multi-Agent System Plan — Smart Inventory MVP

> **Status:** Draft v1 · **Last updated:** 2026-04-10
> **Companion to:** [PLAN.md](PLAN.md) — defines *who* will do *which Phase 1 task*

---

## 🎯 Why Multi-Agent

Different parts of this project need different brains:
- **GST + schema design** → needs deep reasoning + domain knowledge → Opus
- **Code production** → needs speed + consistency → Sonnet
- **Smoke testing** → needs cheap, fast iteration → Haiku

The main Claude (me) acts as **orchestrator** — assigns work, reviews output, sequences handoffs, and never lets agents step on each other.

---

## 👥 The 6 Agents

| # | Agent | Model | Primary Role | Writes Code? |
|---|---|---|---|---|
| 1 | `architect-gst` | **Opus 4.6** | Schema design, GST tax logic, invoice numbering, PDF template spec, compliance review | ❌ Specs only |
| 2 | `backend-coder` | **Sonnet 4.6** | Implements all server-side code from architect's specs | ✅ Server only |
| 3 | `frontend-coder` | **Sonnet 4.6** | Implements feature wiring + state + API integration in React | ✅ Client only |
| 4 | `ui-designer` | **Sonnet 4.6** | Senior designer who audits + ships visual polish (Tailwind, spacing, hierarchy, micro-interactions) | ✅ Client only (visual layer) |
| 5 | `qa-tester` | **Haiku 4.5** | Cheap smoke tests — endpoint contract checks via Node/axios | ✅ Tests only |
| 6 | `senior-tester` | **Sonnet 4.6** | 12-yr QA — runs the live app, exploratory tests UX + API + edge cases, files bugs, coordinates fixes | ✅ Tests + bug reports only |

---

## 🧠 Agent Definitions

### 1️⃣ `architect-gst` — The Brain (Opus)

**Mission:** Be the single source of truth for *what* gets built and *why*. Never writes app code.

**Responsibilities**
- Design Mongoose schemas (fields, validators, indexes)
- Design the GST tax engine (CGST/SGST/IGST split, HSN code lookups, interstate detection)
- Design the invoice number generator (gap-free, atomic, FY-aware)
- Design the PDF invoice template (fields, layout, GST-compliant blocks)
- Review backend-coder PRs for correctness *before* tester touches them
- Catch GST edge cases (reverse charge, exempt items, composite supply, B2B vs B2C)

**Tools allowed:** `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`
**Tools forbidden:** `Write`, `Edit`, `Bash` (no code, no shell)

**Deliverable format:** Markdown specs in `specs/` folder
- `specs/01-schema-changes.md`
- `specs/02-gst-engine.md`
- `specs/03-invoice-numbering.md`
- `specs/04-pdf-template.md`

---

### 2️⃣ `backend-coder` — Server Implementer (Sonnet)

**Mission:** Turn architect specs into working Express/Mongoose code. No improvising on schemas or business rules.

**Responsibilities**
- Implement Mongoose models per `specs/01-schema-changes.md`
- Implement controllers, services, routes
- Wire `node-cron` jobs
- Update `seed.js`
- Run server, hit endpoints with curl to self-verify before handing to tester

**Tools allowed:** `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`
**Scope boundary:** Only touches `server/**` — never `client/**`

**Working agreement**
- Must read the architect spec before writing any model/controller
- Must NOT change schema fields without architect approval
- Must run `node src/server.js` after each change to verify boot
- Must add a one-line comment per controller function: what it does + which spec it implements

---

### 3️⃣ `frontend-coder` — Client Implementer (Sonnet)

**Mission:** Turn UI designer mocks + backend API contracts into working React pages.

**Responsibilities**
- Implement React components per `specs/ui-*.md`
- Wire pages to backend services in `client/src/services/`
- Handle loading/error/empty states
- Run `npm run build` after each change

**Tools allowed:** `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`
**Scope boundary:** Only touches `client/**` — never `server/**`

**Working agreement**
- Must read the UI designer spec before building any component
- Must NOT invent new API endpoints — only consume what backend-coder built
- Must keep bundle size in mind (lazy-load heavy pages)

---

### 4️⃣ `ui-designer` — UX & Tailwind (Sonnet)

**Mission:** Design before code. Decide layout, hierarchy, spacing, colors — so frontend-coder doesn't have to guess.

**Responsibilities**
- Read existing pages to learn the project's visual language
- Sketch new screens as Tailwind class lists + ASCII wireframes
- Define design tokens (primary color, spacing scale, font sizes) — extend `tailwind.config.js` if needed
- Design the GST invoice PDF layout
- Design the OCR review screen
- Design the AI chat UX (suggested chips, loading states)

**Tools allowed:** `Read`, `Grep`, `Glob`, `WebFetch`
**Tools forbidden:** `Write`, `Edit`, `Bash`

**Deliverable format:** Markdown specs in `specs/ui-*.md`
- `specs/ui-01-invoice-preview.md`
- `specs/ui-02-ocr-review.md`
- `specs/ui-03-ai-chat-polish.md`
- `specs/ui-04-dashboard-tiles.md`

Each spec includes: ASCII wireframe + component breakdown + Tailwind classes + states (loading, empty, error).

---

### 5️⃣ `qa-tester` — The Validator (Haiku)

**Mission:** Catch breakage cheaply and fast. Runs after every backend or frontend task.

**Responsibilities**
- Write reusable smoke test scripts in `tests/smoke/` (Node scripts using `axios`)
- Hit endpoints with sample payloads and verify response shape
- Check Mongo state directly when needed
- Report pass/fail per task back to orchestrator
- Catch GST math errors with hand-computed expected values

**Tools allowed:** `Read`, `Write`, `Edit`, `Bash`, `Grep`
**Scope boundary:** Only touches `tests/**`

**Working agreement**
- Tests must be runnable with `node tests/smoke/<name>.js`
- Each test prints `✅ PASS` or `❌ FAIL: <reason>`
- Never modifies `server/**` or `client/**` — only reports

---

## 🔄 Workflow & Handoff Protocol

### Standard handoff for each Phase 1 task:

```
   ┌─────────────────────┐
   │   Orchestrator      │   ← Main Claude — assigns + reviews
   │   (me)              │
   └──────┬──────────────┘
          │ "Design schema for X"
          ▼
   ┌─────────────────────┐
   │  architect-gst      │   ← Opus — produces spec
   │                     │
   └──────┬──────────────┘
          │ specs/01-schema.md
          ▼
   ┌─────────────────────┐     ┌─────────────────────┐
   │  backend-coder      │     │  ui-designer        │   ← Run in parallel when possible
   │  (Sonnet)           │     │  (Sonnet)           │
   └──────┬──────────────┘     └──────┬──────────────┘
          │ server code           │ specs/ui-*.md
          ▼                       ▼
   ┌─────────────────────┐     ┌─────────────────────┐
   │  qa-tester          │     │  frontend-coder     │
   │  (Haiku)            │     │  (Sonnet)           │
   └──────┬──────────────┘     └──────┬──────────────┘
          │ pass/fail              │ client code
          ▼                       ▼
          └───────────► Orchestrator reviews & marks done
```

### Rules
1. **One agent in flight per file** — never two coders editing the same file
2. **Specs before code** — backend/frontend coders must read spec first
3. **Tester after code** — never before
4. **Architect reviews spec violations** — if backend-coder deviated, architect rules
5. **Orchestrator owns the todo list** — agents don't update PLAN.md directly

---

## 📋 Phase 1 Work Mapping (from PLAN.md → agents)

| # | Task | Owner | Reviewer | Tester |
|---|---|---|---|---|
| **A1** | Add `super_admin` to User role enum + update seed | `backend-coder` | `architect-gst` | `qa-tester` |
| **A2** | Extend Product with `hsnCode`, `gstRate`, `unit`, `costPrice`, `reorderQty`, `isActive` | `architect-gst` (spec) → `backend-coder` (impl) | self | `qa-tester` |
| **A3** | Extend Settings with `shopGstin`, `shopState`, `shopAddress`, `invoicePrefix` | `architect-gst` (spec) → `backend-coder` (impl) | self | `qa-tester` |
| **A4** | Build `Alert.model.js` (productId, type, severity, message, status) | `architect-gst` (spec) → `backend-coder` (impl) | self | `qa-tester` |
| **B1** | Fix invoice number generator — atomic counter collection | `architect-gst` (algorithm) → `backend-coder` (impl) | `architect-gst` | `qa-tester` (concurrency test) |
| **B2** | Update sale.controller to derive GST from product gstRate, populate seller from Settings | `architect-gst` (spec) → `backend-coder` (impl) | `architect-gst` | `qa-tester` (math check) |
| **B3** | PDF invoice generator (`pdfkit`) | `architect-gst` (template) + `ui-designer` (layout) → `backend-coder` (impl) | `architect-gst` | `qa-tester` (open PDF) |
| **B4** | Sales page invoice preview + download UI | `ui-designer` (spec) → `frontend-coder` (impl) | self | `qa-tester` (manual check) |
| **C1** | OCR review screen — return parsed data, let user edit, then save | `ui-designer` (spec) → `frontend-coder` + `backend-coder` (split endpoint) | `architect-gst` | `qa-tester` |
| **D1** | Verify Gemini key, add suggested-question chips, GST summary tool | `ui-designer` (chips) → `frontend-coder` + `backend-coder` (tool) | self | `qa-tester` |
| **E1** | Build `smartAlerts.cron.js` + wire `node-cron` | `architect-gst` (spec) → `backend-coder` (impl) | self | `qa-tester` |
| **E2** | Delete `socket/` folder + empty controllers | `backend-coder` | self | — |
| **E3** | Update seed: super_admin + sample shop settings + sample HSN products | `backend-coder` | `architect-gst` | `qa-tester` (run seed) |

**Parallelizable batches** (no file overlap → run agents in parallel):
- **Batch A** (schema fixes): A1 + A2 + A3 + A4 — different files, single backend-coder session
- **Batch B-spec** (design phase): architect designs B1+B2+B3 specs in parallel with ui-designer designing B4 + C1 + D1
- **Batch B-impl**: B1 + B2 + B3 (backend) and B4 (frontend) can run together once specs are ready

---

## 📁 Folder Layout (after this plan lands)

```
Clg Mern/
├── PLAN.md                    ← project plan (locked)
├── AGENTS_PLAN.md             ← this file
├── .claude/
│   └── agents/
│       ├── architect-gst.md
│       ├── backend-coder.md
│       ├── frontend-coder.md
│       ├── ui-designer.md
│       └── qa-tester.md
├── specs/                     ← architect & designer output
│   ├── 01-schema-changes.md
│   ├── 02-gst-engine.md
│   ├── 03-invoice-numbering.md
│   ├── 04-pdf-template.md
│   ├── ui-01-invoice-preview.md
│   ├── ui-02-ocr-review.md
│   └── ui-03-ai-chat-polish.md
├── tests/
│   └── smoke/                 ← qa-tester output
│       ├── auth.test.js
│       ├── product.test.js
│       ├── sale-gst.test.js
│       └── ...
├── server/  (existing)
└── client/  (existing)
```

---

## 💰 Cost & Speed Tradeoffs

| Agent | Model | Cost / 1M tok (in/out) | When to call |
|---|---|---|---|
| `architect-gst` | Opus 4.6 | ~$15 / $75 | Once per task — design phase only |
| `backend-coder` | Sonnet 4.6 | ~$3 / $15 | Many calls — main workhorse |
| `frontend-coder` | Sonnet 4.6 | ~$3 / $15 | Many calls — main workhorse |
| `ui-designer` | Sonnet 4.6 | ~$3 / $15 | Once per UI screen |
| `qa-tester` | Haiku 4.5 | ~$1 / $5 | After every code task — runs cheap and often |

**Strategy:** Front-load Opus on design, then let Sonnet/Haiku grind out the implementation cheaply.

---

## ⚠️ Risks I Want to Flag

### ASSUMPTION: Agents can run in parallel without stepping on each other
- **RISK:** If backend-coder and frontend-coder both touch a shared file (e.g., a service file in client that mirrors a backend route), they could clobber each other
- **SEVERITY:** Medium
- **MITIGATION:** Strict scope boundaries (server/** vs client/**), one agent per task at a time within the same phase

### ASSUMPTION: Architect specs will be specific enough that backend-coder doesn't need to guess
- **RISK:** If specs are too high-level, backend-coder will improvise → architect was bypassed
- **SEVERITY:** Medium
- **MITIGATION:** Spec template requires: exact field names, types, defaults, validators, indexes, example payloads. No prose-only specs.

### ASSUMPTION: qa-tester (Haiku) is smart enough to write meaningful tests
- **RISK:** Haiku may write shallow tests that pass but don't catch real bugs
- **SEVERITY:** Medium
- **MITIGATION:** Orchestrator (me) provides expected-output values for math-heavy tests (GST splits, totals); Haiku just runs and compares

### ASSUMPTION: Specs folder doesn't pollute the repo
- **RISK:** Specs become stale once code is merged
- **SEVERITY:** Low
- **MITIGATION:** Each spec ends with a "✅ Implemented in commit X" line so we know it's frozen

---

## ❓ Open Questions Before Scaffolding the Agent Files

1. **Project-level vs global agents** — should the 5 agent files go in `.claude/agents/` (only this project sees them) or `~/.claude/agents/` (available everywhere)? Recommend: project-level so they live with the repo.
2. **Tool restriction enforcement** — should I hard-restrict tools per agent (safer, but agents may hit dead-ends), or just describe them in the prompt? Recommend: hard-restrict via `tools:` frontmatter.
3. **Should `architect-gst` have WebSearch?** Useful for looking up HSN codes / GST rates, but slower. Recommend: yes.
4. **Should `qa-tester` be allowed to install dev dependencies** (like `axios` for tests)? Recommend: yes, one-time setup.
5. **Spec review loop** — when backend-coder completes a task, should `architect-gst` be auto-called to review, or only if `qa-tester` fails? Recommend: only on test fail (saves Opus tokens).

---

## ⏭️ Next Step

1. **You sign off on this plan** (or give corrections)
2. I create the 5 agent files in `.claude/agents/` based on the definitions above
3. I create `specs/` and `tests/smoke/` empty folders
4. We start **Batch A** (schema fixes A1→A4) by calling `architect-gst` first to spec all four, then `backend-coder` to implement them in one session

Are you happy with the plan, or want changes to any agent's role / tools / model?
