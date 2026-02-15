# Design Document: S3 Global Optimization

## Overview

This design addresses the critical S3 region mismatch issue in the Wishlize demo application and implements a globally optimized solution. The current problem stems from the S3 bucket being in us-east-1 while the application is configured for ap-south-1, causing CORS-blocked 301 redirects.

The solution implements a multi-region S3 strategy with intelligent region detection, proper configuration management, and global performance optimization through CloudFront CDN integration.

## Architecture

### Current Architecture Issues
- Hardcoded region configuration (ap-south-1) in S3 service
- Bucket "wishlize-uploads" exists in us-east-1
- Mismatch causes 301 redirects that browsers block due to CORS policy
- No global optimization for international users

### Proposed Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API    │    │   AWS S3        │
│   Upload Widget │───▶│   S3 Service     │───▶│   Multi-Region  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Configuration  │    │   CloudFront    │
                       │   Manager        │    │   CDN           │
                       └──────────────────┘    └─────────────────┘
```

### Key Components
1. **Enhanced S3 Service**: Intelligent region detection and configuration
2. **Configuration Manager**: Centralized S3 settings with validation
3. **Region Resolver**: Determines optimal region based on bucket location and user geography
4. **CDN Integration**: CloudFront for global content delivery
5. **Monitoring Service**: Performance and error tracking

## Components and Interfaces

### S3ConfigurationManager
```javascript
class S3ConfigurationManager {
  constructor(config)
  
  // Core methods
  getBucketRegion(bucketName): Promise<string>
  validateBucketAccess(bucketName, region): Promise<boolean>
  getOptimalRegion(userLocation, bucketName): Promise<string>
  
  // Configuration
  loadConfiguration(): Promise<S3Config>
  validateConfiguration(config): ValidationResult
}
```

### EnhancedS3Service
```javascript
class EnhancedS3Service {
  constructor(configManager)
  
  // Upload operations
  generateUploadUrl(sessionId, contentType, userLocation): Promise<UploadUrlData>
  generatePresignedPost(params): Promise<PresignedPostData>
  
  // Region management
  resolveRegionForBucket(bucketName): Promise<string>
  createRegionalS3Client(region): AWS.S3
  
  // Monitoring
  logUploadMetrics(region, success, duration): void
  trackRegionPerformance(region, operation, metrics): void
}
```

### RegionResolver
```javascript
class RegionResolver {
  // Determine bucket's actual region
  detectBucketRegion(bucketName): Promise<string>
  
  // Geographic optimization
  getOptimalRegionForUser(userLocation, availableRegions): string
  calculateLatency(userLocation, region): number
  
  // Caching
  cacheBucketRegion(bucketName, region): void
  getCachedBucketRegion(bucketName): string | null
}
```

### CDNManager
```javascript
class CDNManager {
  // CloudFront integration
  getCloudFrontUrl(s3Url): string
  invalidateCache(paths): Promise<void>
  
  // Performance optimization
  optimizeForGlobalAccess(bucketName): Promise<CloudFrontDistribution>
}
```

## Data Models

### S3Configuration
```javascript
interface S3Configuration {
  buckets: {
    [bucketName: string]: {
      region: string;
      purpose: 'upload' | 'results' | 'cdn';
      cloudFrontDistribution?: string;
    }
  };
  
  regions: {
    primary: string;
    fallback: string[];
    userRegionMapping: { [userRegion: string]: string };
  };
  
  upload: {
    maxFileSize: number;
    allowedContentTypes: string[];
    expirySeconds: number;
  };
  
