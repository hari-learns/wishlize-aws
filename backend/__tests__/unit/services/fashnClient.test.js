/**
 * Unit Tests: FASHN API Client
 * 
 * Tests FASHN AI API integration including:
 * - Request submission
 * - Status polling
 * - Retry logic
 * - Error handling
 */

// Set API key before importing the module
process.env.FASHN_API_KEY = 'test-api-key';

const axios = require('axios');
const fashnClient = require('../../../services/fashnClient');
const { ExternalServiceError, TimeoutError, ValidationError } = require('../../../lib/errors');

// Mock axios
jest.mock('axios');

describe('FASHN API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure API key is set in CONFIG
    fashnClient.CONFIG.API_KEY = 'test-api-key';
    // Set low retry delay for faster tests
    fashnClient.CONFIG.RETRY_DELAY_MS = 10;
  });

  describe('submitTryOnRequest', () => {
    const validParams = {
      personImageUrl: 'https://s3.amazonaws.com/bucket/person.jpg',
      garmentImageUrl: 'https://s3.amazonaws.com/bucket/garment.jpg',
      sessionId: 'test-session'
    };

    it('should throw ValidationError for missing personImageUrl', async () => {
      await expect(fashnClient.submitTryOnRequest({ garmentImageUrl: 'url' }))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ValidationError for missing garmentImageUrl', async () => {
      await expect(fashnClient.submitTryOnRequest({ personImageUrl: 'url' }))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ExternalServiceError if API key not configured', async () => {
      delete process.env.FASHN_API_KEY;
      fashnClient.CONFIG.API_KEY = null;

      await expect(fashnClient.submitTryOnRequest(validParams))
        .rejects
        .toThrow('FASHN API key not configured');
      
      // Restore for other tests
      fashnClient.CONFIG.API_KEY = 'test-api-key';
    });

    it('should submit with correct payload', async () => {
      axios.mockResolvedValue({
        data: { id: 'pred-123', status: 'processing' }
      });

      await fashnClient.submitTryOnRequest(validParams);

      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: 'https://api.fashn.ai/v1/run',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data: expect.objectContaining({
          model_image: validParams.personImageUrl,
          garment_image: validParams.garmentImageUrl,
          category: 'auto',
          mode: 'quality',
          num_samples: 1
        })
      }));
    });

    it('should return prediction ID on success', async () => {
      axios.mockResolvedValue({
        data: { id: 'pred-123', status: 'processing' }
      });

      const result = await fashnClient.submitTryOnRequest(validParams);

      expect(result).toEqual({
        predictionId: 'pred-123',
        status: 'processing',
        rawResponse: { id: 'pred-123', status: 'processing' }
      });
    });

    it('should throw ExternalServiceError on 401', async () => {
      axios.mockRejectedValue({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      await expect(fashnClient.submitTryOnRequest(validParams))
        .rejects
        .toThrow('FASHN API authentication failed');
    });

    it('should throw ExternalServiceError on 400', async () => {
      axios.mockRejectedValue({
        response: { status: 400, data: { message: 'Invalid image' } }
      });

      await expect(fashnClient.submitTryOnRequest(validParams))
        .rejects
        .toThrow('FASHN API request error');
    });

    it('should throw ExternalServiceError on 429', async () => {
      axios.mockRejectedValue({
        response: { status: 429 }
      });

      await expect(fashnClient.submitTryOnRequest(validParams))
        .rejects
        .toThrow('FASHN API rate limit exceeded');
    });

    it('should throw ExternalServiceError on 5xx', async () => {
      axios.mockRejectedValue({
        response: { status: 500 }
      });

      await expect(fashnClient.submitTryOnRequest(validParams))
        .rejects
        .toThrow('Failed to submit try-on request');
    });

    it('should retry on retryable status codes', async () => {
      axios
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockRejectedValueOnce({ response: { status: 502 } })
        .mockResolvedValueOnce({ data: { id: 'pred-123', status: 'processing' } });

      const result = await fashnClient.submitTryOnRequest(validParams);

      expect(axios).toHaveBeenCalledTimes(3);
      expect(result.predictionId).toBe('pred-123');
    });

    it('should not retry on 4xx errors', async () => {
      axios.mockRejectedValue({
        response: { status: 400 }
      });

      await expect(fashnClient.submitTryOnRequest(validParams))
        .rejects
        .toThrow();

      expect(axios).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff for retries', async () => {
      jest.spyOn(global, 'setTimeout');

      axios
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ data: { id: 'pred-123', status: 'processing' } });

      await fashnClient.submitTryOnRequest(validParams);

      // First retry should use CONFIG.RETRY_DELAY_MS delay (10ms in tests)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 10);
    });
  });

  describe('checkPredictionStatus', () => {
    it('should throw ValidationError for missing predictionId', async () => {
      await expect(fashnClient.checkPredictionStatus(null))
        .rejects
        .toThrow(ValidationError);
    });

    it('should return status on success', async () => {
      axios.mockResolvedValue({
        data: {
          id: 'pred-123',
          status: 'processing',
          processing_time: 30
        }
      });

      const result = await fashnClient.checkPredictionStatus('pred-123');

      expect(result).toEqual({
        id: 'pred-123',
        status: 'processing',
        processing_time: 30
      });
    });

    it('should throw ExternalServiceError on 404', async () => {
      axios.mockRejectedValue({
        response: { status: 404 }
      });

      await expect(fashnClient.checkPredictionStatus('pred-123'))
        .rejects
        .toThrow('Prediction not found');
    });

    it('should call correct endpoint', async () => {
      axios.mockResolvedValue({ data: { status: 'processing' } });

      await fashnClient.checkPredictionStatus('pred-123');

      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'https://api.fashn.ai/v1/status/pred-123'
      }));
    });
  });

  describe('pollForResult', () => {
    beforeEach(() => {
      // Override poll config for faster tests via module mock
      fashnClient.CONFIG.MAX_POLL_ATTEMPTS = 5;
      fashnClient.CONFIG.POLL_INTERVAL_MS = 10;
    });
    
    afterEach(() => {
      // Restore defaults
      fashnClient.CONFIG.MAX_POLL_ATTEMPTS = 60;
      fashnClient.CONFIG.POLL_INTERVAL_MS = 2000;
    });

    it('should return result when completed', async () => {
      axios.mockResolvedValue({
        data: {
          id: 'pred-123',
          status: 'completed',
          output: ['https://results.example.com/image.jpg'],
          processing_time: 45
        }
      });

      const result = await fashnClient.pollForResult('pred-123');

      expect(result).toEqual({
        status: 'completed',
        resultUrl: 'https://results.example.com/image.jpg',
        processingTime: 45,
        rawResponse: expect.any(Object)
      });
    });

    it('should poll until completed', async () => {
      axios
        .mockResolvedValueOnce({ data: { status: 'processing' } })
        .mockResolvedValueOnce({ data: { status: 'processing' } })
        .mockResolvedValueOnce({
          data: {
            status: 'completed',
            output: ['https://results.example.com/image.jpg']
          }
        });

      const result = await fashnClient.pollForResult('pred-123');

      expect(axios).toHaveBeenCalledTimes(3);
      expect(result.status).toBe('completed');
    });

    it('should call onProgress callback', async () => {
      const onProgress = jest.fn();
      axios
        .mockResolvedValueOnce({ data: { status: 'processing' } })
        .mockResolvedValueOnce({
          data: {
            status: 'completed',
            output: ['url']
          }
        });

      await fashnClient.pollForResult('pred-123', onProgress);

      expect(onProgress).toHaveBeenCalledWith(0, 'processing');
    });

    it('should throw ExternalServiceError when failed', async () => {
      axios.mockResolvedValue({
        data: {
          status: 'failed',
          error: 'Model generation failed'
        }
      });

      await expect(fashnClient.pollForResult('pred-123'))
        .rejects
        .toThrow('Try-on generation failed: Model generation failed');
    });

    it('should throw ExternalServiceError when canceled', async () => {
      axios.mockResolvedValue({
        data: { status: 'canceled' }
      });

      await expect(fashnClient.pollForResult('pred-123'))
        .rejects
        .toThrow('Try-on generation was canceled');
    });

    it('should throw TimeoutError when max attempts reached', async () => {
      axios.mockResolvedValue({
        data: { status: 'processing' }
      });

      await expect(fashnClient.pollForResult('pred-123'))
        .rejects
        .toThrow(TimeoutError);
    });

    it('should throw error if no output URL on completion', async () => {
      axios.mockResolvedValue({
        data: { status: 'completed', output: [] }
      });

      await expect(fashnClient.pollForResult('pred-123'))
        .rejects
        .toThrow('no output URL');
    });
  });

  describe('generateTryOn', () => {
    const validParams = {
      personImageUrl: 'https://s3.amazonaws.com/bucket/person.jpg',
      garmentImageUrl: 'https://s3.amazonaws.com/bucket/garment.jpg'
    };

    beforeEach(() => {
      fashnClient.CONFIG.MAX_POLL_ATTEMPTS = 3;
      fashnClient.CONFIG.POLL_INTERVAL_MS = 10;
    });
    
    afterEach(() => {
      fashnClient.CONFIG.MAX_POLL_ATTEMPTS = 60;
      fashnClient.CONFIG.POLL_INTERVAL_MS = 2000;
    });

    it('should submit and poll for result', async () => {
      // Mock submission
      axios.mockResolvedValueOnce({
        data: { id: 'pred-123', status: 'processing' }
      });

      // Mock polling
      axios.mockResolvedValueOnce({
        data: {
          status: 'completed',
          output: ['https://results.example.com/image.jpg']
        }
      });

      const result = await fashnClient.generateTryOn(validParams);

      expect(result.status).toBe('completed');
      expect(result.resultUrl).toBe('https://results.example.com/image.jpg');
    });

    it('should call onProgress with predictionId', async () => {
      const onProgress = jest.fn();
      
      axios
        .mockResolvedValueOnce({ data: { id: 'pred-123', status: 'processing' } })
        .mockResolvedValueOnce({
          data: { status: 'completed', output: ['url'] }
        });

      await fashnClient.generateTryOn(validParams, onProgress);

      expect(onProgress).toHaveBeenCalledWith(0, 'submitted', { predictionId: 'pred-123' });
    });
  });

  describe('validateImageUrls', () => {
    it('should validate HTTPS person URL', () => {
      const result = fashnClient.validateImageUrls(
        'https://s3.amazonaws.com/bucket/person.jpg',
        'https://s3.amazonaws.com/bucket/garment.jpg'
      );

      expect(result.valid).toBe(true);
    });

    it('should reject HTTP person URL', () => {
      const result = fashnClient.validateImageUrls(
        'http://s3.amazonaws.com/bucket/person.jpg',
        'https://s3.amazonaws.com/bucket/garment.jpg'
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('personImageUrl');
    });

    it('should reject HTTP garment URL', () => {
      const result = fashnClient.validateImageUrls(
        'https://s3.amazonaws.com/bucket/person.jpg',
        'http://s3.amazonaws.com/bucket/garment.jpg'
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('garmentImageUrl');
    });

    it('should reject invalid person URL', () => {
      const result = fashnClient.validateImageUrls(
        'not-a-url',
        'https://s3.amazonaws.com/bucket/garment.jpg'
      );

      expect(result.valid).toBe(false);
    });

    it('should reject invalid garment URL', () => {
      const result = fashnClient.validateImageUrls(
        'https://s3.amazonaws.com/bucket/person.jpg',
        'not-a-url'
      );

      expect(result.valid).toBe(false);
    });
  });
});
