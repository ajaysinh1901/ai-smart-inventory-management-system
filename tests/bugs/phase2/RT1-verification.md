# RT1 Phase 2 Verification Report

**Date:** 2026-05-19  
**Tester:** RT1 Re-test Agent  
**Backend under test:** http://localhost:5001/api/v1 (phase 2 fixed server)  
**Test scripts:** tests/bugs/phase2/rt1-verify.js, rt1-model-direct.js, rt1-biz-profile.js  

---

## Verification Results Table

| Bug ID | Title | Status | Evidence |
|--------|-------|--------|----------|
| A1-01 | Settings pre-save hook crash (Mongoose-9) | **FIXED** | GET /settings → 200; PUT /settings preferences → 200; pre-save async hook confirmed in Settings.model.js line 101 |
| A1-02 | Settings validator missing `profile` section | **FIXED** | PUT /settings {profile:{jobTitle:"Inventory Manager"}} → 200; GET /settings shows jobTitle persisted |
| A1-03 | AI-config validator accepts gemini-2.5-flash / gemini-2.0-flash / gemini-1.5-pro | **FIXED** | All three model IDs → 200; validator enum extended in settings.validator.js lines 52-60 |
| A1-04 | workspace section persists GSTIN/state/UPI/pinCode | **FIXED** | PUT /settings {workspace:{gstin,state,upiId,pinCode}} → 200; GET /settings confirms all four fields persisted |
| A1-05 | workspace.controller errors return clean JSON | **FIXED** | All 5 handlers have try/catch; GET /workspace → 200; PATCH /workspace → 200; confirmed in workspace.controller.js lines 37-42, 52-69, 78-84, 97-175, 183-193 |
| A1-06 | authLimiter 429 message distinct from lockout | **FIXED** | IP limiter message: "Too many requests from this IP. Please wait one minute before trying again." (rateLimiter.middleware.js line 28); Account lockout message: "Too many failed attempts. Try again in N minutes." (auth.controller.js line 102) — clearly distinct |
| A1-08 | DELETE /sample-packs only removes isSample products | **FIXED** | samplePack.controller.js uses `deleteMany({ isSample: true })` with fix comment; single-shop design documented |
| A1-09 | User default role = staff | **FIXED** | User.model.js line 9: `default: 'staff'`; live registration returns role=staff |
| SEC-003 | JWT lifetime capped to ~7 days | **FIXED** | Decoded live token: lifetime = 7.00 days; auth.service.js generateToken() caps at 7d regardless of JWT_EXPIRE env value |
| SEC-004 | CORS works for localhost in dev | **FIXED** | OPTIONS /health with Origin:http://localhost:5173 → Access-Control-Allow-Origin: http://localhost:5173; dev allowlist in app.js |
| SEC-006 | npm test — 3 axios-missing suites now run | **FIXED** | `axios@1.16.1` added to server/devDependencies; `npm test` no longer produces "Cannot find module 'axios'"; test run: 204 tests, 25 suites, 188 pass |
| Mongoose-9 Product hook | Product/KhataEntry/StockAdjustment pre-hooks fixed | **FIXED** | Product.pre('validate') async hook runs without error; Product.save() succeeds (confirmed via direct model test + server log showing 201 on product creates); KhataEntry and StockAdjustment hooks produce expected ValidationErrors (not hook crashes) |

---

## Notes on Remaining npm test Failures (SEC-006 context)

After the axios fix, `npm test` shows: **204 tests, 25 suites, 188 pass, 10 fail, 2 cancelled, 4 skipped**.

The 10 remaining failures are all `AxiosError: Request failed with status code 401` in three e2e test files:
- `e2e-gstr1-export.test.js`
- `e2e-onboarding-speedrun.test.js`
- `e2e-scale-mode-sale.test.js`

These tests attempt to authenticate as `admin@smartstock.test` / `admin123` against port 5000 (hardcoded `API_URL` default). Neither the credentials nor the port exist in the current environment. These are **pre-existing test authoring issues** — they existed before phase 2 and are not caused by the phase 2 changes. The SEC-006 fix (adding axios) is complete. The 10 failures are a separate test-data/configuration issue tracked as future work.

---

## A1-08 Assessment

The fix comment in samplePack.controller.js reads:
> "Single-shop app: all staff share one shop, so deleting all isSample products is correct scope."

This is a design decision change from the original bug report which assumed multi-user tenancy. The bug report called for userId-scoped deletion. The fix instead documents that the app is intentionally single-shop (one business per install), making global `isSample:true` deletion correct. The original cross-user risk is mitigated by the single-shop design assertion.

This is acceptable as FIXED from a single-tenant perspective. If multi-tenancy is later introduced this will need revisiting.

---

## Business Profile Setup

**PASS — 27/27 checks**

**Test account registered:** biz-rt1-1779175219544@smartstock.test  
**Flow executed:**
1. Register fresh account → 201, role=staff
2. GET /settings → 200, settings auto-created
3. PUT /settings {profile.jobTitle:"Store Manager"} → 200
4. PUT /settings workspace block (companyName, legalName, gstin, state, address, pinCode, upiId, payeeName, storeType, storeProfile, gstRegistered, defaultLang, eInvoiceEnabled) → 200
5. PUT /settings aiConfig (model=gemini-2.5-flash, sensitivity=80) → 200
6. GET /settings — verified all 16 fields persisted correctly
7. GET /workspace cross-check — GSTIN and upiId confirmed
8. PATCH /workspace — address update applied and persisted

**All fields verified persisted:**

| Field | Sent Value | Persisted |
|-------|-----------|-----------|
| profile.jobTitle | Store Manager | PASS |
| workspace.companyName | Sharma Kirana Store | PASS |
| workspace.legalName | Sharma Brothers Enterprises | PASS |
| workspace.gstin | 24BZEPP1234F1Z5 | PASS |
| workspace.state | Gujarat | PASS |
| workspace.address | 42, Station Road, Surat 395001 | PASS |
| workspace.pinCode | 395001 | PASS |
| workspace.upiId | sharma.kirana@paytm | PASS |
| workspace.payeeName | Sharma Brothers | PASS |
| workspace.storeType | kirana | PASS |
| workspace.storeProfile | small | PASS |
| workspace.gstRegistered | true | PASS |
| workspace.defaultLang | en | PASS |
| workspace.eInvoiceEnabled | false | PASS |
| aiConfig.model | gemini-2.5-flash | PASS |
| aiConfig.sensitivity | 80 | PASS |
| (update) workspace.address | 99, Ring Road, Surat 395007 | PASS |
| (update) workspace.pinCode | 395007 | PASS |

---

## Summary

**Bugs verified fixed: 12 / 12**  
**Bugs still broken: 0**  
**Business profile setup: PASS (27/27)**

All phase 2 fixes for the Auth / Onboarding / Settings / Security module have been verified against the running server on port 5001. The system is ready to proceed to the next phase of QA.
