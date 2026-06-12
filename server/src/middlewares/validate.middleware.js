// Generic Zod-based body validator. | spec: B2
// Usage: router.post('/', validate(schema), controller)
// On invalid input → 400 with field-level errors. On valid input → req.body is the parsed value.

exports.validate = (schema) => (req, res, next) => {
  if (!schema || typeof schema.safeParse !== 'function') {
    return next(new Error('validate(): schema must be a Zod schema'));
  }

  const result = schema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.body = result.data;
  return next();
};
