'use strict';
// Zod schema for sample-pack seed endpoint | spec: setup-flow-and-units.md §C.3

const { z } = require('zod');

// Body schema for POST /api/v1/sample-packs/seed
exports.seedPackSchema = z
  .object({
    packId: z.enum(['kirana', 'pharmacy', 'general'], {
      required_error: 'packId is required',
      invalid_type_error: 'packId must be one of: kirana, pharmacy, general',
    }),
  })
  .strict(); // reject unknown keys — no extra fields accepted
