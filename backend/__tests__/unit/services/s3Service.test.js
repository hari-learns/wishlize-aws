/**
 * Unit Tests: S3 Service
 * 
 * Tests S3 presigned URL generation including:
 * - Upload URL generation with security conditions
 * - View URL generation
 * - URL parsing and validation
 * - Error handling
 */

const AWS = require('aws-sdk');
const s3Service = require('../../../services/s3Service');
const { ValidationError } = require('../../../lib/errors');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockCreatePresignedPost = jest.fn();
  const mockGetSignedUrlPromise = jest.fn();
  const mockDeleteObject = jest.fn();

  return {
    S3: jest.fn(() => ({
      createPresignedPost: mockCreatePresignedPost,
      getSignedUrlPromise: mockGetSignedUrlPromise,
      deleteObject: mockDeleteObject
    })),
    __mockCreatePresignedPost: mockCreatePresignedPost,
    __mockGetSignedUrlPromise: mockGetSignedUrlPromise,
    __mockDeleteObject: mockDeleteObject
  };
});

const mockCreatePresignedPost = AWS.__mockCreatePresignedPost;
const mockGetSignedUrlPromise = AWS.__mockGetSignedUrlPromise;
const mockDeleteObject = AWS.__mockDeleteObject;

describe('S3 Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUploadUrl', () => {
    it('should throw ValidationError for missing sessionId', async () => {
      await expect(s3Service.generateUploadUrl(null, 'image/jpeg'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid content type', async () => {
      await expect(s3Service.generateUploadUrl('session-123', 'image/gif'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should generate presigned POST with correct params', async () => {
      mockCreatePresignedPost.mockReturnValue({
        url: 'https://wishlize-uploads.s3.amazonaws.com/',
        fields: {
          key: 'test-key',
          'Content-Type': 'image/jpeg'
        }
      });

      await s3Service.generateUploadUrl('session-123', 'image/jpeg');

      expect(mockCreatePresignedPost).toHaveBeenCalled();
      const callArgs = mockCreatePresignedPost.mock.calls[0][0];

      expect(callArgs.Bucket).toBe('wishlize-uploads');
      expect(callArgs.Expires).toBe(300);
      expect(callArgs.Fields['Content-Type']).toBe('image/jpeg');
      expect(callArgs.Fields['x-amz-meta-session-id']).toBe('session-123');
    });

    it('should include security conditions', async () => {
      mockCreatePresignedPost.mockReturnValue({
        url: 'https://wishlize-uploads.s3.amazonaws.com/',
        fields: {}
      });

      await s3Service.generateUploadUrl('session-123', 'image/jpeg');

      const callArgs = mockCreatePresignedPost.mock.calls[0][0];
      const conditions = callArgs.Conditions;

      // Check content-type condition
      const contentTypeCondition = conditions.find(c => 
        Array.isArray(c) && c[0] === 'eq' && c[1] === '$Content-Type'
      );
      expect(contentTypeCondition).toEqual(['eq', '$Content-Type', 'image/jpeg']);

      // Check file size condition
      const sizeCondition = conditions.find(c => 
        Array.isArray(c) && c[0] === 'content-length-range'
      );
      expect(sizeCondition).toEqual(['content-length-range', 0, 10 * 1024 * 1024]);
    });

    it('should include sessionId in S3 key path', async () => {
      mockCreatePresignedPost.mockReturnValue({
        url: 'https://wishlize-uploads.s3.amazonaws.com/',
        fields: {}
      });

      const result = await s3Service.generateUploadUrl('session-123', 'image/jpeg');

      expect(result.key).toMatch(/^uploads\/session-123\/[a-f0-9-]+\.jpg$/);
    });

    it('should return correct response structure', async () => {
      mockCreatePresignedPost.mockReturnValue({
        url: 'https://wishlize-uploads.s3.amazonaws.com/',
        fields: { key: 'test-key' }
      });

      const result = await s3Service.generateUploadUrl('session-123', 'image/jpeg');

      expect(result).toHaveProperty('uploadUrl');
      expect(result).toHaveProperty('publicUrl');
      expect(result).toHaveProperty('fields');
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('bucket');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('maxFileSize');
      expect(result).toHaveProperty('contentType');
    });

    it('should handle PNG content type', async () => {
      mockCreatePresignedPost.mockReturnValue({
        url: 'https://wishlize-uploads.s3.amazonaws.com/',
        fields: {}
      });

      const result = await s3Service.generateUploadUrl('session-123', 'image/png');

      expect(result.contentType).toBe('image/png');
      expect(result.key).toMatch(/\.png$/);
    });

    it('should construct correct public URL', async () => {
      mockCreatePresignedPost.mockReturnValue({
        url: 'https://wishlize-uploads.s3.amazonaws.com/',
        fields: {}
      });

      const result = await s3Service.generateUploadUrl('session-123', 'image/jpeg');

      expect(result.publicUrl).toMatch(/^https:\/\/wishlize-uploads\.s3\..*\.amazonaws\.com\//);
    });

    it('should handle S3 errors gracefully', async () => {
      mockCreatePresignedPost.mockImplementation(() => {
        throw new Error('S3 error');
      });

      await expect(s3Service.generateUploadUrl('session-123', 'image/jpeg'))
        .rejects
        .toThrow('Failed to generate upload URL');
    });
  });

  describe('generateViewUrl', () => {
    it('should throw ValidationError for missing key', async () => {
      await expect(s3Service.generateViewUrl(null))
        .rejects
        .toThrow(ValidationError);
    });

    it('should generate presigned GET URL with default params', async () => {
      mockGetSignedUrlPromise.mockResolvedValue('https://presigned-url.example.com/view');

      await s3Service.generateViewUrl('results/123/image.jpg');

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('getObject', {
        Bucket: 'wishlize-results',
        Key: 'results/123/image.jpg',
        Expires: 3600
      });
    });

    it('should use custom bucket when provided', async () => {
      mockGetSignedUrlPromise.mockResolvedValue('https://presigned-url.example.com/view');

      await s3Service.generateViewUrl('cdn/image.jpg', 'wishlize-cdn');

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('getObject', expect.objectContaining({
        Bucket: 'wishlize-cdn'
      }));
    });

    it('should use custom expiry when provided', async () => {
      mockGetSignedUrlPromise.mockResolvedValue('https://presigned-url.example.com/view');

      await s3Service.generateViewUrl('results/123/image.jpg', 'wishlize-results', 7200);

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('getObject', expect.objectContaining({
        Expires: 7200
      }));
    });

    it('should return the presigned URL', async () => {
      mockGetSignedUrlPromise.mockResolvedValue('https://presigned-url.example.com/view');

      const result = await s3Service.generateViewUrl('results/123/image.jpg');

      expect(result).toBe('https://presigned-url.example.com/view');
    });

    it('should handle S3 errors gracefully', async () => {
      mockGetSignedUrlPromise.mockRejectedValue(new Error('S3 error'));

      await expect(s3Service.generateViewUrl('results/123/image.jpg'))
        .rejects
        .toThrow('Failed to generate view URL');
    });
  });

  describe('generatePutUrl', () => {
    it('should generate presigned PUT URL', async () => {
      mockGetSignedUrlPromise.mockResolvedValue('https://presigned-url.example.com/put');

      await s3Service.generatePutUrl('results/123/image.jpg');

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('putObject', {
        Bucket: 'wishlize-results',
        Key: 'results/123/image.jpg',
        Expires: 300,
        ContentType: 'image/jpeg'
      });
    });

    it('should use custom expiry when provided', async () => {
      mockGetSignedUrlPromise.mockResolvedValue('https://presigned-url.example.com/put');

      await s3Service.generatePutUrl('results/123/image.jpg', 'wishlize-results', 600);

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('putObject', expect.objectContaining({
        Expires: 600
      }));
    });
  });

  describe('parseS3Url', () => {
    it('should parse virtual hosted-style URL', () => {
      const url = 'https://wishlize-uploads.s3.ap-south-1.amazonaws.com/uploads/123/image.jpg';
      const result = s3Service.parseS3Url(url);

      expect(result).toEqual({
        bucket: 'wishlize-uploads',
        key: 'uploads/123/image.jpg'
      });
    });

    it('should handle URL-encoded characters', () => {
      const url = 'https://wishlize-uploads.s3.ap-south-1.amazonaws.com/uploads/123/image%20with%20spaces.jpg';
      const result = s3Service.parseS3Url(url);

      expect(result.key).toBe('uploads/123/image with spaces.jpg');
    });

    it('should return null for invalid URL', () => {
      const result = s3Service.parseS3Url('not-a-valid-url');
      expect(result).toBeNull();
    });

    it('should return null for non-S3 URL', () => {
      const result = s3Service.parseS3Url('https://example.com/image.jpg');
      expect(result).toBeNull();
    });

    it('should handle null input', () => {
      const result = s3Service.parseS3Url(null);
      expect(result).toBeNull();
    });
  });

  describe('isValidS3Url', () => {
    it('should return true for upload bucket URL', () => {
      const url = 'https://wishlize-uploads.s3.ap-south-1.amazonaws.com/uploads/123/image.jpg';
      expect(s3Service.isValidS3Url(url)).toBe(true);
    });

    it('should return true for results bucket URL', () => {
      const url = 'https://wishlize-results.s3.ap-south-1.amazonaws.com/results/123/image.jpg';
      expect(s3Service.isValidS3Url(url)).toBe(true);
    });

    it('should return true for CDN bucket URL', () => {
      const url = 'https://wishlize-cdn.s3.ap-south-1.amazonaws.com/garments/blazer.jpg';
      expect(s3Service.isValidS3Url(url)).toBe(true);
    });

    it('should return false for unknown bucket', () => {
      const url = 'https://unknown-bucket.s3.ap-south-1.amazonaws.com/image.jpg';
      expect(s3Service.isValidS3Url(url)).toBe(false);
    });

    it('should return false for non-S3 URL', () => {
      const url = 'https://example.com/image.jpg';
      expect(s3Service.isValidS3Url(url)).toBe(false);
    });

    it('should return false for invalid URL', () => {
      expect(s3Service.isValidS3Url(null)).toBe(false);
      expect(s3Service.isValidS3Url('')).toBe(false);
    });
  });

  describe('deleteObject', () => {
    it('should return false for null key', async () => {
      const result = await s3Service.deleteObject(null);
      expect(result).toBe(false);
    });

    it('should call deleteObject with correct params', async () => {
      mockDeleteObject.mockReturnValue({
        promise: () => Promise.resolve({})
      });

      await s3Service.deleteObject('uploads/123/image.jpg');

      expect(mockDeleteObject).toHaveBeenCalledWith({
        Bucket: 'wishlize-uploads',
        Key: 'uploads/123/image.jpg'
      });
    });

    it('should return true on success', async () => {
      mockDeleteObject.mockReturnValue({
        promise: () => Promise.resolve({})
      });

      const result = await s3Service.deleteObject('uploads/123/image.jpg');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteObject.mockReturnValue({
        promise: () => Promise.reject(new Error('S3 error'))
      });

      const result = await s3Service.deleteObject('uploads/123/image.jpg');
      expect(result).toBe(false);
    });
  });

  describe('Key Generation', () => {
    it('generateS3Key should include sessionId and extension', () => {
      const key = s3Service.generateS3Key('session-123', 'image/jpeg');
      expect(key).toMatch(/^uploads\/session-123\/[a-f0-9-]+\.jpg$/);
    });

    it('generateS3Key should handle PNG', () => {
      const key = s3Service.generateS3Key('session-123', 'image/png');
      expect(key).toMatch(/\.png$/);
    });

    it('generateResultKey should include sessionId', () => {
      const key = s3Service.generateResultKey('session-123');
      expect(key).toMatch(/^results\/session-123\/[a-f0-9-]+\.jpg$/);
    });

    it('should generate unique keys', () => {
      const key1 = s3Service.generateS3Key('session-123', 'image/jpeg');
      const key2 = s3Service.generateS3Key('session-123', 'image/jpeg');
      expect(key1).not.toBe(key2);
    });
  });
});
