/**
 * Property-Based Test: Documentation and Git Configuration
 * 
 * Feature: wishlize-project-setup
 * Property 11: Git Ignore Security
 * Property 12: Post-Deployment Documentation Completeness
 * 
 * Validates: Requirements 6.4, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7
 * 
 * This property test verifies that git ignore rules prevent committing
 * sensitive data and that post-deployment documentation is complete.
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

describe('Feature: wishlize-project-setup, Documentation and Git Configuration Properties', () => {
  
  // Property 11: Git Ignore Security
  describe('Property 11: Git Ignore Security', () => {
    let gitignoreContent;
    let gitignoreRules;
    
    beforeAll(() => {
      const gitignorePath = path.join(__dirname, '../../../.gitignore');
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      
      // Parse .gitignore into individual rules (non-empty, non-comment lines)
      gitignoreRules = gitignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    });

    it('should exclude .env files to prevent committing secrets', () => {
      const envPatterns = ['.env', '.env.*', '.env.local', '.env.development.local', '.env.test.local', '.env.production.local'];
      const hasEnvPattern = envPatterns.some(pattern => 
        gitignoreRules.some(rule => rule === pattern || rule.includes('.env'))
      );
      expect(hasEnvPattern).toBe(true);
    });

    it('should exclude node_modules directory', () => {
      expect(gitignoreRules).toContain('node_modules/');
    });

    it('should exclude .serverless directory', () => {
      expect(gitignoreRules).toContain('.serverless/');
    });

    it('should exclude .aws directory to prevent committing AWS credentials', () => {
      expect(gitignoreRules).toContain('.aws/');
    });

    it('should exclude common build directories', () => {
      const buildPatterns = ['widget/build/', 'dist/', 'build/', '.build/'];
      const hasBuildPattern = buildPatterns.some(pattern => 
        gitignoreRules.includes(pattern)
      );
      expect(hasBuildPattern).toBe(true);
    });

    it('should exclude log files', () => {
      const logPatterns = ['*.log', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*'];
      const hasLogPattern = logPatterns.some(pattern => 
        gitignoreRules.includes(pattern)
      );
      expect(hasLogPattern).toBe(true);
    });

    it('should exclude OS-specific files', () => {
      const osPatterns = ['.DS_Store', 'Thumbs.db'];
      const hasOsPattern = osPatterns.some(pattern => 
        gitignoreRules.includes(pattern) || gitignoreRules.includes(pattern + '?')
      );
      expect(hasOsPattern).toBe(true);
    });

    it('should exclude IDE files', () => {
      const idePatterns = ['.vscode/', '.idea/', '*.swp', '*.swo'];
      const hasIdePattern = idePatterns.some(pattern => 
        gitignoreRules.includes(pattern)
      );
      expect(hasIdePattern).toBe(true);
    });

    // Property-based test: Git ignore should contain all critical security patterns
    it('should contain all critical security patterns to prevent credential leaks', () => {
      const criticalPatterns = [
        { pattern: '.env', description: 'environment files' },
        { pattern: '.aws/', description: 'AWS credentials' },
        { pattern: 'node_modules/', description: 'dependencies' },
        { pattern: '.serverless/', description: 'serverless artifacts' }
      ];

      fc.assert(
        fc.property(fc.constant(gitignoreRules), (rules) => {
          return criticalPatterns.every(({ pattern }) => {
            return rules.some(rule => 
              rule === pattern || 
              rule.includes(pattern.replace('/', '')) ||
              (pattern.includes('.env') && rule.includes('.env'))
            );
          });
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: No gitignore rule should be empty or malformed
    it('should have well-formed gitignore rules', () => {
      fc.assert(
        fc.property(fc.constant(gitignoreRules), (rules) => {
          return rules.every(rule => {
            return (
              typeof rule === 'string' &&
              rule.length > 0 &&
              rule.trim() === rule && // No leading/trailing whitespace
              !rule.includes('  ') // No double spaces
            );
          });
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Gitignore should prevent common security vulnerabilities
    it('should prevent common security vulnerabilities', () => {
      const securityPatterns = [
        '.env',           // Environment variables
        '.aws',           // AWS credentials
        '*.key',          // Private keys
        '*.pem',          // Certificate files
        'config.json',    // Configuration files that might contain secrets
        '.serverless'     // Deployment artifacts
      ];

      fc.assert(
        fc.property(fc.constant(gitignoreRules), (rules) => {
          return securityPatterns.some(pattern => {
            return rules.some(rule => 
              rule.includes(pattern.replace('*', '').replace('.', ''))
            );
          });
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Gitignore should handle different file extensions for env files
    it('should handle various environment file patterns', () => {
      const envVariations = ['.env', '.env.local', '.env.development', '.env.production', '.env.test'];
      
      fc.assert(
        fc.property(fc.constant(gitignoreRules), (rules) => {
          // Should have at least one pattern that covers .env files
          return rules.some(rule => {
            return envVariations.some(envFile => {
              return rule === envFile || 
                     rule === '.env.*' || 
                     rule.includes('.env') ||
                     (rule.includes('*') && rule.includes('.env'));
            });
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  // Property 12: Post-Deployment Documentation Completeness
  describe('Property 12: Post-Deployment Documentation Completeness', () => {
    let docContent;
    let docSections;
    
    beforeAll(() => {
      const docPath = path.join(__dirname, '../../../POST_DEPLOYMENT_TASKS.md');
      docContent = fs.readFileSync(docPath, 'utf8');
      
      // Parse document into sections based on ## headers
      docSections = {};
      const lines = docContent.split('\n');
      let currentSection = '';
      let currentContent = [];
      
      lines.forEach(line => {
        if (line.startsWith('## ')) {
          if (currentSection) {
            docSections[currentSection] = currentContent.join('\n');
          }
          currentSection = line.replace('## ', '').trim();
          currentContent = [];
        } else {
          currentContent.push(line);
        }
      });
      
      if (currentSection) {
        docSections[currentSection] = currentContent.join('\n');
      }
    });

    it('should include S3 bucket CORS configuration instructions', () => {
      const corsSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('s3') && key.toLowerCase().includes('cors')
      );
      expect(corsSection).toBeDefined();
      
      const corsContent = docSections[corsSection];
      expect(corsContent).toContain('wishlize-uploads');
      expect(corsContent).toContain('wishlize-results');
      expect(corsContent).toContain('wishlize-cdn');
      expect(corsContent).toContain('AllowedMethods');
      expect(corsContent).toContain('AllowedOrigins');
    });

    it('should include DynamoDB table configuration verification', () => {
      const dynamoSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('dynamodb')
      );
      expect(dynamoSection).toBeDefined();
      
      const dynamoContent = docSections[dynamoSection];
      expect(dynamoContent).toContain('WishlizeSessions');
      expect(dynamoContent).toContain('email');
      expect(dynamoContent).toContain('sessionId');
      expect(dynamoContent).toContain('Partition key');
      expect(dynamoContent).toContain('Sort key');
    });

    it('should include CloudWatch alarms configuration', () => {
      const cloudwatchSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('cloudwatch') && key.toLowerCase().includes('alarm')
      );
      expect(cloudwatchSection).toBeDefined();
      
      const cloudwatchContent = docSections[cloudwatchSection];
      expect(cloudwatchContent).toContain('Lambda Error Rate');
      expect(cloudwatchContent).toContain('Lambda Duration');
      expect(cloudwatchContent).toContain('5xx');
      expect(cloudwatchContent).toContain('SNS notification');
    });

    it('should include endpoint testing instructions with curl examples', () => {
      const testSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('test') && key.toLowerCase().includes('endpoint')
      );
      expect(testSection).toBeDefined();
      
      const testContent = docSections[testSection];
      expect(testContent).toContain('curl');
      expect(testContent).toContain('validate-photo');
      expect(testContent).toContain('process-tryon');
      expect(testContent).toContain('POST');
      expect(testContent).toContain('execute-api');
    });

    it('should include widget configuration update instructions', () => {
      const widgetSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('widget') && key.toLowerCase().includes('config')
      );
      expect(widgetSection).toBeDefined();
      
      const widgetContent = docSections[widgetSection];
      expect(widgetContent).toContain('config.js');
      expect(widgetContent).toContain('API_BASE');
      expect(widgetContent).toContain('execute-api');
    });

    it('should include IAM role permissions verification', () => {
      const iamSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('iam') && key.toLowerCase().includes('role')
      );
      expect(iamSection).toBeDefined();
      
      const iamContent = docSections[iamSection];
      expect(iamContent).toContain('S3');
      expect(iamContent).toContain('DynamoDB');
      expect(iamContent).toContain('Rekognition');
      expect(iamContent).toContain('CloudWatch');
      expect(iamContent).toContain('GetObject');
      expect(iamContent).toContain('PutObject');
    });

    it('should include CloudWatch logs verification instructions', () => {
      const logsSection = Object.keys(docSections).find(key => 
        key.toLowerCase().includes('cloudwatch') && key.toLowerCase().includes('log')
      );
      expect(logsSection).toBeDefined();
      
      const logsContent = docSections[logsSection];
      expect(logsContent).toContain('/aws/lambda/');
      expect(logsContent).toContain('validatePhoto');
      expect(logsContent).toContain('processTryOn');
      expect(logsContent).toContain('requestId');
    });

    // Property-based test: Documentation should contain all required sections
    it('should contain all required post-deployment sections', () => {
      const requiredSections = [
        'S3',
        'DynamoDB', 
        'CloudWatch',
        'Test',
        'Widget',
        'IAM'
      ];

      fc.assert(
        fc.property(fc.constant(Object.keys(docSections)), (sections) => {
          return requiredSections.every(required => {
            return sections.some(section => 
              section.toLowerCase().includes(required.toLowerCase())
            );
          });
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Each section should have substantial content
    it('should have substantial content in each section', () => {
      fc.assert(
        fc.property(fc.constant(docSections), (sections) => {
          return Object.values(sections).every(content => {
            return (
              typeof content === 'string' &&
              content.length > 50 && // At least 50 characters
              content.trim().length > 0
            );
          });
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Documentation should include code examples
    it('should include practical code examples and commands', () => {
      const codeIndicators = ['```', 'curl', 'json', 'bash', '`'];
      
      fc.assert(
        fc.property(fc.constant(docContent), (content) => {
          return codeIndicators.some(indicator => 
            content.includes(indicator)
          );
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Documentation should reference all AWS services used
    it('should reference all AWS services used in the project', () => {
      const awsServices = ['S3', 'DynamoDB', 'Lambda', 'CloudWatch', 'IAM', 'API Gateway'];
      
      fc.assert(
        fc.property(fc.constant(docContent), (content) => {
          return awsServices.every(service => 
            content.includes(service) || 
            content.toLowerCase().includes(service.toLowerCase())
          );
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Documentation should include security considerations
    it('should include security-related instructions', () => {
      const securityKeywords = ['CORS', 'permissions', 'credentials', 'IAM', 'SSL', 'certificate'];
      
      fc.assert(
        fc.property(fc.constant(docContent.toLowerCase()), (content) => {
          return securityKeywords.some(keyword => 
            content.includes(keyword.toLowerCase())
          );
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Documentation should have proper structure
    it('should have proper markdown structure with headers and sections', () => {
      fc.assert(
        fc.property(fc.constant(docContent), (content) => {
          const lines = content.split('\n');
          return (
            // Should have main title
            lines.some(line => line.startsWith('# ')) &&
            // Should have section headers
            lines.some(line => line.startsWith('## ')) &&
            // Should have proper markdown formatting
            content.includes('```') && // Code blocks
            content.includes('- [ ]') // Checklists
          );
        }),
        { numRuns: 100 }
      );
    });

    // Property-based test: Documentation should include completion checklist
    it('should include a completion checklist for verification', () => {
      fc.assert(
        fc.property(fc.constant(docContent), (content) => {
          return (
            content.includes('Checklist') || content.includes('checklist') ||
            content.includes('- [ ]') // Checkbox format
          ) && (
            content.includes('✅') || // Checkmark symbols
            content.includes('- [ ]') // Markdown checkboxes
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  // Cross-validation test: Git ignore and documentation consistency
  describe('Cross-Validation: Git Ignore and Documentation Consistency', () => {
    let gitignoreContent;
    let docContent;
    
    beforeAll(() => {
      const gitignorePath = path.join(__dirname, '../../../.gitignore');
      const docPath = path.join(__dirname, '../../../POST_DEPLOYMENT_TASKS.md');
      
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      docContent = fs.readFileSync(docPath, 'utf8');
    });

    it('should have consistent security practices between gitignore and documentation', () => {
      // If documentation mentions sensitive files, they should be in gitignore
      const sensitiveFiles = ['.env', '.aws', 'credentials'];
      
      sensitiveFiles.forEach(file => {
        if (docContent.toLowerCase().includes(file)) {
          expect(gitignoreContent.toLowerCase()).toContain(file);
        }
      });
    });

    // Property-based test: Security consistency
    it('should maintain security consistency between git ignore and documentation', () => {
      fc.assert(
        fc.property(fc.constant({ gitignore: gitignoreContent, doc: docContent }), (files) => {
          // If documentation mentions .env files, gitignore should exclude them
          const docMentionsEnv = files.doc.toLowerCase().includes('.env');
          const gitignoreExcludesEnv = files.gitignore.toLowerCase().includes('.env');
          
          return !docMentionsEnv || gitignoreExcludesEnv;
        }),
        { numRuns: 100 }
      );
    });
  });
});