# Wishlize Backend Business Logic - Production Implementation Plan v1.1

## Overview
This document outlines the production-ready, secure implementation plan for the Wishlize backend business logic (Section 1.1 of the Implementation Plan). This covers the critical backend services needed for the virtual try-on feature.

---

## 📋 Implementation Scope

### Services to Implement
| # | Service | File | Complexity | Security Priority |
|---|---------|------|------------|-------------------|
| 1.1.1 | Photo Validator | `validators/photoCheck.js` | Medium | High |
| 1.1.2 | FASHN API Client | `services/fashnClient.js` | High | High |
| 1.1.3 | S3 Service | `services/s3Service.js` | Medium | High |
| 1.1.4 | Session Store | `services/sessionStore.js` | Medium | Medium |
| 1.1.5 | Lambda Handlers | `handler.js` | High | Critical |
| 1.1.6 | Get Upload URL Endpoint | `handler.js` | Low | High |

---

## 🔐 Security Requirements

### 1. Input Validation & Sanitization
- **Email Validation**: RFC 5322 compliant regex, max 254 chars
- **URL Validation**: Whitelist allowed domains (FASHN CDN only)
- **File Validation**: Size limits (10MB), MIME type whitelist (image/jpeg, image/png)
- **Session ID**: UUID v4 format validation

### 2. Rate Limiting
- **Per Email**: 3 try-ons per 24 hours (business rule)
- **Per IP**: 10 requests per minute (DDoS protection)
- **Global**: 1000 requests per minute per endpoint

### 3. Data Protection
- **PII**: Email addresses hashed in logs (sha256)
- **Images**: Auto-expire after 24 hours in S3
- **API Keys**: Never logged, environment variables only
- **CORS**: Strict origin whitelist (no wildcard in production)

### 4. Error Handling
- **Safe Errors**: Never expose stack traces or internal details
- **Error Codes**: Consistent error code system for client handling
- **Logging**: Structured JSON logs with correlation IDs

---

## 🏗️ Architecture Design

### Component Diagram
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Lambda Handler  │────▶│   Validators    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌──────────────┐          ┌─────────────────┐
                        │   Services   │─────────▶│ AWS Rekognition │
                        └──────────────┘          └─────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    ┌────────────┐     ┌────────────┐     ┌────────────┐
    │    S3      │     │  DynamoDB  │     │ FASHN API  │
    │ (Presigned)│     │ (Sessions) │     │ (Try-on)   │
    └────────────┘     └────────────┘     └────────────┘
```

---

## 📦 Service Specifications

### 1.1.1 Photo Validator Service (`validators/photoCheck.js`)

#### Responsibilities
- Validate uploaded images meet quality standards
- Detect faces using AWS Rekognition
- Determine if photo is full-body or half-body
- Reject inappropriate content

#### Interface
```javascript
/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether photo passes validation
 * @property {string} type - 'full_body' | 'half_body' | 'invalid'
 * @property {string} message - Human-readable message
 * @property {number} confidence - Detection confidence (0-100)
 * @property {string[]} errors - Array of specific error codes
 */

/**
 * Validates uploaded photo meets requirements
 * @param {Buffer} imageBuffer - Image data (max 10MB)
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<ValidationResult>}
 * @throws {ValidationError} On validation failure
 */
async function validatePhoto(imageBuffer, mimeType)
```

#### Implementation Details
```javascript
// Validation Rules
const VALIDATION_RULES = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png'],
  MIN_FACE_CONFIDENCE: 90,           // AWS Rekognition threshold
  MIN_FULL_BODY_RATIO: 2.0,          // height/width for full body
  MIN_IMAGE_DIMENSION: 256,          // min width/height in pixels
  MAX_IMAGE_DIMENSION: 4096,         // max width/height in pixels
};

