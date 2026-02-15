/**
 * Wishlize Lambda Handlers (Simplified - No Email)
 * 
 * Main entry points:
 * - POST /get-upload-url: Get presigned URL (IP-based session)
 * - POST /validate-photo: Validate uploaded photo
 * - POST /process-tryon: Generate virtual try-on
 * - GET /status/{sessionId}: Check status
 */

const { createHandler } = require('./lib/middleware');
const { anonymizeIp } = require('./lib/logger');
const {
  validateGetUploadUrlBody,
  validateValidatePhotoBody,
  validateProcessTryOnBody
} = require('./lib/validators');
const { PhotoValidationError } = require('./lib/errors');

// Services
const s3Service = require('./services/s3Service');
const sessionStore = require('./services/sessionStore-simple');
const photoValidator = require('./validators/photoCheck');
const fashnClient = require('./services/fashnClient');

// ============================================================================
// Handler: POST /get-upload-url
// ============================================================================

const getUploadUrlHandler = async (validatedInput, logger, event) => {
  const { fileType } = validatedInput;
  const clientIp = event.requestContext?.identity?.sourceIp || 'unknown';

  // Get or create session (IP-based)
  logger.info('Getting or creating session', { ip: anonymizeIp(clientIp) });
  const session = await sessionStore.getOrCreateSession(clientIp);

  // Check if quota exceeded
  if (session.triesLeft <= 0) {
    logger.warn('Quota exceeded', { sessionId: session.sessionId });
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

const validatePhotoHandler = async (validatedInput, logger) => {
  const { sessionId, imageUrl } = validatedInput;

  // Verify session exists
  logger.info('Verifying session', { sessionId });
  const session = await sessionStore.getSession(sessionId);

  // Download image from S3 for validation
  logger.info('Downloading image for validation', { imageUrl });
  
  let imageBuffer;
  try {
    // Parse bucket and key from S3 URL
    const url = new URL(imageUrl);
    const hostParts = url.hostname.split('.');
    const bucketName = hostParts[0];
    const key = url.pathname.substring(1); // Remove leading /
    
    // Use S3 SDK to download directly (Lambda has IAM permissions)
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({ region: 'ap-south-1', signatureVersion: 'v4' });
    
    const s3Response = await s3.getObject({
      Bucket: bucketName,
      Key: key
    }).promise();
    
    imageBuffer = s3Response.Body;
  } catch (error) {
    logger.error('Failed to download image', { error: error.message });
    throw new PhotoValidationError('Failed to download image for validation', [{
      code: 'DOWNLOAD_FAILED',
      message: 'Could not retrieve image from S3'
    }]);
  }

  // Validate photo
  logger.info('Running photo validation');
  const validationResult = await photoValidator.validatePhoto(
    imageBuffer,
    'image/jpeg'
  );

  // Update session with validation results
  logger.info('Updating session with validation result', { 
    valid: validationResult.valid,
    type: validationResult.type 
  });
  
  await sessionStore.updateValidation(
    sessionId,
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

const processTryOnHandler = async (validatedInput, logger, event) => {
  const { sessionId, garmentUrl } = validatedInput;

  // Verify session
  logger.info('Verifying session for try-on', { sessionId });
  const session = await sessionStore.getSession(sessionId);

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

  // Consume one try
  logger.info('Consuming try', { sessionId });
  const triesRemaining = await sessionStore.consumeTry(sessionId);

  // Submit to FASHN API
  logger.info('Submitting to FASHN API', { 
    sessionId,
    personImageUrl: session.personImageUrl,
    garmentUrl 
  });

  try {
    const submission = await fashnClient.submitTryOnRequest({
      personImageUrl: session.personImageUrl,
      garmentImageUrl: garmentUrl,
      sessionId
    });

    logger.info('FASHN submission successful', { 
      predictionId: submission.predictionId 
    });

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

  } catch (error) {
    // Error handling without markFailed
    throw error;
  }
};

// ============================================================================
// Handler: GET /status/{sessionId}
// ============================================================================

const checkStatusHandler = async (validatedInput, logger) => {
  const { sessionId } = validatedInput;

  // Get session
  logger.info('Checking session status', { sessionId });
  const session = await sessionStore.getSession(sessionId);

  // If still processing, check with FASHN API
  if (session.status === 'processing' && session.predictionId) {
    try {
      const status = await fashnClient.checkPredictionStatus(session.predictionId);

      if (status.status === 'completed') {
        const resultUrl = status.output?.[0];
        if (resultUrl) {
          await sessionStore.saveResult(sessionId, resultUrl);
          session.status = 'completed';
          session.resultImageUrl = resultUrl;
        }
      } else if (status.status === 'failed') {
        await sessionStore.saveResult?.(sessionId, null);
        session.status = 'failed';
        session.errorMessage = status.error || 'Generation failed';
      }
    } catch (error) {
      logger.error('Failed to check FASHN status', { error: error.message });
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
    (body) => {
      const { sessionId } = body;
      if (!sessionId) throw new Error('sessionId is required');
      return { sessionId };
    },
    checkStatusHandler
  )
};