  monitoring: {
    enableMetrics: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
  };
}
```

### UploadUrlData
```javascript
interface UploadUrlData {
  uploadUrl: string;
  publicUrl: string;
  cdnUrl?: string;
  fields: { [key: string]: string };
  key: string;
  bucket: string;
  region: string;
  expiresIn: number;
  maxFileSize: number;
  contentType: string;
}
```

### RegionMetrics
```javascript
interface RegionMetrics {
  region: string;
  operation: 'upload' | 'download' | 'presign';
  success: boolean;
  duration: number;
  timestamp: Date;
  userLocation?: string;
  errorCode?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Region Endpoint Correctness
*For any* upload request and bucket name, the S3 service should generate URLs that point to the bucket's actual region endpoint
**Validates: Requirements 1.1, 1.2**

### Property 2: No Redirect Generation
*For any* valid upload request, the system should generate URLs that do not trigger 301 redirects when accessed
**Validates: Requirements 1.3**

### Property 3: Region Mismatch Detection and Correction
*For any* configuration with region mismatches, the S3 service should detect the mismatch, log an error, and use the correct region
**Validates: Requirements 1.4**

### Property 4: Geographic Region Selection
*For any* user location and available regions, the S3 service should select a region that optimizes for that user's geographic location
**Validates: Requirements 2.2**

### Property 5: Multi-Region Support
*For any* set of AWS regions, the system should be able to handle upload operations across all specified regions
**Validates: Requirements 2.3**

### Property 6: Global Content Accessibility
*For any* uploaded content, it should be accessible from multiple geographic regions after upload completion
**Validates: Requirements 2.4**

### Property 7: Configuration Source Consistency
*For any* configuration read operation, all bucket settings should come from the same configuration source
**Validates: Requirements 3.1**

### Property 8: Region-Bucket Validation
*For any* bucket and region combination, the system should validate that the region matches the bucket's actual location
**Validates: Requirements 3.2**

### Property 9: Environment Configuration Support
*For any* environment (dev, staging, prod), the system should support different S3 configurations without code changes
**Validates: Requirements 3.3**

### Property 10: Dynamic Configuration Reload
*For any* configuration change, the S3 service should pick up new settings without requiring a service restart
**Validates: Requirements 3.4**

### Property 11: Upload Retry with Backoff
*For any* failed upload due to network issues, the system should retry with exponentially increasing delays
**Validates: Requirements 4.1**

### Property 12: Clear Error Messages
*For any* upload failure scenario, the system should provide specific, actionable error messages to users
**Validates: Requirements 4.2**

### Property 13: Upload Validation
*For any* upload operation, the S3 service should verify successful completion before confirming success to the client
**Validates: Requirements 4.3**

### Property 14: Multipart Upload for Large Files
*For any* file above the size threshold, the system should automatically use multipart upload for improved reliability
**Validates: Requirements 4.4**

### Property 15: Presigned URL Expiration
*For any* generated presigned URL, it should have an appropriate expiration time that balances security and usability
**Validates: Requirements 5.1**

### Property 16: File Type Enforcement
*For any* upload URL generation request, only allowed file types should receive valid upload URLs
**Validates: Requirements 5.2**

### Property 17: File Size Limits
*For any* file upload attempt, files exceeding the configured size limit should be rejected
**Validates: Requirements 5.3**

### Property 18: Proper Upload Permissions
*For any* successful file upload, the uploaded file should have correct permissions for public read access
**Validates: Requirements 5.4**

### Property 19: Comprehensive Upload Logging
*For any* upload attempt, the system should log the operation with region, performance metrics, and outcome
**Validates: Requirements 6.1**

### Property 20: CORS Error Diagnostics
*For any* CORS error occurrence, the system should log detailed diagnostic information including headers and configuration
**Validates: Requirements 6.2**

### Property 21: Regional Success Rate Tracking
*For any* region with upload activity, the system should maintain accurate success rate statistics
**Validates: Requirements 6.3**

### Property 22: Configuration Issue Alerting
*For any* detected configuration problem, the system should generate appropriate administrator alerts
**Validates: Requirements 6.4**

### Property 23: API Interface Compatibility
*For any* existing S3 service method call, the updated service should maintain the same interface and behavior
**Validates: Requirements 7.1**

### Property 24: Existing Content Access Preservation
*For any* previously uploaded content, it should remain accessible after the system update
**Validates: Requirements 7.4**

## Error Handling

### Region Mismatch Recovery
- Detect region mismatches through AWS SDK error responses
- Automatically resolve correct region using AWS S3 head-bucket operation
- Cache resolved regions to avoid repeated lookups
- Log all region corrections for monitoring

### CORS Error Prevention
- Validate bucket region before generating URLs
- Use region-specific S3 endpoints consistently
- Implement preflight request handling for complex CORS scenarios
- Provide fallback mechanisms for edge cases

### Network Failure Resilience
- Implement exponential backoff for transient failures
- Circuit breaker pattern for persistent regional issues
- Graceful degradation to alternative regions when available
- Comprehensive error classification and handling

### Configuration Validation
- Validate all S3 configurations at startup
- Continuous health checks for bucket accessibility
- Automatic failover to backup configurations
- Real-time configuration validation on changes

## Testing Strategy

### Dual Testing Approach
The testing strategy combines unit tests for specific scenarios and property-based tests for comprehensive coverage:

**Unit Tests Focus:**
- Specific error scenarios (CORS, region mismatch, network failures)
- Integration points between components
- Edge cases in configuration validation
- Specific bucket and region combinations

**Property-Based Tests Focus:**
- Universal properties across all regions and buckets
- Comprehensive input coverage through randomization
- Correctness properties validation
- Performance characteristics across different scenarios

### Property-Based Testing Configuration
- Use **fast-check** library for JavaScript property-based testing
- Configure minimum 100 iterations per property test
- Each property test references its design document property
- Tag format: **Feature: s3-global-optimization, Property {number}: {property_text}**

### Test Environment Setup
- Mock AWS services for unit testing
- Use LocalStack for integration testing
- Test against multiple AWS regions in staging
- Validate CORS behavior across different browsers

### Performance Testing
- Measure upload latency across regions
- Test with various file sizes and types
- Validate CDN performance improvements
- Monitor success rates by geographic location

### Security Testing
- Validate presigned URL security
- Test file type and size restrictions
- Verify proper access controls
- Test against malicious upload attempts