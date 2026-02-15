/**
 * Property-Based Test: Serverless Configuration
 * 
 * Feature: wishlize-project-setup
 * Property 3: Serverless Provider Configuration
 * Property 4: Lambda Function Definitions
 * Property 5: IAM Least-Privilege Permissions
 * Property 6: Environment Variable Configuration
 * Property 14: CORS Enabled for All Endpoints
 * 
 * Validates: Requirements 3.2-3.8, 5.1-5.5, 6.2, 8.1, 8.5, 11.3, 11.4, 11.9, 11.10
 * 
 * This property test verifies that the serverless.yml file contains all required
 * configuration for AWS Lambda deployment with proper security and CORS settings.
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('Feature: wishlize-project-setup, Serverless Configuration Properties', () => {
  let serverlessConfig;
  
  beforeAll(() => {
    const serverlessPath = path.join(__dirname, '../../serverless.yml');
    const content = fs.readFileSync(serverlessPath, 'utf8');
    serverlessConfig = yaml.load(content);
  });

  // Property 3: Serverless Provider Configuration
  describe('Property 3: Serverless Provider Configuration', () => {
    it('should have provider.name set to "aws"', () => {
      expect(serverlessConfig.provider).toBeDefined();
      expect(serverlessConfig.provider.name).toBe('aws');
    });

    it('should have provider.runtime set to "nodejs18.x"', () => {
      expect(serverlessConfig.provider.runtime).toBe('nodejs18.x');
    });

    it('should have provider.region set to "ap-south-1"', () => {
      expect(serverlessConfig.provider.region).toBe('ap-south-1');
    });

    it('should have logs.restApi enabled', () => {
      expect(serverlessConfig.provider.logs).toBeDefined();
      expect(serverlessConfig.provider.logs.restApi).toBe(true);
    });

    it('should have tracing.lambda enabled', () => {
      expect(serverlessConfig.provider.tracing).toBeDefined();
      expect(serverlessConfig.provider.tracing.lambda).toBe(true);
    });

    it('should have tracing.apiGateway enabled', () => {
      expect(serverlessConfig.provider.tracing).toBeDefined();
      expect(serverlessConfig.provider.tracing.apiGateway).toBe(true);
    });

    // Property-based test: Provider configuration should be consistent
    it('should maintain consistent provider configuration across multiple reads', () => {
      fc.assert(
        fc.property(fc.constant(serverlessConfig.provider), (provider) => {
          return (
            provider.name === 'aws' &&
            provider.runtime === 'nodejs18.x' &&
            provider.region === 'ap-south-1' &&
            provider.logs?.restApi === true &&
            provider.tracing?.lambda === true &&
            provider.tracing?.apiGateway === true
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  // Property 4: Lambda Function Definitions
  describe('Property 4: Lambda Function Definitions', () => {
    it('should define validatePhoto function', () => {
      expect(serverlessConfig.functions).toBeDefined();
      expect(serverlessConfig.functions.validatePhoto).toBeDefined();
    });

    it('should define processTryOn function', () => {
      expect(serverlessConfig.functions).toBeDefined();
      expect(serverlessConfig.functions.processTryOn).toBeDefined();
    });

    it('should have validatePhoto with HTTP POST endpoint', () => {
      const validatePhoto = serverlessConfig.functions.validatePhoto;
      expect(validatePhoto.events).toBeDefined();
      expect(validatePhoto.events.length).toBeGreaterThan(0);
      
      const httpEvent = validatePhoto.events.find(e => e.http);
      expect(httpEvent).toBeDefined();
      expect(httpEvent.http.method).toBe('post');
    });

    it('should have processTryOn with HTTP POST endpoint', () => {
      const processTryOn = serverlessConfig.functions.processTryOn;
      expect(processTryOn.events).toBeDefined();
      expect(processTryOn.events.length).toBeGreaterThan(0);
      
      const httpEvent = processTryOn.events.find(e => e.http);
      expect(httpEvent).toBeDefined();
      expect(httpEvent.http.method).toBe('post');
    });

    it('should have processTryOn with timeout of 30 seconds', () => {
      const processTryOn = serverlessConfig.functions.processTryOn;
      expect(processTryOn.timeout).toBe(30);
    });

    it('should have processTryOn with memorySize >= 512', () => {
      const processTryOn = serverlessConfig.functions.processTryOn;
      expect(processTryOn.memorySize).toBeDefined();
      expect(processTryOn.memorySize).toBeGreaterThanOrEqual(512);
    });

    it('should have validatePhoto with memorySize >= 512', () => {
      const validatePhoto = serverlessConfig.functions.validatePhoto;
      expect(validatePhoto.memorySize).toBeDefined();
      expect(validatePhoto.memorySize).toBeGreaterThanOrEqual(512);
    });

    // Property-based test: All functions should have valid configuration
    it('should have all functions with valid handler and memory configuration', () => {
      fc.assert(
        fc.property(fc.constant(Object.entries(serverlessConfig.functions)), (functions) => {
          return functions.every(([name, config]) => {
            return (
              typeof config.handler === 'string' &&
              config.handler.length > 0 &&
              typeof config.memorySize === 'number' &&
              config.memorySize >= 512
            );
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  // Property 5: IAM Least-Privilege Permissions
  describe('Property 5: IAM Least-Privilege Permissions', () => {
    let iamStatements;

    beforeAll(() => {
      iamStatements = serverlessConfig.provider.iam?.role?.statements || [];
    });

    it('should have IAM role statements defined', () => {
      expect(iamStatements.length).toBeGreaterThan(0);
    });

    it('should grant S3 permissions only to wishlize-* buckets (not wildcards)', () => {
      const s3Statement = iamStatements.find(stmt => 
        stmt.Action?.includes('s3:GetObject') || stmt.Action?.includes('s3:PutObject')
      );
      
      expect(s3Statement).toBeDefined();
      expect(s3Statement.Resource).toBeDefined();
      expect(Array.isArray(s3Statement.Resource)).toBe(true);
      
      // Verify all S3 resources are specific bucket ARNs, not wildcards
      s3Statement.Resource.forEach(resource => {
        expect(resource).toMatch(/^arn:aws:s3:::wishlize-[a-z]+\/\*$/);
        expect(resource).not.toBe('arn:aws:s3:::*');
        expect(resource).not.toBe('*');
      });
    });

    it('should grant S3 GetObject and PutObject permissions', () => {
      const s3Statement = iamStatements.find(stmt => 
        stmt.Action?.includes('s3:GetObject')
      );
      
      expect(s3Statement).toBeDefined();
      expect(s3Statement.Action).toContain('s3:GetObject');
      expect(s3Statement.Action).toContain('s3:PutObject');
    });

    it('should grant Rekognition DetectFaces permission', () => {
      const rekognitionStatement = iamStatements.find(stmt => 
        stmt.Action?.includes('rekognition:DetectFaces')
      );
      
      expect(rekognitionStatement).toBeDefined();
      expect(rekognitionStatement.Action).toContain('rekognition:DetectFaces');
      // Rekognition is a service-level permission, so Resource: '*' is acceptable
      expect(rekognitionStatement.Resource).toBe('*');
    });

    it('should grant DynamoDB permissions only to WishlizeSessions table (not wildcards)', () => {
      const dynamoStatement = iamStatements.find(stmt => 
        stmt.Action?.includes('dynamodb:GetItem')
      );
      
      expect(dynamoStatement).toBeDefined();
      expect(dynamoStatement.Resource).toBeDefined();
      expect(Array.isArray(dynamoStatement.Resource)).toBe(true);
      
      // Verify all DynamoDB resources are specific table ARNs, not wildcards
      dynamoStatement.Resource.forEach(resource => {
        expect(resource).toMatch(/^arn:aws:dynamodb:ap-south-1:\*:table\/WishlizeSessions$/);
        expect(resource).not.toBe('arn:aws:dynamodb:*');
        expect(resource).not.toBe('*');
      });
    });

    it('should grant DynamoDB GetItem, PutItem, UpdateItem, Query permissions', () => {
      const dynamoStatement = iamStatements.find(stmt => 
        stmt.Action?.includes('dynamodb:GetItem')
      );
      
      expect(dynamoStatement).toBeDefined();
      expect(dynamoStatement.Action).toContain('dynamodb:GetItem');
      expect(dynamoStatement.Action).toContain('dynamodb:PutItem');
      expect(dynamoStatement.Action).toContain('dynamodb:UpdateItem');
      expect(dynamoStatement.Action).toContain('dynamodb:Query');
    });

    // Property-based test: IAM statements should follow least-privilege principle
    it('should not use wildcard resources for S3 or DynamoDB', () => {
      fc.assert(
        fc.property(fc.constant(iamStatements), (statements) => {
          return statements.every(stmt => {
            // Skip Rekognition which legitimately uses '*'
            if (stmt.Action?.some(action => action.startsWith('rekognition:'))) {
              return true;
            }
            
            // For S3 and DynamoDB, resources should not be plain wildcards
            if (stmt.Action?.some(action => action.startsWith('s3:') || action.startsWith('dynamodb:'))) {
              if (Array.isArray(stmt.Resource)) {
                return stmt.Resource.every(r => r !== '*' && r.includes('arn:aws:'));
              }
              return stmt.Resource !== '*' && stmt.Resource.includes('arn:aws:');
            }
            
            return true;
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  // Property 6: Environment Variable Configuration
  describe('Property 6: Environment Variable Configuration', () => {
    it('should reference FASHN_API_KEY from environment', () => {
      expect(serverlessConfig.provider.environment).toBeDefined();
      expect(serverlessConfig.provider.environment.FASHN_API_KEY).toBeDefined();
      expect(serverlessConfig.provider.environment.FASHN_API_KEY).toMatch(/\$\{env:FASHN_API_KEY\}/);
    });

    it('should not set AWS_REGION in environment (reserved by Lambda)', () => {
      // AWS_REGION is automatically provided by Lambda runtime
      expect(serverlessConfig.provider.environment.AWS_REGION).toBeUndefined();
    });

    it('should reference DYNAMO_TABLE from environment', () => {
      expect(serverlessConfig.provider.environment.DYNAMO_TABLE).toBeDefined();
      expect(serverlessConfig.provider.environment.DYNAMO_TABLE).toMatch(/\$\{env:DYNAMO_TABLE\}/);
    });

    it('should have S3_UPLOAD_BUCKET as direct value', () => {
      expect(serverlessConfig.provider.environment.S3_UPLOAD_BUCKET).toBe('wishlize-uploads');
    });

    it('should have S3_RESULTS_BUCKET as direct value', () => {
      expect(serverlessConfig.provider.environment.S3_RESULTS_BUCKET).toBe('wishlize-results');
    });

    it('should have S3_CDN_BUCKET as direct value', () => {
      expect(serverlessConfig.provider.environment.S3_CDN_BUCKET).toBe('wishlize-cdn');
    });

    // Property-based test: Environment variables should be properly configured
    it('should have all required environment variables defined', () => {
      fc.assert(
        fc.property(fc.constant(serverlessConfig.provider.environment), (env) => {
          const requiredEnvVars = [
            'FASHN_API_KEY',

            'DYNAMO_TABLE',
            'S3_UPLOAD_BUCKET',
            'S3_RESULTS_BUCKET',
            'S3_CDN_BUCKET'
          ];
          
          return requiredEnvVars.every(varName => env[varName] !== undefined);
        }),
        { numRuns: 100 }
      );
    });
  });

  // Property 14: CORS Enabled for All Endpoints
  describe('Property 14: CORS Enabled for All Endpoints', () => {
    it('should have CORS enabled for validatePhoto endpoint', () => {
      const validatePhoto = serverlessConfig.functions.validatePhoto;
      const httpEvent = validatePhoto.events.find(e => e.http);
      
      expect(httpEvent).toBeDefined();
      expect(httpEvent.http.cors).toBe(true);
    });

    it('should have CORS enabled for processTryOn endpoint', () => {
      const processTryOn = serverlessConfig.functions.processTryOn;
      const httpEvent = processTryOn.events.find(e => e.http);
      
      expect(httpEvent).toBeDefined();
      expect(httpEvent.http.cors).toBe(true);
    });

    // Property-based test: All HTTP endpoints should have CORS enabled
    it('should have CORS enabled for all HTTP endpoints', () => {
      fc.assert(
        fc.property(fc.constant(Object.values(serverlessConfig.functions)), (functions) => {
          return functions.every(func => {
            if (!func.events) return true;
            
            const httpEvents = func.events.filter(e => e.http);
            if (httpEvents.length === 0) return true;
            
            return httpEvents.every(event => event.http.cors === true);
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  // Cross-property test: Verify overall configuration consistency
  describe('Cross-Property Validation', () => {
    it('should have consistent configuration across all properties', () => {
      fc.assert(
        fc.property(fc.constant(serverlessConfig), (config) => {
          // Verify provider configuration
          const providerValid = (
            config.provider?.name === 'aws' &&
            config.provider?.runtime === 'nodejs18.x' &&
            config.provider?.region === 'ap-south-1'
          );
          
          // Verify functions exist
          const functionsValid = (
            config.functions?.validatePhoto !== undefined &&
            config.functions?.processTryOn !== undefined
          );
          
          // Verify IAM statements exist
          const iamValid = (
            config.provider?.iam?.role?.statements?.length > 0
          );
          
          // Verify environment variables exist
          const envValid = (
            config.provider?.environment?.FASHN_API_KEY !== undefined &&
            config.provider?.environment?.DYNAMO_TABLE !== undefined
          );
          
          return providerValid && functionsValid && iamValid && envValid;
        }),
        { numRuns: 100 }
      );
    });
  });
});
