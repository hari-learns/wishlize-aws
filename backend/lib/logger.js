/**
 * Structured Logger for Wishlize Backend
 * 
 * Features:
 * - JSON structured logging for CloudWatch
 * - PII protection (email hashing, IP anonymization)
 * - Request correlation IDs
 * - Log level filtering
 * - Safe serialization (handles circular references)
 */

const crypto = require('crypto');

// Log levels in order of severity
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

// Current log level from environment
const CURRENT_LOG_LEVEL = LOG_LEVELS[
  (process.env.LOG_LEVEL || 'info').toUpperCase()
] || LOG_LEVELS.INFO;

/**
 * Hash sensitive data for logging (one-way, deterministic)
 * @param {string} data - Data to hash
 * @returns {string} SHA-256 hash (first 16 chars)
 */
function hashForLog(data) {
  if (!data) return null;
  return crypto
    .createHash('sha256')
    .update(String(data).toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Anonymize IP address (keep first 3 octets for IPv4, mask last)
 * @param {string} ip - IP address
 * @returns {string} Anonymized IP
 */
function anonymizeIp(ip) {
  if (!ip) return null;
  
  // IPv4: mask last octet
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }
  
  // IPv6: mask last 64 bits
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return parts.slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
    }
  }
  
  return 'xxx.xxx.xxx.xxx';
}

/**
 * Sanitize object for logging (remove PII)
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveFields = [
    'email', 'emailRaw', 'password', 'token', 'apiKey', 'api_key',
    'secret', 'authorization', 'cookie', 'session', 'credit_card',
    'ssn', 'phone', 'address', 'name', 'firstName', 'lastName'
  ];
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      // Hash sensitive values instead of removing them
      // This allows correlation without exposing PII
      if (lowerKey.includes('email')) {
        sanitized[key] = hashForLog(value);
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Safe JSON stringify (handles circular references)
 * @param {Object} obj - Object to stringify
 * @returns {string} JSON string
 */
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // Skip functions and undefined
    if (typeof value === 'function' || value === undefined) {
      return undefined;
    }
    
    // Handle circular references
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    
    // Handle errors
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        code: value.code,
        stack: value.stack
      };
    }
    
    return value;
  });
}

/**
 * Create a logger instance for a specific request
 * @param {string} requestId - Request correlation ID
 * @param {string} functionName - Lambda function name
 * @returns {Object} Logger instance
 */
function createLogger(requestId, functionName) {
  const baseLog = {
    requestId,
    function: functionName,
    service: 'wishlize-backend',
    environment: process.env.NODE_ENV || 'development',
    awsRegion: process.env.AWS_REGION
  };

  /**
   * Log at specified level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [meta] - Additional metadata
   */
  function log(level, message, meta = {}) {
    const levelValue = LOG_LEVELS[level.toUpperCase()];
    
    // Skip if below current log level
    if (levelValue < CURRENT_LOG_LEVEL) {
      return;
    }
    
    const logEntry = {
      ...baseLog,
      level: level.toLowerCase(),
      message,
      timestamp: new Date().toISOString(),
      ...sanitizeForLogging(meta)
    };
    
    // Log to console (CloudWatch will capture)
    console.log(safeStringify(logEntry));
  }

  return {
    debug: (message, meta) => log('DEBUG', message, meta),
    info: (message, meta) => log('INFO', message, meta),
    warn: (message, meta) => log('WARN', message, meta),
    error: (message, meta) => log('ERROR', message, meta),
    fatal: (message, meta) => log('FATAL', message, meta),
    
    // Utility methods
    hashForLog,
    anonymizeIp,
    sanitizeForLogging,
    
    // Create child logger with additional context
    child: (additionalContext) => createLogger(requestId, functionName)
  };
}

/**
 * Create a simple logger for non-request contexts
 * @param {string} component - Component name
 * @returns {Object} Logger instance
 */
function createComponentLogger(component) {
  return createLogger('system', component);
}

module.exports = {
  createLogger,
  createComponentLogger,
  hashForLog,
  anonymizeIp,
  sanitizeForLogging,
  LOG_LEVELS,
  CURRENT_LOG_LEVEL
};
