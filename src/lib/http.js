// An error with an HTTP status. Services throw it; errorHandler sends it as
// { error: message, ...extra }.
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Express 4 doesn't pass rejected promises to the error handler on its own.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export { HttpError, asyncHandler };
