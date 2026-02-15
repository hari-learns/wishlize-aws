/**
 * Property-Based Test: Package.json Completeness
 * 
 * Feature: wishlize-project-setup
 * Property 2: Package.json Completeness
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 14.1-14.7
 * 
 * This property test verifies that the package.json file contains all required
 * fields, dependencies, and scripts for the Wishlize backend project.
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

describe('Feature: wishlize-project-setup, Property 2: Package.json Completeness', () => {
  let packageJson;
  
  beforeAll(() => {
    const packagePath = path.join(__dirname, '../../package.json');
    const content = fs.readFileSync(packagePath, 'utf8');
    packageJson = JSON.parse(content);
  });

  it('should have name field set to "wishlize-backend"', () => {
    expect(packageJson.name).toBe('wishlize-backend');
  });

  it('should have engines.node specifying ">=18.0.0"', () => {
    expect(packageJson.engines).toBeDefined();
    expect(packageJson.engines.node).toBe('>=18.0.0');
  });

  it('should have aws-sdk in dependencies', () => {
    expect(packageJson.dependencies).toBeDefined();
    expect(packageJson.dependencies['aws-sdk']).toBeDefined();
    expect(packageJson.dependencies['aws-sdk']).toMatch(/^\^?2\./);
  });

  it('should have axios in dependencies', () => {
    expect(packageJson.dependencies).toBeDefined();
    expect(packageJson.dependencies['axios']).toBeDefined();
    expect(packageJson.dependencies['axios']).toMatch(/^\^?1\./);
  });

  it('should have all required scripts', () => {
    const requiredScripts = [
      'deploy',
      'deploy:dev',
      'deploy:prod',
      'logs',
      'remove',
      'test',
      'lint'
    ];

    expect(packageJson.scripts).toBeDefined();
    
    requiredScripts.forEach(script => {
      expect(packageJson.scripts[script]).toBeDefined();
      expect(packageJson.scripts[script]).not.toBe('');
    });
  });

  it('should have deploy script that runs serverless deploy', () => {
    expect(packageJson.scripts.deploy).toContain('serverless deploy');
  });

  it('should have deploy:dev script that deploys to dev stage', () => {
    expect(packageJson.scripts['deploy:dev']).toContain('serverless deploy');
    expect(packageJson.scripts['deploy:dev']).toContain('dev');
  });

  it('should have deploy:prod script that deploys to prod stage', () => {
    expect(packageJson.scripts['deploy:prod']).toContain('serverless deploy');
    expect(packageJson.scripts['deploy:prod']).toContain('prod');
  });

  it('should have logs script for tailing Lambda logs', () => {
    expect(packageJson.scripts.logs).toContain('serverless logs');
  });

  it('should have remove script for cleaning up resources', () => {
    expect(packageJson.scripts.remove).toContain('serverless remove');
  });

  it('should have test script', () => {
    expect(packageJson.scripts.test).toBeDefined();
    expect(packageJson.scripts.test).not.toBe('');
  });

  it('should have lint script for code quality checks', () => {
    expect(packageJson.scripts.lint).toContain('eslint');
  });

  // Property-based test: Verify package.json structure is valid across multiple reads
  it('should maintain valid JSON structure when parsed multiple times', () => {
    fc.assert(
      fc.property(fc.constant(packageJson), (pkg) => {
        // Property: Package.json should always be valid JSON with required fields
        const jsonString = JSON.stringify(pkg);
        const reparsed = JSON.parse(jsonString);
        
        return (
          reparsed.name === 'wishlize-backend' &&
          reparsed.engines?.node === '>=18.0.0' &&
          reparsed.dependencies?.['aws-sdk'] !== undefined &&
          reparsed.dependencies?.['axios'] !== undefined &&
          reparsed.scripts?.deploy !== undefined &&
          reparsed.scripts?.['deploy:dev'] !== undefined &&
          reparsed.scripts?.['deploy:prod'] !== undefined &&
          reparsed.scripts?.logs !== undefined &&
          reparsed.scripts?.remove !== undefined &&
          reparsed.scripts?.test !== undefined &&
          reparsed.scripts?.lint !== undefined
        );
      }),
      { numRuns: 100 }
    );
  });

  // Property-based test: All script values should be non-empty strings
  it('should have all scripts as non-empty strings', () => {
    fc.assert(
      fc.property(fc.constant(Object.entries(packageJson.scripts)), (scripts) => {
        return scripts.every(([key, value]) => {
          return typeof value === 'string' && value.length > 0;
        });
      }),
      { numRuns: 100 }
    );
  });

  // Property-based test: All dependencies should have valid version strings
  it('should have all dependencies with valid version strings', () => {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    fc.assert(
      fc.property(fc.constant(Object.entries(allDeps)), (deps) => {
        return deps.every(([key, value]) => {
          // Version should be a string and match semver pattern (with or without ^)
          return typeof value === 'string' && /^[\^~]?\d+\.\d+\.\d+/.test(value);
        });
      }),
      { numRuns: 100 }
    );
  });
});
