# Smoke Tests

Owned by the `qa-tester` agent. Each file is a runnable Node script that hits the SmartStock AI API and verifies response shape + key values.

## Running

Server must be running on `http://localhost:5000` (the default).

```bash
# Start server (in another shell)
cd server && node src/server.js

# Run a single smoke test
node tests/smoke/auth.test.js

# Run all smoke tests
for f in tests/smoke/*.test.js; do node "$f"; done
```

## Setup (one-time)

```bash
npm init -y
npm install --save-dev axios
```

(Or install `axios` globally — the smoke tests are not part of the app bundle.)

## Test Files (planned)

- `auth.test.js` — login, register, /auth/me, password change
- `product.test.js` — CRUD, low-stock filter, stock adjustment
- `supplier.test.js` — CRUD, GST field, supplier products
- `transaction.test.js` — IN/OUT logging, stock side-effects
- `sale-gst.test.js` — invoice creation, CGST/SGST split, IGST for interstate, HSN propagation
- `ai.test.js` — insights, predictions, dead-stock, chat (skip if no Gemini key)
- `analytics.test.js` — dashboard, sales report, inventory report, profit
- `settings.test.js` — get/update workspace, AI config, notifications, password
- `ocr.test.js` — upload, extract, save (skip if no test image)

## Conventions

- Each test prints `✅ PASS` / `❌ FAIL` / `⚠️ SKIP` per assertion
- Sets `process.exitCode = 1` on any failure
- Uses seeded admin credentials: `admin@smartstock.test` / `admin123`
- Never modifies app code — only reports
