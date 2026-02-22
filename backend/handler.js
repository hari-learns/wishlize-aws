/**
 * Wishlize Lambda Handlers (IP-Based)
 * 
 * Main entry points for the API:
 * - POST /get-upload-url: Get presigned URL for photo upload
 * - POST /validate-photo: Validate uploaded photo
 * - POST /process-tryon: Generate virtual try-on
 * 
 * All handlers use IP-based rate limiting (no email required).
 */

const { createHandler, hashForLog } = require('./lib/middleware');
const {
  validateGetUploadUrlBody,
  validateValidatePhotoBody,
  validateProcessTryOnBody
} = require('./lib/validators');
const { PhotoValidationError, ValidationError } = require('./lib/errors');

// Services
const s3Service = require('./services/s3Service');
const sessionStore = require('./services/sessionStore');
const photoValidator = require('./validators/photoCheck');
const fashnClient = require('./services/fashnClient');

/**
 * Parse S3 object location from a public URL.
 * Supports both virtual-hosted and path-style S3 URLs.
 * @param {string} imageUrl - Public S3 URL
 * @returns {{ bucketName: string, key: string, region: string }}
 */
function parseS3Location(imageUrl) {
  const parsed = new URL(imageUrl);
  const hostParts = parsed.hostname.split('.');
  let bucketName;
  let region = process.env.AWS_REGION || 'ap-south-1';
  let key;

  if (hostParts[0] === 's3') {
    if (hostParts[1] && hostParts[1] !== 'amazonaws') {
      region = hostParts[1];
    }
    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/');
    bucketName = pathParts.shift();
    key = pathParts.join('/');
  } else {
    bucketName = hostParts[0];
    if (hostParts[1] === 's3' && hostParts[2] && hostParts[2] !== 'amazonaws') {
      region = hostParts[2];
    }
    key = parsed.pathname.replace(/^\/+/, '');
  }

  if (!bucketName || !key) {
    throw new ValidationError('Invalid S3 image URL', [{
      field: 'imageUrl',
      code: 'INVALID_S3_URL',
      message: 'Could not extract bucket/key from image URL'
    }]);
  }

  return {
    bucketName,
    key: decodeURIComponent(key),
    region
  };
}

/**
 * Extract client IP from API Gateway event
 * @param {Object} event - Lambda event
 * @returns {string|null} Client IP
 */
function resolveClientIp(event) {
  return (
    event?.requestContext?.identity?.sourceIp ||
    event?.requestContext?.http?.sourceIp ||
    event?.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
    event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    null
  );
}

async function resolveGarmentImageUrl(garmentUrl, logger) {
  const parsed = s3Service.parseS3Url(garmentUrl);
  if (parsed && s3Service.isValidS3Url(garmentUrl)) {
    const signedUrl = await s3Service.generateViewUrl(parsed.key, parsed.bucket, 3600);
    logger.info('Resolved garment image URL via S3 signed URL', {
      bucket: parsed.bucket,
      key: parsed.key
    });
    return signedUrl;
  }
  return garmentUrl;
}

// ============================================================================
// Handler: POST /get-upload-url
// ============================================================================

/**
 * Get presigned upload URL handler
 * Creates or retrieves session and generates S3 presigned POST URL
 */
const getUploadUrlHandler = async (validatedInput, logger, event) => {
  const { fileType } = validatedInput;
  const clientIP = resolveClientIp(event);

  if (!clientIP || clientIP === 'unknown') {
    logger.error('IP validation failed', {
      clientIp: clientIP || 'undefined',
      requestContext: event.requestContext ? 'present' : 'missing'
    });
    throw new ValidationError('Unable to process request - IP address required', [{
      code: 'IP_REQUIRED',
      message: 'IP address could not be determined from request'
    }]);
  }

  // Get client metadata for session
  const metadata = {
    userAgent: event.headers?.['User-Agent'] || event.headers?.['user-agent'],
    source: 'widget'
  };

  // Get or create session (IP-based)
  logger.info('Getting or creating session', { ipHash: hashForLog(clientIP) });
  const session = await sessionStore.getOrCreateSession(clientIP, metadata);

  // Check if quota exceeded
  if (session.triesLeft <= 0) {
    logger.warn('Quota exceeded', { sessionId: session.sessionId, ip: hashForLog(clientIP) });
    return {
      success: true,
      quotaExceeded: true,
      message: 'Daily try-on limit reached. Please try again tomorrow.',
      retryAfter: Math.ceil((session.expiresAt * 1000 - Date.now()) / 1000)
    };
  }

  // Generate presigned upload URL
  logger.info('Generating upload URL', { sessionId: session.sessionId });
  const uploadData = await s3Service.generateUploadUrl(session.sessionId, fileType);

  logger.info('Upload URL generated', { 
    sessionId: session.sessionId,
    key: uploadData.key 
  });

  return {
    success: true,
    uploadUrl: uploadData.uploadUrl,
    publicUrl: uploadData.publicUrl,
    fields: uploadData.fields,
    sessionId: session.sessionId,
    triesRemaining: session.triesLeft,
    expiresIn: uploadData.expiresIn,
    maxFileSize: uploadData.maxFileSize
  };
};

