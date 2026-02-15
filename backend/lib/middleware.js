/**
 * Lambda Handler Middleware
 * 
 * Provides common functionality for all Lambda handlers:
 * - Request/response formatting
 * - Error handling with safe responses
 * - CORS handling
 * - Rate limiting
 * - Structured logging
 */

const { v4: uuidv4 } = require('uuid');
const { 
  AppError, 
  ValidationError, 
  QuotaExceededError,
  InternalServerError,
  safeErrorResponse,
  getErrorStatusCode 
} = require('./errors');
const { createLogger, anonymizeIp, hashForLog } = require('./logger');
const { parseJSONBody } = require('./validators');

// Simple in-memory rate limiting store
// In production, use Redis or DynamoDB for distributed rate limiting
const rateLimitStore = new Map();

// Rate limit configuration
const RATE_LIMIT = {
  PER_IP: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_PER_IP, 10) || 10
  },
  PER_EMAIL: {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: parseInt(process.env.RATE_LIMIT_PER_EMAIL, 10) || 3
  }
};

/**
 * Clean up expired rate limit entries periodically
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

/**
 * Check rate limit for a key
 * @param {string} key - Rate limit key (IP or email hash)
 * @param {Object} limit - Limit configuration
 * @returns {Object} Rate limit status
 */
function checkRateLimitForKey(key, limit) {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + limit.windowMs
    });
    return { allowed: true, remaining: limit.maxRequests - 1 };
  }

  if (entry.count >= limit.maxRequests) {
    // Limit exceeded
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000)
    };
  }

  // Increment count
  entry.count++;
  return { allowed: true, remaining: limit.maxRequests - entry.count };
}

/**
 * Check rate limit for IP address
 * @param {string} ip - IP address
 * @returns {Promise<void>}
 * @throws {QuotaExceededError}
 */
async function checkIpRateLimit(ip) {
  if (!ip) return;

  const result = checkRateLimitForKey(`ip:${ip}`, RATE_LIMIT.PER_IP);

  if (!result.allowed) {
    throw new QuotaExceededError(
      'Too many requests from this IP address',
      result.retryAfter
    );
  }
}

/**
 * Check rate limit for email
 * @param {string} emailHash - Hashed email address
 * @returns {Promise<void>}
 * @throws {QuotaExceededError}
 */
async function checkEmailRateLimit(emailHash) {
  const result = checkRateLimitForKey(`email:${emailHash}`, RATE_LIMIT.PER_EMAIL);

  if (!result.allowed) {
    throw new QuotaExceededError(
      'Daily try-on limit exceeded. Please try again tomorrow.',
      result.retryAfter
    );
  }
}

/**
 * Get client IP from event
 * @param {Object} event - Lambda event
 * @returns {string|null} IP address
 */
function getClientIp(event) {
  // API Gateway v1
  return event.requestContext?.identity?.sourceIp ||
    // API Gateway v2 (HTTP API)
    event.requestContext?.http?.sourceIp ||
    // Custom header
    event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
    null;
}

/**
 * Get CORS headers based on request origin
 * @param {Object} event - Lambda event
 * @returns {Object} CORS headers
 */
function getCorsHeaders(event) {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '*').split(',').map(o => o.trim());
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // If wildcard is allowed (dev only) or origin matches whitelist
  let allowOrigin = allowedOrigins.includes('*') ? '*' : null;
  
  if (!allowOrigin && requestOrigin) {
    // Check exact match
    if (allowedOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    }
    // Check wildcard subdomain match (e.g., https://*.example.com)
    for (const allowed of allowedOrigins) {
      if (allowed.startsWith('https://*.')) {
        const domain = allowed.replace('https://*.', '');
        if (requestOrigin.endsWith(domain) || requestOrigin === `https://${domain}`) {
          allowOrigin = requestOrigin;
          break;
        }
      }
    }
  }

  // Default to first allowed origin or null
  if (!allowOrigin && allowedOrigins.length > 0 && !allowedOrigins.includes('*')) {
    allowOrigin = allowedOrigins[0];
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

/**
 * Create success response
 * @param {Object} data - Response data
 * @param {string} requestId - Request ID
 * @param {Object} corsHeaders - CORS headers
 * @returns {Object} API Gateway response
 */
function createSuccessResponse(data, requestId, corsHeaders) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    },
    body: JSON.stringify({
      success: true,
      requestId,
      ...data
    })
  };
}

