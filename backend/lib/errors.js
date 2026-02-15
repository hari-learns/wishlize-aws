/**
 * Custom Error Classes for Wishlize Backend
 * 
 * Provides standardized error handling with:
 * - Safe error messages (no internal details leaked)
 * - HTTP status code mapping
 * - Error codes for client handling
 * - Structured logging compatibility
 */

/**
 * Base application error
 */
class AppError extends Error {
  constructor(message, code, statusCode, isOperational = true) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to safe response format (no internal details)
   */
  toResponse() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp
      }
    };
  }

  /**
   * Convert to log format (includes details for debugging)
   */
  toLog() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validation Error - Invalid input data
 * Status: 400 Bad Request
 */
class ValidationError extends AppError {
  constructor(message = 'Invalid input data', details = []) {
    super(message, 'VALIDATION_ERROR', 400, true);
    this.details = details;
  }

  toResponse() {
    const response = super.toResponse();
    response.error.details = this.details;
    return response;
  }
}

/**
 * Authentication Error - Invalid or missing credentials
 * Status: 401 Unauthorized
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
  }
}

/**
 * Authorization Error - Insufficient permissions
 * Status: 403 Forbidden
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
  }
}

/**
 * Quota Exceeded Error - Rate limit or quota exceeded
 * Status: 429 Too Many Requests
 */
class QuotaExceededError extends AppError {
  constructor(message = 'Quota exceeded', retryAfter = null) {
    super(message, 'QUOTA_EXCEEDED', 429, true);
    this.retryAfter = retryAfter;
  }

  toResponse() {
    const response = super.toResponse();
    if (this.retryAfter) {
      response.error.retryAfter = this.retryAfter;
    }
    return response;
  }
}

/**
 * Not Found Error - Resource not found
 * Status: 404 Not Found
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404, true);
  }
}

/**
 * Conflict Error - Resource conflict
 * Status: 409 Conflict
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 'CONFLICT', 409, true);
  }
}

/**
 * External Service Error - Third-party service failure
 * Status: 502 Bad Gateway
 */
class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = null) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, true);
    this.service = service;
  }

  toResponse() {
    const response = super.toResponse();
    if (this.service) {
      response.error.service = this.service;
    }
    return response;
  }
}

/**
 * Timeout Error - Operation timed out
 * Status: 504 Gateway Timeout
 */
class TimeoutError extends AppError {
  constructor(message = 'Operation timed out') {
    super(message, 'TIMEOUT_ERROR', 504, true);
  }
}

/**
 * Internal Server Error - Unexpected server error
 * Status: 500 Internal Server Error
 */
class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 'INTERNAL_ERROR', 500, false);
  }
}

/**
 * Photo Validation Error - Specific to photo validation failures
 * Status: 422 Unprocessable Entity
 */
class PhotoValidationError extends AppError {
  constructor(message = 'Photo validation failed', errors = []) {
    super(message, 'PHOTO_VALIDATION_ERROR', 422, true);
    this.validationErrors = errors;
  }

  toResponse() {
    const response = super.toResponse();
    response.error.validationErrors = this.validationErrors;
    return response;
  }
}

/**
 * Session Error - Session-related errors
 * Status: 400 Bad Request or 404 Not Found
 */
class SessionError extends AppError {
  constructor(message = 'Session error', code = 'SESSION_ERROR') {
    super(message, code, 400, true);
  }
}

/**
 * Error code mapping for quick reference
 */
const ERROR_CODES = {
  // Client Errors (4xx)
  VALIDATION_ERROR: { status: 400, description: 'Invalid input data' },
  AUTHENTICATION_ERROR: { status: 401, description: 'Authentication required' },
  AUTHORIZATION_ERROR: { status: 403, description: 'Access denied' },
  NOT_FOUND: { status: 404, description: 'Resource not found' },
  CONFLICT: { status: 409, description: 'Resource conflict' },
  PHOTO_VALIDATION_ERROR: { status: 422, description: 'Photo validation failed' },
  QUOTA_EXCEEDED: { status: 429, description: 'Quota exceeded' },
  
  // Server Errors (5xx)
  INTERNAL_ERROR: { status: 500, description: 'Internal server error' },
  EXTERNAL_SERVICE_ERROR: { status: 502, description: 'External service error' },
  TIMEOUT_ERROR: { status: 504, description: 'Operation timed out' },
};

/**
 * Safely convert any error to a response-safe format
 * @param {Error} error - Any error object
 * @returns {Object} Safe error response
 */
function safeErrorResponse(error) {
  // If it's one of our operational errors, use its toResponse method
  if (error instanceof AppError && error.isOperational) {
    return error.toResponse();
  }

  // For non-operational errors (programming errors, unexpected errors),
  // return a generic message to avoid leaking internal details
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Get HTTP status code from error
 * @param {Error} error - Any error object
 * @returns {number} HTTP status code
 */
function getErrorStatusCode(error) {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  QuotaExceededError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  TimeoutError,
  InternalServerError,
  PhotoValidationError,
  SessionError,
  ERROR_CODES,
  safeErrorResponse,
  getErrorStatusCode
};