// ============================================================================
// Handler: POST /validate-photo
// ============================================================================

/**
 * Validate photo handler
 * Downloads image from S3, validates with Rekognition, updates session
 */
const validatePhotoHandler = async (validatedInput, logger, event) => {
  const { sessionId, imageUrl } = validatedInput;
  const clientIP = resolveClientIp(event);

  // Verify session exists
  logger.info('Verifying session', { sessionId, ipHash: hashForLog(clientIP) });
  const session = await sessionStore.getSession(sessionId, clientIP);

  // Download image from S3 for validation
  logger.info('Downloading image for validation', { imageUrl });
  
  let imageBuffer;
  let s3Location;
  try {
    s3Location = parseS3Location(imageUrl);
    
    // Use S3 SDK to download directly (Lambda has IAM permissions)
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({
      region: s3Location.region,
      signatureVersion: 'v4'
    });
    
    const s3Response = await s3.getObject({
      Bucket: s3Location.bucketName,
      Key: s3Location.key
    }).promise();
    
    imageBuffer = s3Response.Body;
  } catch (error) {
    logger.error('S3 download failed', {
      error: error.message,
      errorCode: error.code,
      bucketName: s3Location?.bucketName,
      key: s3Location?.key
    });

    if (error.code === 'NoSuchKey') {
      throw new PhotoValidationError('Image not found', [{
        code: 'IMAGE_NOT_FOUND',
        message: 'The uploaded image could not be found. Please try uploading again.'
      }]);
    } else if (error.code === 'AccessDenied' || error.code === 'Forbidden') {
      throw new PhotoValidationError('Access denied', [{
        code: 'ACCESS_DENIED',
        message: 'Unable to access the image. Please check permissions and try again.'
      }]);
    } else if (error.code === 'NoSuchBucket') {
      throw new PhotoValidationError('Storage error', [{
        code: 'STORAGE_ERROR',
        message: 'Storage service unavailable. Please try again later.'
      }]);
    } else if (error.code === 'NetworkingError' || error.code === 'TimeoutError') {
      throw new PhotoValidationError('Network timeout', [{
        code: 'NETWORK_ERROR',
        message: 'Connection to storage failed. Please check your network and try again.'
      }]);
    }

    throw new PhotoValidationError('Failed to download image for validation', [{
      code: 'DOWNLOAD_FAILED',
      message: 'Could not retrieve image from storage. Please try again.'
    }]);
  }

  // Validate photo
  logger.info('Running photo validation');
  const validationResult = await photoValidator.validatePhoto(
    imageBuffer,
    'image/jpeg' // S3 uploads are always JPEG after processing
  );

  // Update session with validation results
  logger.info('Updating session with validation result', { 
    valid: validationResult.valid,
    type: validationResult.type 
  });
  
  await sessionStore.updateValidation(
    sessionId,
    clientIP,
    validationResult,
    imageUrl
  );

  return {
    success: true,
    valid: validationResult.valid,
    type: validationResult.type,
    message: validationResult.message,
    confidence: validationResult.confidence,
    sessionId,
    triesRemaining: session.triesLeft
  };
};

// ============================================================================
// Handler: POST /process-tryon
// ============================================================================

/**
 * Process try-on handler
 * Validates quota, submits to FASHN API, polls for result, saves to session
 */