/**
 * Create error response
 * @param {Error} error - Error object
 * @param {string} requestId - Request ID
 * @param {Object} corsHeaders - CORS headers
 * @returns {Object} API Gateway response
 */
function createErrorResponse(error, requestId, corsHeaders) {
  const statusCode = getErrorStatusCode(error);
  const safeResponse = safeErrorResponse(error);

  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    },
    body: JSON.stringify({
      ...safeResponse,
      requestId
    })
  };

  // Add Retry-After header for rate limiting
  if (error instanceof QuotaExceededError && error.retryAfter) {
    response.headers['Retry-After'] = String(error.retryAfter);
  }

  return response;
}

/**
 * Create a wrapped Lambda handler with common functionality
 * @param {string} handlerName - Handler name for logging
 * @param {Function} validatorFn - Input validation function
 * @param {Function} handlerFn - Business logic handler
 * @param {Object} options - Handler options
 * @returns {Function} Lambda handler
 */
function createHandler(handlerName, validatorFn, handlerFn, options = {}) {
  const {
    skipRateLimit = false,
    skipBodyParse = false
  } = options;

  return async (event, context) => {
    // Keep Lambda warm for reuse
    context.callbackWaitsForEmptyEventLoop = false;

    // Generate or extract request ID
    const requestId = event.requestContext?.requestId || uuidv4();
    
    // Create logger
    const logger = createLogger(requestId, handlerName);
    
    // Get CORS headers
    const corsHeaders = getCorsHeaders(event);

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    const startTime = Date.now();
    const clientIp = getClientIp(event);

    try {
      logger.info('Request started', {
        path: event.path,
        httpMethod: event.httpMethod,
        sourceIp: anonymizeIp(clientIp)
      });

      // Rate limiting
      if (!skipRateLimit && clientIp) {
        await checkIpRateLimit(clientIp);
      }

      // Parse body
      let body = event.body;
      if (!skipBodyParse && body) {
        body = parseJSONBody(body);
      }

      // Validate input
      let validatedInput;
      if (validatorFn) {
        validatedInput = validatorFn(body);
      } else {
        validatedInput = body;
      }

      // Rate limiting is now IP-based only (handled at start)

      // Execute handler
      const result = await handlerFn(validatedInput, logger, event);

      logger.info('Request completed', {
        durationMs: Date.now() - startTime
      });

      return createSuccessResponse(result, requestId, corsHeaders);

    } catch (error) {
      logger.error('Request failed', {
        error: error.code || error.name,
        message: error.message,
        durationMs: Date.now() - startTime,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });

      // Convert unknown errors to safe internal errors
      let safeError = error;
      if (!(error instanceof AppError)) {
        safeError = new InternalServerError();
      }

      return createErrorResponse(safeError, requestId, corsHeaders);
    }
  };
}

/**
 * Middleware composition helper
 * @param {...Function} middlewares - Middleware functions
 * @returns {Function} Composed middleware
 */
function compose(...middlewares) {
  return (handler) => {
    return middlewares.reduceRight(
      (wrapped, middleware) => middleware(wrapped),
      handler
    );
  };
}

module.exports = {
  createHandler,
  createSuccessResponse,
  createErrorResponse,
  getCorsHeaders,
  getClientIp,
  checkIpRateLimit,
  checkEmailRateLimit,
  compose,
  hashForLog
};