// Error Codes
const ERROR_CODES = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_MIME_TYPE: 'INVALID_MIME_TYPE',
  IMAGE_TOO_SMALL: 'IMAGE_TOO_SMALL',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  NO_FACE_DETECTED: 'NO_FACE_DETECTED',
  MULTIPLE_FACES: 'MULTIPLE_FACES',
  LOW_FACE_CONFIDENCE: 'LOW_FACE_CONFIDENCE',
  INAPPROPRIATE_CONTENT: 'INAPPROPRIATE_CONTENT',
  CORRUPT_IMAGE: 'CORRUPT_IMAGE',
};
```

#### Security Controls
- Buffer size check before Rekognition call (prevent memory exhaustion)
- Timeout on Rekognition calls (5 seconds)
- Content moderation using Rekognition moderation labels
- No persistent storage of image data

---

### 1.1.2 FASHN API Client (`services/fashnClient.js`)

#### Responsibilities
- Submit virtual try-on requests to FASHN API
- Poll for job completion
- Handle retries and timeouts
- Parse and validate responses

#### Interface
```javascript
/**
 * @typedef {Object} TryOnRequest
 * @property {string} personImageUrl - URL to person's photo (S3)
 * @property {string} garmentImageUrl - URL to garment image
 * @property {string} sessionId - Unique session identifier
 */

/**
 * @typedef {Object} TryOnResult
 * @property {boolean} success - Whether generation succeeded
 * @property {string} [resultUrl] - URL to generated image
 * @property {string} [error] - Error message if failed
 * @property {number} triesRemaining - Number of tries left for user
 */

/**
 * Submits virtual try-on request to FASHN API
 * @param {TryOnRequest} params - Try-on parameters
 * @returns {Promise<TryOnResult>}
 * @throws {FashnApiError} On API failure
 */
async function submitTryOnRequest(params)
```

#### Implementation Details
```javascript
// FASHN API Configuration
const FASHN_CONFIG = {
  BASE_URL: 'https://api.fashn.ai/v1',
  RUN_ENDPOINT: '/run',
  STATUS_ENDPOINT: '/status',
  API_KEY_HEADER: 'Authorization',
  MAX_POLL_ATTEMPTS: 60,           // 2 minutes (2s intervals)
  POLL_INTERVAL_MS: 2000,
  REQUEST_TIMEOUT_MS: 5000,
  MAX_RETRY_ATTEMPTS: 3,
};

// Retry Configuration
const RETRY_CONFIG = {
  retries: 3,
  backoff: 'exponential',
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};
```

#### Security Controls
- API key stored in environment variable only
- URL validation (must be S3 presigned URLs from our buckets)
- Request signing if required by FASHN API
- Circuit breaker pattern for API failures
- Request timeout to prevent Lambda hanging

---

### 1.1.3 S3 Service (`services/s3Service.js`)

#### Responsibilities
- Generate presigned POST URLs for direct browser upload
- Generate presigned GET URLs for viewing results
- Validate file metadata before upload

#### Interface
```javascript
/**
 * @typedef {Object} PresignedUploadUrl
 * @property {string} uploadUrl - Presigned POST URL
 * @property {string} publicUrl - Public URL after upload
 * @property {Object} fields - Form fields for POST
 * @property {string} key - S3 object key
 * @property {number} expiresIn - Expiration time in seconds
 */

/**
 * Generates presigned URL for direct browser upload
 * @param {string} sessionId - Session identifier
 * @param {string} fileType - MIME type (image/jpeg or image/png)
 * @returns {Promise<PresignedUploadUrl>}
 */
async function generateUploadUrl(sessionId, fileType)

/**
 * Generates presigned URL for viewing/downloading
 * @param {string} key - S3 object key
 * @param {string} bucket - S3 bucket name
 * @param {number} [expiresIn=3600] - Expiration in seconds
 * @returns {Promise<string>}
 */
async function generateViewUrl(key, bucket, expiresIn = 3600)
```

#### Implementation Details
```javascript
// S3 Configuration
const S3_CONFIG = {
  UPLOAD_BUCKET: process.env.S3_UPLOAD_BUCKET,
  RESULTS_BUCKET: process.env.S3_RESULTS_BUCKET,
  CDN_BUCKET: process.env.S3_CDN_BUCKET,
  UPLOAD_EXPIRY_SECONDS: 300,       // 5 minutes for upload
  VIEW_EXPIRY_SECONDS: 3600,        // 1 hour for viewing
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
  ALLOWED_CONTENT_TYPES: ['image/jpeg', 'image/png'],
};

