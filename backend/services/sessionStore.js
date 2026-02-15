/**
 * Session Store Service
 * 
 * Manages user sessions using DynamoDB:
 * - Create/retrieve sessions
 * - Enforce try-on quota (3 per email per 24h)
 * - Track session state
 * - Encrypt PII
 */

const AWS = require('aws-sdk');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { 
  NotFoundError, 
  QuotaExceededError, 
  SessionError,
  ConflictError 
} = require('../lib/errors');

// Configure DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  maxRetries: 3
});

// Configuration
const CONFIG = {
  TABLE_NAME: process.env.DYNAMO_TABLE || 'WishlizeSessions',
  MAX_TRIES: 3,
  SESSION_TTL_HOURS: 24,
  QUOTA_RESET_HOURS: 24
};

/**
 * Hash email for use as partition key
 * @param {string} email - Email address
 * @returns {string} SHA-256 hash (first 32 chars)
 */
function hashEmail(email) {
  return crypto
    .createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex')
    .substring(0, 32);
}

/**
 * Calculate TTL timestamp (Unix epoch seconds)
 * @param {number} hours - Hours from now
 * @returns {number} TTL timestamp
 */
function calculateTTL(hours) {
  return Math.floor(Date.now() / 1000) + (hours * 60 * 60);
}

/**
 * Create a new session
 * @param {string} email - User email
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created session
 */
async function createSession(email, metadata = {}) {
  const emailHash = hashEmail(email);
  const sessionId = uuidv4();
  const now = Date.now();
  const ttl = calculateTTL(CONFIG.SESSION_TTL_HOURS);

  const session = {
    email: emailHash,                    // Partition key (hashed)
    sessionId,                           // Sort key
    emailRaw: encryptEmail(email),       // Encrypted email for responses
    triesLeft: CONFIG.MAX_TRIES,
    status: 'created',
    personImageUrl: null,
    resultImageUrl: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: ttl,
    metadata: {
      userAgent: metadata.userAgent?.substring(0, 256) || null,
      ipHash: metadata.ipHash || null,
      source: metadata.source || 'api'
    }
  };

  try {
    await dynamodb.put({
      TableName: CONFIG.TABLE_NAME,
      Item: session,
      ConditionExpression: 'attribute_not_exists(email) OR attribute_not_exists(sessionId)'
    }).promise();

    return {
      ...session,
      emailRaw: email // Return raw email for client response
    };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new ConflictError('Session already exists');
    }
    console.error('Failed to create session:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Get existing active session for email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} Session or null
 */
async function getActiveSessionForEmail(email) {
  const emailHash = hashEmail(email);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await dynamodb.query({
      TableName: CONFIG.TABLE_NAME,
      KeyConditionExpression: 'email = :email',
      FilterExpression: 'expiresAt > :now',
      ExpressionAttributeValues: {
        ':email': emailHash,
        ':now': now
      },
      ScanIndexForward: false, // Most recent first
      Limit: 1
    }).promise();

    if (result.Items && result.Items.length > 0) {
      const session = result.Items[0];
      return {
        ...session,
        emailRaw: decryptEmail(session.emailRaw)
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to get session:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Get or create session for email
 * @param {string} email - User email
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Session
 */
async function getOrCreateSession(email, metadata = {}) {
  // Try to find existing active session
  const existingSession = await getActiveSessionForEmail(email);

  if (existingSession) {
    // Reset quota if session is older than 24 hours
    const sessionAge = Date.now() - existingSession.createdAt;
    if (sessionAge > CONFIG.QUOTA_RESET_HOURS * 60 * 60 * 1000) {
      // Create new session to reset quota
      return createSession(email, metadata);
    }
    return existingSession;
  }

  // Create new session
  return createSession(email, metadata);
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @param {string} email - User email (for verification)
 * @returns {Promise<Object>} Session
 * @throws {NotFoundError}
 */
async function getSession(sessionId, email) {
  const emailHash = hashEmail(email);

  try {
    const result = await dynamodb.get({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        email: emailHash,
        sessionId
      }
    }).promise();

    if (!result.Item) {
      throw new NotFoundError('Session not found');
    }

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (result.Item.expiresAt < now) {
      throw new NotFoundError('Session has expired');
    }

    return {
      ...result.Item,
      emailRaw: decryptEmail(result.Item.emailRaw)
    };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    console.error('Failed to get session:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Update session with validation results
 * @param {string} sessionId - Session ID
 * @param {string} email - User email
 * @param {Object} validationResult - Photo validation result
 * @param {string} personImageUrl - URL to uploaded photo
 * @returns {Promise<Object>} Updated session
 */
async function updateValidation(sessionId, email, validationResult, personImageUrl) {
  const emailHash = hashEmail(email);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        email: emailHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :status, validationResult = :validation, personImageUrl = :url, updatedAt = :now',
      ConditionExpression: '#status = :created OR #status = :validated',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'validated',
        ':created': 'created',
        ':validated': 'validated',
        ':validation': validationResult,
        ':url': personImageUrl,
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return {
      ...result.Attributes,
      emailRaw: decryptEmail(result.Attributes.emailRaw)
    };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new SessionError('Session is not in a valid state for this operation', 'INVALID_SESSION_STATE');
    }
    console.error('Failed to update session validation:', error);
    throw new Error('Failed to update session');
  }
}

/**
 * Consume one try-on attempt
 * @param {string} sessionId - Session ID
 * @param {string} email - User email
 * @returns {Promise<number>} Tries remaining
 * @throws {QuotaExceededError}
 */
async function consumeTry(sessionId, email) {
  const emailHash = hashEmail(email);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        email: emailHash,
        sessionId
      },
      UpdateExpression: 'SET triesLeft = triesLeft - :dec, #status = :processing, updatedAt = :now',
      ConditionExpression: 'triesLeft > :zero AND (#status = :validated OR #status = :failed)',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':dec': 1,
        ':zero': 0,
        ':processing': 'processing',
        ':validated': 'validated',
        ':failed': 'failed',
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes.triesLeft;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      // Check if it's because of no tries left or invalid state
      const session = await getSession(sessionId, email);
      if (session.triesLeft <= 0) {
        throw new QuotaExceededError('No try-ons remaining for this session');
      }
      throw new SessionError('Session is not in a valid state for this operation', 'INVALID_SESSION_STATE');
    }
    console.error('Failed to consume try:', error);
    throw new Error('Failed to process try-on request');
  }
}

/**
 * Save try-on result
 * @param {string} sessionId - Session ID
 * @param {string} email - User email
 * @param {string} resultUrl - URL to generated image
 * @returns {Promise<Object>} Updated session
 */
async function saveResult(sessionId, email, resultUrl) {
  const emailHash = hashEmail(email);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        email: emailHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :completed, resultImageUrl = :url, completedAt = :now, updatedAt = :now',
      ConditionExpression: '#status = :processing',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':completed': 'completed',
        ':processing': 'processing',
        ':url': resultUrl,
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return {
      ...result.Attributes,
      emailRaw: decryptEmail(result.Attributes.emailRaw)
    };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new SessionError('Session is not in processing state', 'INVALID_SESSION_STATE');
    }
    console.error('Failed to save result:', error);
    throw new Error('Failed to save try-on result');
  }
}

/**
 * Mark session as failed
 * @param {string} sessionId - Session ID
 * @param {string} email - User email
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} Updated session
 */
async function markFailed(sessionId, email, errorMessage) {
  const emailHash = hashEmail(email);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        email: emailHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :failed, errorMessage = :error, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':error': errorMessage?.substring(0, 500),
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return {
      ...result.Attributes,
      emailRaw: decryptEmail(result.Attributes.emailRaw)
    };
  } catch (error) {
    console.error('Failed to mark session failed:', error);
    throw new Error('Failed to update session');
  }
}

