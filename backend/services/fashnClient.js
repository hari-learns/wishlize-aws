/**
 * FASHN API Client
 * 
 * Integrates with FASHN AI API for virtual try-on generation:
 * - Submit try-on requests
 * - Poll for job completion
 * - Handle retries and timeouts
 * - Error handling with safe messages
 */

const axios = require('axios');
const { 
  ExternalServiceError, 
  TimeoutError,
  ValidationError 
} = require('../lib/errors');

// FASHN API Configuration
const CONFIG = {
  BASE_URL: 'https://api.fashn.ai/v1',
  API_KEY: process.env.FASHN_API_KEY,
  MAX_POLL_ATTEMPTS: 60,           // 2 minutes with 2s intervals
  POLL_INTERVAL_MS: 2000,
  REQUEST_TIMEOUT_MS: 30000,       // 30 seconds for submission
  STATUS_TIMEOUT_MS: 10000,        // 10 seconds for status checks
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000
};

// Retryable HTTP status codes
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Sleep helper for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make HTTP request with retry logic
 * @param {Object} config - Axios config
 * @param {number} [maxRetries] - Max retry attempts
 * @returns {Promise<Object>} Response data
 */
async function makeRequestWithRetry(config, maxRetries = CONFIG.MAX_RETRY_ATTEMPTS) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx except specific codes)
      const status = error.response?.status;
      if (status && !RETRYABLE_STATUS_CODES.includes(status)) {
        throw error;
      }
      
      // Don't retry after last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff
      const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Submit try-on request to FASHN API
 * @param {Object} params - Request parameters
 * @param {string} params.personImageUrl - URL to person's photo
 * @param {string} params.garmentImageUrl - URL to garment image
 * @param {string} [params.sessionId] - Session ID for tracking
 * @returns {Promise<Object>} API response with prediction ID
 */
