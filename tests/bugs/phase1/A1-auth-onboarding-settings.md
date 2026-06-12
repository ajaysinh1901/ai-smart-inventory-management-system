# Phase 1 Bug Report — Auth, Users, Settings, Workspace & Onboarding

**QA Agent:** A1  
**Date:** 2026-05-19  
**Test Script:** tests/bugs/phase1/scripts/A1-auth-tests.js  
**Servers:** Backend http://localhost:5000/api/v1 | Frontend http://localhost:5173  

---

## Bug #A1-01: Settings Pre-Save Hook Crashes on Every Save — All Settings/Workspace/Onboarding Endpoints Return 5xx

**Found:** 2026-05-19  
**Severity:** Critical  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
Every endpoint that creates or saves a Settings document returns a server error. This means:
- GET /settings returns 500 "next is not a function" for all users
- PUT /settings with any valid body returns 400 "next is not a function"
- GET /workspace, PATCH /workspace, GET /workspace/onboarding, PATCH /workspace/onboarding all return 500 "Internal server error."
- POST /sample-packs/seed returns 500

The entire settings, workspace, and onboarding subsystem is inoperable for every user.

### Steps to Reproduce
1. Register a fresh account: POST /auth/register {name, email, password}
2. GET /api/v1/settings with Bearer token
3. Observe 500 {"success":false,"message":"next is not a function"}

Reproduced consistently on every fresh user and every existing user tested.

### Expected
GET /settings returns 200 with the user's settings document (auto-created if first call).

### Actual
500 {"success":false,"message":"next is not a function"} on every call.

### Evidence

Direct Node reproduction (confirmed in server/):
```
node -e "require('dotenv').config(); const mongoose = require('./node_modules/mongoose'); ..."
// Output: ERROR: next is not a function
// Stack: TypeError: next is not a function
//   at model.<anonymous> (Settings.model.js:120:3)
//   at Kareem.execPre (kareem/index.js:68:39)
```

Kareem version: 3.2.0 (used by Mongoose 9.3.1).

Curl after clean rate-limit window:
```
POST /auth/register -> 201
GET /settings (same token) -> 500 {"success":false,"message":"next is not a function"}
GET /workspace (same token) -> 500 {"success":false,"message":"Internal server error."}
```

### Root Cause Hypothesis
`server/src/models/Settings.model.js` line 100 registers a synchronous pre-save hook using the **callback-style** signature `function(next)`. In Kareem 3.x (shipped with Mongoose 9.x), synchronous pre-hooks no longer receive `next` as a parameter — it arrives as `undefined`. When the hook reaches the final `next()` call at line 120 (after setting `weightDisplay` and `paiseDisplay`), it throws `TypeError: next is not a function`.

The User model (auth.service works fine) uses the correct async style: `pre('save', async function () { ... })` — no `next` parameter. Settings has not been migrated.

Cascade: every Settings.create() and settings.save() call in the codebase throws this error, taking down:
- `settings.controller.js` getSettings, updateSettings, updatePassword
- `workspace.controller.js` (no try/catch — unhandled async throw goes to error middleware)
- `samplePack.controller.js` seedPack (calls Settings.create/findOne + save)

### Suggested Fix
`server/src/models/Settings.model.js` line 100: convert the pre-save hook to async style:

```js
// BEFORE (broken with Mongoose 9 / Kareem 3)
settingsSchema.pre('save', function (next) {
  if (!this.isModified('workspace.storeProfile') && !this.isNew) return next();
  const profile = this.workspace && this.workspace.storeProfile;
  if (!profile) return next();
  ...
  next();
});

// AFTER (Mongoose 9 compatible)
settingsSchema.pre('save', function () {
  if (!this.isModified('workspace.storeProfile') && !this.isNew) return;
  const profile = this.workspace && this.workspace.storeProfile;
  if (!profile) return;
  ...
  // no next() needed — async/sync hooks without next parameter work correctly
});
```

