/**
 * Input Validation Schemas and Functions
 * 
 * Uses JSON Schema validation with strict type checking
 * All validators are pure functions that either return validated data or throw ValidationError
 */

const { ValidationError } = require('./errors');

// Validation Constants
const VALIDATION_RULES = {
  EMAIL: {
    MAX_LENGTH: 254,
    PATTERN: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  },
  UUID: {
    PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  },
  URL: {
    MAX_LENGTH: 2048,
    ALLOWED_PROTOCOLS: ['https:'],
    ALLOWED_HOSTS: [
      's3.ap-south-1.amazonaws.com',
      'wishlize-uploads.s3.ap-south-1.amazonaws.com',
      'wishlize-results.s3.ap-south-1.amazonaws.com',
      'wishlize-cdn.s3.ap-south-1.amazonaws.com'
    ]
  },
  FILE: {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png'],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png']
  },
  STRING: {
    MAX_LENGTH: 1000
  }
};

function getAllowedUrlHosts() {
  const hosts = new Set(VALIDATION_RULES.URL.ALLOWED_HOSTS);
  const region = process.env.AWS_REGION || 'ap-south-1';
  const configuredBuckets = [
    process.env.S3_UPLOAD_BUCKET,
    process.env.S3_RESULTS_BUCKET,
    process.env.S3_CDN_BUCKET
  ].filter(Boolean);

  for (const bucket of configuredBuckets) {
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`);
    hosts.add(`${bucket}.s3.amazonaws.com`);
  }

  return Array.from(hosts);
}

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @param {string} [fieldName='email'] - Field name for error messages
 * @returns {string} Validated email (lowercase, trimmed)
 * @throws {ValidationError}
 */
function validateEmail(email, fieldName = 'email') {
  if (email === undefined || email === null) {
    throw new ValidationError(`${fieldName} is required`, [{
      field: fieldName,
      code: 'REQUIRED',
      message: 'Field is required'
    }]);
  }

  const str = String(email).trim().toLowerCase();

  if (str.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, [{
      field: fieldName,
      code: 'EMPTY',
      message: 'Field cannot be empty'
    }]);
  }

  if (str.length > VALIDATION_RULES.EMAIL.MAX_LENGTH) {
    throw new ValidationError(`${fieldName} exceeds maximum length`, [{
      field: fieldName,
      code: 'TOO_LONG',
      message: `Maximum length is ${VALIDATION_RULES.EMAIL.MAX_LENGTH} characters`,
      maxLength: VALIDATION_RULES.EMAIL.MAX_LENGTH
    }]);
  }

  if (!VALIDATION_RULES.EMAIL.PATTERN.test(str)) {
    throw new ValidationError(`${fieldName} format is invalid`, [{
      field: fieldName,
      code: 'INVALID_FORMAT',
      message: 'Invalid email format'
    }]);
  }

  return str;
}

/**
 * Validate UUID v4 format
 * @param {string} uuid - UUID to validate
 * @param {string} [fieldName='id'] - Field name for error messages
 * @returns {string} Validated UUID
 * @throws {ValidationError}
 */
function validateUUID(uuid, fieldName = 'id') {
  if (!uuid) {
    throw new ValidationError(`${fieldName} is required`, [{
      field: fieldName,
      code: 'REQUIRED',
      message: 'Field is required'
    }]);
  }

  const str = String(uuid).trim();

  if (!VALIDATION_RULES.UUID.PATTERN.test(str)) {
    throw new ValidationError(`${fieldName} format is invalid`, [{
      field: fieldName,
      code: 'INVALID_FORMAT',
      message: 'Invalid UUID format'
    }]);
  }

  return str;
}

/**
 * Validate URL (S3 URLs only)
 * @param {string} url - URL to validate
 * @param {string} [fieldName='url'] - Field name for error messages
 * @returns {string} Validated URL
 * @throws {ValidationError}
 */
function validateURL(url, fieldName = 'url') {
  if (!url) {
    throw new ValidationError(`${fieldName} is required`, [{
      field: fieldName,
      code: 'REQUIRED',
      message: 'Field is required'
    }]);
  }

  const str = String(url).trim();

  if (str.length > VALIDATION_RULES.URL.MAX_LENGTH) {
    throw new ValidationError(`${fieldName} exceeds maximum length`, [{
      field: fieldName,
      code: 'TOO_LONG',
      message: `Maximum length is ${VALIDATION_RULES.URL.MAX_LENGTH} characters`
    }]);
  }

  let parsed;
  try {
    parsed = new URL(str);
  } catch (e) {
    throw new ValidationError(`${fieldName} format is invalid`, [{
      field: fieldName,
      code: 'INVALID_FORMAT',
      message: 'Invalid URL format'
    }]);
  }

  // Check protocol
  // In development, allow HTTP, HTTPS, and file:// for local testing
  // In production, enforce HTTPS only
  const allowedProtocols = process.env.NODE_ENV === 'production' 
    ? ['https:'] 
    : ['http:', 'https:', 'file:'];
  
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new ValidationError(`${fieldName} must use HTTPS`, [{
      field: fieldName,
      code: 'INSECURE_PROTOCOL',
      message: process.env.NODE_ENV === 'production' 
        ? 'Only HTTPS URLs are allowed' 
        : 'Only HTTP/HTTPS/file URLs are allowed for testing'
    }]);
  }

  // Check host (S3 buckets only in production)
  // In development, allow any HTTPS URL for testing
  if (process.env.NODE_ENV === 'production') {
    const allowedHosts = getAllowedUrlHosts();
    const isAllowedHost = allowedHosts.some(host => 
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );

    if (!isAllowedHost) {
      throw new ValidationError(`${fieldName} host is not allowed`, [{
        field: fieldName,
        code: 'INVALID_HOST',
        message: 'URL host is not in allowed list'
      }]);
    }
  }

  return str;
}

/**
 * Validate file type
 * @param {string} mimeType - MIME type to validate
 * @param {string} [fieldName='fileType'] - Field name for error messages
 * @returns {string} Validated MIME type
 * @throws {ValidationError}
 */
function validateFileType(mimeType, fieldName = 'fileType') {
  if (!mimeType) {
    throw new ValidationError(`${fieldName} is required`, [{
      field: fieldName,
      code: 'REQUIRED',
      message: 'Field is required'
    }]);
  }

  const str = String(mimeType).trim().toLowerCase();

  if (!VALIDATION_RULES.FILE.ALLOWED_TYPES.includes(str)) {
    throw new ValidationError(`${fieldName} is not supported`, [{
      field: fieldName,
      code: 'UNSUPPORTED_TYPE',
      message: `Allowed types: ${VALIDATION_RULES.FILE.ALLOWED_TYPES.join(', ')}`,
      allowedTypes: VALIDATION_RULES.FILE.ALLOWED_TYPES
    }]);
  }

  return str;
}

/**
 * Validate string length and content
 * @param {string} value - String to validate
 * @param {Object} options - Validation options
 * @param {string} [fieldName='string'] - Field name for error messages
 * @returns {string} Validated string
 * @throws {ValidationError}
 */
function validateString(value, options = {}, fieldName = 'string') {
  const {
    required = true,
    minLength = 0,
    maxLength = VALIDATION_RULES.STRING.MAX_LENGTH,
    pattern = null,
    allowEmpty = false
  } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, [{
        field: fieldName,
        code: 'REQUIRED',
        message: 'Field is required'
      }]);
    }
    return null;
  }

  const str = String(value).trim();

  if (str.length === 0 && !allowEmpty) {
    if (required) {
      throw new ValidationError(`${fieldName} cannot be empty`, [{
        field: fieldName,
        code: 'EMPTY',
        message: 'Field cannot be empty'
      }]);
    }
    return null;
  }

  if (str.length < minLength) {
    throw new ValidationError(`${fieldName} is too short`, [{
      field: fieldName,
      code: 'TOO_SHORT',
      message: `Minimum length is ${minLength} characters`,
      minLength
    }]);
  }

  if (str.length > maxLength) {
    throw new ValidationError(`${fieldName} is too long`, [{
      field: fieldName,
      code: 'TOO_LONG',
      message: `Maximum length is ${maxLength} characters`,
      maxLength
    }]);
  }

  if (pattern && !pattern.test(str)) {
    throw new ValidationError(`${fieldName} format is invalid`, [{
      field: fieldName,
      code: 'INVALID_FORMAT',
      message: 'Invalid format'
    }]);
  }

  return str;
}

/**
 * Validate get-upload-url request body
 * @param {Object} body - Request body
 * @returns {Object} Validated data
 * @throws {ValidationError}
 */
function validateGetUploadUrlBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body is required');
  }

  const validated = {
    fileType: validateFileType(body.fileType, 'fileType')
  };

  return validated;
}

/**
 * Validate validate-photo request body
 * @param {Object} body - Request body
 * @returns {Object} Validated data
 * @throws {ValidationError}
 */
function validateValidatePhotoBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body is required');
  }

  const validated = {
    sessionId: validateUUID(body.sessionId, 'sessionId'),
    imageUrl: validateURL(body.imageUrl, 'imageUrl')
  };

  return validated;
}

/**
 * Validate process-tryon request body
 * @param {Object} body - Request body
 * @returns {Object} Validated data
 * @throws {ValidationError}
 */
function validateProcessTryOnBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body is required');
  }

  const validated = {
    sessionId: validateUUID(body.sessionId, 'sessionId'),
    garmentUrl: validateURL(body.garmentUrl, 'garmentUrl')
  };

  return validated;
}

/**
 * Sanitize string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeXSS(str) {
  if (!str || typeof str !== 'string') return str;
  
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return str.replace(/[&<>"'/]/g, char => htmlEscapes[char]);
}

/**
 * Parse and validate JSON body
 * @param {string} body - Raw request body
 * @returns {Object} Parsed body
 * @throws {ValidationError}
 */
function parseJSONBody(body) {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  // If already an object (API Gateway Lambda proxy integration), return as-is
  if (typeof body === 'object') {
    return body;
  }

  try {
    const parsed = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new ValidationError('Request body must be a JSON object');
    }
    return parsed;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError('Invalid JSON in request body');
  }
}

module.exports = {
  VALIDATION_RULES,
  validateEmail,
  validateUUID,
  validateURL,
  validateFileType,
  validateString,
  validateGetUploadUrlBody,
  validateValidatePhotoBody,
  validateProcessTryOnBody,
  sanitizeXSS,
  parseJSONBody
};
