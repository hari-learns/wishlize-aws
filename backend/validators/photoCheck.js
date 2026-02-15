/**
 * Photo Validation Service
 * 
 * Uses AWS Rekognition to:
 * - Detect faces in uploaded images
 * - Analyze image quality
 * - Check for inappropriate content
 * - Determine if photo is full-body or half-body
 */

const AWS = require('aws-sdk');
const { PhotoValidationError, ExternalServiceError } = require('../lib/errors');

// Configure Rekognition
const rekognition = new AWS.Rekognition({
  region: process.env.AWS_REGION || 'ap-south-1',
  maxRetries: 3,
  httpOptions: {
    timeout: 5000 // 5 second timeout
  }
});

// Validation constants
const VALIDATION_RULES = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png'],
  MIN_FACE_CONFIDENCE: 90,           // AWS Rekognition threshold
  MIN_FULL_BODY_RATIO: 2.0,          // height/width for full body
  MIN_HALF_BODY_RATIO: 1.2,          // height/width for half body
  MIN_IMAGE_DIMENSION: 256,          // min width/height in pixels
  MAX_IMAGE_DIMENSION: 4096,         // max width/height in pixels
  MIN_SHARPNESS: 50,                 // Rekognition quality threshold
  MIN_BRIGHTNESS: 30,                // Minimum brightness
  MAX_BRIGHTNESS: 250                // Maximum brightness
};

// Error codes for specific validation failures
const ERROR_CODES = {
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'File size exceeds 10MB limit'
  },
  INVALID_MIME_TYPE: {
    code: 'INVALID_MIME_TYPE',
    message: 'Only JPEG and PNG images are supported'
  },
  IMAGE_TOO_SMALL: {
    code: 'IMAGE_TOO_SMALL',
    message: 'Image dimensions are too small (min 256px)'
  },
  IMAGE_TOO_LARGE: {
    code: 'IMAGE_TOO_LARGE',
    message: 'Image dimensions are too large (max 4096px)'
  },
  NO_FACE_DETECTED: {
    code: 'NO_FACE_DETECTED',
    message: 'No face detected in the photo'
  },
  MULTIPLE_FACES: {
    code: 'MULTIPLE_FACES',
    message: 'Multiple faces detected. Please use a photo with only one person'
  },
  LOW_FACE_CONFIDENCE: {
    code: 'LOW_FACE_CONFIDENCE',
    message: 'Face confidence too low. Please use a clearer photo'
  },
  FACE_TOO_SMALL: {
    code: 'FACE_TOO_SMALL',
    message: 'Face is too small in the photo'
  },
  BLURRY_IMAGE: {
    code: 'BLURRY_IMAGE',
    message: 'Photo is too blurry. Please use a sharper image'
  },
  POOR_LIGHTING: {
    code: 'POOR_LIGHTING',
    message: 'Photo has poor lighting. Please use a better lit photo'
  },
  INAPPROPRIATE_CONTENT: {
    code: 'INAPPROPRIATE_CONTENT',
    message: 'Photo contains inappropriate content'
  },
  CORRUPT_IMAGE: {
    code: 'CORRUPT_IMAGE',
    message: 'Unable to process image. Please try a different photo'
  }
};

/**
 * Check file metadata before Rekognition call
 * @param {Buffer} imageBuffer - Image data
 * @param {string} mimeType - MIME type
 * @returns {Array} Array of error codes
 */
function checkFileMetadata(imageBuffer, mimeType) {
  const errors = [];

  // Check file size
  if (imageBuffer.length > VALIDATION_RULES.MAX_FILE_SIZE) {
    errors.push(ERROR_CODES.FILE_TOO_LARGE);
  }

  // Check MIME type
  if (!VALIDATION_RULES.ALLOWED_MIME_TYPES.includes(mimeType)) {
    errors.push(ERROR_CODES.INVALID_MIME_TYPE);
  }

  return errors;
}

/**
 * Detect moderation labels (inappropriate content)
 * @param {Buffer} imageBuffer - Image data
 * @returns {Promise<Array>} Moderation labels
 */
async function detectModerationLabels(imageBuffer) {
  try {
    const params = {
      Image: {
        Bytes: imageBuffer
      },
      MinConfidence: 60
    };

    const result = await rekognition.detectModerationLabels(params).promise();
    return result.ModerationLabels || [];
  } catch (error) {
    // Log but don't fail - moderation is a safety net, not a hard requirement
    console.warn('Moderation detection failed:', error.message);
    return [];
  }
}

/**
 * Detect faces and analyze image quality
 * @param {Buffer} imageBuffer - Image data
 * @returns {Promise<Object>} Face detection result
 */
async function detectFaces(imageBuffer) {
  const params = {
    Image: {
      Bytes: imageBuffer
    },
    Attributes: ['ALL']
  };

  try {
    const result = await rekognition.detectFaces(params).promise();
    return result;
  } catch (error) {
    console.error('Rekognition detectFaces error:', error.code, error.message);
    if (error.code === 'InvalidImageFormatException') {
      throw new PhotoValidationError('Invalid image format', [ERROR_CODES.CORRUPT_IMAGE]);
    }
    if (error.code === 'ImageTooLargeException') {
      throw new PhotoValidationError('Image too large', [ERROR_CODES.IMAGE_TOO_LARGE]);
    }
    throw new ExternalServiceError(`Face detection failed: ${error.code || error.message}`, 'rekognition');
  }
}

