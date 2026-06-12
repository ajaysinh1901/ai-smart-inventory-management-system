# Bug #002: Any authenticated user can promote self to admin via /auth/update

**Found:** 2026-04-28
**Severity:** Critical
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
A logged-in user (any role — staff, manager, etc.) can call `PUT /api/v1/auth/update` with body `{"role":"admin"}` and the server will set their role to `admin`. There is no role-change authorization. Combined with Bug #001 this lets even an existing low-privileged user go full admin.

## Steps to Reproduce
1. Log in as a non-admin (e.g. staff): create one via `register` then login, OR create one via the existing admin and log in.
   ```
   curl -c staff.cookie -X POST http://localhost:5000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"staff@test.com","password":"password123"}'
   ```
2. Confirm role is `staff`:
   ```
   curl -b staff.cookie http://localhost:5000/api/v1/auth/me
   ```
3. Self-promote:
   ```
   curl -b staff.cookie -X PUT http://localhost:5000/api/v1/auth/update \
     -H "Content-Type: application/json" -d '{"role":"admin"}'
   ```
4. Response: `"role":"admin"`. The same user's cookie now grants admin access.

## Expected
- A user MUST NOT be able to change their own role.
- `PUT /auth/update` should only allow profile fields (name, email, password) — never `role`.
- Role changes should be admin-only via `PUT /api/v1/users/:id/role`.

## Actual
`updateProfileSchema` includes `role`, and `auth.service.updateProfile` writes `{ name, role }` directly back to the user document.

## Evidence
- Live test, observed: staff@test.com became `role:"admin"` after one PUT.
- Source `server/src/validators/auth.validator.js` lines 21–28 — `updateProfileSchema` includes `role`.
- Source `server/src/services/auth.service.js` lines 39–47 — `allowedUpdates = { name, role }` is written via `findByIdAndUpdate`.

## Root Cause Hypothesis
The schema and service intentionally expose `role` as a self-updateable field. Likely an oversight: someone wanted admins to be able to change their role and forgot to gate it.

## Suggested Fix
- Remove `role` from `updateProfileSchema`.
- In `auth.service.updateProfile`, allow only `{ name }` (and email/password through dedicated endpoints).
- Keep role mutation strictly behind `users/:id/role` admin-only route.
- Add integration test: as staff, `PUT /auth/update {role:'admin'}` returns 200 but role is still staff (or 400 with "role not allowed").

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked
- [ ] DB cleanup: revert `staff@test.com` role to staff (was promoted during this test) — orchestrator cleanup task

## Re-test note (post-fix)
- As staff cookie, `PUT /auth/update {role:"admin"}` → 400 `{"errors":[{"field":"(root)","message":"Unrecognized key: \"role\""}]}`.
- `GET /auth/me` after the attempt → role still `staff`. Self-promotion vector closed.