Also add try/catch to `workspace.controller.js` handlers (currently missing).

### Verification
- [ ] Fix shipped
- [ ] GET /settings returns 200 for a brand new user with auto-created settings
- [ ] PUT /settings preferences update returns 200 and data persists
- [ ] GET /workspace returns 200 with workspace + onboarding blocks
- [ ] PATCH /workspace/onboarding step advance returns 200 and completedSteps updated
- [ ] POST /sample-packs/seed returns 200/201 and products are inserted

---

## Bug #A1-02: Settings Validator Missing 'profile' Section — Job Title Can Never Be Saved

**Found:** 2026-05-19  
**Severity:** High  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
The SettingsPage Profile section has a "Job Title / Role" field. Saving the profile fires `saveSettings('profile', { jobTitle })` which calls PUT /settings with `{profile: {jobTitle: 'value'}}`. The endpoint returns 400 "At least one settings section is required". The job title is never persisted for any user.

### Steps to Reproduce
1. Login and go to Settings > Profile
2. Enter a Job Title value
3. Click "Save Changes"
4. The name/email update succeeds (PUT /users/me) but job title update silently fails
5. Reload page — job title is empty

Via API:
```
PUT /api/v1/settings {"profile": {"jobTitle": "Inventory Manager"}}
-> 400 {"success":false,"message":"At least one settings section is required"}
```

### Expected
PUT /settings with `{profile: {jobTitle: "..."}}` succeeds and persists job title.

### Actual
400 because `updateSettingsSchema`'s `.refine()` requires at least one of: workspace, preferences, aiConfig, notifications. `profile` is not in the schema at all and the Zod refine check fails.

### Evidence
`server/src/validators/settings.validator.js` line 57-71: `updateSettingsSchema` defines only `workspace`, `preferences`, `aiConfig`, `notifications`. There is no `profile` section.

`server/src/controllers/settings.controller.js` line 31-33: the controller correctly handles `if (profile) { Object.assign(settings.profile, profile); }` — the controller side is ready, but the validator blocks it.

`client/src/pages/SettingsPage.jsx` line 194-197: `ProfileSection.save()` calls `saveSettings('profile', { jobTitle }, { silent: true })`. The `silent: true` flag means the 400 error is silently swallowed and the user sees "Profile saved." toast even though job title was not saved.

```
PUT /settings {profile:{jobTitle}} -> 400 {"errors":[{"field":"(root)","message":"At least one settings section is required"}]}
```

### Root Cause Hypothesis
`settings.validator.js` `updateSettingsSchema` was never extended to include `profile`. The controller and UI both have the profile section but the validator rejects the request before it reaches the controller.

### Suggested Fix
Add `profile` to `updateSettingsSchema` in `server/src/validators/settings.validator.js`:
```js
const profile = z.object({
  jobTitle: z.string().trim().max(120).optional(),
}).partial();

exports.updateSettingsSchema = z.object({
  profile: profile.optional(),
  workspace: workspace.optional(),
  // ... rest unchanged
}).refine(obj =>
  obj.profile !== undefined || obj.workspace !== undefined ||
  obj.preferences !== undefined || obj.aiConfig !== undefined ||
  obj.notifications !== undefined,
  { message: 'At least one settings section is required' }
);
```

Also remove the `silent: true` flag from `SettingsPage.jsx` line 197 so profile save failures surface to the user.

### Verification
- [ ] Fix shipped
- [ ] PUT /settings {"profile":{"jobTitle":"Test"}} returns 200
- [ ] Reload SettingsPage — job title is populated from saved settings
- [ ] Profile save failure (if any) shows error toast

---

## Bug #A1-03: AI Config Validator Accepts Only 3 Legacy Model IDs — UI Models All Rejected

