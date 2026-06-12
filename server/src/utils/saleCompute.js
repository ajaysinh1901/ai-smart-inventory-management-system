'use strict';

/**
 * saleCompute.js — pure, DB-free computation for sale line items.
 *
 * This module is the single source of truth for all sale math: scale-mode
 * qty computation, tare subtraction, line subtotal/tax/total, GST split, and
 * invoice-level round-off. Both the create and preview endpoints call this;
 * no Mongoose models are imported here.
 *
 * spec: setup-flow-and-units.md §B.3, §B.4, §B.8; chunk #3 deliverable C.
 */

const money  = require('./money');
const weight = require('./weight');

/**
 * Compute a single sale line given a raw line input and its resolved product.
 *
 * @param {object} line          Raw request line (from POST body).
 * @param {object} product       Mongoose product document (or plain object after toObject()).
 * @param {boolean} intraState   True = CGST+SGST; false = IGST.
 * @param {string} saleType      'sale' | 'return'. Negative qty allowed only for 'return'.
 * @returns {object}             Computed line item ready for Sale.items.
 * @throws {Error}               On invalid inputs (zero rate for amount-first, bad tare, etc.)
 *
 * spec: chunk #3 deliverable C
 */
function computeLine(line, product, intraState, saleType = 'sale') {
  // ── 1. Resolve qty ──────────────────────────────────────────────────────
  let qtyD;

  if (line.amountFirst) {
    // "₹500 ka rice" — back-compute qty from entered amount
    if (!line.enteredAmount) {
      throw Object.assign(
        new Error('enteredAmount is required when amountFirst is true'),
        { statusCode: 400 }
      );
    }
    const enteredD = money.fromNumberOrString(line.enteredAmount);
    const rateD    = money.fromNumberOrString(product.pricePerUnit);
    if (money.isZero(rateD)) {
      throw Object.assign(
        new Error(`Cannot compute qty: pricePerUnit is 0 for product "${product.name}"`),
        { statusCode: 400 }
      );
    }
    qtyD = weight.amountToQty(enteredD, rateD, product.unit);
  } else {
    if (line.qty == null) {
      throw Object.assign(
        new Error('qty is required when amountFirst is false'),
        { statusCode: 400 }
      );
    }
    qtyD = weight.fromNumberOrString(line.qty);
  }

  // ── 2. Validate qty sign and zero for non-return sales ──────────────────
  if (saleType !== 'return' && money.isNegative(qtyD)) {
    throw Object.assign(
      new Error(`Negative qty is only allowed on return sales (product: ${product.name})`),
      { statusCode: 400 }
    );
  }
  // Bug A3-05: reject zero-quantity lines on forward sales
  if (saleType !== 'return' && money.isZero(qtyD)) {
    throw Object.assign(
      new Error(`qty must be greater than 0 (product: ${product.name})`),
      { statusCode: 400 }
    );
  }

  // ── 3. Validate integer qty for non-saleByWeight units (spec §B.8) ───────
  if (!product.saleByWeight) {
    if (!weight.isWhole(qtyD)) {
      throw Object.assign(
        new Error(
          `Fractional quantity is not allowed for unit "${product.unit}" (product: ${product.name})`
        ),
        { statusCode: 400 }
      );
    }
  }

  // ── 4. Apply tare ────────────────────────────────────────────────────────
  const rawTare = line.tareApplied != null ? line.tareApplied : '0';
  const tareD   = weight.fromNumberOrString(rawTare);

  // tareApplied must not exceed abs(qty)
  const absQty = money.isNegative(qtyD)
    ? weight.fromNumberOrString(String(Math.abs(Number(qtyD.toString()))))
    : qtyD;

  if (Number(tareD.toString()) > Number(absQty.toString())) {
    throw Object.assign(
      new Error(`tareApplied (${tareD}) must not exceed qty (${qtyD}) for "${product.name}"`),
      { statusCode: 400 }
    );
  }

  // Net qty: for return lines sign is preserved after tare subtraction
  let netQtyD;
  if (money.isNegative(qtyD)) {
    // Return: subtract tare from the absolute value then re-negate
    const posNet = weight.subtractTareSafe(absQty, tareD);
    // Re-apply the negative sign
    netQtyD = money.fromNumberOrString(
      '-' + posNet.toString()
    );
  } else {
    netQtyD = weight.subtractTareSafe(qtyD, tareD);
  }

  // ── 5. Line subtotal ─────────────────────────────────────────────────────
  // Bug A3-06: guard against null/undefined pricePerUnit before calling money
  // helpers — the internal "money: unsupported type" error is not user-friendly.
  if (product.pricePerUnit == null) {
    throw Object.assign(
      new Error(`Product "${product.name}" has no price configured. Please set a price before selling.`),
      { statusCode: 400 }
    );
  }
  const rateD        = money.fromNumberOrString(product.pricePerUnit);
  const lineSubtotal = money.roundPaise(money.multiply(netQtyD, rateD));

  // ── 6. Line tax ──────────────────────────────────────────────────────────
  const gstRate = typeof product.gstRate === 'number' ? product.gstRate : 0;
  const taxRate = money.fromNumberOrString(String(gstRate / 100));
  const lineTax = money.roundPaise(money.multiply(lineSubtotal, taxRate));

  // ── 7. Line total ────────────────────────────────────────────────────────
  const lineTotal = money.add(lineSubtotal, lineTax);

  // ── 8. GST split ─────────────────────────────────────────────────────────
  const mode  = intraState ? 'cgst-sgst' : 'igst';
  const split = money.splitTax(lineTax, mode);

  return {
    productId:   product._id,
    productName: product.name,
    sku:         product.sku || '',
    hsnCode:     product.hsnCode || '',
    unit:        product.unit,

    qty:          qtyD,
    tareApplied:  tareD,
    pricePerUnit: rateD,

    lineSubtotal,
    lineTax,
    lineTotal,
    gstRate,

    cgst: split.cgst,
    sgst: split.sgst,
    igst: split.igst,

    amountFirst:   line.amountFirst || false,
    enteredAmount: line.amountFirst ? money.fromNumberOrString(line.enteredAmount) : null,

    // For stock operations (not stored on the sale item, returned for controller use)
    _netQty:       netQtyD,
    _saleByWeight: product.saleByWeight,
  };
}

