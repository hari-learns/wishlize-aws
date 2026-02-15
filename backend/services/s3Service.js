/**
 * S3 Service
 * 
 * Enhanced S3 service with global optimization and region auto-detection.
 * Maintains backward compatibility while providing:
 * - Automatic region detection and correction
 * - Multi-region support
 * - Geographic optimization
 * - Comprehensive error handling and monitoring
 * 
 * Security features:
 * - Short expiration times
 * - Content-Type enforcement
 * - File size limits
 * - Secure key generation
 */

const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../lib/errors');
const EnhancedS3Service = require('./enhancedS3Service');

// Create enhanced S3 service instance
const enhancedS3Service = new EnhancedS3Service();

// Legacy S3 Configuration for backward compatibility
const S3_CONFIG = {
  UPLOAD_BUCKET: process.env.S3_UPLOAD_BUCKET || 'wishlize-uploads-mumbai',
  RESULTS_BUCKET: process.env.S3_RESULTS_BUCKET || 'wishlize-results-mumbai',
  CDN_BUCKET: process.env.S3_CDN_BUCKET || 'wishlize-cdn-mumbai',
  UPLOAD_EXPIRY_SECONDS: 300,       // 5 minutes for upload
  VIEW_EXPIRY_SECONDS: 3600,        // 1 hour for viewing
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
  ALLOWED_CONTENT_TYPES: ['image/jpeg', 'image/png']
};

/**
 * Generate secure S3 key for upload (backward compatibility wrapper)
 * @param {string} sessionId - Session ID
 * @param {string} contentType - Content type
 * @returns {string} S3 object key
 */
function generateS3Key(sessionId, contentType) {
  return enhancedS3Service.generateS3Key(sessionId, contentType);
}

/**
 * Generate S3 key for result image
 * @param {string} sessionId - Session ID
 * @returns {string} S3 object key
 */
function generateResultKey(sessionId) {
  const uniqueId = uuidv4();
  return `results/${sessionId}/${uniqueId}.jpg`;
}

/**
 * Generate presigned POST URL for direct browser upload
 * Enhanced with automatic region detection and global optimization
 * @param {string} sessionId - Session identifier
 * @param {string} contentType - MIME type (image/jpeg or image/png)
 * @param {string} [userLocation] - User's geographic location for optimization
 * @returns {Promise<Object>} Presigned URL data
 * @throws {ValidationError}
 */
async function generateUploadUrl(sessionId, contentType, userLocation = null) {
  try {
    // Use enhanced service with automatic region detection
    return await enhancedS3Service.generateUploadUrl(sessionId, contentType, userLocation);
  } catch (error) {
    // Maintain backward compatibility for error handling
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Failed to generate presigned URL:', error);
    throw new Error('Failed to generate upload URL');
  }
}

/**
 * Generate presigned GET URL for viewing/downloading
 * Enhanced with automatic region detection
 * @param {string} key - S3 object key
 * @param {string} [bucket] - S3 bucket name (defaults to results bucket)
 * @param {number} [expiresIn] - Expiration in seconds
 * @returns {Promise<string>} Presigned URL
 */
async function generateViewUrl(key, bucket = S3_CONFIG.RESULTS_BUCKET, expiresIn = S3_CONFIG.VIEW_EXPIRY_SECONDS) {
  try {
    return await enhancedS3Service.generateViewUrl(key, bucket, expiresIn);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Failed to generate view URL:', error);
    throw new Error('Failed to generate view URL');
  }
}

/**
 * Generate presigned URL for result image upload (from Lambda)
 * Enhanced with automatic region detection
 * @param {string} key - S3 object key
 * @param {string} [bucket] - S3 bucket name
 * @param {number} [expiresIn] - Expiration in seconds
 * @returns {Promise<string>} Presigned PUT URL
 */
async function generatePutUrl(key, bucket = S3_CONFIG.RESULTS_BUCKET, expiresIn = 300) {
  try {
    return await enhancedS3Service.generatePutUrl(key, bucket, expiresIn);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Failed to generate put URL:', error);
    throw new Error('Failed to generate put URL');
  }
}

/**
 * Extract key from S3 URL
 * @param {string} url - S3 URL
 * @returns {Object|null} { key, bucket } or null
 */
function parseS3Url(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    
    // Virtual hosted-style URL: https://bucket.s3.region.amazonaws.com/key
    const virtualHostedMatch = parsed.hostname.match(/^([^.]+)\.s3\.([^.]+)\.amazonaws\.com$/);
    if (virtualHostedMatch) {
      return {
        bucket: virtualHostedMatch[1],
        key: decodeURIComponent(parsed.pathname.substring(1)) // Remove leading /
      };
    }

    // Path-style URL: https://s3.region.amazonaws.com/bucket/key
    const pathMatch = parsed.pathname.match(/^\/([^/]+)\/(.+)$/);
    if (pathMatch && parsed.hostname.includes('amazonaws.com')) {
      return {
        bucket: pathMatch[1],
        key: decodeURIComponent(pathMatch[2])
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Validate that a URL is a valid S3 URL for our buckets
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidS3Url(url) {
  const parsed = parseS3Url(url);
  if (!parsed) return false;

  const allowedBuckets = [
    S3_CONFIG.UPLOAD_BUCKET,
    S3_CONFIG.RESULTS_BUCKET,
    S3_CONFIG.CDN_BUCKET
  ];

  return allowedBuckets.includes(parsed.bucket);
}

/**
 * Delete object from S3
 * Enhanced with automatic region detection
 * @param {string} key - S3 object key
 * @param {string} [bucket] - S3 bucket name
 * @returns {Promise<boolean>}
 */
async function deleteObject(key, bucket = S3_CONFIG.UPLOAD_BUCKET) {
  if (!key) return false;

  try {
    // Get the correct region for the bucket
    const region = await enhancedS3Service.resolveRegionForBucket(bucket);
    const s3 = enhancedS3Service.createRegionalS3Client(region);
    
    await s3.deleteObject({
      Bucket: bucket,
      Key: key
    }).promise();
    return true;
  } catch (error) {
    console.error('Failed to delete S3 object:', error);
    return false;
  }
}

// Export enhanced service instance for advanced usage
const getEnhancedS3Service = () => enhancedS3Service;

module.exports = {
  generateUploadUrl,
  generateViewUrl,
  generatePutUrl,
  parseS3Url,
  isValidS3Url,
  deleteObject,
  generateS3Key,
  generateResultKey,
  S3_CONFIG,
  getEnhancedS3Service // Export enhanced service for advanced usage
};
