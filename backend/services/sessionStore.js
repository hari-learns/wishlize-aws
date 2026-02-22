/**
 * Session Store Service (IP-Based)
 * 
 * Manages user sessions using DynamoDB with IP-based rate limiting:
 * - Create/retrieve sessions by IP hash
 * - Enforce try-on quota (3 per IP per 24h)
 * - Track session state
 * - No PII collected
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
 * Hash IP address for use as partition key
 * @param {string} ip - IP address
 * @returns {string} SHA-256 hash (first 32 chars)
 */
function hashIP(ip) {
  if (!ip) return 'unknown-ip';
  return crypto
    .createHash('sha256')
    .update(ip)
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

function normalizeErrorMessage(errorMessage) {
  if (!errorMessage) return 'Generation failed';
  if (typeof errorMessage === 'string') return errorMessage.substring(0, 500);
  try {
    return JSON.stringify(errorMessage).substring(0, 500);
  } catch (error) {
    return String(errorMessage).substring(0, 500);
  }
}

/**
 * Create a new session
 * @param {string} ip - Client IP address
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created session
 */
async function createSession(ip, metadata = {}) {
  const ipHash = hashIP(ip);
  const sessionId = uuidv4();
  const now = Date.now();
  const ttl = calculateTTL(CONFIG.SESSION_TTL_HOURS);

  const session = {
    ipHash,                              // Partition key (IP hash)
    sessionId,                           // Sort key
    triesLeft: CONFIG.MAX_TRIES,
    status: 'created',
    personImageUrl: null,
    resultImageUrl: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: ttl,
    metadata: {
      userAgent: metadata.userAgent?.substring(0, 256) || null,
      sourceIp: ip?.substring(0, 45) || null,  // Store partial IP for debugging
      source: metadata.source || 'widget'
    }
  };

  try {
    await dynamodb.put({
      TableName: CONFIG.TABLE_NAME,
      Item: session,
      ConditionExpression: 'attribute_not_exists(ipHash) OR attribute_not_exists(sessionId)'
    }).promise();

    return session;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new ConflictError('Session already exists');
    }
    console.error('Failed to create session:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Get existing active session for IP
 * @param {string} ip - Client IP address
 * @returns {Promise<Object|null>} Session or null
 */
async function getActiveSessionForIP(ip) {
  const ipHash = hashIP(ip);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await dynamodb.query({
      TableName: CONFIG.TABLE_NAME,
      KeyConditionExpression: 'ipHash = :ipHash',
      FilterExpression: 'expiresAt > :now',
      ExpressionAttributeValues: {
        ':ipHash': ipHash,
        ':now': now
      },
      ScanIndexForward: false, // Most recent first
      Limit: 1
    }).promise();

    if (result.Items && result.Items.length > 0) {
      return result.Items[0];
    }

    return null;
  } catch (error) {
    console.error('Failed to get session:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Get or create session for IP
 * @param {string} ip - Client IP address
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Session
 */
async function getOrCreateSession(ip, metadata = {}) {
  // Try to find existing active session
  const existingSession = await getActiveSessionForIP(ip);

  if (existingSession) {
    // Reset quota if session is older than 24 hours
    const sessionAge = Date.now() - existingSession.createdAt;
    if (sessionAge > CONFIG.QUOTA_RESET_HOURS * 60 * 60 * 1000) {
      // Create new session to reset quota
      return createSession(ip, metadata);
    }
    return existingSession;
  }

  // Create new session
  return createSession(ip, metadata);
}

/**
 * Get session by ID and IP
 * @param {string} sessionId - Session ID
 * @param {string} ip - Client IP address (for verification)
 * @returns {Promise<Object>} Session
 * @throws {NotFoundError}
 */
async function getSession(sessionId, ip) {
  const ipHash = hashIP(ip);

  try {
    const result = await dynamodb.get({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash,
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

    return result.Item;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    console.error('Failed to get session:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Update session with validation results
 * @param {string} sessionId - Session ID
 * @param {string} ip - Client IP address
 * @param {Object} validationResult - Photo validation result
 * @param {string} personImageUrl - URL to uploaded photo
 * @returns {Promise<Object>} Updated session
 */
async function updateValidation(sessionId, ip, validationResult, personImageUrl) {
  const ipHash = hashIP(ip);
  const now = Date.now();
  const nextStatus = validationResult?.valid ? 'validated' : 'validation_failed';

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :status, validationResult = :validation, personImageUrl = :url, updatedAt = :now',
      ConditionExpression: '#status = :created OR #status = :validated OR #status = :validationFailed OR #status = :failed',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': nextStatus,
        ':created': 'created',
        ':validated': 'validated',
        ':validationFailed': 'validation_failed',
        ':failed': 'failed',
        ':validation': validationResult,
        ':url': personImageUrl,
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes;
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
 * @param {string} ip - Client IP address
 * @returns {Promise<number>} Tries remaining
 * @throws {QuotaExceededError}
 */
async function consumeTry(sessionId, ip) {
  const ipHash = hashIP(ip);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash,
        sessionId
      },
      UpdateExpression: 'SET triesLeft = triesLeft - :dec, #status = :processing, updatedAt = :now',
      ConditionExpression: 'triesLeft > :zero AND #status = :validated',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':dec': 1,
        ':zero': 0,
        ':processing': 'processing',
        ':validated': 'validated',
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes.triesLeft;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      // Check if it's because of no tries left or invalid state
      const session = await getSession(sessionId, ip);
      if (session.triesLeft <= 0) {
        throw new QuotaExceededError('No try-ons remaining. Please try again tomorrow.');
      }
      throw new SessionError('Session is not in a valid state for this operation', 'INVALID_SESSION_STATE');
    }
    console.error('Failed to consume try:', error);
    throw new Error('Failed to process try-on request');
  }
}

/**
 * Save prediction ID to session
 * @param {string} sessionId - Session ID
 * @param {string} ip - Client IP address
 * @param {string} predictionId - FASHN prediction ID
 * @returns {Promise<Object>} Updated session
 */
async function savePredictionId(sessionId, ip, predictionId) {
  const ipHash = hashIP(ip);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash,
        sessionId
      },
      UpdateExpression: 'SET predictionId = :predictionId, updatedAt = :now',
      ExpressionAttributeValues: {
        ':predictionId': predictionId,
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes;
  } catch (error) {
    console.error('Failed to save prediction ID:', error);
    throw new Error('Failed to save prediction ID');
  }
}

/**
 * Save try-on result
 * @param {string} sessionId - Session ID
 * @param {string} ip - Client IP address
 * @param {string} resultUrl - URL to generated image
 * @returns {Promise<Object>} Updated session
 */
async function saveResult(sessionId, ip, resultUrl) {
  const ipHash = hashIP(ip);
  const now = Date.now();

  if (!resultUrl || typeof resultUrl !== 'string') {
    throw new SessionError('resultUrl is required', 'INVALID_RESULT_URL');
  }

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :completed, resultImageUrl = :url, completedAt = :now, updatedAt = :now REMOVE errorMessage',
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

    return result.Attributes;
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
 * @param {string} ip - Client IP address
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} Updated session
 */
async function markFailed(sessionId, ip, errorMessage) {
  const ipHash = hashIP(ip);
  const now = Date.now();

  try {
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :failed, errorMessage = :error, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':error': normalizeErrorMessage(errorMessage),
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes;
  } catch (error) {
    console.error('Failed to mark session failed:', error);
    throw new Error('Failed to update session');
  }
}

module.exports = {
  getOrCreateSession,
  getSession,
  updateValidation,
  consumeTry,
  savePredictionId,
  saveResult,
  markFailed,
  hashIP,
  CONFIG
};