async function submitTryOnRequest(params) {
  const { personImageUrl, garmentImageUrl, sessionId } = params;

  // Validate inputs
  if (!personImageUrl || !garmentImageUrl) {
    throw new ValidationError('Both personImageUrl and garmentImageUrl are required');
  }

  if (!CONFIG.API_KEY) {
    throw new ExternalServiceError('FASHN API key not configured', 'fashn');
  }

  const requestBody = {
    model_image: personImageUrl,
    garment_image: garmentImageUrl,
    // Optional parameters for better results
    category: 'auto',           // Auto-detect garment category
    mode: 'quality',            // Prioritize quality over speed
    num_samples: 1              // Generate 1 image
  };

  const config = {
    method: 'POST',
    url: `${CONFIG.BASE_URL}/run`,
    headers: {
      'Authorization': `Bearer ${CONFIG.API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    data: requestBody,
    timeout: CONFIG.REQUEST_TIMEOUT_MS
  };

  try {
    const data = await makeRequestWithRetry(config);
    
    // Validate response
    if (!data.id) {
      throw new ExternalServiceError('Invalid response from FASHN API: missing prediction ID', 'fashn');
    }

    return {
      predictionId: data.id,
      status: data.status || 'processing',
      rawResponse: data
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;
    
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    
    if (status === 401) {
      throw new ExternalServiceError('FASHN API authentication failed', 'fashn');
    }
    if (status === 400) {
      throw new ExternalServiceError(`FASHN API request error: ${message}`, 'fashn');
    }
    if (status === 429) {
      throw new ExternalServiceError('FASHN API rate limit exceeded', 'fashn');
    }
    
    console.error('FASHN API submission error:', error.message);
    throw new ExternalServiceError('Failed to submit try-on request', 'fashn');
  }
}

/**
 * Check prediction status
 * @param {string} predictionId - FASHN prediction ID
 * @returns {Promise<Object>} Status response
 */
async function checkPredictionStatus(predictionId) {
  if (!predictionId) {
    throw new ValidationError('predictionId is required');
  }

  const config = {
    method: 'GET',
    url: `${CONFIG.BASE_URL}/status/${predictionId}`,
    headers: {
      'Authorization': `Bearer ${CONFIG.API_KEY}`,
      'Accept': 'application/json'
    },
    timeout: CONFIG.STATUS_TIMEOUT_MS
  };

  try {
    const data = await makeRequestWithRetry(config, 1); // Fewer retries for status checks
    return data;
  } catch (error) {
    const status = error.response?.status;
    
    if (status === 404) {
      throw new ExternalServiceError('Prediction not found', 'fashn');
    }
    
    console.error('FASHN API status check error:', error.message);
    throw new ExternalServiceError('Failed to check prediction status', 'fashn');
  }
}

/**
 * Poll for prediction completion
 * @param {string} predictionId - FASHN prediction ID
 * @param {Function} [onProgress] - Callback for progress updates (attempt, status)
 * @returns {Promise<Object>} Final result
 * @throws {TimeoutError}
 */
async function pollForResult(predictionId, onProgress = null) {
  if (!predictionId) {
    throw new ValidationError('predictionId is required');
  }

  for (let attempt = 0; attempt < CONFIG.MAX_POLL_ATTEMPTS; attempt++) {
    const status = await checkPredictionStatus(predictionId);
    
    // Call progress callback if provided
    if (onProgress) {
      onProgress(attempt, status.status);
    }

    // Check if completed
    if (status.status === 'completed') {
      if (!status.output || status.output.length === 0) {
        throw new ExternalServiceError('Prediction completed but no output URL', 'fashn');
      }
      
      return {
        status: 'completed',
        resultUrl: status.output[0],
        processingTime: status.processing_time,
        rawResponse: status
      };
    }

    // Check if failed
    if (status.status === 'failed' || status.status === 'error') {
      const errorMessage = status.error || 'Prediction failed';
      throw new ExternalServiceError(`Try-on generation failed: ${errorMessage}`, 'fashn');
    }

    // Check if canceled
    if (status.status === 'canceled') {
      throw new ExternalServiceError('Try-on generation was canceled', 'fashn');
    }

    // Wait before next poll
    await sleep(CONFIG.POLL_INTERVAL_MS);
  }

  // Max attempts reached
  throw new TimeoutError('Try-on generation timed out');
}

/**
 * Complete try-on flow: submit and poll for result
 * @param {Object} params - Request parameters
 * @param {string} params.personImageUrl - URL to person's photo
 * @param {string} params.garmentImageUrl - URL to garment image
 * @param {Function} [onProgress] - Progress callback
 * @returns {Promise<Object>} Final result
 */
async function generateTryOn(params, onProgress = null) {
  // Submit request
  const submission = await submitTryOnRequest(params);
  
  if (onProgress) {
    onProgress(0, 'submitted', { predictionId: submission.predictionId });
  }

  // Poll for result
  const result = await pollForResult(submission.predictionId, onProgress);
  
  return result;
}

/**
 * Validate image URLs before submission
 * @param {string} personImageUrl - Person image URL
 * @param {string} garmentImageUrl - Garment image URL
 * @returns {Object} Validation result
 */
function validateImageUrls(personImageUrl, garmentImageUrl) {
  const errors = [];

  // Check if URLs are HTTPS
  try {
    const personUrl = new URL(personImageUrl);
    if (personUrl.protocol !== 'https:') {
      errors.push({
        field: 'personImageUrl',
        message: 'Person image URL must use HTTPS'
      });
    }
  } catch (e) {
    errors.push({
      field: 'personImageUrl',
      message: 'Invalid person image URL'
    });
  }

  try {
    const garmentUrl = new URL(garmentImageUrl);
    if (garmentUrl.protocol !== 'https:') {
      errors.push({
        field: 'garmentImageUrl',
        message: 'Garment image URL must use HTTPS'
      });
    }
  } catch (e) {
    errors.push({
      field: 'garmentImageUrl',
      message: 'Invalid garment image URL'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  submitTryOnRequest,
  checkPredictionStatus,
  pollForResult,
  generateTryOn,
  validateImageUrls,
  CONFIG
};
