// Transaction request schemas. | spec: B2
const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');

exports.createTransactionSchema = z.object({
  productId: objectId,
  type: z.enum(['IN', 'OUT'], { errorMap: () => ({ message: 'Type must be IN or OUT' }) }),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be an integer')
    .gt(0, 'Quantity must be greater than 0'),
  notes: z.string().trim().optional(),
});
