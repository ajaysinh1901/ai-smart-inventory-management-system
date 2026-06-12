// AI request schemas. | spec: B2, bug #006
const { z } = require('zod');

exports.chatSchema = z.object({
  message: z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(1, 'Message is required')
    .max(2000, 'Message must be 2000 characters or fewer'),
});
