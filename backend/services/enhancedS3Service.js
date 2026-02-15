/**
 * Enhanced S3 Service
 * 
 * Globally optimized S3 service with:
 * - Automatic region detection and correction
 * - Multi-region support
 * - Geographic optimization
 * - Comprehensive error handling and monitoring
 * - Backward compatibility with existing API
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../lib/errors');
const S3ConfigurationManager = require('./s3ConfigurationManager');
const RegionResolver = require('./regionResolver');

class EnhancedS3Service {
  constructor() {
    this.configManager = new S3ConfigurationManager();
    this.regionResolver = new RegionResolver();
    this.s3Clients = new Map(); // Cache S3 clients by region
    this.metrics = {
      uploads: new Map(),
      errors: new Map(),
      regionPerformance: new Map()
    };
  }

  /**
   * Get or create S3 client for specific region
   * @param {string} region - AWS region
   * @returns {AWS.S3} S3 client
   */
  createRegionalS3Client(region) {
    if (!this.s3Clients.has(region)) {
      const s3Client = new AWS.S3({
        region,
        signatureVersion: 'v4',
        s3ForcePathStyle: false,
        useAccelerateEndpoint: false
      });
      this.s3Clients.set(region, s3Client);
    }
    return this.s3Clients.get(region);
  }

  /**
   * Resolve the correct region for a bucket
   * @param {string} bucketName - Name of the bucket
   * @returns {Promise<string>} Bucket's actual region
   */
  async resolveRegionForBucket(bucketName) {
    try {
      return await this.configManager.getBucketRegion(bucketName);
    } catch (error) {
      console.error(`Failed to resolve region for bucket ${bucketName}:`, error);
      // Fallback to direct detection
      return await this.regionResolver.detectBucketRegion(bucketName);
    }
  }

  /**
   * Generate secure S3 key for upload
   * @param {string} sessionId - Session ID
   * @param {string} contentType - Content type
   * @returns {string} S3 object key
   */
  generateS3Key(sessionId, contentType) {
    const contentTypeExtensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png'
    };
    
    const extension = contentTypeExtensions[contentType] || '.jpg';
    const uniqueId = uuidv4();
    return `uploads/${sessionId}/${uniqueId}${extension}`;
  }

  /**
   * Generate presigned POST URL for direct browser upload with region correction
   * @param {string} sessionId - Session identifier
   * @param {string} contentType - MIME type
   * @param {string} [userLocation] - User's geographic location for optimization
   * @returns {Promise<Object>} Enhanced presigned URL data
   */
  async generateUploadUrl(sessionId, contentType, userLocation = null) {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!sessionId) {
        throw new ValidationError('sessionId is required');
      }

      const config = await this.configManager.getConfiguration();
      
      if (!config.upload.allowedContentTypes.includes(contentType)) {
        throw new ValidationError('Invalid content type', [{
          field: 'contentType',
          code: 'INVALID_CONTENT_TYPE',
          allowedTypes: config.upload.allowedContentTypes
        }]);
      }

      // Get upload bucket name
      const uploadBuckets = Object.entries(config.buckets)
        .filter(([, bucketConfig]) => bucketConfig.purpose === 'upload');
      
      if (uploadBuckets.length === 0) {
        throw new Error('No upload bucket configured');
      }

      const [bucketName] = uploadBuckets[0];

      // Resolve correct region for the bucket
      const bucketRegion = await this.resolveRegionForBucket(bucketName);
      
      // Log region mismatch if detected
      if (bucketRegion !== config.regions.primary) {
        console.warn(`Region mismatch detected: Bucket ${bucketName} is in ${bucketRegion}, but primary region is ${config.regions.primary}`);
        this.logUploadMetrics(bucketRegion, false, Date.now() - startTime, 'REGION_MISMATCH');
      }

      // Create S3 client for the correct region
      const s3 = this.createRegionalS3Client(bucketRegion);
      
      const key = this.generateS3Key(sessionId, contentType);

      // Enhanced policy conditions for security
      const conditions = [
        ['eq', '$Content-Type', contentType],
        ['content-length-range', 0, config.upload.maxFileSize],
        { bucket: bucketName },
        { key }
      ];

      const params = {
        Bucket: bucketName,
        Key: key,
        Expires: config.upload.expirySeconds,
        Conditions: conditions,
        Fields: {
          'key': key,
          'Content-Type': contentType,
          'x-amz-meta-session-id': sessionId,
          'x-amz-meta-upload-time': new Date().toISOString()
        }
      };

      const presignedPost = await s3.createPresignedPost(params);

      // Use bucket's region for S3 URL
      const virtualHostedUrl = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/`;
      const publicUrl = `${virtualHostedUrl}${key}`;

      const result = {
        uploadUrl: virtualHostedUrl,
        publicUrl,
        fields: presignedPost.fields,
        key,
        bucket: bucketName,
        region: bucketRegion,
        expiresIn: config.upload.expirySeconds,
        maxFileSize: config.upload.maxFileSize,
        contentType
      };

      // Log successful operation
      this.logUploadMetrics(bucketRegion, true, Date.now() - startTime);
      
      return result;

    } catch (error) {
      this.logUploadMetrics('unknown', false, Date.now() - startTime, error.code || 'UNKNOWN_ERROR');
      console.error('Failed to generate upload URL:', error);
      throw error;
    }
  }

  /**
   * Generate presigned POST with enhanced parameters
   * @param {Object} params - Enhanced parameters
   * @returns {Promise<Object>} Presigned POST data
   */
  async generatePresignedPost(params) {
    const {
      sessionId,
      contentType,
      userLocation,
      bucketName: requestedBucket,
      customKey
    } = params;

    const config = await this.configManager.getConfiguration();
    
    // Determine bucket to use
    let bucketName = requestedBucket;
    if (!bucketName) {
      const uploadBuckets = Object.entries(config.buckets)
        .filter(([, bucketConfig]) => bucketConfig.purpose === 'upload');
      bucketName = uploadBuckets[0]?.[0];
    }

    if (!bucketName) {
      throw new Error('No suitable bucket found');
    }

    // Use custom key or generate one
    const key = customKey || this.generateS3Key(sessionId, contentType);
    
    // Get correct region and S3 client
    const region = await this.resolveRegionForBucket(bucketName);
    const s3 = this.createRegionalS3Client(region);

    const postParams = {
      Bucket: bucketName,
      Key: key,
      Expires: config.upload.expirySeconds,
      Conditions: [
        ['eq', '$Content-Type', contentType],
        ['content-length-range', 0, config.upload.maxFileSize],
        { bucket: bucketName },
        { key }
      ],
      Fields: {
        'Content-Type': contentType,
        'x-amz-meta-session-id': sessionId
      }
    };

    const presignedPost = await s3.createPresignedPost(postParams);

    return {
      ...presignedPost,
      region,
      bucket: bucketName,
      key
    };
  }

  /**
   * Generate presigned GET URL for viewing/downloading
   * @param {string} key - S3 object key
   * @param {string} [bucketName] - S3 bucket name
   * @param {number} [expiresIn] - Expiration in seconds
   * @returns {Promise<string>} Presigned URL
   */
  async generateViewUrl(key, bucketName = null, expiresIn = 3600) {
    if (!key) {
      throw new ValidationError('key is required');
    }

    const config = await this.configManager.getConfiguration();
    
    // Determine bucket
    if (!bucketName) {
      const resultsBuckets = Object.entries(config.buckets)
        .filter(([, bucketConfig]) => bucketConfig.purpose === 'results');
      bucketName = resultsBuckets[0]?.[0];
    }

    if (!bucketName) {
      throw new Error('No suitable bucket found for viewing');
    }

    // Get correct region and S3 client
    const region = await this.resolveRegionForBucket(bucketName);
    const s3 = this.createRegionalS3Client(region);

    const params = {
      Bucket: bucketName,
      Key: key,
      Expires: expiresIn
    };

    try {
      const url = await s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error) {
      console.error('Failed to generate view URL:', error);
      throw new Error('Failed to generate view URL');
    }
  }

  /**
   * Generate presigned PUT URL for result uploads
   * @param {string} key - S3 object key
   * @param {string} [bucketName] - S3 bucket name
   * @param {number} [expiresIn] - Expiration in seconds
   * @returns {Promise<string>} Presigned PUT URL
   */
  async generatePutUrl(key, bucketName = null, expiresIn = 300) {
    if (!key) {
      throw new ValidationError('key is required');
    }

    const config = await this.configManager.getConfiguration();
    
    // Determine bucket
    if (!bucketName) {
      const resultsBuckets = Object.entries(config.buckets)
        .filter(([, bucketConfig]) => bucketConfig.purpose === 'results');
      bucketName = resultsBuckets[0]?.[0];
    }

    if (!bucketName) {
      throw new Error('No suitable bucket found for uploads');
    }

    // Get correct region and S3 client
    const region = await this.resolveRegionForBucket(bucketName);
    const s3 = this.createRegionalS3Client(region);

    const params = {
      Bucket: bucketName,
      Key: key,
      Expires: expiresIn,
      ContentType: 'image/jpeg'
    };

    try {
      const url = await s3.getSignedUrlPromise('putObject', params);
      return url;
    } catch (error) {
      console.error('Failed to generate put URL:', error);
      throw new Error('Failed to generate put URL');
    }
  }

  /**
   * Log upload metrics for monitoring
   * @param {string} region - AWS region
   * @param {boolean} success - Whether operation succeeded
   * @param {number} duration - Operation duration in ms
   * @param {string} [errorCode] - Error code if failed
   */
  logUploadMetrics(region, success, duration, errorCode = null) {
    const timestamp = new Date().toISOString();
    
    // Update success/failure counts
    const regionKey = `${region}_${success ? 'success' : 'failure'}`;
    const currentCount = this.metrics.uploads.get(regionKey) || 0;
    this.metrics.uploads.set(regionKey, currentCount + 1);

    // Track performance
    if (!this.metrics.regionPerformance.has(region)) {
      this.metrics.regionPerformance.set(region, []);
    }
    this.metrics.regionPerformance.get(region).push({
      duration,
      success,
      timestamp,
      errorCode
    });

    // Log for external monitoring
    const logData = {
      timestamp,
      region,
      success,
      duration,
      errorCode
    };

    if (success) {
      console.log('S3 Upload Metrics:', JSON.stringify(logData));
    } else {
      console.error('S3 Upload Error:', JSON.stringify(logData));
    }
  }

  /**
   * Track region performance metrics
   * @param {string} region - AWS region
   * @param {string} operation - Operation type
   * @param {Object} metrics - Performance metrics
   */
  trackRegionPerformance(region, operation, metrics) {
    const key = `${region}_${operation}`;
    if (!this.metrics.regionPerformance.has(key)) {
      this.metrics.regionPerformance.set(key, []);
    }
    
    this.metrics.regionPerformance.get(key).push({
      ...metrics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    const stats = {
      uploads: Object.fromEntries(this.metrics.uploads),
      regionPerformance: {}
    };

    // Calculate average performance by region
    for (const [region, performances] of this.metrics.regionPerformance) {
      if (performances.length > 0) {
        const avgDuration = performances.reduce((sum, p) => sum + p.duration, 0) / performances.length;
        const successRate = performances.filter(p => p.success).length / performances.length;
        
        stats.regionPerformance[region] = {
          averageDuration: Math.round(avgDuration),
          successRate: Math.round(successRate * 100) / 100,
          totalOperations: performances.length
        };
      }
    }

    return stats;
  }
}

module.exports = EnhancedS3Service;