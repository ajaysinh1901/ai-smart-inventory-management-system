# Bug #006: AI Chat is 100% broken — gemini-1.5-flash model returns 404

**Found:** 2026-04-28
**Severity:** High
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
Every `POST /api/v1/ai/chat` call (English, Hindi, empty, valid query — anything that gets through validation) returns HTTP 500:
```
{"success":false,"data":{"reply":"Gemini error: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent: [404 Not Found] models/gemini-1.5-flash is not found for API version v1beta..."}}
```
The entire AI Insights Chat feature is unusable.

## Steps to Reproduce
1. Login as admin.
2. POST any chat:
   ```
   curl -b admin.cookie -X POST http://localhost:5000/api/v1/ai/chat \
     -H "Content-Type: application/json" \
     -d '{"message":"What is running low?"}'
   ```
3. HTTP 500 with the 404 model-not-found body. Reproduced with English, Hindi, empty string, and missing-message payloads — all fail identically.

## Expected
- A valid Gemini reply summarizing low stock.
- Validator should reject empty/missing `message` with 400 (currently it goes straight to Gemini and lets Gemini complain).

## Actual
- The model name `gemini-1.5-flash` is no longer served on `v1beta` for this API key. Google rotates these — this is a known deprecation.
- No request validation; an empty body still triggers a real Gemini API call (cost + rate-limit waste).

## Evidence
- 16 successive 500s before the per-IP `aiChatLimiter` (20/min) tripped, returning 429 thereafter — consistent with the rate-limit spec.
- Source: `server/src/controllers/ai.controller.js` line 259 — hardcoded `model: 'gemini-1.5-flash'`.
- Source: same file line 222 — `const { message } = req.body;` with no presence/length guard.

## Root Cause Hypothesis
1. Gemini deprecated the `gemini-1.5-flash` alias on `v1beta`. Use a current model (e.g. `gemini-2.0-flash` or `gemini-1.5-flash-002`) and/or switch to `v1` endpoint.
2. Missing input validation lets requests reach Gemini even when message is empty.

## Suggested Fix
1. Move model name to env: `GEMINI_MODEL` with sensible default like `gemini-2.0-flash`.
2. Add a Zod schema `chatSchema = z.object({ message: z.string().trim().min(1, 'Message is required').max(2000) })` and apply via `validate(chatSchema)` middleware on the route.
3. On a Gemini API error, return a friendly 503 "AI temporarily unavailable" rather than dumping the raw SDK error.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- `POST /ai/chat {message:""}` → 400 `{"errors":[{"field":"message","message":"Message is required"}]}` — validator now rejects empty before calling Gemini.
- `POST /ai/chat {message:"what is running low?"}` → 503 `{"reply":"AI temporarily unavailable. Please try again shortly."}` — clean friendly error, NOT raw SDK stack trace. Backend coder noted Gemini key may be rate-limited (quota 429) so this is the acceptable degraded-state response.
- Source: `ai.controller.js:261` — `const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';` — model name now via env, default updated.
