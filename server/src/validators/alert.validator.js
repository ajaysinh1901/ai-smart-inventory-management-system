// Alert request schemas. | spec: C2
const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');

// Dismiss endpoint takes no body but we still validate to reject extras
exports.dismissAlertSchema = z.object({}).strict().or(z.object({}).partial());

exports.alertIdParamSchema = z.object({ id: objectId });