/**
 * Analyze face details for quality issues
 * @param {Object} faceDetail - Rekognition face detail
 * @returns {Array} Quality error codes
 */
function analyzeFaceQuality(faceDetail) {
  const errors = [];
  const quality = faceDetail.Quality;

  if (quality) {
    // Check sharpness
    if (quality.Sharpness < VALIDATION_RULES.MIN_SHARPNESS) {
      errors.push(ERROR_CODES.BLURRY_IMAGE);
    }

    // Check brightness
    if (quality.Brightness < VALIDATION_RULES.MIN_BRIGHTNESS) {
      errors.push(ERROR_CODES.POOR_LIGHTING);
    }
    if (quality.Brightness > VALIDATION_RULES.MAX_BRIGHTNESS) {
      errors.push(ERROR_CODES.POOR_LIGHTING);
    }
  }

  return errors;
}

/**
 * Calculate body type based on face bounding box ratio
 * This is a heuristic - assumes the face position indicates body framing
 * @param {Object} faceDetail - Rekognition face detail
 * @returns {string} 'full_body', 'half_body', or 'unknown'
 */
function calculateBodyType(faceDetail) {
  const box = faceDetail.BoundingBox;
  
  if (!box) return 'unknown';

  // Face height relative to image height
  const faceHeightRatio = box.Height;
  const faceTopPosition = box.Top;

  // Heuristic: If face is small in frame (< 15% height) and positioned in upper third,
  // it's likely a full body shot
  if (faceHeightRatio < 0.15 && faceTopPosition < 0.3) {
    return 'full_body';
  }

  // If face is medium size (15-30% height), likely half body
  if (faceHeightRatio >= 0.15 && faceHeightRatio < 0.3) {
    return 'half_body';
  }

  // If face is large (> 30% height), likely portrait/headshot
  return 'half_body';
}

/**
 * Main validation function
 * @param {Buffer} imageBuffer - Image data (max 10MB)
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<Object>} Validation result
 */
async function validatePhoto(imageBuffer, mimeType) {
  // Validate inputs
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new PhotoValidationError('Invalid image data', [ERROR_CODES.CORRUPT_IMAGE]);
  }

  if (!mimeType) {
    throw new PhotoValidationError('MIME type is required', [ERROR_CODES.INVALID_MIME_TYPE]);
  }

  // Check file metadata first
  const metadataErrors = checkFileMetadata(imageBuffer, mimeType);
  if (metadataErrors.length > 0) {
    throw new PhotoValidationError('File validation failed', metadataErrors);
  }

  // Check for inappropriate content
  const moderationLabels = await detectModerationLabels(imageBuffer);
  const inappropriateLabels = moderationLabels.filter(label => 
    label.ParentName === 'Explicit Nudity' ||
    label.ParentName === 'Violence' ||
    label.Name === 'Suggestive'
  );

  if (inappropriateLabels.length > 0) {
    throw new PhotoValidationError('Content validation failed', [ERROR_CODES.INAPPROPRIATE_CONTENT]);
  }

  // Detect faces
  const faceResult = await detectFaces(imageBuffer);
  const faceDetails = faceResult.FaceDetails || [];

  // Check face count
  if (faceDetails.length === 0) {
    throw new PhotoValidationError('No face detected', [ERROR_CODES.NO_FACE_DETECTED]);
  }

  if (faceDetails.length > 1) {
    throw new PhotoValidationError('Multiple faces detected', [ERROR_CODES.MULTIPLE_FACES]);
  }

  const faceDetail = faceDetails[0];

  // Check face confidence
  if (faceDetail.Confidence < VALIDATION_RULES.MIN_FACE_CONFIDENCE) {
    throw new PhotoValidationError('Face confidence too low', [ERROR_CODES.LOW_FACE_CONFIDENCE]);
  }

  // Analyze face quality
  const qualityErrors = analyzeFaceQuality(faceDetail);
  if (qualityErrors.length > 0) {
    throw new PhotoValidationError('Photo quality issues detected', qualityErrors);
  }

  // Determine body type
  const bodyType = calculateBodyType(faceDetail);

  // Build success result
  const result = {
    valid: true,
    type: bodyType,
    message: bodyType === 'full_body' 
      ? 'Full body photo validated successfully'
      : 'Half body photo validated successfully',
    confidence: Math.round(faceDetail.Confidence * 10) / 10,
    faceDetails: {
      boundingBox: faceDetail.BoundingBox,
      quality: {
        sharpness: Math.round(faceDetail.Quality?.Sharpness || 0),
        brightness: Math.round(faceDetail.Quality?.Brightness || 0)
      }
    }
  };

  return result;
}

/**
 * Quick validation for file upload (before S3 upload)
 * @param {number} fileSize - File size in bytes
 * @param {string} mimeType - MIME type
 * @returns {Object} Quick validation result
 */
function quickValidate(fileSize, mimeType) {
  const errors = [];

  if (fileSize > VALIDATION_RULES.MAX_FILE_SIZE) {
    errors.push(ERROR_CODES.FILE_TOO_LARGE);
  }

  if (!VALIDATION_RULES.ALLOWED_MIME_TYPES.includes(mimeType)) {
    errors.push(ERROR_CODES.INVALID_MIME_TYPE);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validatePhoto,
  quickValidate,
  VALIDATION_RULES,
  ERROR_CODES
};
