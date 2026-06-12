// Transactional ledger posting. Every KhataEntry write goes through here so
// that Customer.outstandingBalance and the entry's runningBalance stay
// consistent under concurrent writes.
//
// Concurrency contract (spec §5):
//   1. Atomic $inc on Customer.outstandingBalance returns the post-update value.
//   2. The entry is inserted with that value as runningBalance.
//   3. Both ops sit inside session.withTransaction when a replica set is
//      available; otherwise we fall back to a best-effort compensating $inc
//      if the entry insert fails.
const mongoose = require('mongoose');
const Customer    = require('../models/Customer.model');
const KhataEntry  = require('../models/KhataEntry.model');
const Counter     = require('../models/Counter.model');

const supportsTransactions = () => {
  const conn = mongoose.connection;
  // Only replica sets / mongos give us multi-doc transactions. Single-node
  // dev deployments fall back to the compensating-$inc path.
  // Bug C3: topology.s.description.type is undefined on standalone Mongo, so
  // `undefined !== 'Single'` was true — falsely indicating transaction support.
  // Now we explicitly whitelist the types that DO support transactions instead.
  const topo = conn?.db?.topology;
  const topoType = topo?.description?.type || topo?.s?.description?.type;
  return topoType === 'ReplicaSetWithPrimary'
    || topoType === 'ReplicaSetNoPrimary'
    || topoType === 'Sharded';
};