/**
 * Simple email encryption (for demo purposes)
 * In production, use AWS KMS for encryption
 * @param {string} email - Email to encrypt
 * @returns {string} Encrypted email
 */
function encryptEmail(email) {
  // Simple XOR-based obfuscation for demo
  // In production, use AWS KMS Encrypt
  const key = process.env.ENCRYPTION_KEY || 'wishlize-default-key-min-32-chars';
  const buffer = Buffer.from(email);
  const keyBuffer = Buffer.from(key);
  
  const encrypted = buffer.map((byte, i) => 
    byte ^ keyBuffer[i % keyBuffer.length]
  );
  
  return encrypted.toString('base64');
}

/**
 * Decrypt email
 * @param {string} encrypted - Encrypted email
 * @returns {string} Decrypted email
 */
function decryptEmail(encrypted) {
  if (!encrypted) return null;
  
  try {
    const key = process.env.ENCRYPTION_KEY || 'wishlize-default-key-min-32-chars';
    const buffer = Buffer.from(encrypted, 'base64');
    const keyBuffer = Buffer.from(key);
    
    const decrypted = buffer.map((byte, i) => 
      byte ^ keyBuffer[i % keyBuffer.length]
    );
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Failed to decrypt email:', error);
    return null;
  }
}

module.exports = {
  getOrCreateSession,
  getSession,
  updateValidation,
  consumeTry,
  saveResult,
  markFailed,
  hashEmail,
  CONFIG
};
