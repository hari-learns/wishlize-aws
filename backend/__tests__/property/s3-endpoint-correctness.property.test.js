/**
 * Property-Based Tests for S3 Endpoint Correctness
 * 
 * **Feature: s3-global-optimization, Property 1: Region Endpoint Correctness**
 * **Validates: Requirements 1.1, 1.2**
 * 
 * Tests that the S3 service generates URLs that point to the bucket's actual region endpoint
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
    getSignedUrlPromise: jest.fn()
  };
  
  return {
    S3: jest.fn(() => mockS3),
    __mockS3: mockS3
  };
});

const AWS = require('aws-sdk');
const mockS3 = AWS.__mockS3;

describe('S3 Endpoint Correctness Properties', () => {
  let consoleSpy;

  beforeEach(() => {
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
   * Property 1: Region Endpoint Correctness
   * For any upload request and bucket name, the S3 service should generate URLs 
   * that point to the bucket's actual region endpoint
   */
  test('Property 1: Region Endpoint Correctness', async () => {
    const bucketName = 'wishlize-uploads';
    const actualRegion = 'us-east-1';
    const sessionId = 'test-session';
    const contentType = 'image/jpeg';

    // Set environment variables
    process.env.S3_UPLOAD_BUCKET = bucketName;
    process.env.AWS_REGION = 'ap-south-1'; // Different from actual to test correction

    // Mock bucket region detection
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

    // Mock presigned POST creation
    const mockPresignedPost = {
      url: `https://${bucketName}.s3.${actualRegion}.amazonaws.com/`,
      fields: {
        'Content-Type': contentType,
        key: `uploads/${sessionId}/test-file.jpg`,
        bucket: bucketName
      }
    };
    mockS3.createPresignedPost.mockResolvedValue(mockPresignedPost);

    // Generate upload URL
    const result = await s3Service.generateUploadUrl(sessionId, contentType);

    // Property: Upload URL should point to the correct region
    expect(result.uploadUrl).toContain(actualRegion);
    expect(result.uploadUrl).toBe(mockPresignedPost.url);

    // Property: Public URL should use the correct region endpoint
    expect(result.publicUrl).toContain(actualRegion);
    expect(result.publicUrl).toMatch(new RegExp(`https://${bucketName}\\.s3\\.${actualRegion}\\.amazonaws\\.com/`));

    // Property: Region in response should match actual bucket region
    expect(result.region).toBe(actualRegion);

    // Property: Bucket in response should match the bucket name
    expect(result.bucket).toBe(bucketName);

    // Property: URLs should not contain the misconfigured region
    expect(result.uploadUrl).not.toContain('ap-south-1');
    expect(result.publicUrl).not.toContain('ap-south-1');
  });

  test('Property: Different regions produce different endpoints', async () => {
    const testCases = [
      { region: 'us-east-1', bucketName: 'test-bucket-us' },
      { region: 'eu-west-1', bucketName: 'test-bucket-eu' },
      { region: 'ap-south-1', bucketName: 'test-bucket-ap' }
    ];

    for (const { region, bucketName } of testCases) {
      process.env.S3_UPLOAD_BUCKET = bucketName;

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
        url: `https://${bucketName}.s3.${region}.amazonaws.com/`,
        fields: {
          'Content-Type': 'image/jpeg',
          key: 'uploads/test/file.jpg',
          bucket: bucketName
        }
      });

      const result = await s3Service.generateUploadUrl('test-session', 'image/jpeg');

      // Property: Each region should produce URLs with that region
      expect(result.uploadUrl).toContain(region);
      expect(result.publicUrl).toContain(region);
      expect(result.region).toBe(region);

      // Clear cache for next iteration
      const enhancedService = s3Service.getEnhancedS3Service();
      enhancedService.regionResolver.clearCache();
    }
  });

  test('Property: View URL uses correct region', async () => {
    const bucketName = 'wishlize-results';
    const actualRegion = 'eu-west-1';
    const key = 'results/test/image.jpg';

    // Mock bucket region detection
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
      LocationConstraint: actualRegion
    });

    // Mock signed URL generation
    const expectedUrl = `https://${bucketName}.s3.${actualRegion}.amazonaws.com/${key}?signature=test`;
    mockS3.getSignedUrlPromise.mockResolvedValue(expectedUrl);

    // Generate view URL
    const viewUrl = await s3Service.generateViewUrl(key, bucketName);

    // Property: View URL should use the correct region
    expect(viewUrl).toContain(actualRegion);
    expect(viewUrl).toBe(expectedUrl);

    // Property: Should not contain wrong regions
    expect(viewUrl).not.toContain('us-east-1');
    expect(viewUrl).not.toContain('ap-south-1');
  });

  test('Property: Consistent region detection across calls', async () => {
    const bucketName = 'consistency-test';
    const actualRegion = 'us-east-1';

    // Mock bucket region detection
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
      LocationConstraint: null
    });

    // Mock S3 operations
    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.${actualRegion}.amazonaws.com/`,
      fields: { 'Content-Type': 'image/jpeg', key: 'test.jpg', bucket: bucketName }
    });

    mockS3.getSignedUrlPromise.mockResolvedValue(
      `https://${bucketName}.s3.${actualRegion}.amazonaws.com/test.jpg?signature=test`
    );

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Perform multiple operations
    const uploadResult1 = await s3Service.generateUploadUrl('session1', 'image/jpeg');
    const uploadResult2 = await s3Service.generateUploadUrl('session2', 'image/jpeg');
    const viewUrl = await s3Service.generateViewUrl('test.jpg', bucketName);

    // Property: All operations should detect the same region
    expect(uploadResult1.region).toBe(actualRegion);
    expect(uploadResult2.region).toBe(actualRegion);
    expect(viewUrl).toContain(actualRegion);

    // Property: Region detection should be cached (headBucket called only once)
    expect(mockS3.headBucket).toHaveBeenCalledTimes(1);
  });

  test('Property: Error handling maintains endpoint correctness', async () => {
    const bucketName = 'error-test-bucket';
    const actualRegion = 'eu-west-1';

    // Mock initial failure, then success
    mockS3.headBucket().promise
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        $response: {
          httpResponse: {
            headers: {
              'x-amz-bucket-region': actualRegion
            }
          }
        }
      });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: actualRegion
    });

    mockS3.createPresignedPost.mockResolvedValue({
      url: `https://${bucketName}.s3.${actualRegion}.amazonaws.com/`,
      fields: { 'Content-Type': 'image/jpeg', key: 'test.jpg', bucket: bucketName }
    });

    process.env.S3_UPLOAD_BUCKET = bucketName;

    // First call should fail gracefully and use fallback
    const result1 = await s3Service.generateUploadUrl('session1', 'image/jpeg');
    
    // Should still work with fallback region
    expect(result1.uploadUrl).toBeDefined();
    expect(result1.publicUrl).toBeDefined();

    // Clear cache to force re-detection
    const enhancedService = s3Service.getEnhancedS3Service();
    enhancedService.regionResolver.clearCache();

    // Second call should succeed with correct region
    const result2 = await s3Service.generateUploadUrl('session2', 'image/jpeg');
    expect(result2.region).toBe(actualRegion);
    expect(result2.uploadUrl).toContain(actualRegion);
  });
});