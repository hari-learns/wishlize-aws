/**
 * Simple Session Store (No Email Required)
 * 
 * Uses IP-based tracking instead of email
 * Simpler, faster, no PII collection
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
  SESSION_TTL_HOURS: 24
};

/**
 * Hash IP for use as partition key
 * @param {string} ip - IP address
 * @returns {string} SHA-256 hash (first 32 chars)
 */
function hashIP(ip) {
  if (!ip) return 'anonymous';
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
 * @returns {Promise<Object>} Created session
 */
async function createSession(ip) {
  const ipHash = hashIP(ip);
  const sessionId = uuidv4();
  const now = Date.now();
  const ttl = calculateTTL(CONFIG.SESSION_TTL_HOURS);

  const session = {
    ipHash,                       // Partition key
    sessionId,                    // Sort key
    triesLeft: CONFIG.MAX_TRIES,
    status: 'created',
    personImageUrl: null,
    resultImageUrl: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: ttl
  };

  try {
    await dynamodb.put({
      TableName: CONFIG.TABLE_NAME,
      Item: session
    }).promise();

    return session;
  } catch (error) {
    console.error('Failed to create session:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Get or create session for IP
 * @param {string} ip - Client IP address
 * @returns {Promise<Object>} Session
 */
async function getOrCreateSession(ip) {
  const ipHash = hashIP(ip);

  // Check if there are active sessions for this IP
  // DynamoDB TTL automatically removes expired sessions
  try {
    const result = await dynamodb.query({
      TableName: CONFIG.TABLE_NAME,
      KeyConditionExpression: 'ipHash = :ipHash',
      FilterExpression: 'expiresAt > :now',
      ExpressionAttributeValues: {
        ':ipHash': ipHash,
        ':now': Math.floor(Date.now() / 1000)
      },
      ScanIndexForward: false, // Most recent first
      Limit: 1
    }).promise();

    if (result.Items && result.Items.length > 0) {
      // Return existing active session
      // DynamoDB TTL will handle expiration cleanup automatically
      return result.Items[0];
    }

    // Create new session if none found
    return createSession(ip);
  } catch (error) {
    console.error('Failed to get session:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Session
 * @throws {NotFoundError}
 */
async function getSession(sessionId) {
  try {
    // Use GSI to query by sessionId - O(1) index lookup instead of O(n) table scan
    const result = await dynamodb.query({
      TableName: CONFIG.TABLE_NAME,
      IndexName: 'SessionIdIndex',
      KeyConditionExpression: 'sessionId = :sessionId',
      FilterExpression: 'expiresAt > :now',
      ExpressionAttributeValues: {
        ':sessionId': sessionId,
        ':now': Math.floor(Date.now() / 1000)
      }
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      throw new NotFoundError('Session not found or has expired');
    }

    return result.Items[0];
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    console.error('Failed to get session by ID:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Update session with validation results
 * @param {string} sessionId - Session ID
 * @param {Object} validationResult - Photo validation result
 * @param {string} personImageUrl - URL to uploaded photo
 * @returns {Promise<Object>} Updated session
 */
async function updateValidation(sessionId, validationResult, personImageUrl) {
  const now = Date.now();
  const nextStatus = validationResult?.valid ? 'validated' : 'validation_failed';

  try {
    // First get the session to find ipHash
    const session = await getSession(sessionId);

    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :status, validationResult = :validation, personImageUrl = :url, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': nextStatus,
        ':validation': validationResult,
        ':url': personImageUrl,
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes;
  } catch (error) {
    console.error('Failed to update session validation:', error);
    throw new Error('Failed to update session');
  }
}

/**
 * Consume one try-on attempt
 * @param {string} sessionId - Session ID
 * @returns {Promise<number>} Tries remaining
 * @throws {QuotaExceededError}
 */
async function consumeTry(sessionId) {
  const now = Date.now();

  try {
    // First get the session to retrieve ipHash
    const session = await getSession(sessionId);

    // Use atomic update with conditional expression to prevent race conditions
    // This ensures triesLeft is only decremented if it's greater than 0
    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
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
        ':validated': 'validated',
        ':processing': 'processing',
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes.triesLeft;
  } catch (error) {
    // Handle conditional check failure - race condition detected
    if (error.code === 'ConditionalCheckFailedException') {
      console.warn('Race condition prevented - quota exhausted', { sessionId });
      throw new QuotaExceededError('Daily try-on limit reached. Please try again tomorrow.');
    }
    
    if (error instanceof QuotaExceededError) throw error;
    console.error('Failed to consume try:', error);
    throw new Error('Failed to process try-on request');
  }
}

/**
 * Save prediction ID to session
 * @param {string} sessionId - Session ID
 * @param {string} predictionId - FASHN prediction ID
 * @returns {Promise<Object>} Updated session
 */
async function savePredictionId(sessionId, predictionId) {
  const now = Date.now();

  try {
    const session = await getSession(sessionId);

    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
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
 * @param {string} resultUrl - URL to generated image
 * @returns {Promise<Object>} Updated session
 */
async function saveResult(sessionId, resultUrl) {
  const now = Date.now();

  if (!resultUrl || typeof resultUrl !== 'string') {
    throw new SessionError('resultUrl is required', 'INVALID_RESULT_URL');
  }

  try {
    const session = await getSession(sessionId);

    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
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
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} Updated session
 */
async function markFailed(sessionId, errorMessage) {
  const now = Date.now();

  try {
    const session = await getSession(sessionId);

    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
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
