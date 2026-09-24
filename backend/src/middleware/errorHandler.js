function errorHandler(err, req, res, next) {
  console.error('[Silent Ledger Server Error]:', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected server error occurred.',
    timestamp: new Date().toISOString()
  });
}

module.exports = errorHandler;
