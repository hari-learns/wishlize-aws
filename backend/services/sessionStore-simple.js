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
  try {
    const result = await dynamodb.query({
      TableName: CONFIG.TABLE_NAME,
      KeyConditionExpression: 'ipHash = :ipHash',
      FilterExpression: 'expiresAt > :now',
      ExpressionAttributeValues: {
        ':ipHash': ipHash,
        ':now': Math.floor(Date.now() / 1000)
      },
      ScanIndexForward: false,
      Limit: 1
    }).promise();

    if (result.Items && result.Items.length > 0) {
      const session = result.Items[0];
      // Check if session is older than 24 hours (reset quota)
      const sessionAge = Date.now() - session.createdAt;
      if (sessionAge > CONFIG.SESSION_TTL_HOURS * 60 * 60 * 1000) {
        return createSession(ip);
      }
      return session;
    }

    // Create new session
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
    // Query by sessionId (requires GSI, but for now scan)
    const result = await dynamodb.scan({
      TableName: CONFIG.TABLE_NAME,
      FilterExpression: 'sessionId = :sessionId AND expiresAt > :now',
      ExpressionAttributeValues: {
        ':sessionId': sessionId,
        ':now': Math.floor(Date.now() / 1000)
      }
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      throw new NotFoundError('Session not found');
    }

    return result.Items[0];
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    console.error('Failed to get session:', error);
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
        ':status': 'validated',
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
    // First get the session
    const session = await getSession(sessionId);

    if (session.triesLeft <= 0) {
      throw new QuotaExceededError('No try-ons remaining');
    }

    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
        sessionId
      },
      UpdateExpression: 'SET triesLeft = triesLeft - :dec, #status = :processing, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':dec': 1,
        ':processing': 'processing',
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes.triesLeft;
  } catch (error) {
    if (error instanceof QuotaExceededError) throw error;
    console.error('Failed to consume try:', error);
    throw new Error('Failed to process try-on request');
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

  try {
    const session = await getSession(sessionId);

    const result = await dynamodb.update({
      TableName: CONFIG.TABLE_NAME,
      Key: {
        ipHash: session.ipHash,
        sessionId
      },
      UpdateExpression: 'SET #status = :completed, resultImageUrl = :url, completedAt = :now, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':completed': 'completed',
        ':url': resultUrl,
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes;
  } catch (error) {
    console.error('Failed to save result:', error);
    throw new Error('Failed to save try-on result');
  }
}

module.exports = {
  getOrCreateSession,
  getSession,
  updateValidation,
  consumeTry,
  saveResult,
  hashIP,
  CONFIG
};