**Found:** 2026-05-19  
**Severity:** High  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
The Settings > AI Configuration page shows 3 model choices: "Gemini 2.5 Flash", "Gemini 2.0 Flash", "Gemini 1.5 Pro". Saving any of these three returns 400 validation error. The entire AI Configuration section cannot be saved.

### Steps to Reproduce
1. Go to Settings > AI Configuration
2. Select any model (all three are the "new" model IDs)
3. Click "Save AI Config"
4. 400 error: "Invalid option: expected one of gemini-flash|gemini-pro|legacy"

Via API:
```
PUT /api/v1/settings {"aiConfig": {"model": "gemini-2.5-flash"}}
-> 400 {"errors":[{"field":"aiConfig.model","message":"Invalid option: expected one of \"gemini-flash\"|\"gemini-pro\"|\"legacy\""}]}
```

### Expected
PUT /settings with any of `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` returns 200 and persists the selection.

### Actual
All modern model IDs are rejected. Only the old IDs `gemini-flash`, `gemini-pro`, `legacy` pass validation — but even those fail with "next is not a function" due to Bug #A1-01.

### Evidence
`server/src/validators/settings.validator.js` line 24:
```js
model: z.enum(['gemini-flash', 'gemini-pro', 'legacy']).optional(),
```

`server/src/models/Settings.model.js` line 55: model enum has 7 values:
```js
model: { type: String, enum: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash', 'gemini-pro', 'legacy'], default: 'gemini-2.5-flash' }
```

`client/src/pages/SettingsPage.jsx` AiConfigSection shows:
```js
{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'RECOMMENDED' },
{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
{ id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
```

All three fail validation. The validator was never updated when the model IDs were expanded.

Tested:
```
gemini-2.5-flash -> 400 (validator mismatch)
gemini-2.0-flash -> 400 (validator mismatch)
gemini-1.5-flash -> 400 (validator mismatch)
gemini-1.5-pro   -> 400 (validator mismatch)
gemini-flash     -> 400 (pre-save bug, but validator accepts)
```

### Root Cause Hypothesis
`settings.validator.js` aiConfig.model enum was never updated to match the expanded model list added to the Mongoose schema and the UI.

### Suggested Fix
`server/src/validators/settings.validator.js` line 24, replace enum:
```js
model: z.enum([
  'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash',
  'gemini-1.5-pro', 'gemini-flash', 'gemini-pro', 'legacy'
]).optional(),
```

