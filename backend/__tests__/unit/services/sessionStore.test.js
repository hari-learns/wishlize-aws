/**
 * Unit Tests: Session Store Service
 * 
 * Tests DynamoDB session management including:
 * - Session creation and retrieval
 * - Quota enforcement
 * - State transitions
 * - PII protection (email hashing)
 */

const AWS = require('aws-sdk');
const sessionStore = require('../../../services/sessionStore');
const { NotFoundError, QuotaExceededError, ConflictError } = require('../../../lib/errors');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockPut = jest.fn();
  const mockGet = jest.fn();
  const mockQuery = jest.fn();
  const mockUpdate = jest.fn();

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        put: mockPut,
        get: mockGet,
        query: mockQuery,
        update: mockUpdate
      }))
    },
    __mockPut: mockPut,
    __mockGet: mockGet,
    __mockQuery: mockQuery,
    __mockUpdate: mockUpdate
  };
});

const mockPut = AWS.__mockPut;
const mockGet = AWS.__mockGet;
const mockQuery = AWS.__mockQuery;
const mockUpdate = AWS.__mockUpdate;

describe('Session Store Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashEmail', () => {
    it('should produce consistent hash for same email', () => {
      const hash1 = sessionStore.hashEmail('test@example.com');
      const hash2 = sessionStore.hashEmail('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different emails', () => {
      const hash1 = sessionStore.hashEmail('test1@example.com');
      const hash2 = sessionStore.hashEmail('test2@example.com');
      expect(hash1).not.toBe(hash2);
    });

    it('should normalize email case', () => {
      const hash1 = sessionStore.hashEmail('Test@Example.com');
      const hash2 = sessionStore.hashEmail('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should trim whitespace', () => {
      const hash1 = sessionStore.hashEmail('  test@example.com  ');
      const hash2 = sessionStore.hashEmail('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should return 32 character hash', () => {
      const hash = sessionStore.hashEmail('test@example.com');
      expect(hash).toHaveLength(32);
    });
  });

  describe('createSession', () => {
    beforeEach(() => {
      // Mock empty query result so createSession is triggered
      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [] })
      });
    });

    it('should create session with correct structure', async () => {
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      const result = await sessionStore.getOrCreateSession('test@example.com');

      expect(result).toHaveProperty('email'); // Hashed
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('triesLeft', 3);
      expect(result).toHaveProperty('status', 'created');
      expect(result).toHaveProperty('expiresAt');
    });

    it('should hash email for partition key', async () => {
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      await sessionStore.getOrCreateSession('test@example.com');

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Item.email).toBe(sessionStore.hashEmail('test@example.com'));
    });

    it('should encrypt email for storage', async () => {
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      await sessionStore.getOrCreateSession('test@example.com');

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Item.emailRaw).not.toBe('test@example.com'); // Should be encrypted
      expect(typeof putCall.Item.emailRaw).toBe('string');
    });

    it('should set TTL for 24 hours', async () => {
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });
      const beforeCreate = Math.floor(Date.now() / 1000);

      await sessionStore.getOrCreateSession('test@example.com');

      const putCall = mockPut.mock.calls[0][0];
      const afterCreate = Math.floor(Date.now() / 1000);
      
      expect(putCall.Item.expiresAt).toBeGreaterThanOrEqual(beforeCreate + 24 * 60 * 60 - 1);
      expect(putCall.Item.expiresAt).toBeLessThanOrEqual(afterCreate + 24 * 60 * 60 + 1);
    });

    it('should include metadata', async () => {
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      await sessionStore.getOrCreateSession('test@example.com', {
        userAgent: 'Mozilla/5.0',
        ipHash: 'abc123',
        source: 'widget'
      });

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Item.metadata).toEqual({
        userAgent: 'Mozilla/5.0',
        ipHash: 'abc123',
        source: 'widget'
      });
    });

    it('should truncate long user agent', async () => {
      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [] })
      });
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });
      const longUA = 'a'.repeat(300);

      await sessionStore.getOrCreateSession('test@example.com', {
        userAgent: longUA
      });

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Item.metadata.userAgent).toHaveLength(256);
    });

    it('should throw ConflictError on duplicate session', async () => {
      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [] })
      });
      const error = new Error('Conditional check failed');
      error.code = 'ConditionalCheckFailedException';
      mockPut.mockReturnValue({ promise: () => Promise.reject(error) });

      await expect(sessionStore.getOrCreateSession('test@example.com'))
        .rejects
        .toThrow();
    });
  });

  describe('getOrCreateSession', () => {
    it('should return existing active session', async () => {
      const existingSession = {
        email: sessionStore.hashEmail('test@example.com'),
        sessionId: 'existing-id',
        triesLeft: 2,
        status: 'created',
        createdAt: Date.now(),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [existingSession] })
      });

      const result = await sessionStore.getOrCreateSession('test@example.com');

      expect(result.sessionId).toBe('existing-id');
      expect(result.triesLeft).toBe(2);
    });

    it('should create new session if none exists', async () => {
      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [] })
      });
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      const result = await sessionStore.getOrCreateSession('test@example.com');

      expect(mockPut).toHaveBeenCalled();
      expect(result.triesLeft).toBe(3);
    });

    it('should create new session if existing is expired', async () => {
      const expiredSession = {
        email: sessionStore.hashEmail('test@example.com'),
        sessionId: 'expired-id',
        createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        expiresAt: Math.floor(Date.now() / 1000) - 3600 // Already expired
      };

      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [expiredSession] })
      });
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      const result = await sessionStore.getOrCreateSession('test@example.com');

      expect(mockPut).toHaveBeenCalled();
      expect(result.sessionId).not.toBe('expired-id');
    });

    it('should reset quota after 24 hours', async () => {
      const oldSession = {
        email: sessionStore.hashEmail('test@example.com'),
        sessionId: 'old-id',
        triesLeft: 0,
        createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      mockQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [oldSession] })
      });
      mockPut.mockReturnValue({ promise: () => Promise.resolve({}) });

      const result = await sessionStore.getOrCreateSession('test@example.com');

      expect(mockPut).toHaveBeenCalled();
      expect(result.triesLeft).toBe(3);
    });
  });

  describe('getSession', () => {
    it('should return session if found', async () => {
      const session = {
        email: sessionStore.hashEmail('test@example.com'),
        sessionId: 'test-id',
        triesLeft: 3,
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      mockGet.mockReturnValue({
        promise: () => Promise.resolve({ Item: session })
      });

      const result = await sessionStore.getSession('test-id', 'test@example.com');

      expect(result.sessionId).toBe('test-id');
    });

    it('should throw NotFoundError if session not found', async () => {
      mockGet.mockReturnValue({
        promise: () => Promise.resolve({ Item: null })
      });

      await expect(sessionStore.getSession('test-id', 'test@example.com'))
        .rejects
        .toThrow(NotFoundError);
    });

    it('should throw NotFoundError if session expired', async () => {
      const expiredSession = {
        email: sessionStore.hashEmail('test@example.com'),
        sessionId: 'test-id',
        expiresAt: Math.floor(Date.now() / 1000) - 3600 // Expired
      };

      mockGet.mockReturnValue({
        promise: () => Promise.resolve({ Item: expiredSession })
      });

      await expect(sessionStore.getSession('test-id', 'test@example.com'))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('consumeTry', () => {
    it('should decrement triesLeft', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: { triesLeft: 2 }
        })
      });

      const result = await sessionStore.consumeTry('test-id', 'test@example.com');

      expect(result).toBe(2);
    });

    it('should update status to processing', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: { triesLeft: 2, status: 'processing' }
        })
      });

      await sessionStore.consumeTry('test-id', 'test@example.com');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.ExpressionAttributeValues[':processing']).toBe('processing');
    });

    it('should throw QuotaExceededError if no tries left', async () => {
      const error = new Error('Conditional check failed');
      error.code = 'ConditionalCheckFailedException';
      mockUpdate.mockReturnValue({ promise: () => Promise.reject(error) });

      // Mock getSession to return session with 0 tries
      mockGet.mockReturnValue({
        promise: () => Promise.resolve({
          Item: { triesLeft: 0 }
        })
      });

      await expect(sessionStore.consumeTry('test-id', 'test@example.com'))
        .rejects
        .toThrow(QuotaExceededError);
    });

    it('should use conditional expression to prevent race conditions', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: { triesLeft: 2 }
        })
      });

      await sessionStore.consumeTry('test-id', 'test@example.com');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.ConditionExpression).toContain('triesLeft > :zero');
    });
  });

  describe('saveResult', () => {
    it('should save result URL', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: {
            status: 'completed',
            resultImageUrl: 'https://results.example.com/image.jpg'
          }
        })
      });

      const result = await sessionStore.saveResult(
        'test-id',
        'test@example.com',
        'https://results.example.com/image.jpg'
      );

      expect(result.status).toBe('completed');
      expect(result.resultImageUrl).toBe('https://results.example.com/image.jpg');
    });

    it('should only update when status is processing', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: { status: 'completed' }
        })
      });

      await sessionStore.saveResult('test-id', 'test@example.com', 'url');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.ConditionExpression).toBe('#status = :processing');
    });

    it('should throw error if session not in processing state', async () => {
      const error = new Error('Conditional check failed');
      error.code = 'ConditionalCheckFailedException';
      mockUpdate.mockReturnValue({ promise: () => Promise.reject(error) });

      await expect(sessionStore.saveResult('test-id', 'test@example.com', 'url'))
        .rejects
        .toThrow();
    });
  });

  describe('markFailed', () => {
    it('should update status to failed', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: {
            status: 'failed',
            errorMessage: 'Something went wrong'
          }
        })
      });

      const result = await sessionStore.markFailed('test-id', 'test@example.com', 'Something went wrong');

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Something went wrong');
    });

    it('should truncate long error messages', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: { status: 'failed' }
        })
      });

      const longError = 'a'.repeat(600);
      await sessionStore.markFailed('test-id', 'test@example.com', longError);

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.ExpressionAttributeValues[':error'].length).toBeLessThanOrEqual(500);
    });
  });

  describe('updateValidation', () => {
    it('should update session with validation result', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({
          Attributes: {
            status: 'validated',
            validationResult: { valid: true },
            personImageUrl: 'https://uploads.example.com/photo.jpg'
          }
        })
      });

      const result = await sessionStore.updateValidation(
        'test-id',
        'test@example.com',
        { valid: true },
        'https://uploads.example.com/photo.jpg'
      );

      expect(result.status).toBe('validated');
    });

    it('should accept transition from created to validated', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({ Attributes: {} })
      });

      await sessionStore.updateValidation('test-id', 'test@example.com', {}, 'url');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.ConditionExpression).toContain(':created');
    });

    it('should accept re-validation', async () => {
      mockUpdate.mockReturnValue({
        promise: () => Promise.resolve({ Attributes: {} })
      });

      await sessionStore.updateValidation('test-id', 'test@example.com', {}, 'url');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.ConditionExpression).toContain(':validated');
    });
  });
});