/**
 * Compute the full sale from raw lines and pre-fetched products.
 * Pure function — no DB calls.
 *
 * @param {object} opts
 * @param {Array}   opts.lines           Raw request lines.
 * @param {Map}     opts.products        Map<productId string, product doc>.
 * @param {string}  opts.workspaceState  Workspace state name (e.g. "Gujarat").
 * @param {string}  [opts.customerState] Customer state name; null for walk-in.
 * @param {string}  [opts.saleType]      'sale' | 'return'. Default 'sale'.
 * @param {number}  [opts.discount]      Flat rupee discount subtracted from subtotal before GST.
 * @returns {{ lines: Array, subtotal: D128, taxTotal: D128, roundOff: D128, grandTotal: D128, intraState: boolean, discount: number }}
 *
 * spec: chunk #3 deliverable C
 */
function computeSale({ lines, products, workspaceState, customerState, saleType = 'sale', discount = 0 }) {
  if (!lines || lines.length === 0) {
    throw Object.assign(new Error('Sale must have at least one line'), { statusCode: 400 });
  }

  // Validate discount: must be >= 0
  const discountNum = Number(discount) || 0;
  if (discountNum < 0) {
    throw Object.assign(new Error('discount must be >= 0'), { statusCode: 400 });
  }

  // Determine intraState: if customer state matches workspace state → intra
  // Walk-in customers (no state) → intra by default.
  // NEW-02 fix: when the workspace state is not yet configured we cannot
  // classify interstate sales — default to intra (CGST/SGST) rather than
  // wrongly charging IGST on every invoice.
  const wsState = (workspaceState || '').trim().toLowerCase();
  const custState = (customerState || '').trim().toLowerCase();
  const intraState = !custState || !wsState
    ? true
    : custState === wsState;

  const computedLines = lines.map((line) => {
    const productId = line.productId;
    const product = products.get(String(productId));
    if (!product) {
      throw Object.assign(
        new Error(`Product not found: ${productId}`),
        { statusCode: 404 }
      );
    }
    return computeLine(line, product, intraState, saleType);
  });

  // Invoice-level aggregates
  // Bug A3-04: subtract flat discount from subtotal before computing tax
  const rawSubtotal = money.sumLines(computedLines, 'lineSubtotal');
  const subtotal = discountNum > 0
    ? money.roundPaise(money.subtract(rawSubtotal, money.fromNumberOrString(discountNum)))
    : rawSubtotal;

  const taxTotal  = money.sumLines(computedLines, 'lineTax');
  const preRound  = money.add(subtotal, taxTotal);
  const { finalTotal: grandTotal, roundOff } = money.addRoundOff(preRound);

  return {
    lines: computedLines,
    subtotal,
    taxTotal,
    roundOff,
    grandTotal,
    intraState,
    discount: discountNum,
  };
}

module.exports = { computeLine, computeSale };
