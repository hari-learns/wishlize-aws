/**
 * Unit Tests: Photo Validator Service
 * 
 * Tests photo validation logic including:
 * - File metadata validation
 * - AWS Rekognition integration (mocked)
 * - Content moderation
 * - Error handling
 */

const AWS = require('aws-sdk');
const photoValidator = require('../../../validators/photoCheck');
const { PhotoValidationError, ExternalServiceError } = require('../../../lib/errors');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockDetectFaces = jest.fn();
  const mockDetectModerationLabels = jest.fn();
  
  return {
    Rekognition: jest.fn(() => ({
      detectFaces: mockDetectFaces,
      detectModerationLabels: mockDetectModerationLabels
    })),
    __mockDetectFaces: mockDetectFaces,
    __mockDetectModerationLabels: mockDetectModerationLabels
  };
});

const mockDetectFaces = AWS.__mockDetectFaces;
const mockDetectModerationLabels = AWS.__mockDetectModerationLabels;

describe('Photo Validator Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should reject null image buffer', async () => {
      await expect(photoValidator.validatePhoto(null, 'image/jpeg'))
        .rejects
        .toThrow(PhotoValidationError);
    });

    it('should reject undefined image buffer', async () => {
      await expect(photoValidator.validatePhoto(undefined, 'image/jpeg'))
        .rejects
        .toThrow(PhotoValidationError);
    });

    it('should reject non-buffer data', async () => {
      await expect(photoValidator.validatePhoto('not a buffer', 'image/jpeg'))
        .rejects
        .toThrow(PhotoValidationError);
    });

    it('should reject missing MIME type', async () => {
      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, null))
        .rejects
        .toThrow(PhotoValidationError);
    });

    it('should reject files larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      await expect(photoValidator.validatePhoto(largeBuffer, 'image/jpeg'))
        .rejects
        .toThrow(PhotoValidationError);
    });

    it('should reject unsupported MIME types', async () => {
      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/gif'))
        .rejects
        .toThrow(PhotoValidationError);
    });

    it('should accept valid JPEG buffer', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.1, Top: 0.1 },
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({ ModerationLabels: [] })
      });

      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');
      expect(result.valid).toBe(true);
    });

    it('should accept valid PNG buffer', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.1, Top: 0.1 },
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({ ModerationLabels: [] })
      });

      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/png');
      expect(result.valid).toBe(true);
    });
  });

  describe('AWS Rekognition Integration', () => {
    beforeEach(() => {
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({ ModerationLabels: [] })
      });
    });

    it('should call detectFaces with correct params', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.1, Top: 0.1 },
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await photoValidator.validatePhoto(buffer, 'image/jpeg');

      expect(mockDetectFaces).toHaveBeenCalledWith({
        Image: { Bytes: buffer },
        Attributes: ['QUALITY']
      });
    });

    it('should detect full body photo', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.05, Top: 0.05 }, // Small face, high position
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');
      
      expect(result.type).toBe('full_body');
    });

    it('should detect half body photo', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.2, Top: 0.1 }, // Medium face
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');
      
      expect(result.type).toBe('half_body');
    });

    it('should reject when no face detected', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({ FaceDetails: [] })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('No face detected');
    });

    it('should reject when multiple faces detected', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [
            { Confidence: 98, BoundingBox: {} },
            { Confidence: 95, BoundingBox: {} }
          ]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Multiple faces detected');
    });

    it('should reject when face confidence < 90%', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 85, // Below threshold
            BoundingBox: { Height: 0.2, Top: 0.1 },
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Face confidence too low');
    });

    it('should reject blurry images', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.2, Top: 0.1 },
            Quality: { Sharpness: 40, Brightness: 100 } // Low sharpness
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Photo quality issues detected');
    });

    it('should reject images with poor lighting', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.2, Top: 0.1 },
            Quality: { Sharpness: 80, Brightness: 10 } // Too dark
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Photo quality issues detected');
    });

    it('should handle Rekognition service errors', async () => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.reject(new Error('Service error'))
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow(ExternalServiceError);
    });

    it('should handle invalid image format', async () => {
      const error = new Error('Invalid image');
      error.code = 'InvalidImageFormatException';
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.reject(error)
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Invalid image format');
    });
  });

  describe('Content Moderation', () => {
    beforeEach(() => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98,
            BoundingBox: { Height: 0.2, Top: 0.1 },
            Quality: { Sharpness: 80, Brightness: 100 }
          }]
        })
      });
    });

    it('should flag explicit nudity', async () => {
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({
          ModerationLabels: [{
            Name: 'Explicit Nudity',
            ParentName: 'Explicit Nudity',
            Confidence: 95
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Content validation failed');
    });

    it('should flag suggestive content', async () => {
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({
          ModerationLabels: [{
            Name: 'Suggestive',
            Confidence: 80
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Content validation failed');
    });

    it('should flag violent content', async () => {
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({
          ModerationLabels: [{
            Name: 'Violence',
            ParentName: 'Violence',
            Confidence: 90
          }]
        })
      });

      const buffer = Buffer.alloc(1000);
      await expect(photoValidator.validatePhoto(buffer, 'image/jpeg'))
        .rejects
        .toThrow('Content validation failed');
    });

    it('should allow appropriate images', async () => {
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({ ModerationLabels: [] })
      });

      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');
      expect(result.valid).toBe(true);
    });

    it('should continue if moderation check fails', async () => {
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.reject(new Error('Service error'))
      });

      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');
      expect(result.valid).toBe(true); // Should still pass
    });
  });

  describe('quickValidate', () => {
    it('should validate file size', () => {
      const result = photoValidator.quickValidate(11 * 1024 * 1024, 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('FILE_TOO_LARGE');
    });

    it('should validate MIME type', () => {
      const result = photoValidator.quickValidate(1000, 'image/gif');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_MIME_TYPE');
    });

    it('should pass valid files', () => {
      const result = photoValidator.quickValidate(1000, 'image/jpeg');
      expect(result.valid).toBe(true);
    });
  });

  describe('Success Response', () => {
    beforeEach(() => {
      mockDetectFaces.mockReturnValue({
        promise: () => Promise.resolve({
          FaceDetails: [{
            Confidence: 98.5,
            BoundingBox: { Height: 0.1, Top: 0.1, Width: 0.2, Left: 0.3 },
            Quality: { Sharpness: 85, Brightness: 100 }
          }]
        })
      });
      mockDetectModerationLabels.mockReturnValue({
        promise: () => Promise.resolve({ ModerationLabels: [] })
      });
    });

    it('should return correct structure on success', async () => {
      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');

      expect(result).toHaveProperty('valid', true);
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('faceDetails');
    });

    it('should round confidence to 1 decimal place', async () => {
      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');

      expect(result.confidence).toBe(98.5);
    });

    it('should include face bounding box details', async () => {
      const buffer = Buffer.alloc(1000);
      const result = await photoValidator.validatePhoto(buffer, 'image/jpeg');

      expect(result.faceDetails).toHaveProperty('boundingBox');
      expect(result.faceDetails).toHaveProperty('quality');
      expect(result.faceDetails.quality).toHaveProperty('sharpness');
      expect(result.faceDetails.quality).toHaveProperty('brightness');
    });
  });
});