const processTryOnHandler = async (validatedInput, logger, event) => {
  const { sessionId, garmentUrl } = validatedInput;
  const clientIP = resolveClientIp(event);

  // Verify session
  logger.info('Verifying session for try-on', { sessionId });
  const session = await sessionStore.getSession(sessionId, clientIP);

  // Verify photo has been validated
  if (session.status !== 'validated') {
    logger.warn('Try-on attempted without validated photo', { 
      sessionId, 
      status: session.status 
    });
    return {
      success: false,
      error: {
        code: 'PHOTO_NOT_VALIDATED',
        message: 'Please validate your photo before trying on garments'
      }
    };
  }

  // Submit to FASHN API FIRST (before consuming quota)
  // This ensures we only charge for successful submissions
  const garmentImageUrl = await resolveGarmentImageUrl(garmentUrl, logger);
  logger.info('Submitting to FASHN API', { 
    sessionId,
    personImageUrl: session.personImageUrl,
    garmentUrl 
  });

  let submission;
  try {
    submission = await fashnClient.submitTryOnRequest({
      personImageUrl: session.personImageUrl,
      garmentImageUrl: garmentImageUrl,
      sessionId
    });

    logger.info('FASHN submission successful', { 
      predictionId: submission.predictionId 
    });

  } catch (error) {
    logger.error('FASHN submission failed - quota NOT consumed', {
      error: error.message,
      sessionId
    });
    throw error;
  }

  // Only consume quota AFTER successful FASHN submission
  logger.info('Consuming try', { sessionId });
  const triesRemaining = await sessionStore.consumeTry(sessionId, clientIP);

  // Save predictionId to session for status polling
  await sessionStore.savePredictionId(sessionId, clientIP, submission.predictionId);

  return {
    success: true,
    status: 'processing',
    message: 'Try-on generation started',
    predictionId: submission.predictionId,
    sessionId,
    triesRemaining,
    checkStatusUrl: `/status/${sessionId}`,
    estimatedTimeSeconds: 60
  };
};

// ============================================================================
// Handler: GET /status/{sessionId} (for polling)
// ============================================================================

/**
 * Check try-on status handler
 * Returns current status and result if completed
 */
const checkStatusHandler = async (validatedInput, logger, event) => {
  const { sessionId } = validatedInput;
  const clientIP = resolveClientIp(event);

  // Get session
  logger.info('Checking session status', { sessionId });
  const session = await sessionStore.getSession(sessionId, clientIP);

  // If still processing, check with FASHN API
  if (session.status === 'processing' && session.predictionId) {
    try {
      const status = await fashnClient.checkPredictionStatus(session.predictionId);

      if (status.status === 'completed') {
        // Save result
        const resultUrl = status.output?.[0];
        if (resultUrl) {
          await sessionStore.saveResult(sessionId, clientIP, resultUrl);
          session.status = 'completed';
          session.resultImageUrl = resultUrl;
          session.errorMessage = null;
        }
      } else if (status.status === 'failed') {
        await sessionStore.markFailed(sessionId, clientIP, status.error || 'Generation failed');
        session.status = 'failed';
        session.errorMessage = status.error || 'Generation failed';
      }
    } catch (error) {
      logger.error('Failed to check FASHN status', { error: error.message });
      // Don't fail the request, just return current cached status
    }
  }

  return {
    success: true,
    status: session.status,
    sessionId,
    triesRemaining: session.triesLeft,
    resultUrl: session.resultImageUrl || null,
    errorMessage: session.errorMessage || null,
    updatedAt: session.updatedAt
  };
};

// ============================================================================
// Wrapped Handlers Export
// ============================================================================

module.exports = {
  // Main handlers with middleware wrapper
  getUploadUrl: createHandler(
    'getUploadUrl',
    validateGetUploadUrlBody,
    getUploadUrlHandler
  ),

  validatePhoto: createHandler(
    'validatePhoto',
    validateValidatePhotoBody,
    validatePhotoHandler
  ),

  processTryOn: createHandler(
    'processTryOn',
    validateProcessTryOnBody,
    processTryOnHandler
  ),

  checkStatus: createHandler(
    'checkStatus',
    (body, event) => {
      const sessionId = event.pathParameters?.sessionId || body?.sessionId;
      if (!sessionId) throw new Error('sessionId is required');
      return { sessionId };
    },
    checkStatusHandler,
    { skipRateLimit: true }
  ),

  // Raw handlers for testing
  _raw: {
    getUploadUrlHandler,
    validatePhotoHandler,
    processTryOnHandler,
    checkStatusHandler
  }
};
