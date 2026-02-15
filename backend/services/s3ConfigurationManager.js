/**
 * S3 Configuration Manager
 * 
 * Centralized configuration management for S3 services.
 * Handles validation, environment-specific settings, and dynamic reloading.
 */

const RegionResolver = require('./regionResolver');

class S3ConfigurationManager {
  constructor() {
    this.regionResolver = new RegionResolver();
    this.config = null;
    this.lastConfigLoad = null;
    this.configReloadInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load S3 configuration from environment and validate
   * @returns {Promise<Object>} S3 configuration
   */
  async loadConfiguration() {
    const config = {
      buckets: {
        [process.env.S3_UPLOAD_BUCKET || 'wishlize-uploads-mumbai']: {
          region: 'ap-south-1', // Buckets are in ap-south-1 (Mumbai)
          purpose: 'upload'
        },
        [process.env.S3_RESULTS_BUCKET || 'wishlize-results-mumbai']: {
          region: 'ap-south-1', // Buckets are in ap-south-1 (Mumbai)
          purpose: 'results'
        },
        [process.env.S3_CDN_BUCKET || 'wishlize-cdn-mumbai']: {
          region: 'ap-south-1', // Buckets are in ap-south-1 (Mumbai)
          purpose: 'cdn'
        }
      },
      
      regions: {
        primary: process.env.AWS_REGION || 'us-east-1',
        fallback: ['us-east-1', 'eu-west-1', 'ap-south-1'],
        userRegionMapping: {
          'US': 'us-east-1',
          'EU': 'eu-west-1',
          'AS': 'ap-south-1'
        }
      },
      
      upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
        allowedContentTypes: (process.env.ALLOWED_CONTENT_TYPES || 'image/jpeg,image/png').split(','),
        expirySeconds: parseInt(process.env.UPLOAD_EXPIRY_SECONDS) || 300 // 5 minutes
      },
      
      monitoring: {
        enableMetrics: process.env.ENABLE_METRICS !== 'false',
        logLevel: process.env.LOG_LEVEL || 'info'
      }
    };

    // Detect actual bucket regions
    for (const [bucketName, bucketConfig] of Object.entries(config.buckets)) {
      try {
        bucketConfig.region = await this.regionResolver.detectBucketRegion(bucketName);
        console.log(`Configuration: Bucket ${bucketName} is in region ${bucketConfig.region}`);
      } catch (error) {
        console.warn(`Configuration: Could not detect region for bucket ${bucketName}:`, error.message);
        bucketConfig.region = config.regions.primary; // Fallback to primary region
      }
    }

    // Validate configuration
    const validation = this.validateConfiguration(config);
    if (!validation.isValid) {
      throw new Error(`Invalid S3 configuration: ${validation.errors.join(', ')}`);
    }

    this.config = config;
    this.lastConfigLoad = Date.now();
    
    return config;
  }

  /**
   * Get current configuration, loading if necessary
   * @returns {Promise<Object>} Current configuration
   */
  async getConfiguration() {
    if (!this.config || this.shouldReloadConfig()) {
      await this.loadConfiguration();
    }
    return this.config;
  }

  /**
   * Get bucket region from configuration
   * @param {string} bucketName - Name of the bucket
   * @returns {Promise<string>} Bucket region
   */
  async getBucketRegion(bucketName) {
    const config = await this.getConfiguration();
    const bucketConfig = config.buckets[bucketName];
    
    if (!bucketConfig) {
      throw new Error(`Unknown bucket: ${bucketName}`);
    }
    
    return bucketConfig.region;
  }

  /**
   * Validate bucket access in specified region
   * @param {string} bucketName - Name of the bucket
   * @param {string} region - AWS region
   * @returns {Promise<boolean>} True if accessible
   */
  async validateBucketAccess(bucketName, region) {
    try {
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({ region, signatureVersion: 'v4' });
      
      await s3.headBucket({ Bucket: bucketName }).promise();
      return true;
    } catch (error) {
      console.warn(`Bucket access validation failed for ${bucketName} in ${region}:`, error.message);
      return false;
    }
  }

  /**
   * Get optimal region for user location and bucket
   * @param {string} userLocation - User's location
   * @param {string} bucketName - Bucket name
   * @returns {Promise<string>} Optimal region
   */
  async getOptimalRegion(userLocation, bucketName) {
    const config = await this.getConfiguration();
    
    // If bucket has a specific region, use that
    if (bucketName && config.buckets[bucketName]) {
      return config.buckets[bucketName].region;
    }
    
    // Otherwise, find optimal region for user
    return this.regionResolver.getOptimalRegionForUser(userLocation, config.regions.fallback);
  }

  /**
   * Validate S3 configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result
   */
  validateConfiguration(config) {
    const errors = [];

    // Validate buckets
    if (!config.buckets || Object.keys(config.buckets).length === 0) {
      errors.push('At least one bucket must be configured');
    }

    // Validate upload settings
    if (config.upload) {
      if (config.upload.maxFileSize <= 0) {
        errors.push('maxFileSize must be positive');
      }
      
      if (!Array.isArray(config.upload.allowedContentTypes) || config.upload.allowedContentTypes.length === 0) {
        errors.push('allowedContentTypes must be a non-empty array');
      }
      
      if (config.upload.expirySeconds <= 0) {
        errors.push('expirySeconds must be positive');
      }
    }

    // Validate regions
    if (!config.regions || !config.regions.primary) {
      errors.push('Primary region must be specified');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if configuration should be reloaded
   * @returns {boolean} True if reload is needed
   */
  shouldReloadConfig() {
    if (!this.lastConfigLoad) {
      return true;
    }
    
    return Date.now() - this.lastConfigLoad > this.configReloadInterval;
  }

  /**
   * Force configuration reload
   * @returns {Promise<Object>} Reloaded configuration
   */
  async reloadConfiguration() {
    this.config = null;
    this.lastConfigLoad = null;
    return await this.loadConfiguration();
  }

  /**
   * Get bucket configuration by name
   * @param {string} bucketName - Name of the bucket
   * @returns {Promise<Object>} Bucket configuration
   */
  async getBucketConfig(bucketName) {
    const config = await this.getConfiguration();
    return config.buckets[bucketName] || null;
  }

  /**
   * Get all configured buckets
   * @returns {Promise<Object>} All bucket configurations
   */
  async getAllBuckets() {
    const config = await this.getConfiguration();
    return config.buckets;
  }
}

module.exports = S3ConfigurationManager;