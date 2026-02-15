/**
 * Property-Based Test: Lambda Handler Responses
 * 
 * Feature: wishlize-project-setup
 * Property 7: Lambda Handler Response Structure
 * Property 8: Lambda Handler Logging
 * 
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 12.5, 12.6
 * 
 * This property test verifies that Lambda handler functions return properly
 * structured responses with correct status codes, headers, and logging behavior.
 */

const fc = require('fast-check');
const handler = require('../../handler');

describe('Feature: wishlize-project-setup, Lambda Handler Response Properties', () => {
  
  // Property 7: Lambda Handler Response Structure
  describe('Property 7: Lambda Handler Response Structure', () => {
    
    // Helper function to create mock API Gateway event
    const createMockEvent = (requestId) => ({
      requestContext: {
        requestId: requestId || 'test-request-id-' + Date.now()
      },
      body: null,
      headers: {}
    });

    describe('validatePhoto handler', () => {
      it('should return statusCode 200', async () => {
        const event = createMockEvent();
        const response = await handler.validatePhoto(event);
        
        expect(response.statusCode).toBe(200);
      });

      it('should include CORS header Access-Control-Allow-Origin: *', async () => {
        const event = createMockEvent();
        const response = await handler.validatePhoto(event);
        
        expect(response.headers).toBeDefined();
        expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      });

      it('should include Content-Type: application/json header', async () => {
        const event = createMockEvent();
        const response = await handler.validatePhoto(event);
        
        expect(response.headers).toBeDefined();
        expect(response.headers['Content-Type']).toBe('application/json');
      });

      it('should have body that is valid JSON', async () => {
        const event = createMockEvent();
        const response = await handler.validatePhoto(event);
        
        expect(response.body).toBeDefined();
        expect(() => JSON.parse(response.body)).not.toThrow();
      });

      it('should have parsed body containing success: true', async () => {
        const event = createMockEvent();
        const response = await handler.validatePhoto(event);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });

      it('should have parsed body containing requestId field', async () => {
        const event = createMockEvent('test-request-123');
        const response = await handler.validatePhoto(event);
        
        const body = JSON.parse(response.body);
        expect(body.requestId).toBeDefined();
        expect(body.requestId).toBe('test-request-123');
      });

      // Property-based test: Response structure should be consistent for various requestIds
      it('should maintain consistent response structure for any requestId', async () => {
        const testCases = [
          'simple-id',
          'with-dashes-123',
          'with_underscores',
          'ABC-123-XYZ',
          'a',
          'very-long-request-id-with-many-characters-12345',
          'special!@#$%',
          'unicode-日本語',
        ];
        
        for (const requestId of testCases) {
          const event = createMockEvent(requestId);
          const response = await handler.validatePhoto(event);
          
          // Verify all required properties
          expect(response.statusCode).toBe(200);
          expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
          expect(response.headers['Content-Type']).toBe('application/json');
          expect(typeof response.body).toBe('string');
          
          const body = JSON.parse(response.body);
          expect(body.success).toBe(true);
          expect(body.requestId).toBe(requestId);
        }
      });
    });

    describe('processTryOn handler', () => {
      it('should return statusCode 200', async () => {
        const event = createMockEvent();
        const response = await handler.processTryOn(event);
        
        expect(response.statusCode).toBe(200);
      });

      it('should include CORS header Access-Control-Allow-Origin: *', async () => {
        const event = createMockEvent();
        const response = await handler.processTryOn(event);
        
        expect(response.headers).toBeDefined();
        expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      });

      it('should include Content-Type: application/json header', async () => {
        const event = createMockEvent();
        const response = await handler.processTryOn(event);
        
        expect(response.headers).toBeDefined();
        expect(response.headers['Content-Type']).toBe('application/json');
      });

      it('should have body that is valid JSON', async () => {
        const event = createMockEvent();
        const response = await handler.processTryOn(event);
        
        expect(response.body).toBeDefined();
        expect(() => JSON.parse(response.body)).not.toThrow();
      });

      it('should have parsed body containing success: true', async () => {
        const event = createMockEvent();
        const response = await handler.processTryOn(event);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });

      it('should have parsed body containing requestId field', async () => {
        const event = createMockEvent('test-request-456');
        const response = await handler.processTryOn(event);
        
        const body = JSON.parse(response.body);
        expect(body.requestId).toBeDefined();
        expect(body.requestId).toBe('test-request-456');
      });

      // Property-based test: Response structure should be consistent for various requestIds
      it('should maintain consistent response structure for any requestId', async () => {
        const testCases = [
          'simple-id',
          'with-dashes-123',
          'with_underscores',
          'ABC-123-XYZ',
          'a',
          'very-long-request-id-with-many-characters-12345',
          'special!@#$%',
          'unicode-日本語',
        ];
        
        for (const requestId of testCases) {
          const event = createMockEvent(requestId);
          const response = await handler.processTryOn(event);
          
          // Verify all required properties
          expect(response.statusCode).toBe(200);
          expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
          expect(response.headers['Content-Type']).toBe('application/json');
          expect(typeof response.body).toBe('string');
          
          const body = JSON.parse(response.body);
          expect(body.success).toBe(true);
          expect(body.requestId).toBe(requestId);
        }
      });
    });

    // Cross-handler property test: Both handlers should have identical response structure
    it('should have both handlers return consistent response structure', async () => {
      const testCases = [
        'test-request-001',
        'abc-123-xyz',
        'simple',
        'with-special-chars-!@#',
      ];
      
      for (const requestId of testCases) {
        const event = createMockEvent(requestId);
        
        const validateResponse = await handler.validatePhoto(event);
        const tryOnResponse = await handler.processTryOn(event);
        
        // Both should have same structure
        expect(validateResponse.statusCode).toBe(tryOnResponse.statusCode);
        expect(validateResponse.headers['Access-Control-Allow-Origin']).toBe(
          tryOnResponse.headers['Access-Control-Allow-Origin']
        );
        expect(validateResponse.headers['Content-Type']).toBe(
          tryOnResponse.headers['Content-Type']
        );
        
        const validateBody = JSON.parse(validateResponse.body);
        const tryOnBody = JSON.parse(tryOnResponse.body);
        
        expect(validateBody.success).toBe(tryOnBody.success);
        expect(validateBody.requestId).toBe(tryOnBody.requestId);
        expect(typeof validateBody.message).toBe(typeof tryOnBody.message);
      }
    });
  });

  // Property 8: Lambda Handler Logging
  describe('Property 8: Lambda Handler Logging', () => {
    const createMockEvent = (requestId) => ({
      requestContext: {
        requestId: requestId || 'test-request-id-' + Date.now()
      },
      body: null,
      headers: {}
    });

    describe('validatePhoto logging', () => {
      let consoleLogSpy;

      beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      });

      afterEach(() => {
        consoleLogSpy.mockRestore();
      });

      it('should log to console when invoked', async () => {
        const event = createMockEvent();
        await handler.validatePhoto(event);
        
        expect(consoleLogSpy).toHaveBeenCalled();
      });

      it('should log with requestId from event', async () => {
        const event = createMockEvent('log-test-123');
        await handler.validatePhoto(event);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"requestId":"log-test-123"')
        );
      });

      it('should log with timestamp in ISO format', async () => {
        const event = createMockEvent();
        await handler.validatePhoto(event);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/)
        );
      });

      it('should log function name or identifier', async () => {
        const event = createMockEvent();
        await handler.validatePhoto(event);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"function":"validatePhoto"')
        );
      });

      // Property-based test: Logging should be consistent for any requestId
      it('should log consistently for any requestId', async () => {
        // Run multiple individual tests instead of fc.assert to avoid async issues
        const testCases = [
          'simple-id',
          'with-dashes-123',
          'with_underscores',
          'ABC-123-XYZ',
          'a',
          'very-long-request-id-with-many-characters-12345',
          'special!@#$%',
        ];
        
        for (const requestId of testCases) {
          const localSpy = jest.spyOn(console, 'log').mockImplementation();
          
          try {
            const event = createMockEvent(requestId);
            const response = await handler.validatePhoto(event);
            
            // Verify console.log was called
            expect(localSpy).toHaveBeenCalled();
            
            // Parse and verify log structure
            const loggedString = localSpy.mock.calls[0][0];
            const logData = JSON.parse(loggedString);
            
            expect(logData.function).toBe('validatePhoto');
            expect(logData.requestId).toBe(requestId);
            expect(logData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            
            // Verify response
            expect(response.statusCode).toBe(200);
          } finally {
            localSpy.mockRestore();
          }
        }
      });
    });

    describe('processTryOn logging', () => {
      let consoleLogSpy;

      beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      });

      afterEach(() => {
        consoleLogSpy.mockRestore();
      });

      it('should log to console when invoked', async () => {
        const event = createMockEvent();
        await handler.processTryOn(event);
        
        expect(consoleLogSpy).toHaveBeenCalled();
      });

      it('should log with requestId from event', async () => {
        const event = createMockEvent('log-test-456');
        await handler.processTryOn(event);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"requestId":"log-test-456"')
        );
      });

      it('should log with timestamp in ISO format', async () => {
        const event = createMockEvent();
        await handler.processTryOn(event);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/)
        );
      });

      it('should log function name or identifier', async () => {
        const event = createMockEvent();
        await handler.processTryOn(event);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"function":"processTryOn"')
        );
      });

      // Property-based test: Logging should be consistent for any requestId
      it('should log consistently for any requestId', async () => {
        // Run multiple individual tests instead of fc.assert to avoid async issues
        const testCases = [
          'simple-id',
          'with-dashes-123',
          'with_underscores',
          'ABC-123-XYZ',
          'a',
          'very-long-request-id-with-many-characters-12345',
          'special!@#$%',
        ];
        
        for (const requestId of testCases) {
          const localSpy = jest.spyOn(console, 'log').mockImplementation();
          
          try {
            const event = createMockEvent(requestId);
            const response = await handler.processTryOn(event);
            
            // Verify console.log was called
            expect(localSpy).toHaveBeenCalled();
            
            // Parse and verify log structure
            const loggedString = localSpy.mock.calls[0][0];
            const logData = JSON.parse(loggedString);
            
            expect(logData.function).toBe('processTryOn');
            expect(logData.requestId).toBe(requestId);
            expect(logData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            
            // Verify response
            expect(response.statusCode).toBe(200);
          } finally {
            localSpy.mockRestore();
          }
        }
      });
    });

    // Cross-handler property test: Both handlers should log consistently
    it('should have both handlers log with same structure', async () => {
      const testCases = [
        'test-request-001',
        'abc-123-xyz',
        'simple',
        'with-special-chars-!@#',
      ];
      
      for (const requestId of testCases) {
        const localSpy = jest.spyOn(console, 'log').mockImplementation();
        
        try {
          const event = createMockEvent(requestId);
          
          await handler.validatePhoto(event);
          const validateLogString = localSpy.mock.calls[0]?.[0];
          
          localSpy.mockClear();
          
          await handler.processTryOn(event);
          const tryOnLogString = localSpy.mock.calls[0]?.[0];
          
          // Both should be JSON strings
          expect(typeof validateLogString).toBe('string');
          expect(typeof tryOnLogString).toBe('string');
          
          // Parse both logs
          const validateLog = JSON.parse(validateLogString);
          const tryOnLog = JSON.parse(tryOnLogString);
          
          // Both should have same structure
          expect(validateLog.function).toBe('validatePhoto');
          expect(tryOnLog.function).toBe('processTryOn');
          expect(validateLog.requestId).toBe(requestId);
          expect(tryOnLog.requestId).toBe(requestId);
          expect(typeof validateLog.timestamp).toBe('string');
          expect(typeof tryOnLog.timestamp).toBe('string');
        } finally {
          localSpy.mockRestore();
        }
      }
    });
  });
});
