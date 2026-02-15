/**
 * Region Resolver
 * 
 * Handles AWS S3 bucket region detection and caching.
 * Resolves region mismatches to prevent CORS issues.
 */

const AWS = require('aws-sdk');

class RegionResolver {
  constructor() {
    this.regionCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Detect the actual region of an S3 bucket
   * @param {string} bucketName - Name of the S3 bucket
   * @returns {Promise<string>} The bucket's region
   */
  async detectBucketRegion(bucketName) {
    if (!bucketName) {
      throw new Error('Bucket name is required');
    }

    // Check cache first
    const cached = this.getCachedBucketRegion(bucketName);
    if (cached) {
      return cached;
    }

    try {
      // Use a generic S3 client (no region specified) to detect bucket region
      const s3 = new AWS.S3({ signatureVersion: 'v4' });
      
      // Use headBucket operation to get bucket region
      const response = await s3.headBucket({ Bucket: bucketName }).promise();
      
      // Extract region from response headers
      let region = 'us-east-1'; // Default region
      
      if (response && response.$response && response.$response.httpResponse) {
        const headers = response.$response.httpResponse.headers;
        if (headers['x-amz-bucket-region']) {
          region = headers['x-amz-bucket-region'];
        }
      }

      // If headBucket doesn't give us the region, try getBucketLocation
      if (region === 'us-east-1') {
        try {
          const locationResponse = await s3.getBucketLocation({ Bucket: bucketName }).promise();
          if (locationResponse.LocationConstraint) {
            region = locationResponse.LocationConstraint;
          }
          // Note: us-east-1 returns null/empty for LocationConstraint
        } catch (locationError) {
          console.warn(`Could not get bucket location for ${bucketName}:`, locationError.message);
        }
      }

      // Cache the result
      this.cacheBucketRegion(bucketName, region);
      
      console.log(`Detected region for bucket ${bucketName}: ${region}`);
      return region;

    } catch (error) {
      // If we get a 301 redirect error, extract region from error
      if (error.statusCode === 301 && error.region) {
        const region = error.region;
        this.cacheBucketRegion(bucketName, region);
        console.log(`Detected region from redirect for bucket ${bucketName}: ${region}`);
        return region;
      }

      // If bucket doesn't exist or access denied, throw error
      if (error.statusCode === 404) {
        throw new Error(`Bucket ${bucketName} does not exist`);
      }
      
      if (error.statusCode === 403) {
        throw new Error(`Access denied to bucket ${bucketName}`);
      }

      console.error(`Failed to detect region for bucket ${bucketName}:`, error);
      throw new Error(`Failed to detect bucket region: ${error.message}`);
    }
  }

  /**
   * Cache bucket region information
   * @param {string} bucketName - Name of the bucket
   * @param {string} region - AWS region
   */
  cacheBucketRegion(bucketName, region) {
    this.regionCache.set(bucketName, {
      region,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached bucket region if available and not expired
   * @param {string} bucketName - Name of the bucket
   * @returns {string|null} Cached region or null
   */
  getCachedBucketRegion(bucketName) {
    const cached = this.regionCache.get(bucketName);
    if (!cached) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.regionCache.delete(bucketName);
      return null;
    }

    return cached.region;
  }

  /**
   * Clear the region cache
   */
  clearCache() {
    this.regionCache.clear();
  }

  /**
   * Get optimal region for user based on geographic location
   * @param {string} userLocation - User's geographic location (country code or region)
   * @param {string[]} availableRegions - Available AWS regions
   * @returns {string} Optimal region
   */
  getOptimalRegionForUser(userLocation, availableRegions = ['us-east-1', 'eu-west-1', 'ap-south-1']) {
    if (!userLocation) {
      return availableRegions[0]; // Default to first available region
    }

    // Simple geographic mapping - can be enhanced with more sophisticated logic
    const regionMapping = {
      // North America
      'US': 'us-east-1',
      'CA': 'us-east-1',
      'MX': 'us-east-1',
      
      // Europe
      'GB': 'eu-west-1',
      'DE': 'eu-west-1',
      'FR': 'eu-west-1',
      'IT': 'eu-west-1',
      'ES': 'eu-west-1',
      'NL': 'eu-west-1',
      
      // Asia Pacific
      'IN': 'ap-south-1',
      'CN': 'ap-southeast-1',
      'JP': 'ap-northeast-1',
      'KR': 'ap-northeast-2',
      'AU': 'ap-southeast-2',
      'SG': 'ap-southeast-1'
    };

    const preferredRegion = regionMapping[userLocation.toUpperCase()];
    
    // Return preferred region if available, otherwise return first available
    return availableRegions.includes(preferredRegion) ? preferredRegion : availableRegions[0];
  }

  /**
   * Calculate approximate latency to a region (simplified)
   * @param {string} userLocation - User location
   * @param {string} region - AWS region
   * @returns {number} Estimated latency in milliseconds
   */
  calculateLatency(userLocation, region) {
    // Simplified latency calculation based on geographic distance
    // In a real implementation, this would use actual network measurements
    const latencyMap = {
      'us-east-1': { 'US': 50, 'EU': 150, 'AS': 200 },
      'eu-west-1': { 'US': 150, 'EU': 50, 'AS': 180 },
      'ap-south-1': { 'US': 200, 'EU': 180, 'AS': 50 }
    };

    const regionLatencies = latencyMap[region] || { 'US': 100, 'EU': 100, 'AS': 100 };
    
    // Determine user's continent
    let continent = 'US'; // Default
    if (['GB', 'DE', 'FR', 'IT', 'ES', 'NL'].includes(userLocation)) {
      continent = 'EU';
    } else if (['IN', 'CN', 'JP', 'KR', 'AU', 'SG'].includes(userLocation)) {
      continent = 'AS';
    }

    return regionLatencies[continent] || 100;
  }
}

module.exports = RegionResolver;