// S3 Key Patterns
const KEY_PATTERNS = {
  UPLOAD: (sessionId) => `uploads/${sessionId}/${uuidv4()}.jpg`,
  RESULT: (sessionId) => `results/${sessionId}/${uuidv4()}.jpg`,
};
```

#### Security Controls
- Content-Type enforcement in presigned URL conditions
- File size limits in presigned URL conditions
- Short expiration times (5 min for upload, 1 hour for view)
- Bucket policy prevents public read/write
- CORS configured for specific origins only

---

### 1.1.4 Session Store (`services/sessionStore.js`)

#### Responsibilities
- Create and manage user sessions
- Enforce try-on quota (3 per email per 24h)
- Track session state (validated, processing, completed)

#### Interface
```javascript
/**
 * @typedef {Object} Session
 * @property {string} email - User email (hashed in DB)
 * @property {string} sessionId - UUID v4
 * @property {number} triesLeft - Remaining try-ons (0-3)
 * @property {string} status - 'created' | 'validated' | 'processing' | 'completed' | 'failed'
 * @property {string} [personImageUrl] - URL to uploaded photo
 * @property {string} [resultImageUrl] - URL to generated image
 * @property {number} createdAt - Timestamp
 * @property {number} expiresAt - Timestamp (24h from created)
 */

/**
 * Creates new session or retrieves existing
 * @param {string} email - User email address
 * @returns {Promise<Session>}
 */
async function getOrCreateSession(email)

/**
 * Updates session with validation results
 * @param {string} sessionId - Session ID
 * @param {Object} validationResult - Photo validation result
 * @returns {Promise<void>}
 */
async function updateValidation(sessionId, validationResult)

/**
 * Consumes one try-on attempt
 * @param {string} sessionId - Session ID
 * @returns {Promise<number>} Tries remaining
 * @throws {QuotaExceededError} If no tries left
 */
async function consumeTry(sessionId)

/**
 * Saves try-on result
 * @param {string} sessionId - Session ID
 * @param {string} resultUrl - URL to generated image
 * @returns {Promise<void>}
 */
async function saveResult(sessionId, resultUrl)
```

#### DynamoDB Schema
```javascript
// Table: WishlizeSessions
// Primary Key: email (PK), sessionId (SK)
// TTL: expiresAt

const SESSION_SCHEMA = {
  email: 'string',          // PK - hashed email
  sessionId: 'string',      // SK - UUID v4
  emailRaw: 'string',       // Encrypted email (for responses)
  triesLeft: 'number',      // 0-3
  status: 'string',         // Enum
  personImageUrl: 'string', // S3 URL
  resultImageUrl: 'string', // S3 URL
  createdAt: 'number',      // Unix timestamp
  expiresAt: 'number',      // TTL timestamp
  metadata: {               // Additional tracking
    userAgent: 'string',
    ipHash: 'string',       // Hashed IP for rate limiting
  }
};
```

#### Security Controls
- Email addresses stored as SHA-256 hashes (PK)
- Raw emails encrypted with AWS KMS
- TTL automatically expires sessions after 24h
- Conditional writes prevent race conditions on quota
- No PII in logs (only session IDs)

---

### 1.1.5 Lambda Handlers (`handler.js`)

#### Endpoints

| Endpoint | Method | Function | Purpose |
|----------|--------|----------|---------|
| `/get-upload-url` | POST | `getUploadUrl` | Get presigned URL for photo upload |
| `/validate-photo` | POST | `validatePhoto` | Validate uploaded photo |
| `/process-tryon` | POST | `processTryOn` | Generate virtual try-on |

#### Common Handler Structure
```javascript
/**
 * Standard Lambda handler wrapper
 * Provides: logging, error handling, CORS, rate limiting
 */
