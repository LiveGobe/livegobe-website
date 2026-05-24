/**
 * Error handling utilities for Wiki API
 * Converts axios errors to standardized API errors
 */

const { getLogger } = require('../logging/logger');

let logger;

class ApiError extends Error {
  constructor(message, type, statusCode, originalError) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Error types
 */
const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Handle API error and convert to standardized format
 * @param {Error} error - Original error
 * @returns {ApiError} Standardized error
 */
function handleApiError(error) {
  logger = logger || require('../logging/logger').getLogger();

  if (error instanceof ApiError) {
    return error;
  }

  // Network error (no response)
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      logger.error({ error: error.message }, 'Request timeout');
      return new ApiError(
        'Request timeout',
        ERROR_TYPES.TIMEOUT,
        null,
        error
      );
    }

    logger.error({ error: error.message }, 'Network error');
    return new ApiError(
      error.message || 'Network error',
      ERROR_TYPES.NETWORK_ERROR,
      null,
      error
    );
  }

  const { status } = error.response;
  const message = error.response.data?.message || error.message;

  switch (status) {
    case 400:
      logger.warn({ status }, 'Bad request');
      return new ApiError(message, ERROR_TYPES.INVALID_RESPONSE, status, error);

    case 401:
      logger.warn({ status }, 'Unauthorized - authentication required');
      return new ApiError(message, ERROR_TYPES.UNAUTHORIZED, status, error);

    case 403:
      logger.warn({ status }, 'Forbidden');
      return new ApiError(message, ERROR_TYPES.FORBIDDEN, status, error);

    case 404:
      logger.debug({ status }, 'Resource not found');
      return new ApiError(message, ERROR_TYPES.NOT_FOUND, status, error);

    case 429:
      logger.warn({ status }, 'Rate limited');
      return new ApiError(message, ERROR_TYPES.RATE_LIMITED, status, error);

    case 500:
    case 502:
    case 503:
    case 504:
      logger.error({ status }, 'Server error');
      return new ApiError(message, ERROR_TYPES.SERVER_ERROR, status, error);

    default:
      logger.error({ status }, 'Unknown error');
      return new ApiError(message, ERROR_TYPES.UNKNOWN, status, error);
  }
}

/**
 * Check if error is retryable
 * @param {ApiError} error - API error
 * @returns {boolean} Whether error should be retried
 */
function isRetryableError(error) {
  const retryableTypes = [
    ERROR_TYPES.NETWORK_ERROR,
    ERROR_TYPES.TIMEOUT,
    ERROR_TYPES.RATE_LIMITED,
    ERROR_TYPES.SERVER_ERROR
  ];

  return retryableTypes.includes(error.type);
}

/**
 * Get retry delay for error
 * @param {ApiError} error - API error
 * @param {number} attempt - Attempt number (0-based)
 * @param {number} baseDelay - Base delay in ms
 * @returns {number} Delay in ms
 */
function getRetryDelay(error, attempt, baseDelay = 1000) {
  // Rate limit errors have priority - use Retry-After if available
  if (error.type === ERROR_TYPES.RATE_LIMITED) {
    const retryAfter = error.originalError?.response?.headers?.['retry-after'];
    if (retryAfter) {
      const delayMs = parseInt(retryAfter) * 1000;
      return !isNaN(delayMs) ? delayMs : baseDelay * Math.pow(2, attempt);
    }
  }

  // Exponential backoff for other retryable errors
  return baseDelay * Math.pow(2, attempt);
}

module.exports = {
  ApiError,
  ERROR_TYPES,
  handleApiError,
  isRetryableError,
  getRetryDelay
};
