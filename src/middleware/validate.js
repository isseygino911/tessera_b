// Replaces req[source] with the parsed data, or responds 400 with `message`
// (or the first zod issue's message when none is given).
const validate = (schema, message, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    return res.status(400).json({ error: message ?? parsed.error.issues[0].message });
  }
  req[source] = parsed.data;
  next();
};

export { validate };