### Verification
- [ ] Fix shipped (and Bug #A1-01 also fixed)
- [ ] PUT /settings {"aiConfig":{"model":"gemini-2.5-flash"}} returns 200
- [ ] Settings page AI Config section saves successfully and persists model selection

---

## Bug #A1-04: Settings Validator Does Not Validate Invoice Fields — GSTIN/UPI/State Silently Dropped via PUT /settings

**Found:** 2026-05-19  
**Severity:** High  
**Status:** Open  
**Assigned:** backend-coder (validator) + frontend-coder (route to correct endpoint)  

### Symptom
The SettingsPage Workspace section includes GSTIN, State, Address, PIN, UPI ID, Payee Name fields (all legally required for tax invoices). When the user clicks "Update Workspace", these fields are silently dropped — they never reach the database. The user receives a success toast but the invoice fields are not saved.

### Steps to Reproduce
1. Go to Settings > Workspace
2. Fill in GSTIN: "27AAPFU0939F1ZV", State: "Gujarat", UPI ID: "merchant@upi"
3. Click "Update Workspace"
4. Reload page — all three fields are empty

### Expected
Saving the Workspace section persists GSTIN, state, UPI ID, and all other invoice-related fields.

### Actual
`SettingsPage.jsx` WorkspaceSection.save() calls `saveSettings('__multi__', {workspace:{...}, preferences:{...}})` which calls `PUT /settings`. The `updateSettingsSchema` workspace sub-schema only validates: `companyName, industry, website, timezone, description`. Fields like `gstin, state, address, pinCode, upiId, payeeName, storeProfile` are not in the validator and are silently stripped by Zod's partial() before reaching the controller. These fields are permanently lost.

### Evidence
`server/src/validators/settings.validator.js` lines 4-11: workspace sub-schema:
```js
const workspace = z.object({
  companyName: z.string().trim().optional(),
  industry:    z.string().trim().optional(),
  website:     z.string().trim().optional(),
  timezone:    z.string().trim().optional(),
  description: z.string().trim().optional(),
}).partial();
```

No `gstin`, `state`, `address`, `pinCode`, `upiId`, `payeeName`, `storeProfile`, `storeType`, `defaultLang`, `gstRegistered`, `legalName`, `fyStart`, `bankLast4`, `eInvoiceEnabled`, `weightDisplay`, `paiseDisplay`.

All of these ARE handled by `settings.controller.js` updateSettings (`Object.assign(settings.workspace, workspace)`), and all of them exist in `Settings.model.js`. The gap is only in the validator.

The correct route for these fields is `PATCH /workspace` (via workspace.controller.js and workspace.validator.js which DOES have all these fields). But the SettingsPage UI uses `PUT /settings` instead of `PATCH /workspace`.

### Root Cause Hypothesis
Two separate issues: (1) `settings.validator.js` workspace section was never updated when invoice fields were added to the model. (2) `SettingsPage.jsx` WorkspaceSection routes to the wrong endpoint — should use `PATCH /workspace` but uses `PUT /settings`.

### Suggested Fix
Option A (preferred): Update `SettingsPage.jsx` WorkspaceSection.save() to call `PATCH /workspace` instead of `PUT /settings` for the workspace block, then call `PUT /settings` for preferences only. The workspace validator already has full field coverage.

Option B: Extend `settings.validator.js` workspace schema to include all fields with the same validation rules as `workspace.validator.js`.

### Verification
- [ ] Fix shipped (and Bug #A1-01 fixed)
- [ ] Save GSTIN + State + UPI on Workspace settings page
- [ ] Reload page — all three fields retained
- [ ] Invoice preview shows correct GSTIN and state

---

## Bug #A1-05: Workspace Controller Has No try/catch — Unhandled Promise Rejection Returns Generic 500

**Found:** 2026-05-19  
**Severity:** Medium  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
All five handlers in `workspace.controller.js` (`getWorkspace`, `patchWorkspace`, `getOnboarding`, `patchOnboarding`, `dismissOnboarding`) have no try/catch blocks. Any thrown error (currently always from the Settings pre-save bug) propagates as an unhandled async error. Express's error middleware catches it and returns 500 "Internal server error." with no diagnostic detail. When Bug #A1-01 is fixed, other errors (e.g., DB connection loss, validation edge cases) will still produce the same opaque 500.

### Steps to Reproduce
1. GET /workspace with a valid token
2. 500 {"success":false,"message":"Internal server error."}
3. Compare with settings.controller.js which has try/catch and returns descriptive messages

### Expected
Errors are caught, logged, and return appropriate status codes with descriptive messages.

### Actual
All errors silently fall through to the global error middleware. Even Mongoose validation errors return 500 instead of 400.

### Evidence
`server/src/controllers/workspace.controller.js` all exports: no try/catch present. Every function is `async (req, res) => { ... }` without error handling.

Compare with `settings.controller.js`:
```js
exports.getSettings = async (req, res) => {
  try { ... } catch (error) { res.status(500).json(...); }
};
```

### Root Cause Hypothesis
Workspace controller was written without error handling and the gap was never caught (pre-save bug always triggers before reaching any handler logic).

### Suggested Fix
Wrap all handler bodies in try/catch in `server/src/controllers/workspace.controller.js`:
```js
exports.getWorkspace = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    res.json({ success: true, data: workspacePayload(settings) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```
Apply the same pattern to patchWorkspace, getOnboarding, patchOnboarding, dismissOnboarding.

### Verification
- [ ] Fix shipped
- [ ] DB connection dropped scenario returns 503 or descriptive 500, not generic crash
- [ ] Validation errors from patchWorkspace return 400 with message

---

## Bug #A1-06: authLimiter (15 req/min) Fires Before Per-Account Lockout — Incorrect Error on Login Edge Cases

**Found:** 2026-05-19  
**Severity:** Medium  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
During the test suite, the IP-based rate limiter (15 requests per minute on /auth/register and /auth/login) fires before the individual account lockout logic runs. A test script that registers ~14 accounts in the same minute then tries login tests receives 429 "Too many auth attempts. Please try again in a minute." for ALL login calls — including tests for wrong password (expected 401) and missing fields (expected 400). Users in normal usage can also hit this if they try multiple accounts in rapid succession.

The 429 message "Too many auth attempts" is misleading because it's an IP-level throttle, not an account lockout.

### Steps to Reproduce
1. Register 14+ accounts in under 60 seconds from one IP
2. Then attempt: POST /auth/login with wrong password
3. Expected: 401 Invalid credentials
4. Actual: 429 "Too many auth attempts. Please try again in a minute."

### Expected
IP rate limiter message should clearly distinguish from account lockout. Or the limit should be higher (e.g. 60 req/min) so normal developer testing doesn't hit it.

### Actual
Same 429 message for both IP-level throttle and account-level lockout, making it impossible for the user to know what to do (wait 1 minute vs wait 15 minutes).

### Evidence
`server/src/middlewares/rateLimiter.middleware.js` line 24-28:
```js
exports.authLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many auth attempts. Please try again in a minute.',
});
```

`server/src/controllers/auth.controller.js` line 83-86: account lockout message:
```js
message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`
```

Both are 429s with similar phrasing. No way to distinguish IP throttle from account lockout.

### Root Cause Hypothesis
Message text for IP rate limiter was set identically to the account-level lockout message. Different context, different remediation steps, same message.

### Suggested Fix
Change the IP rate limiter message to distinguish it:
```js
message: 'Request rate exceeded. Please wait one minute before trying again.'
```
Or differentiate by including the throttle type in the error body:
```json
{"success": false, "message": "...", "error": "IP_RATE_LIMIT"}
```
vs account lockout:
```json
{"success": false, "message": "...", "error": "ACCOUNT_LOCKED"}
```

### Verification
- [ ] Fix shipped
- [ ] IP rate limit 429 has distinguishable message from account lockout 429
- [ ] Frontend shows appropriate remediation text for each type

---

## Bug #A1-07: Onboarding Service localStorage Fallback Has Off-By-One Error in completedSteps

**Found:** 2026-05-19  
**Severity:** Medium  
**Status:** Open  
**Assigned:** frontend-coder  

### Symptom
When the onboarding PATCH /workspace/onboarding API fails (currently always fails due to Bug #A1-01), `onboardingService.saveStep()` falls back to localStorage. The fallback code stores `stepNumber - 1` in `completedSteps` instead of `stepNumber`. So completing Step 1 marks nothing complete (0 is filtered out), completing Step 2 marks Step 1, and so on — always one step behind. The wizard never correctly tracks that Step 7 (the final activation step) is complete.

### Steps to Reproduce
1. Register a new user (wizard opens automatically)
2. Complete Step 1 (store profile)
3. API call fails (Bug #A1-01), localStorage fallback fires
4. Check localStorage key `smartstock-onboarding-draft`
5. `completedSteps` is `[]` (step 0 is filtered, so nothing recorded for step 1)
6. Proceed to step 7, complete it
7. `completedSteps` contains `[1,2,3,4,5,6]` — step 7 is missing
8. `isComplete` check: `completedSteps.length >= 7` -> `6 >= 7` = false
9. Wizard never marks as complete; resume pill persists indefinitely

### Expected
Completing step N records step N in completedSteps. After step 7, completedSteps = [1,2,3,4,5,6,7] and isComplete = true.

### Actual
Off-by-one: completedSteps is always one step behind. After all 7 steps, completedSteps = [1,2,3,4,5,6]. isComplete = false.

### Evidence
`client/src/services/onboardingService.js` lines 41-46:
```js
completedSteps: [
  ...new Set([...(draft.completedSteps || []), stepNumber - 1].filter(n => n > 0)),
],
```
`stepNumber - 1` should be `stepNumber`.

`client/src/contexts/OnboardingContext.jsx` line 86:
```js
const isComplete = state.completedSteps.length >= 7 || state.currentStep > 7;
```

Note: `currentStep` is advanced by `markStepComplete` to `step + 1` which works correctly. But `isComplete` also checks `completedSteps.length >= 7` which will never be true due to the off-by-one.

### Root Cause Hypothesis
Likely a typo: `stepNumber - 1` was intended to record the step just before the current one (the one just completed), but this is logically wrong. The step being saved IS `stepNumber`.

### Suggested Fix
`client/src/services/onboardingService.js` line 44: change `stepNumber - 1` to `stepNumber`:
```js
completedSteps: [
  ...new Set([...(draft.completedSteps || []), stepNumber].filter(n => n > 0)),
],
```

Also fix the localStorage key for stepData (line 46): `step${stepNumber - 1}` should be `step${stepNumber}`.

### Verification
- [ ] Fix shipped
- [ ] Complete all 7 onboarding steps with API failing (localStorage mode)
- [ ] localStorage completedSteps = [1,2,3,4,5,6,7] after step 7
- [ ] isComplete = true, resume pill disappears

---

## Bug #A1-08: DELETE /sample-packs Deletes ALL Users' Sample Products — Missing userId Filter

**Found:** 2026-05-19  
**Severity:** High  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
The sample pack clear endpoint (`DELETE /api/v1/sample-packs`) deletes ALL products with `isSample: true` from the entire database, regardless of which user owns them. In a multi-user environment, one user clearing their sample pack would delete every other user's sample inventory.

Similarly, the "oldest sample" age check (`findOne({ isSample: true })`) queries globally — if any user has an old sample product, ALL users are blocked from clearing their packs.

### Steps to Reproduce
1. User A seeds a kirana pack
2. User B seeds a pharmacy pack
3. User A calls DELETE /sample-packs
4. User B's pharmacy sample products are also deleted

### Expected
DELETE /sample-packs deletes only the authenticated user's sample products.

### Actual
`Product.deleteMany({ isSample: true })` has no userId filter — deletes every isSample product globally.

### Evidence
`server/src/controllers/samplePack.controller.js` lines 208-209:
```js
const deleteResult = await Product.deleteMany({ isSample: true });
```

Lines 191-198 (oldest sample check also unscoped):
```js
const oldestSample = await Product.findOne({ isSample: true })
  .sort({ createdAt: 1 })
```

Comment on line 82 in buildProductDoc acknowledges the gap:
```js
// userId is not yet a schema field (multi-tenancy gap per spec §0).
// We store it in a loose field so "Clear sample products" can scope deletion.
// This is a no-op until the userId field is added to the Product schema.
```

The TODO comment documents that the userId field does not exist on Product yet, but the controller uses `deleteMany({ isSample: true })` without any guard. Without the multi-tenancy field, the clear operation is globally destructive.

### Root Cause Hypothesis
Multi-tenancy (userId on Product) is not yet implemented. The clearPack was written optimistically but the guard field does not exist, making global deletion the only current behavior.

### Suggested Fix
Until multi-tenancy ships, add a safety block in clearPack:
```js
// Temporary: refuse clear if multiple users have samples (prevents cross-user deletion)
const distinctUsers = await Product.distinct('userId', { isSample: true });
if (distinctUsers.length > 1) {
  return res.status(503).json({ success: false, message: 'Sample pack clear is temporarily disabled in multi-user mode.' });
}
```
Or: add `userId` to Product schema and filter by it immediately.

### Verification
- [ ] Fix shipped
- [ ] User A clears pack; User B's products unaffected
- [ ] Age check (30-day window) is also scoped to requesting user

---

## Bug #A1-09: User Model Default Role is 'manager' But Service Forces 'staff' — Misaligned Defaults

**Found:** 2026-05-19  
**Severity:** Low  
**Status:** Open  
**Assigned:** backend-coder  

### Symptom
The User Mongoose schema defines `role: { default: 'manager' }` but the auth service always creates users with explicit `role: 'staff'`. Any code path that creates a User document directly (bypassing auth.service) will assign `manager` role instead of `staff`, granting unintended elevated permissions.

### Steps to Reproduce
1. Any User.create() call that omits `role` (e.g., future invite flow, test fixtures)
2. User gets `role: 'manager'` (full write access) instead of `role: 'staff'` (read-only)

### Expected
Model default and service default are aligned. Schema default should be `'staff'`.

### Actual
`User.model.js` line 8: `default: 'manager'`. `auth.service.js` line 14: `role: 'staff'`.

### Evidence
`server/src/models/User.model.js` line 8:
```js
role: { type: String, enum: ['admin', 'manager', 'staff'], default: 'manager' },
```

`server/src/services/auth.service.js` line 14:
```js
const user = await User.create({ name, email, password, role: 'staff' });
```

### Root Cause Hypothesis
The model default was set before the privilege-escalation fix (which hardcoded `staff` in the service). The model default was never updated.

### Suggested Fix
`server/src/models/User.model.js` line 8: change `default: 'manager'` to `default: 'staff'`.

### Verification
- [ ] Fix shipped
- [ ] User.create({name, email, password}) without role gets role='staff'
- [ ] Existing users unaffected (model default change only affects new docs)

---

## Bug #A1-10: SettingsPage AiConfigSection Shows 3 Models — None Can Be Saved (Blocked by Bug #A1-03 + #A1-01)

**Found:** 2026-05-19  
**Severity:** High (cascades from #A1-03)  
**Status:** Open  
**Assigned:** frontend-coder (UI) + backend-coder (validator fix in #A1-03)  

### Symptom
The AI Configuration section in Settings shows three model options as selectable (Gemini 2.5 Flash as "RECOMMENDED", Gemini 2.0 Flash, Gemini 1.5 Pro). Clicking any of them and saving returns 400. The entire section is non-functional.

### Steps to Reproduce
1. Settings > AI Configuration
2. Click any model card
3. Click "Save AI Config"
4. Toast: "Failed to save AI configuration."

### Expected
Model selection persists and the "RECOMMENDED" option works out of the box.

### Actual
All three displayed model IDs fail the validator (Bug #A1-03). Even if the validator is fixed, the settings.save() pre-save crash (Bug #A1-01) would also block persistence.

Both upstream bugs must be fixed for this section to work.

### Evidence
See Bug #A1-01 and #A1-03 evidence.

### Suggested Fix
Fix Bug #A1-01 and Bug #A1-03. No separate client-side change needed unless the model list in the UI is to be extended further.

### Verification
- [ ] Bugs #A1-01 and #A1-03 fixed
- [ ] Select "Gemini 2.5 Flash" and save — persists and GET /settings shows model=gemini-2.5-flash

---

## Bug #A1-11: SettingsPage WorkspaceSection save() Silently Succeeds Even Though GSTIN/UPI/State Were Dropped

**Found:** 2026-05-19  
**Severity:** High (cascades from #A1-04)  
**Status:** Open  
**Assigned:** frontend-coder  

### Symptom
The Workspace Settings form displays a success toast "Workspace updated." after saving, even though critical tax-invoice fields (GSTIN, State, UPI ID, PIN Code, Address) were silently stripped by the server validator and never saved. The user believes their invoice fields are saved but invoices will print blank/wrong seller details.

### Steps to Reproduce
1. Settings > Workspace
2. Enter GSTIN "27AAPFU0939F1ZV", State "Gujarat", UPI ID "merchant@upi"
3. Click "Update Workspace"
4. Toast shows "Workspace updated."
5. Reload page — GSTIN, state, UPI fields are empty again

### Expected
Either the save succeeds (all fields persisted) or the error is surfaced to the user.

### Actual
saveSettings returns `true` (server returns 200 for the companyName/industry/website update), but the invoice fields were stripped before they reached the controller. No error is raised because the partial save "succeeds" from a HTTP perspective.

This is distinct from Bug #A1-04 (which is the backend validator gap). This bug is the frontend failing to use the correct endpoint or failing to detect the field loss.

### Evidence
`client/src/pages/SettingsPage.jsx` WorkspaceSection.save() line 469: uses `saveSettings('__multi__', {workspace:{...}, preferences:{...}})`. The workspace object includes gstin, state, upiId, etc. These are stripped silently by the validator. The 200 response is from the partial save (only companyName etc. saved).

### Suggested Fix
`SettingsPage.jsx` WorkspaceSection should use `PATCH /workspace` (via a new service call `patchWorkspace`) for workspace fields, and `PUT /settings` only for preferences. The workspace validator (`workspace.validator.js`) covers all invoice fields with proper validation. See Bug #A1-04 for full details.

### Verification
- [ ] Fix shipped (after #A1-01 and #A1-04)
- [ ] Save GSTIN + State + UPI in WorkspaceSection
- [ ] Reload — all three fields present
- [ ] Invoice modal shows correct seller GSTIN and state

---

## Summary

| Bug ID | Title | Severity | File(s) | Assigned |
|--------|-------|----------|---------|----------|
| A1-01 | Settings pre-save hook crashes on Mongoose 9/Kareem 3 — all Settings/Workspace/Onboarding/SamplePack endpoints return 5xx | Critical | server/src/models/Settings.model.js:100-121 | backend-coder |
| A1-02 | Settings validator missing 'profile' section — job title can never be saved | High | server/src/validators/settings.validator.js + client/src/pages/SettingsPage.jsx:194 | backend-coder |
| A1-03 | AI config validator accepts only 3 legacy model IDs — all 3 UI models rejected with 400 | High | server/src/validators/settings.validator.js:24 | backend-coder |
| A1-04 | Settings validator workspace section missing invoice fields — GSTIN/UPI/state silently dropped | High | server/src/validators/settings.validator.js:4-11 + client/src/pages/SettingsPage.jsx:469 | backend-coder + frontend-coder |
| A1-05 | Workspace controller has no try/catch — generic 500 on any error | Medium | server/src/controllers/workspace.controller.js | backend-coder |
| A1-06 | authLimiter 429 message identical to account lockout 429 — indistinguishable to users | Medium | server/src/middlewares/rateLimiter.middleware.js:27 | backend-coder |
| A1-07 | Onboarding localStorage fallback off-by-one — stepNumber-1 stored instead of stepNumber | Medium | client/src/services/onboardingService.js:44,46 | frontend-coder |
| A1-08 | DELETE /sample-packs deletes ALL users' sample products — missing userId filter | High | server/src/controllers/samplePack.controller.js:208 | backend-coder |
| A1-09 | User model default role is 'manager' but service sets 'staff' — misaligned defaults | Low | server/src/models/User.model.js:8 | backend-coder |
| A1-10 | SettingsPage AI Config section non-functional (cascades from A1-01 + A1-03) | High | client/src/pages/SettingsPage.jsx (AiConfigSection) | blocked by A1-01, A1-03 |
| A1-11 | WorkspaceSection save() shows success toast despite GSTIN/UPI silently dropped | High | client/src/pages/SettingsPage.jsx (WorkspaceSection) | frontend-coder |
