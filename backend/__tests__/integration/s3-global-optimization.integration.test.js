/**
 * Integration Tests for S3 Global Optimization
 * 
 * Tests end-to-end upload flows, CORS prevention, and multi-region functionality
 * **Validates: Requirements 1.3, 2.4**
 */

const s3Service = require('../../services/s3Service');

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
    getSignedUrlPromise: jest.fn(),
    deleteObject: jest.fn().mockReturnValue({
      promise: jest.fn()
    })
  };
  
  return {
    S3: jest.fn(() => mockS3),
    __mockS3: mockS3
  };
});

const AWS = require('aws-sdk');
const mockS3 = AWS.__mockS3;

describe('S3 Global Optimization Integration Tests', () => {
  let consoleSpy;
  let originalEnv;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear mocks
    mockS3.headBucket.mockClear();
    mockS3.getBucketLocation.mockClear();
    mockS3.createPresignedPost.mockClear();
    mockS3.getSignedUrlPromise.mockClear();
    mockS3.deleteObject.mockClear();
    
    // Reset promise mocks
    mockS3.headBucket().promise.mockClear();
    mockS3.getBucketLocation().promise.mockClear();
    mockS3.deleteObject().promise.mockClear();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
    
    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * Integration Test: End-to-end upload flow with region correction
   * Validates: Requirements 1.3 (no 301 redirects)
   */
  test('End-to-end upload flow prevents CORS redirects', async () => {
    const bucketName = 'wishlize-uploads';
    const actualRegion = 'us-east-1';
    const configuredRegion = 'ap-south-1'; // Different from actual
    const sessionId = 'integration-test-session';
    const contentType = 'image/jpeg';

    // Set up environment to simulate the original problem
    process.env.S3_UPLOAD_BUCKET = bucketName;
    process.env.AWS_REGION = configuredRegion; // Misconfigured region

    // Mock bucket region detection (bucket is actually in us-east-1)
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': actualRegion
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null // us-east-1 returns null
    });

    // Mock successful presigned POST creation
    const expectedUploadUrl = `https://${bucketName}.s3.${actualRegion}.amazonaws.com/`;
    mockS3.createPresignedPost.mockResolvedValue({
      url: expectedUploadUrl,
      fields: {
        'Content-Type': contentType,
        key: `uploads/${sessionId}/test-file.jpg`,
        bucket: bucketName,
        'x-amz-meta-session-id': sessionId
      }
    });

    // Generate upload URL
    const result = await s3Service.generateUploadUrl(sessionId, contentType);

    // Integration Test: System should detect region mismatch and use correct region
    expect(result.region).toBe(actualRegion);
    expect(result.region).not.toBe(configuredRegion);

    // Integration Test: URLs should point to correct region (no redirects)
    expect(result.uploadUrl).toBe(expectedUploadUrl);
    expect(result.uploadUrl).toContain(actualRegion);
    expect(result.publicUrl).toContain(actualRegion);

    // Integration Test: URLs should not contain misconfigured region
    expect(result.uploadUrl).not.toContain(configuredRegion);
    expect(result.publicUrl).not.toContain(configuredRegion);

    // Integration Test: Response should include all required fields
    expect(result).toHaveProperty('uploadUrl');
    expect(result).toHaveProperty('publicUrl');
    expect(result).toHaveProperty('fields');
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('bucket');
    expect(result).toHaveProperty('region');
    expect(result).toHaveProperty('expiresIn');
    expect(result).toHaveProperty('maxFileSize');
    expect(result).toHaveProperty('contentType');
  });

  /**
   * Integration Test: Multi-region functionality
   * Validates: Requirements 2.4 (global accessibility)
   */
  test('Multi-region functionality works correctly', async () => {
    const testRegions = [
      { region: 'us-east-1', bucket: 'test-bucket-us' },
      { region: 'eu-west-1', bucket: 'test-bucket-eu' },
      { region: 'ap-south-1', bucket: 'test-bucket-ap' }
    ];

    for (const { region, bucket } of testRegions) {
      // Set up environment for this region
      process.env.S3_UPLOAD_BUCKET = bucket;
      process.env.AWS_REGION = region;

      // Mock bucket region detection
      mockS3.headBucket().promise.mockResolvedValue({
        $response: {
          httpResponse: {
            headers: {
              'x-amz-bucket-region': region
            }
          }
        }
      });

      const locationConstraint = region === 'us-east-1' ? null : region;
      mockS3.getBucketLocation().promise.mockResolvedValue({
        LocationConstraint: locationConstraint
      });

      // Mock presigned POST creation
      mockS3.createPresignedPost.mockResolvedValue({
        url: `https://${bucket}.s3.${region}.amazonaws.com/`,
        fields: {
          'Content-Type': 'image/jpeg',
          key: 'uploads/test/file.jpg',
          bucket: bucket
        }
      });

      // Generate upload URL
      const result = await s3Service.generateUploadUrl('test-session', 'image/jpeg');

      // Integration Test: Each region should work correctly
      expect(result.region).toBe(region);
      expect(result.bucket).toBe(bucket);
      expect(result.uploadUrl).toContain(region);
      expect(result.publicUrl).toContain(region);

      // Clear cache for next iteration
      const enhancedService = s3Service.getEnhancedS3Service();
      enhancedService.regionResolver.clearCache();
    }
  });

  /**
   * Integration Test: Complete upload and view workflow
   */
  test('Complete upload and view workflow', async () => {
    const bucketName = 'workflow-test-bucket';
    const region = 'us-east-1';
    const sessionId = 'workflow-session';
    const contentType = 'image/jpeg';
    const uploadKey = `uploads/${sessionId}/test-image.jpg`;

    // Set up environment
    process.env.S3_UPLOAD_BUCKET = bucketName;
    process.env.S3_RESULTS_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': region
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: null
    });

    // Mock upload URL generation
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.${region}.amazonaws.com/`,
      fields: {
        'Content-Type': contentType,
        key: uploadKey,
        bucket: bucketName
      }
    });

    // Mock view URL generation
    const expectedViewUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${uploadKey}?signature=test`;
    mockS3.getSignedUrlPromise.mockResolvedValue(expectedViewUrl);

    // Step 1: Generate upload URL
    const uploadResult = await s3Service.generateUploadUrl(sessionId, contentType);
    expect(uploadResult).toBeDefined();
    expect(uploadResult.region).toBe(region);

    // Step 2: Generate view URL for the uploaded file
    const viewUrl = await s3Service.generateViewUrl(uploadKey, bucketName);
    expect(viewUrl).toBe(expectedViewUrl);
    expect(viewUrl).toContain(region);

    // Integration Test: Both operations should use the same region
    expect(uploadResult.uploadUrl).toContain(region);
    expect(viewUrl).toContain(region);
  });

  /**
   * Integration Test: Error handling and fallback behavior
   */
  test('Error handling and fallback behavior', async () => {
    const bucketName = 'error-test-bucket';
    const sessionId = 'error-session';
    const contentType = 'image/jpeg';

    process.env.S3_UPLOAD_BUCKET = bucketName;
    process.env.AWS_REGION = 'us-east-1';

    // Mock initial failure in region detection
    mockS3.headBucket().promise
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
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

    // Mock successful presigned POST after fallback
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.us-east-1.amazonaws.com/`,
      fields: {
        'Content-Type': contentType,
        key: `uploads/${sessionId}/test-file.jpg`,
        bucket: bucketName
      }
    });

    // First call should use fallback region
    const result1 = await s3Service.generateUploadUrl(sessionId + '-1', contentType);
    expect(result1).toBeDefined();
    expect(result1.uploadUrl).toBeDefined();

    // Clear cache to force re-detection
    const enhancedService = s3Service.getEnhancedS3Service();
    enhancedService.regionResolver.clearCache();

    // Second call should succeed with proper region detection
    const result2 = await s3Service.generateUploadUrl(sessionId + '-2', contentType);
    expect(result2).toBeDefined();
    expect(result2.region).toBe('us-east-1');
  });

  /**
   * Integration Test: Backward compatibility with existing code
   */
  test('Backward compatibility with existing API', async () => {
    const bucketName = 'compatibility-bucket';
    const sessionId = 'compat-session';
    const contentType = 'image/jpeg';
    const testKey = 'test/compatibility.jpg';

    process.env.S3_UPLOAD_BUCKET = bucketName;
    process.env.S3_RESULTS_BUCKET = bucketName;

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

    // Mock all S3 operations
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.us-east-1.amazonaws.com/`,
      fields: { 'Content-Type': contentType, key: testKey, bucket: bucketName }
    });

    mockS3.getSignedUrlPromise.mockResolvedValue(
      `https://${bucketName}.s3.us-east-1.amazonaws.com/${testKey}?signature=test`
    );

    mockS3.deleteObject().promise.mockResolvedValue({});

    // Test all existing API methods
    const uploadResult = await s3Service.generateUploadUrl(sessionId, contentType);
    const viewUrl = await s3Service.generateViewUrl(testKey, bucketName);
    const putUrl = await s3Service.generatePutUrl(testKey, bucketName);
    const deleteResult = await s3Service.deleteObject(testKey, bucketName);

    // Integration Test: All methods should work with enhanced functionality
    expect(uploadResult).toBeDefined();
    expect(uploadResult).toHaveProperty('uploadUrl');
    expect(uploadResult).toHaveProperty('publicUrl');
    expect(uploadResult).toHaveProperty('region'); // New field

    expect(viewUrl).toBeDefined();
    expect(typeof viewUrl).toBe('string');

    expect(putUrl).toBeDefined();
    expect(typeof putUrl).toBe('string');

    expect(deleteResult).toBe(true);

    // Integration Test: All operations should use the same region
    expect(uploadResult.uploadUrl).toContain('us-east-1');
    expect(viewUrl).toContain('us-east-1');
    expect(putUrl).toContain('us-east-1');
  });

  /**
   * Integration Test: Configuration consistency across operations
   */
  test('Configuration consistency across operations', async () => {
    const bucketName = 'consistency-test-bucket';
    const region = 'eu-west-1';

    // Set up environment
    process.env.S3_UPLOAD_BUCKET = bucketName;
    process.env.S3_RESULTS_BUCKET = bucketName;
    process.env.AWS_REGION = region;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': region
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: region
    });

    // Mock S3 operations
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.${region}.amazonaws.com/`,
      fields: { 'Content-Type': 'image/jpeg', key: 'test.jpg', bucket: bucketName }
    });

    mockS3.getSignedUrlPromise.mockResolvedValue(
      `https://${bucketName}.s3.${region}.amazonaws.com/test.jpg?signature=test`
    );

    // Perform multiple operations
    const upload1 = await s3Service.generateUploadUrl('session1', 'image/jpeg');
    const upload2 = await s3Service.generateUploadUrl('session2', 'image/png');
    const viewUrl = await s3Service.generateViewUrl('test.jpg', bucketName);

    // Integration Test: All operations should use consistent configuration
    expect(upload1.region).toBe(region);
    expect(upload2.region).toBe(region);
    expect(viewUrl).toContain(region);

    // Integration Test: Configuration should be loaded only once (cached)
    expect(mockS3.headBucket).toHaveBeenCalledTimes(1);
  });
});