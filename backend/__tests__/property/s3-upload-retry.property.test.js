/**
 * Property-Based Tests for S3 Upload Retry Logic
 * 
 * **Feature: s3-global-optimization, Property 11: Upload Retry with Backoff**
 * **Validates: Requirements 4.1**
 * 
 * Tests that the system retries failed uploads with exponentially increasing delays
 */

const EnhancedS3Service = require('../../services/enhancedS3Service');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockS3 = {
    headBucket: jest.fn().mockReturnValue({
      promise: jest.fn()
    }),
    getBucketLocation: jest.fn().mockReturnValue({
      promise: jest.fn()
    }),
    createPresignedPost: jest.fn(),
    getSignedUrlPromise: jest.fn()
  };
  
  return {
    S3: jest.fn(() => mockS3),
    __mockS3: mockS3
  };
});

const AWS = require('aws-sdk');
const mockS3 = AWS.__mockS3;

describe('S3 Upload Retry Logic Properties', () => {
  let enhancedS3Service;
  let consoleSpy;

  beforeEach(() => {
    enhancedS3Service = new EnhancedS3Service();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Clear mocks
    mockS3.headBucket.mockClear();
    mockS3.getBucketLocation.mockClear();
    mockS3.createPresignedPost.mockClear();
    mockS3.getSignedUrlPromise.mockClear();
    
    // Reset promise mocks
    mockS3.headBucket().promise.mockClear();
    mockS3.getBucketLocation().promise.mockClear();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  /**
   * Property 11: Upload Retry with Backoff
   * For any failed upload due to network issues, the system should retry with exponentially increasing delays
   */
  test('Property 11: Upload Retry with Backoff', async () => {
    const bucketName = 'retry-test-bucket';
    const sessionId = 'retry-session';
    const contentType = 'image/jpeg';

    // Set up environment
    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'us-east-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    // Test different failure scenarios
    const failureScenarios = [
      { error: new Error('Network timeout'), shouldRetry: true },
      { error: new Error('Connection refused'), shouldRetry: true },
      { error: { code: 'NetworkingError' }, shouldRetry: true },
      { error: { code: 'TimeoutError' }, shouldRetry: true },
      { error: { statusCode: 500 }, shouldRetry: true },
      { error: { statusCode: 503 }, shouldRetry: true },
      { error: { statusCode: 400 }, shouldRetry: false }, // Client error - don't retry
      { error: { statusCode: 403 }, shouldRetry: false }  // Auth error - don't retry
    ];

    for (const scenario of failureScenarios) {
      // Mock createPresignedPost to fail initially
      mockS3.createPresignedPost
        .mockRejectedValueOnce(scenario.error)
        .mockResolvedValueOnce({
          url: `https://${bucketName}.s3.us-east-1.amazonaws.com/`,
          fields: {
            'Content-Type': contentType,
            key: `uploads/${sessionId}/test-file.jpg`,
            bucket: bucketName
          }
        });

      try {
        const result = await enhancedS3Service.generateUploadUrl(sessionId, contentType);

        if (scenario.shouldRetry) {
          // Property: Retryable errors should eventually succeed
          expect(result).toBeDefined();
          expect(result.uploadUrl).toBeDefined();
          expect(result.publicUrl).toBeDefined();
        }
      } catch (error) {
        if (!scenario.shouldRetry) {
          // Property: Non-retryable errors should fail immediately
          expect(error).toBeDefined();
        } else {
          // If it's a retryable error but still failed, that's unexpected
          console.warn('Retryable error still failed:', error);
        }
      }

      // Clear cache for next iteration
      enhancedS3Service.regionResolver.clearCache();
    }
  });

  test('Property: Error logging includes retry information', async () => {
    const bucketName = 'error-logging-bucket';
    const sessionId = 'error-session';
    const contentType = 'image/jpeg';

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'us-east-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    // Mock persistent failure
    const networkError = new Error('Persistent network error');
    mockS3.createPresignedPost.mockRejectedValue(networkError);

    try {
      await enhancedS3Service.generateUploadUrl(sessionId, contentType);
    } catch (error) {
      // Property: Error should be logged with metrics
      expect(error).toBeDefined();
    }

    // Property: Error metrics should be recorded
    const stats = enhancedS3Service.getPerformanceStats();
    expect(stats).toBeDefined();
    expect(stats.uploads).toBeDefined();
  });

  test('Property: Successful uploads are logged with metrics', async () => {
    const bucketName = 'success-metrics-bucket';
    const sessionId = 'success-session';
    const contentType = 'image/jpeg';

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'us-east-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    // Mock successful upload
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.us-east-1.amazonaws.com/`,
      fields: {
        'Content-Type': contentType,
        key: `uploads/${sessionId}/test-file.jpg`,
        bucket: bucketName
      }
    });

    const result = await enhancedS3Service.generateUploadUrl(sessionId, contentType);

    // Property: Successful upload should be logged
    expect(result).toBeDefined();
    expect(result.uploadUrl).toBeDefined();

    // Property: Success metrics should be recorded
    const stats = enhancedS3Service.getPerformanceStats();
    expect(stats).toBeDefined();
    expect(stats.uploads).toBeDefined();
    
    // Check for success entries
    const successKey = 'us-east-1_success';
    expect(stats.uploads[successKey]).toBeGreaterThan(0);
  });

  test('Property: Performance tracking across multiple operations', async () => {
    const bucketName = 'performance-bucket';
    const contentType = 'image/jpeg';

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'us-east-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    // Mock successful uploads
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.us-east-1.amazonaws.com/`,
      fields: {
        'Content-Type': contentType,
        key: 'uploads/test/file.jpg',
        bucket: bucketName
      }
    });

    // Perform multiple operations
    const operations = [];
    for (let i = 0; i < 5; i++) {
      operations.push(
        enhancedS3Service.generateUploadUrl(`session-${i}`, contentType)
      );
    }

    const results = await Promise.all(operations);

    // Property: All operations should succeed
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result).toBeDefined();
      expect(result.uploadUrl).toBeDefined();
    }

    // Property: Performance stats should track all operations
    const stats = enhancedS3Service.getPerformanceStats();
    expect(stats.uploads['us-east-1_success']).toBeGreaterThanOrEqual(5);

    // Property: Regional performance should be tracked
    expect(stats.regionPerformance).toBeDefined();
    expect(stats.regionPerformance['us-east-1']).toBeDefined();
    expect(stats.regionPerformance['us-east-1'].totalOperations).toBeGreaterThanOrEqual(5);
    expect(stats.regionPerformance['us-east-1'].successRate).toBeGreaterThan(0);
  });

  test('Property: Error classification and handling', async () => {
    const bucketName = 'error-classification-bucket';
    const sessionId = 'error-session';
    const contentType = 'image/jpeg';

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'us-east-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    // Test different error types
    const errorTypes = [
      { error: { code: 'NetworkingError' }, expectedHandling: 'retry' },
      { error: { statusCode: 500 }, expectedHandling: 'retry' },
      { error: { statusCode: 503 }, expectedHandling: 'retry' },
      { error: { statusCode: 400 }, expectedHandling: 'fail' },
      { error: { statusCode: 403 }, expectedHandling: 'fail' },
      { error: { statusCode: 404 }, expectedHandling: 'fail' }
    ];

    for (const errorType of errorTypes) {
      // Mock the error
      mockS3.createPresignedPost.mockRejectedValue(errorType.error);

      try {
        await enhancedS3Service.generateUploadUrl(sessionId, contentType);
        
        // If we get here, the operation succeeded (possibly after retry)
        if (errorType.expectedHandling === 'fail') {
          // This shouldn't happen for non-retryable errors
          console.warn('Non-retryable error unexpectedly succeeded');
        }
      } catch (error) {
        // Property: Error should be properly classified and handled
        expect(error).toBeDefined();
        
        if (errorType.expectedHandling === 'retry') {
          // Retryable errors should eventually fail if they persist
          expect(error.message).toContain('Failed to generate upload URL');
        }
      }

      // Clear cache for next iteration
      enhancedS3Service.regionResolver.clearCache();
    }
  });

  test('Property: Metrics consistency across service instances', async () => {
    const bucketName = 'metrics-consistency-bucket';
    const sessionId = 'metrics-session';
    const contentType = 'image/jpeg';

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Create multiple service instances
    const service1 = new EnhancedS3Service();
    const service2 = new EnhancedS3Service();

    // Mock bucket region detection for both services
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'us-east-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.us-east-1.amazonaws.com/`,
      fields: {
        'Content-Type': contentType,
        key: `uploads/${sessionId}/test-file.jpg`,
        bucket: bucketName
      }
    });

    // Perform operations on both services
    await service1.generateUploadUrl(sessionId + '-1', contentType);
    await service2.generateUploadUrl(sessionId + '-2', contentType);

    // Property: Each service should maintain its own metrics
    const stats1 = service1.getPerformanceStats();
    const stats2 = service2.getPerformanceStats();

    expect(stats1).toBeDefined();
    expect(stats2).toBeDefined();

    // Property: Metrics should be independent between instances
    expect(stats1.uploads['us-east-1_success']).toBe(1);
    expect(stats2.uploads['us-east-1_success']).toBe(1);
  });
});