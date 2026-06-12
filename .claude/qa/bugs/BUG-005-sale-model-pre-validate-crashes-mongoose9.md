# Bug #005: Sale.model.js pre('validate') Hooks Crash on Mongoose 9 — Sale.create() Unusable

**Found:** 2026-04-29
**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

## Symptom

Any attempt to save a new-schema Sale document (via `Sale.create()`, `sale.save()`,
or any controller that validates the Sale model) throws:

```
TypeError: next is not a function
```

This means the `POST /api/v1/sales` endpoint (new controller path) is completely
broken: no new-schema sale can ever be persisted.

## Steps to Reproduce

```js
const mongoose = require('mongoose');
const Sale = require('./src/models/Sale.model');
const { Decimal128 } = mongoose.Types;

const doc = new Sale({
  invoiceNumber: 'TEST-001',
  type: 'sale',
  items: [{
    productId: new mongoose.Types.ObjectId(),
    productName: 'Test',
    sku: 'T001',
    unit: 'kg',
    qty: Decimal128.fromString('4'),
    pricePerUnit: Decimal128.fromString('125'),
    lineSubtotal: Decimal128.fromString('500'),
    lineTax: Decimal128.fromString('25'),
    lineTotal: Decimal128.fromString('525'),
    gstRate: 5,
    cgst: Decimal128.fromString('12.5'),
    sgst: Decimal128.fromString('12.5'),
    igst: Decimal128.fromString('0'),
    amountFirst: false,
  }],
  subtotal: Decimal128.fromString('500'),
  taxTotal: Decimal128.fromString('25'),
  roundOff: Decimal128.fromString('0'),
  grandTotal: Decimal128.fromString('525'),
  paymentMode: 'cash',
});

await doc.validate();
// THROWS: TypeError: next is not a function
```

Confirmed repro:
```
cd server && node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/MERNDB', {serverSelectionTimeoutMS:3000}).then(async () => {
  const Sale = require('./src/models/Sale.model');
  const { Decimal128 } = mongoose.Types;
  const doc = new Sale({ invoiceNumber: 'QA-TEST-001', type: 'sale', items: [{
    productId: new mongoose.Types.ObjectId(), productName: 'P', sku: 'S', unit: 'kg',
    qty: Decimal128.fromString('1'), pricePerUnit: Decimal128.fromString('100'),
    lineSubtotal: Decimal128.fromString('100'), lineTax: Decimal128.fromString('5'),
    lineTotal: Decimal128.fromString('105'), gstRate: 5,
    cgst: Decimal128.fromString('2.5'), sgst: Decimal128.fromString('2.5'),
    igst: Decimal128.fromString('0'), amountFirst: false,
  }], subtotal: Decimal128.fromString('100'), taxTotal: Decimal128.fromString('5'),
     roundOff: Decimal128.fromString('0'), grandTotal: Decimal128.fromString('105'), paymentMode: 'cash' });
  await doc.validate();
  console.log('OK');
});"
```

## Expected

`Sale.create()` succeeds for valid sale documents. Pre-validate hooks run and
pass for correct data.

## Actual

Both `saleItemSchema.pre('validate', function(next) {...})` (line 70) and
`saleSchema.pre('validate', function(next) {...})` (line 238) crash with
`TypeError: next is not a function` because Mongoose 9.x changed how callback-form
pre-validate hooks work — `next` is `undefined` when using `function(next)` style.

Stack trace:
```
Error: next is not a function
    at model.<anonymous> (Sale.model.js:252:3)
    at Kareem.execPre (node_modules/kareem/index.js:68:39)
    at model._execDocumentPreHooks (node_modules/mongoose/lib/document.js:3198:29)
```

## Evidence

```
cd server && node -e "
const mongoose = require('mongoose');
const { Schema } = mongoose;
const s = new Schema({ name: String });
s.pre('validate', function(next) { console.log('next type:', typeof next); next(); });
mongoose.model('TestPV', s, 'test_pv');
mongoose.connect('mongodb://127.0.0.1:27017/MERNDB').then(async () => {
  const M = mongoose.model('TestPV');
  await new M({name:'x'}).validate();
});
"
```
Output: `next type: undefined` → `TypeError: next is not a function`

Mongoose 9 with async hooks:
```
s.pre('validate', async function() { /* works */ });
```
Output: `async pre-validate works` — no crash.

## Root Cause Hypothesis

Mongoose 9.x removed the callback parameter from synchronous pre-hooks. The
`pre('validate', function(next))` pattern was valid in Mongoose 7/8 but is broken
in Mongoose 9 (running version: 9.3.1). The hooks must be rewritten to use
`async function()` (or `function()` returning a Promise) without the `next`
callback.

Note: This crash may have been pre-existing before the BUG-003 fix (the pre-validate
hooks were not part of BUG-003's toJSON change). But it is currently blocking all new
Sale creation.

## Suggested Fix

In `server/src/models/Sale.model.js`, rewrite both hooks to use async/await:

```js
// Line 70 — saleItemSchema hook
saleItemSchema.pre('validate', async function () {
  if (this.pricePerUnit != null) {
    try {
      const ppu = Number(this.pricePerUnit.toString());
      if (ppu <= 0) throw new Error('pricePerUnit must be > 0 on each sale line');
    } catch (e) { throw e; }
  }
  if (this.qty != null && this.tareApplied != null) {
    try {
      const q = Number(this.qty.toString());
      const t = Number(this.tareApplied.toString());
      if (t > Math.abs(q)) throw new Error('tareApplied must not exceed qty');
    } catch (e) { throw e; }
  }
});

// Line 238 — saleSchema hook
saleSchema.pre('validate', async function () {
  const isReturn = this.type === 'return';
  for (const item of this.items || []) {
    if (item.qty != null) {
      try {
        const q = Number(item.qty.toString());
        if (q < 0 && !isReturn) {
          throw new Error(`Negative qty is only allowed on return sales (line: ${item.productName})`);
        }
      } catch (e) { if (e.message.includes('Negative qty')) throw e; }
    }
  }
});
```

## Severity Justification

Critical because:
1. `POST /api/v1/sales` (new controller path) is completely broken — no new-schema sale can be created after server restart.
2. All BUG-001 and BUG-003 fixes are unreachable at runtime because they require a successfully-created Sale document.
3. This will show as a 500 error on every sale creation attempt.

## Impact Scope

- `POST /api/v1/sales` — all new-schema sale creation
- `POST /api/v1/sales/:id/refund` — refund creation
- Any direct `Sale.create()` or `sale.save()` call

## Verification

- [ ] Fix shipped
- [ ] `await new Sale({...valid data...}).validate()` completes without error
- [ ] `POST /api/v1/sales` with valid kg line creates sale and returns `grandTotal` as Decimal128 string
- [ ] Pre-validate rejects pricePerUnit <= 0 with correct error
- [ ] Pre-validate rejects negative qty on non-return sale with correct error