const createHandler = (handlerName, handlerFn) => {
  return async (event) => {
    const requestId = event.requestContext?.requestId || uuidv4();
    const startTime = Date.now();
    
    // Structured logging
    const logger = createLogger(requestId, handlerName);
    
    try {
      logger.info('Request started', { 
        path: event.path,
        httpMethod: event.httpMethod,
        sourceIp: hashIp(event.requestContext?.identity?.sourceIp)
      });
      
      // Rate limiting check
      await checkRateLimit(event);
      
      // Parse and validate body
      const body = parseBody(event.body);
      const validatedInput = validateInput(handlerName, body);
      
      // Execute handler
      const result = await handlerFn(validatedInput, logger);
      
      logger.info('Request completed', { 
        durationMs: Date.now() - startTime 
      });
      
      return createSuccessResponse(result, requestId);
      
    } catch (error) {
      logger.error('Request failed', { 
        error: error.code,
        message: error.message,
        durationMs: Date.now() - startTime
      });
      
      return createErrorResponse(error, requestId);
    }
  };
};
```

#### Endpoint: GET /get-upload-url
```javascript
/**
 * Request Body:
 * {
 *   "email": "user@example.com",
 *   "fileType": "image/jpeg"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "uploadUrl": "https://s3...",
 *   "publicUrl": "https://s3...",
 *   "fields": { ... },
 *   "sessionId": "uuid",
 *   "triesRemaining": 3,
 *   "expiresIn": 300
 * }
 */
```

#### Endpoint: POST /validate-photo
```javascript
/**
 * Request Body:
 * {
 *   "email": "user@example.com",
 *   "sessionId": "uuid",
 *   "imageUrl": "https://s3..."
 * }
 * 
 * Response (Success):
 * {
 *   "success": true,
 *   "valid": true,
 *   "type": "full_body",
 *   "message": "Photo validated successfully",
 *   "confidence": 98.5
 * }
 * 
 * Response (Invalid):
 * {
 *   "success": true,
 *   "valid": false,
 *   "type": "invalid",
 *   "message": "No face detected in photo",
 *   "errors": ["NO_FACE_DETECTED"]
 * }
 */
```

#### Endpoint: POST /process-tryon
```javascript
/**
 * Request Body:
 * {
 *   "email": "user@example.com",
 *   "sessionId": "uuid",
 *   "garmentUrl": "https://cdn.../blazer.jpg"
 * }
 * 
 * Response (Async started):
 * {
 *   "success": true,
 *   "status": "processing",
 *   "message": "Try-on generation started",
 *   "checkUrl": "/status/{sessionId}",
 *   "triesRemaining": 2
 * }
 * 
 * Response (Completed):
 * {
 *   "success": true,
 *   "status": "completed",
 *   "resultUrl": "https://s3.../result.jpg",
 *   "triesRemaining": 2
 * }
 */
```

#### Security Controls
- Input validation using JSON Schema
- CORS origin whitelist (configurable per environment)
- Rate limiting per IP and per email
- Safe error responses (no internal details)
- Request size limits (API Gateway: 10MB)
- Structured logging with correlation IDs

---

## 🧪 Test Strategy

### Test Pyramid
```
       /\
      /  \
     / E2E \      (5 tests - critical paths)
    /________\
   /          \
  / Integration \  (20 tests - service interactions)
 /________________\
