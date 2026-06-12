# Bug #010: Frontend Sidebar shows admin-only nav items to staff users (UX failure, not just a 403)

**Found:** 2026-04-28
**Severity:** Medium
**Status:** VERIFIED
**Assigned:** frontend-coder

## Symptom
The Sidebar's NAV_ITEMS list is hardcoded and rendered to every authenticated user regardless of role. A staff user sees and can click "Suppliers" (admin/manager only), "Settings" (server allows any auth, but role-gated cards inside fail), and "Users" management (admin only via API). Clicking these results in 403 errors instead of the items being hidden.

The agent spec (Flow D) explicitly calls this out: "Login as `staff` → can you see admin-only buttons? Should be hidden, not just rejected on click."

## Steps to Reproduce
1. Create a staff user (or use existing `staff@test.com` after Bug #002 cleanup).
2. Login on the frontend at http://localhost:5173.
3. Observe the left Sidebar: all 9 nav items visible.
4. Click "Suppliers" → page tries to fetch `/api/v1/suppliers` → 403 → error banner.

## Expected
- "Suppliers" not rendered for staff (route requires admin/manager).
- Any other admin-only sub-page tile (e.g. user role management in Settings) hidden, not just disabled.

## Actual
- `client/src/components/Sidebar.jsx` line 9–19 statically lists all nav items, no role check against `AuthContext`.

## Evidence
- Source review only (no headless browser available).
- API behavior confirmed: `GET /suppliers` as staff → 403 "User role 'staff' is not authorized".

## Root Cause Hypothesis
`AuthContext` exposes `user.role`, but `Sidebar` doesn't filter NAV_ITEMS by role.

## Suggested Fix
1. Add `roles: ['admin','manager']` to each `NAV_ITEMS` entry that requires elevation.
2. In Sidebar render, `useContext(AuthContext)`, filter `NAV_ITEMS.filter(it => !it.roles || it.roles.includes(user.role))`.
3. Same treatment for any admin-only buttons inside Dashboard / Settings (e.g. Trigger Alerts Run).

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- `client/src/components/Sidebar.jsx` lines 16-26: `NAV_ITEMS` now declares `roles: ['admin','manager']` on the Suppliers entry. Lines 52-54 filter `visibleNavItems` against `user?.role`. Staff will simply not see the Suppliers entry rendered.
- `client/src/pages/SettingsPage.jsx` lines 17-25: User Management tab gated `roles: ['admin']`, lines 799-805 filter the sub-nav, line 814 also gates the section content (`user?.role === 'admin' ? <UsersSection /> : null`) — defence in depth even if a staff hand-edits state.
- API defence: as staff cookie, `GET /suppliers` → 403 `{"message":"User role 'staff' is not authorized to access this route"}` — server-side gating still enforced.
