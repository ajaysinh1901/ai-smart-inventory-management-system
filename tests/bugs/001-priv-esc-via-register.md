# Bug #001: Anyone can self-register as admin (Privilege Escalation)

**Found:** 2026-04-28
**Severity:** Critical
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
The public, unauthenticated `POST /api/v1/auth/register` endpoint accepts a `role` field from the request body and persists it as-is. An external attacker can POST `{"role":"admin"}` and immediately receive a valid admin JWT cookie. No prior auth, no admin approval. Full takeover.

## Steps to Reproduce
1. Restart server to clear any existing test users (or use a fresh email).
2. From an unauthenticated terminal:
   ```
   curl -X POST http://localhost:5000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Sneaky","email":"sneaky-1@evil.com","password":"password123","role":"admin"}'
   ```
3. Observe response: `success:true`, `user.role:"admin"`, valid JWT issued.
4. Use the returned token: `curl -H "Authorization: Bearer <token>" http://localhost:5000/api/v1/users` → 200 with the full user list (admin-only endpoint).

## Expected
- The `role` field MUST be ignored / stripped on public registration.
- Public self-register should always create the lowest-privileged role (e.g. `staff` or pending invitation), or registration should require an existing admin's auth.

## Actual
The role is taken straight from `req.body` and saved. Any visitor on the public internet can mint themselves an admin account.

## Evidence
- Reproduced twice (sneaky-1777351823@evil.com and proof2-1777351833@evil.com).
- Both got `"role":"admin"` in the login response and were able to call admin-only endpoints.
- Source: `server/src/validators/auth.validator.js` lines 7,13 — `role` is part of `registerSchema`.
- Source: `server/src/services/auth.service.js` lines 4–13 — `role` is destructured from `userData` and passed to `User.create({ name, email, password, role })`.

## Root Cause Hypothesis
`registerSchema` exposes `role` as a writable field, and `registerUser` blindly forwards it to the model. There is no allow-list check or role-based gating around who can specify `role`.

## Suggested Fix
- Remove `role` from `registerSchema` (or `.omit({ role: true })`).
- In `auth.service.registerUser`, force `role: 'staff'` (or whatever the lowest role should be) regardless of input.
- Add an admin-only `POST /api/v1/users` (or `PUT /:id/role`, which already exists) for assigning roles.
- Add an integration test that `register({role:'admin'})` returns a non-admin role.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked
- [ ] Existing rogue admins (e.g. `sneaky-1777351823@evil.com`, `proof2-1777351833@evil.com`, `staff@test.com` post-Bug #002) cleaned up from DB — orchestrator cleanup task

## Re-test note (post-fix)
- `POST /auth/register {role:"admin"}` → 400 `{"errors":[{"field":"(root)","message":"Unrecognized key: \"role\""}]}` — even better than expected; schema rejects role outright instead of silently stripping. Acceptable.
- `POST /auth/register` without role → 200, `user.role:"staff"` (default).
- Related Bug #002 also VERIFIED separately.