/                  \
/    Unit Tests      \ (50+ tests - functions in isolation)
/______________________\
```

### 1. Unit Tests

#### File: `__tests__/unit/validators/photoCheck.test.js`
```javascript
describe('Photo Validator', () => {
  describe('Input Validation', () => {
    it('should reject files larger than 10MB');
    it('should reject non-image MIME types');
    it('should reject null/undefined buffer');
    it('should handle empty buffer gracefully');
  });
  
  describe('AWS Rekognition Integration', () => {
    it('should call detectFaces with correct params');
    it('should return full_body for tall aspect ratio');
    it('should return half_body for square aspect ratio');
    it('should reject when no face detected');
    it('should reject when multiple faces detected');
    it('should reject when confidence < 90%');
    it('should timeout after 5 seconds');
  });
  
  describe('Content Moderation', () => {
    it('should flag inappropriate content');
    it('should allow appropriate images');
  });
  
  describe('Error Handling', () => {
    it('should handle Rekognition service errors');
    it('should handle corrupt image data');
  });
});
```

#### File: `__tests__/unit/services/fashnClient.test.js`
```javascript
describe('FASHN API Client', () => {
  describe('Request Submission', () => {
    it('should submit with correct payload');
    it('should include Authorization header');
    it('should validate URL format');
    it('should reject non-S3 URLs');
  });
  
  describe('Polling Logic', () => {
    it('should poll until completion');
    it('should return result URL on success');
    it('should timeout after max attempts');
    it('should handle API errors gracefully');
  });
  
  describe('Retry Logic', () => {
    it('should retry on 5xx errors');
    it('should retry on timeout');
    it('should not retry on 4xx errors');
    it('should use exponential backoff');
  });
});
```

#### File: `__tests__/unit/services/s3Service.test.js`
```javascript
describe('S3 Service', () => {
  describe('Upload URL Generation', () => {
    it('should generate valid presigned POST URL');
    it('should include content-type condition');
    it('should include content-length condition');
    it('should expire after 5 minutes');
    it('should use correct bucket');
  });
  
  describe('View URL Generation', () => {
    it('should generate valid presigned GET URL');
    it('should use correct expiry time');
  });
  
  describe('Security', () => {
    it('should reject invalid file types');
    it('should include sessionId in key path');
  });
});
```

#### File: `__tests__/unit/services/sessionStore.test.js`
```javascript
describe('Session Store', () => {
  describe('Session Creation', () => {
    it('should create new session for new email');
    it('should return existing session if valid');
    it('should hash email for PK');
    it('should set TTL for 24 hours');
  });
  
  describe('Quota Management', () => {
    it('should start with 3 tries');
    it('should decrement on consumeTry');
    it('should throw when no tries left');
    it('should reset after 24 hours');
  });
  
  describe('State Transitions', () => {
    it('should transition created -> validated');
    it('should transition validated -> processing');
    it('should transition processing -> completed');
    it('should handle concurrent updates safely');
  });
});
```

### 2. Integration Tests

#### File: `__tests__/integration/api.test.js`
```javascript
describe('API Integration', () => {
  describe('End-to-End Flow', () => {
    it('should complete full try-on flow');
    it('should enforce quota across multiple requests');
    it('should handle invalid photos');
    it('should handle FASHN API failures');
  });
  
  describe('Error Scenarios', () => {
    it('should return 400 for invalid email');
    it('should return 400 for invalid session');
    it('should return 429 when rate limited');
    it('should return 403 when quota exceeded');
  });
});
```

### 3. Security Tests

#### File: `__tests__/security/input-validation.test.js`
```javascript
describe('Security: Input Validation', () => {
  it('should sanitize email input');
  it('should reject SQL injection attempts');
  it('should reject XSS in email');
  it('should reject oversized payloads');
  it('should reject malformed JSON');
});
```

#### File: `__tests__/security/rate-limiting.test.js`
```javascript
describe('Security: Rate Limiting', () => {
  it('should limit requests per IP');
  it('should limit try-ons per email');
  it('should return 429 with Retry-After header');
});
```

#### File: `__tests__/security/cors.test.js`
```javascript
describe('Security: CORS', () => {
  it('should reject requests from unauthorized origins');
  it('should allow requests from whitelisted origins');
  it('should not reflect arbitrary origins');
});
```

---

## 📁 File Structure

```
backend/
├── handler.js                    # Lambda entry points
├── serverless.yml               # Infrastructure config
├── package.json
├── jest.config.js
├── lib/
│   ├── errors.js                # Custom error classes
│   ├── logger.js                # Structured logging
│   ├── validators.js            # Input validation schemas
│   └── middleware.js            # Handler wrappers
├── validators/
│   └── photoCheck.js            # AWS Rekognition integration
├── services/
│   ├── s3Service.js             # S3 presigned URLs
│   ├── fashnClient.js           # FASHN API client
│   └── sessionStore.js          # DynamoDB sessions
└── __tests__/
    ├── unit/
    │   ├── validators/
    │   ├── services/
    │   └── lib/
    ├── integration/
    ├── security/
    └── fixtures/
        └── test-images/
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Day 1)
- [ ] Set up error handling framework (`lib/errors.js`)
- [ ] Implement structured logging (`lib/logger.js`)
- [ ] Create input validation schemas (`lib/validators.js`)
- [ ] Implement handler middleware (`lib/middleware.js`)

