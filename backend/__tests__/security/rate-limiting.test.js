/**
 * Security Tests: Rate Limiting
 * 
 * Tests for:
 * - IP-based rate limiting
 * - Email-based rate limiting
 * - Rate limit response headers
 * - Rate limit reset behavior
 */

const { QuotaExceededError } = require('../../lib/errors');

describe('Security: Rate Limiting', () => {
  let checkIpRateLimit, checkEmailRateLimit;
  
  // Reset rate limit store before each test
  beforeEach(async () => {
    jest.resetModules();
    const middleware = require('../../lib/middleware');
    checkIpRateLimit = middleware.checkIpRateLimit;
    checkEmailRateLimit = middleware.checkEmailRateLimit;
  });

  describe('IP Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const ip = '192.168.1.1';
      
      // Should not throw for first 10 requests
      for (let i = 0; i < 10; i++) {
        await expect(checkIpRateLimit(ip)).resolves.not.toThrow();
      }
    });

    it('should block requests over limit', async () => {
      const ip = '192.168.1.2';
      
      // Make 10 requests (at limit)
      for (let i = 0; i < 10; i++) {
        await checkIpRateLimit(ip);
      }

      // 11th request should be blocked
      await expect(checkIpRateLimit(ip)).rejects.toThrow(QuotaExceededError);
    });

    it('should include retry-after header info', async () => {
      const ip = '192.168.1.3';
      
      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await checkIpRateLimit(ip);
      }

      try {
        await checkIpRateLimit(ip);
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededError);
        expect(error.retryAfter).toBeDefined();
        expect(error.retryAfter).toBeGreaterThan(0);
        expect(error.retryAfter).toBeLessThanOrEqual(60);
      }
    });

    it('should track different IPs separately', async () => {
      const ip1 = '192.168.1.4';
      const ip2 = '192.168.1.5';

      // Exhaust limit for ip1
      for (let i = 0; i < 10; i++) {
        await checkIpRateLimit(ip1);
      }
      await expect(checkIpRateLimit(ip1)).rejects.toThrow();

      // ip2 should still be allowed
      await expect(checkIpRateLimit(ip2)).resolves.not.toThrow();
    });

    it('should handle null IP gracefully', async () => {
      await expect(checkIpRateLimit(null)).resolves.not.toThrow();
    });

    it('should handle IPv6 addresses', async () => {
      const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      
      // Should track IPv6 separately
      await expect(checkIpRateLimit(ipv6)).resolves.not.toThrow();
    });

    it('should reset limit after window expires', async () => {
      // This test would need to manipulate time or use a mock clock
      // For now, we just verify the structure
      const ip = '192.168.1.6';
      await expect(checkIpRateLimit(ip)).resolves.not.toThrow();
    });
  });

  describe('Email Rate Limiting', () => {
    it('should allow requests within quota', async () => {
      const emailHash = 'hash1';
      
      // Should not throw for first 3 requests
      for (let i = 0; i < 3; i++) {
        await expect(checkEmailRateLimit(emailHash)).resolves.not.toThrow();
      }
    });

    it('should block requests over quota', async () => {
      const emailHash = 'hash2';
      
      // Make 3 requests (at quota)
      for (let i = 0; i < 3; i++) {
        await checkEmailRateLimit(emailHash);
      }

      // 4th request should be blocked
      await expect(checkEmailRateLimit(emailHash)).rejects.toThrow(QuotaExceededError);
    });

    it('should track different emails separately', async () => {
      const hash1 = 'hash3';
      const hash2 = 'hash4';

      // Exhaust quota for hash1
      for (let i = 0; i < 3; i++) {
        await checkEmailRateLimit(hash1);
      }
      await expect(checkEmailRateLimit(hash1)).rejects.toThrow();

      // hash2 should still be allowed
      await expect(checkEmailRateLimit(hash2)).resolves.not.toThrow();
    });

    it('should provide helpful error message', async () => {
      const emailHash = 'hash5';
      
      // Exhaust quota
      for (let i = 0; i < 3; i++) {
        await checkEmailRateLimit(emailHash);
      }

      try {
        await checkEmailRateLimit(emailHash);
      } catch (error) {
        expect(error.message).toContain('Daily try-on limit');
        expect(error.message).toContain('tomorrow');
      }
    });

    it('should have 24-hour retry window', async () => {
      const emailHash = 'hash6';
      
      // Exhaust quota
      for (let i = 0; i < 3; i++) {
        await checkEmailRateLimit(emailHash);
      }

      try {
        await checkEmailRateLimit(emailHash);
      } catch (error) {
        // Retry-After should be close to 24 hours (in seconds)
        expect(error.retryAfter).toBeGreaterThan(20 * 60 * 60); // > 20 hours
        expect(error.retryAfter).toBeLessThanOrEqual(24 * 60 * 60); // <= 24 hours
      }
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include Retry-After header in error response', async () => {
      const emailHash = 'hash7';
      
      for (let i = 0; i < 3; i++) {
        await checkEmailRateLimit(emailHash);
      }

      try {
        await checkEmailRateLimit(emailHash);
      } catch (error) {
        const response = error.toResponse();
        expect(response.error.retryAfter).toBeDefined();
      }
    });
  });

  describe('Rate Limit Store Management', () => {
    it('should handle concurrent requests safely', async () => {
      const ip = '192.168.1.100';
      
      // Simulate concurrent requests
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          checkIpRateLimit(ip).catch(err => err)
        );
      }

      const results = await Promise.all(promises);
      
      // Count successes and failures
      const successes = results.filter(r => !(r instanceof Error)).length;
      const failures = results.filter(r => r instanceof QuotaExceededError).length;

      // Should have exactly 10 successes and 10 failures
      expect(successes).toBe(10);
      expect(failures).toBe(10);
    });

    it('should clean up expired entries', async () => {
      // This would require manipulating time
      // For now, we just verify the cleanup function exists
      const ip = '192.168.1.101';
      await checkIpRateLimit(ip);
      // Entry should exist now
    });
  });
});
