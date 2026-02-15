/**
 * Property-Based Tests for S3 Configuration Consistency
 * 
 * **Feature: s3-global-optimization, Property 7: Configuration Source Consistency**
 * **Validates: Requirements 3.1**
 * 
 * Tests that all bucket settings come from the same configuration source
 */

const S3ConfigurationManager = require('../../services/s3ConfigurationManager');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockS3 = {
    headBucket: jest.fn().mockReturnValue({
      promise: jest.fn()
    }),
    getBucketLocation: jest.fn().mockReturnValue({
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

describe('S3 Configuration Consistency Properties', () => {
  let configManager;
  let consoleSpy;
  let originalEnv;

  beforeEach(() => {
    configManager = new S3ConfigurationManager();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear mocks
    mockS3.headBucket.mockClear();
    mockS3.getBucketLocation.mockClear();
    mockS3.headBucket().promise.mockClear();
    mockS3.getBucketLocation().promise.mockClear();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
    
    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * Property 7: Configuration Source Consistency
   * For any configuration read operation, all bucket settings should come from the same configuration source
   */
  test('Property 7: Configuration Source Consistency', async () => {
    // Set up consistent environment variables
    process.env.S3_UPLOAD_BUCKET = 'test-upload-bucket';
    process.env.S3_RESULTS_BUCKET = 'test-results-bucket';
    process.env.S3_CDN_BUCKET = 'test-cdn-bucket';
    process.env.AWS_REGION = 'us-east-1';
    process.env.MAX_FILE_SIZE = '5242880'; // 5MB
    process.env.ALLOWED_CONTENT_TYPES = 'image/jpeg,image/png,image/webp';
    process.env.UPLOAD_EXPIRY_SECONDS = '600';
    process.env.ENABLE_METRICS = 'true';
    process.env.LOG_LEVEL = 'debug';

    // Mock bucket region detection for all buckets
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
      LocationConstraint: null // us-east-1 returns null
    });

    // Load configuration
    const config = await configManager.loadConfiguration();

    // Property: All bucket configurations should come from environment variables
    expect(config.buckets['test-upload-bucket']).toBeDefined();
    expect(config.buckets['test-results-bucket']).toBeDefined();
    expect(config.buckets['test-cdn-bucket']).toBeDefined();

    // Property: All buckets should have consistent structure
    const bucketNames = Object.keys(config.buckets);
    for (const bucketName of bucketNames) {
      const bucketConfig = config.buckets[bucketName];
      
      // Each bucket should have required properties
      expect(bucketConfig).toHaveProperty('region');
      expect(bucketConfig).toHaveProperty('purpose');
      expect(typeof bucketConfig.region).toBe('string');
      expect(typeof bucketConfig.purpose).toBe('string');
    }

    // Property: Upload configuration should come from environment
    expect(config.upload.maxFileSize).toBe(5242880);
    expect(config.upload.allowedContentTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(config.upload.expirySeconds).toBe(600);

    // Property: Monitoring configuration should come from environment
    expect(config.monitoring.enableMetrics).toBe(true);
    expect(config.monitoring.logLevel).toBe('debug');

    // Property: Region configuration should come from environment
    expect(config.regions.primary).toBe('us-east-1');
  });

  test('Property: Configuration validation is consistent', async () => {
    const testConfigs = [
      // Valid configuration
      {
        buckets: {
          'test-bucket': { region: 'us-east-1', purpose: 'upload' }
        },
        regions: { primary: 'us-east-1', fallback: ['us-east-1'] },
        upload: {
          maxFileSize: 1024,
          allowedContentTypes: ['image/jpeg'],
          expirySeconds: 300
        },
        monitoring: { enableMetrics: true, logLevel: 'info' }
      },
      // Invalid configuration - no buckets
      {
        buckets: {},
        regions: { primary: 'us-east-1', fallback: ['us-east-1'] },
        upload: {
          maxFileSize: 1024,
          allowedContentTypes: ['image/jpeg'],
          expirySeconds: 300
        },
        monitoring: { enableMetrics: true, logLevel: 'info' }
      },
      // Invalid configuration - negative file size
      {
        buckets: {
          'test-bucket': { region: 'us-east-1', purpose: 'upload' }
        },
        regions: { primary: 'us-east-1', fallback: ['us-east-1'] },
        upload: {
          maxFileSize: -1,
          allowedContentTypes: ['image/jpeg'],
          expirySeconds: 300
        },
        monitoring: { enableMetrics: true, logLevel: 'info' }
      }
    ];

    for (let i = 0; i < testConfigs.length; i++) {
      const config = testConfigs[i];
      const validation = configManager.validateConfiguration(config);

      // Property: Validation should be consistent and deterministic
      const secondValidation = configManager.validateConfiguration(config);
      expect(validation.isValid).toBe(secondValidation.isValid);
      expect(validation.errors).toEqual(secondValidation.errors);

      // Property: First config should be valid, others invalid
      if (i === 0) {
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      } else {
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      }
    }
  });

  test('Property: Multiple configuration reads return same data', async () => {
    // Set up environment
    process.env.S3_UPLOAD_BUCKET = 'consistent-bucket';
    process.env.AWS_REGION = 'eu-west-1';

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'eu-west-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: 'eu-west-1'
    });

    // Load configuration multiple times
    const config1 = await configManager.getConfiguration();
    const config2 = await configManager.getConfiguration();
    const config3 = await configManager.getConfiguration();

    // Property: All configuration reads should return identical data
    expect(config1).toEqual(config2);
    expect(config2).toEqual(config3);

    // Property: Specific values should be consistent
    expect(config1.regions.primary).toBe(config2.regions.primary);
    expect(config1.regions.primary).toBe(config3.regions.primary);

    // Property: Bucket configurations should be identical
    expect(config1.buckets).toEqual(config2.buckets);
    expect(config2.buckets).toEqual(config3.buckets);
  });

  test('Property: Bucket region retrieval is consistent', async () => {
    const bucketName = 'consistency-test-bucket';
    const expectedRegion = 'ap-south-1';

    // Set up environment
    process.env.S3_UPLOAD_BUCKET = bucketName;

    // Mock bucket region detection
    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': expectedRegion
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: expectedRegion
    });

    // Get bucket region multiple times
    const region1 = await configManager.getBucketRegion(bucketName);
    const region2 = await configManager.getBucketRegion(bucketName);
    const region3 = await configManager.getBucketRegion(bucketName);

    // Property: All calls should return the same region
    expect(region1).toBe(expectedRegion);
    expect(region2).toBe(expectedRegion);
    expect(region3).toBe(expectedRegion);
    expect(region1).toBe(region2);
    expect(region2).toBe(region3);
  });

  test('Property: Configuration defaults are consistent', async () => {
    // Clear environment variables to test defaults
    delete process.env.S3_UPLOAD_BUCKET;
    delete process.env.S3_RESULTS_BUCKET;
    delete process.env.S3_CDN_BUCKET;
    delete process.env.AWS_REGION;
    delete process.env.MAX_FILE_SIZE;
    delete process.env.ALLOWED_CONTENT_TYPES;
    delete process.env.UPLOAD_EXPIRY_SECONDS;
    delete process.env.ENABLE_METRICS;
    delete process.env.LOG_LEVEL;

    // Mock bucket region detection for default buckets
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

    // Load configuration with defaults
    const config = await configManager.loadConfiguration();

    // Property: Default values should be consistent and reasonable
    expect(config.buckets['wishlize-uploads']).toBeDefined();
    expect(config.buckets['wishlize-results']).toBeDefined();
    expect(config.buckets['wishlize-cdn']).toBeDefined();

    expect(config.regions.primary).toBe('us-east-1');
    expect(config.upload.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
    expect(config.upload.allowedContentTypes).toEqual(['image/jpeg', 'image/png']);
    expect(config.upload.expirySeconds).toBe(300);
    expect(config.monitoring.enableMetrics).toBe(true);
    expect(config.monitoring.logLevel).toBe('info');

    // Property: Loading configuration again should return same defaults
    const config2 = await configManager.getConfiguration();
    expect(config).toEqual(config2);
  });

  test('Property: Environment changes are reflected in new configurations', async () => {
    // Initial configuration
    process.env.S3_UPLOAD_BUCKET = 'initial-bucket';
    process.env.AWS_REGION = 'us-east-1';

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

    const config1 = await configManager.loadConfiguration();
    expect(config1.buckets['initial-bucket']).toBeDefined();
    expect(config1.regions.primary).toBe('us-east-1');

    // Change environment
    process.env.S3_UPLOAD_BUCKET = 'changed-bucket';
    process.env.AWS_REGION = 'eu-west-1';

    mockS3.headBucket().promise.mockResolvedValue({
      $response: {
        httpResponse: {
          headers: {
            'x-amz-bucket-region': 'eu-west-1'
          }
        }
      }
    });

    mockS3.getBucketLocation().promise.mockResolvedValue({
      LocationConstraint: 'eu-west-1'
    });

    // Force reload
    const config2 = await configManager.reloadConfiguration();

    // Property: New configuration should reflect environment changes
    expect(config2.buckets['changed-bucket']).toBeDefined();
    expect(config2.buckets['initial-bucket']).toBeUndefined();
    expect(config2.regions.primary).toBe('eu-west-1');

    // Property: Configurations should be different
    expect(config1).not.toEqual(config2);
  });
});