### Phase 2: Core Services (Day 1-2)
- [ ] Implement S3 service with presigned URLs
- [ ] Implement Session store with DynamoDB
- [ ] Write unit tests for both services

### Phase 3: Photo Validation (Day 2-3)
- [ ] Implement AWS Rekognition integration
- [ ] Implement content moderation checks
- [ ] Write comprehensive unit tests

### Phase 4: FASHN Integration (Day 3-4)
- [ ] Implement FASHN API client
- [ ] Implement polling and retry logic
- [ ] Write unit tests with mocked API

### Phase 5: Lambda Handlers (Day 4-5)
- [ ] Implement `getUploadUrl` endpoint
- [ ] Implement `validatePhoto` endpoint
- [ ] Implement `processTryOn` endpoint
- [ ] Wire all services together

### Phase 6: Testing & Security (Day 5-6)
- [ ] Write integration tests
- [ ] Write security tests
- [ ] Perform security review
- [ ] Load test rate limiting

---

## ⚙️ Environment Variables

```bash
# Required
FASHN_API_KEY=             # FASHN API authentication
DYNAMO_TABLE=WishlizeSessions  # DynamoDB table name
AWS_REGION=ap-south-1      # AWS region

# S3 Buckets
S3_UPLOAD_BUCKET=wishlize-uploads
S3_RESULTS_BUCKET=wishlize-results
S3_CDN_BUCKET=wishlize-cdn

# Optional (with defaults)
RATE_LIMIT_PER_IP=10       # Requests per minute per IP
RATE_LIMIT_PER_EMAIL=3     # Try-ons per 24h per email
LOG_LEVEL=info             # debug | info | warn | error
CORS_ALLOWED_ORIGINS=*     # Comma-separated or * for dev
MAX_FILE_SIZE=10485760     # 10MB in bytes
SESSION_TTL_HOURS=24       # Session expiration
```

---

## 📊 Success Criteria

### Functional
- [ ] All 3 endpoints respond correctly
- [ ] Photo validation works with >90% accuracy
- [ ] FASHN API integration completes in <2 minutes
- [ ] Quota enforcement works correctly
- [ ] Sessions expire after 24 hours

### Performance
- [ ] Cold start < 500ms
- [ ] Warm response < 200ms (validate-photo, get-upload-url)
- [ ] FASHN polling completes in < 2 minutes

### Security
- [ ] All inputs validated and sanitized
- [ ] Rate limiting enforced
- [ ] No PII in logs
- [ ] Safe error messages
- [ ] CORS properly configured

### Testing
- [ ] >80% code coverage
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Security tests passing
- [ ] Load tests passing

---

## 📝 Notes

1. **AWS SDK v3**: Consider migrating from aws-sdk v2 to @aws-sdk/* v3 for better tree-shaking and Lambda cold start performance.

2. **Lambda Layers**: Consider packaging common dependencies (aws-sdk, axios) in Lambda Layers to reduce deployment size.

3. **Monitoring**: Set up CloudWatch alarms for:
   - Error rate > 1%
   - P95 latency > 5s
   - Throttling events

4. **Cost Optimization**: 
   - Use DynamoDB on-demand for low traffic
   - Consider S3 Intelligent-Tiering for result images
   - Set S3 lifecycle rules to expire old uploads
