export function sendSuccess(res, statusCode = 200, payload = null) {
  const body = payload === null ? {} : payload;
  return res.status(statusCode).json(body);
}

export function sendError(res, statusCode, message, fields = {}) {
  return res.status(statusCode).json({
    error: {
      message,
      fields
    }
  });
}
