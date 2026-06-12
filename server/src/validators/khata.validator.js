// Khata (ledger) request schemas.
const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');
const isoDate  = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

exports.recordPaymentSchema = z.object({
  customerId:   objectId,
  amount:       z.number().positive('Amount must be greater than 0'),
  mode:         z.enum(['cash', 'upi', 'bank', 'cheque', 'card']),
  entryDate:    isoDate.optional(),
  chequeNumber: z.string().trim().max(30).optional(),
  chequeBank:   z.string().trim().max(80).optional(),
  upiTxnId:     z.string().trim().max(50).optional(),
  notes:        z.string().trim().max(1000).optional(),
}).refine(
  (v) => v.mode !== 'cheque' || (v.chequeNumber && v.chequeNumber.length > 0),
  { message: 'chequeNumber is required when mode = cheque', path: ['chequeNumber'] }
);

exports.adjustmentSchema = z.object({
  customerId: objectId,
  direction:  z.enum(['debit', 'credit']),
  amount:     z.number().positive('Amount must be greater than 0'),
  reason:     z.string().trim().min(3).max(200),
  entryDate:  isoDate.optional(),
});

exports.reverseSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

exports.statementQuerySchema = z.object({
  from:   isoDate,
  to:     isoDate,
  format: z.enum(['json', 'pdf']).optional(),
});