async function allocateReceiptNumber(session) {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `receipt-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );
  return `RCPT-${year}-${String(counter.seq).padStart(5, '0')}`;
}

// Core poster — writes one entry, updates the Customer cache, returns both.
//
// signedAmount is computed from direction; we never trust caller-supplied
// signs to avoid the `+1000 marked as credit` class of bug.
async function postEntry({
  userId, customerId, voucherType, direction, amount, entryDate,
  mode = '', reference = {}, chequeNumber = '', chequeBank = '', upiTxnId = '',
  notes = '', createdBy, allocateReceipt = false, reversalOf = null,
}) {
  if (!['debit', 'credit'].includes(direction)) {
    throw new Error('direction must be debit or credit');
  }
  if (!(amount > 0)) {
    throw new Error('amount must be > 0');
  }

  const signed = direction === 'debit' ? +amount : -amount;
  const useTx  = supportsTransactions();

  const exec = async (session) => {
    // 1. Atomic update of the Customer cache. The returned doc has the new
    //    outstandingBalance; we use it as the entry's runningBalance.
    const updated = await Customer.findOneAndUpdate(
      { _id: customerId, userId },
      { $inc: { outstandingBalance: signed }, $set: { lastTransactionAt: new Date() } },
      { new: true, session: session || undefined }
    );
    if (!updated) {
      throw new Error('Customer not found for ledger posting');
    }
    if (!updated.isActive) {
      // Allow posting against inactive customers (still settling old debt) but
      // resurrect them so future autocomplete works (E6).
      updated.isActive = true;
      await updated.save({ session: session || undefined });
    }

    let receiptNumber;
    if (allocateReceipt) {
      receiptNumber = await allocateReceiptNumber(session);
    }

    let entryDoc;
    try {
      const created = await KhataEntry.create([{
        userId,
        customerId,
        voucherType,
        direction,
        amount,
        runningBalance: updated.outstandingBalance,
        entryDate: entryDate || new Date(),
        mode,
        reference,
        chequeNumber,
        chequeBank,
        upiTxnId,
        receiptNumber,
        notes,
        createdBy,
        reversalOf,
      }], { session: session || undefined });
      entryDoc = created[0];
    } catch (err) {
      if (!useTx) {
        // Compensating revert — the $inc above succeeded but the entry
        // didn't materialise, so the cache is now ahead of the ledger.
        await Customer.updateOne({ _id: customerId, userId }, { $inc: { outstandingBalance: -signed } });
      }
      throw err;
    }

    if (reversalOf) {
      await KhataEntry.updateOne(
        { _id: reversalOf, userId, isReversed: false },
        { $set: { isReversed: true } },
        { session: session || undefined }
      );
    }

    return { entry: entryDoc, customer: updated };
  };

  if (useTx) {
    const session = await mongoose.startSession();
    try {
      let out;
      await session.withTransaction(async () => { out = await exec(session); });
      return out;
    } finally {
      session.endSession();
    }
  }

  return exec(null);
}

// Public helpers — the controllers call these by name so the intent is clear
// at the call site (rather than a generic postEntry with magic strings).

exports.postSaleDebit = ({ userId, customerId, saleId, amount, entryDate, createdBy, notes }) =>
  postEntry({
    userId, customerId, voucherType: 'Sale', direction: 'debit',
    amount, entryDate, reference: { saleId }, notes: notes || 'Sale on credit', createdBy,
  });

exports.postPayment = ({ userId, customerId, amount, mode, entryDate, chequeNumber, chequeBank, upiTxnId, notes, createdBy }) =>
  postEntry({
    userId, customerId, voucherType: 'Payment', direction: 'credit',
    amount, entryDate, mode, chequeNumber, chequeBank, upiTxnId,
    notes: notes || `Payment received via ${mode}`,
    createdBy, allocateReceipt: true,
  });

exports.postRefund = ({ userId, customerId, saleId, amount, entryDate, createdBy, notes }) =>
  postEntry({
    userId, customerId, voucherType: 'Refund', direction: 'credit',
    amount, entryDate, reference: { saleId }, notes: notes || 'Sale refund',
    createdBy, allocateReceipt: true,
  });

exports.postAdjustment = ({ userId, customerId, direction, amount, reason, entryDate, createdBy }) =>
  postEntry({
    userId, customerId, voucherType: 'Adjustment', direction,
    amount, entryDate, reference: { adjustmentReason: reason },
    notes: reason, createdBy,
  });

exports.postOpeningBalance = ({ userId, customerId, amount, createdBy }) =>
  postEntry({
    userId, customerId, voucherType: 'OpeningBalance',
    direction: amount >= 0 ? 'debit' : 'credit',
    amount: Math.abs(amount), entryDate: new Date(),
    notes: 'Opening balance', createdBy,
  });

// Reverse an existing entry (e.g. bounced cheque). Posts a sibling with
// opposite direction and equal amount, sets isReversed on the original.
exports.postReversal = async ({ userId, entryId, reason, createdBy }) => {
  const original = await KhataEntry.findOne({ _id: entryId, userId });
  if (!original) throw new Error('Entry not found');
  if (original.isReversed) throw new Error('Entry already reversed');

  const opposite = original.direction === 'debit' ? 'credit' : 'debit';
  return postEntry({
    userId,
    customerId: original.customerId,
    voucherType: original.voucherType,
    direction: opposite,
    amount: original.amount,
    entryDate: new Date(),
    reference: original.reference,
    notes: `Reversal: ${reason}`,
    createdBy,
    reversalOf: original._id,
  });
};

// Admin recompute — scans all entries for a customer, sums signed amounts,
// writes the corrected outstandingBalance back. Used by the
// /customers/:id/recompute-balance endpoint when drift is suspected.
exports.recomputeBalance = async ({ userId, customerId }) => {
  const customer = await Customer.findOne({ _id: customerId, userId });
  if (!customer) throw new Error('Customer not found');

  const agg = await KhataEntry.aggregate([
    { $match: {
        userId: new mongoose.Types.ObjectId(userId),
        customerId: new mongoose.Types.ObjectId(customerId),
        isReversed: { $ne: true },
    } },
    { $group: {
        _id: null,
        net: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', { $multiply: ['$amount', -1] }] } },
    } },
  ]);

  const recomputed = agg[0]?.net || 0;
  const previous = customer.outstandingBalance;
  customer.outstandingBalance = recomputed;
  await customer.save();
  return { previous, recomputed };
};

exports.allocateReceiptNumber = allocateReceiptNumber;
exports.postEntry = postEntry;
