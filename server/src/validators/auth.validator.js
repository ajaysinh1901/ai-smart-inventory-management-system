// Auth request schemas. | spec: B2
const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Invalid email');
const password = z.string().min(6, 'Password must be at least 6 characters');
// Length-capped, sanitized name — strips HTML tags. | bug #011 (#11.4, #11.5)
const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name must be 120 characters or fewer')
  .transform((v) => v.replace(/<[^>]*>/g, '').trim())
  .refine((v) => v.length >= 2, 'Name must be at least 2 characters');

// Public registration MUST NOT accept `role`. Privilege escalation fix. | bug #001
exports.registerSchema = z
  .object({
    name,
    email,
    password,
  })
  .strict();

exports.loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

// Self-update MUST NOT accept `role`. Privilege escalation fix. | bug #002
exports.updateProfileSchema = z
  .object({
    name: name.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined, {
    message: 'At least one field (name) is required',
  });

exports.changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
