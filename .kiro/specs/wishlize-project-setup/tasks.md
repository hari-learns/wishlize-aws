# Implementation Plan: Wishlize Project Setup

## Overview

This implementation plan breaks down the Wishlize project structure setup and Phase 1 infrastructure initialization into discrete, actionable coding tasks. Each task builds incrementally on previous work, ensuring the project structure is created correctly, configuration files are properly set up, and the initial Lambda functions can be deployed and verified.

The implementation follows this sequence:
1. Create project directory structure
2. Initialize backend with package.json and dependencies
3. Configure Serverless Framework with serverless.yml
4. Implement initial Lambda handlers
5. Create environment configuration files
6. Set up widget configuration
7. Create demo store pages
8. Create documentation and git configuration
9. Validate the complete setup

## Tasks

- [x] 1. Create project directory structure
  - Create all required directories: backend/, backend/validators/, backend/services/, widget/src/, widget/build/, demo-store/, demo-store/product/, demo-store/assets/images/, demo-store/assets/css/
  - Ensure directories are created with proper permissions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 10.3, 10.4_

- [x] 2. Initialize backend Node.js project
  - [x] 2.1 Create backend/package.json with project metadata
    - Set name to "wishlize-backend"
    - Set version to "1.0.0"
    - Set description to "Wishlize virtual try-on backend API"
    - Set main to "handler.js"
    - Set engines.node to ">=18.0.0"
    - Add all required scripts: deploy, deploy:dev, deploy:prod, logs, logs:tryon, remove, test, lint
    - _Requirements: 2.1, 2.4, 2.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  
  - [x] 2.2 Add dependencies to package.json
    - Add aws-sdk ^2.1500.0 to dependencies
    - Add axios ^1.6.0 to dependencies
    - Add serverless ^3.38.0 to devDependencies
    - Add serverless-offline ^13.3.0 to devDependencies
    - Add serverless-dotenv-plugin ^6.0.0 to devDependencies
    - Add eslint ^8.55.0 to devDependencies
    - _Requirements: 2.2, 2.3_
  
  - [x] 2.3 Write property test for package.json completeness
    - **Property 2: Package.json Completeness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 14.1-14.7**

- [ ] 3. Create Serverless Framework configuration
  - [x] 3.1 Create backend/serverless.yml with provider configuration
    - Set service name to "wishlize-backend"
    - Set frameworkVersion to "3"
    - Configure provider: aws, nodejs18.x, ap-south-1
    - Enable logs.restApi: true
    - Enable tracing for Lambda and API Gateway
    - Set stage to ${opt:stage, 'dev'}
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 11.4, 11.9_
  
  - [x] 3.2 Add environment variables to serverless.yml
    - Add FASHN_API_KEY: ${env:FASHN_API_KEY}
    - Add AWS_REGION: ${env:AWS_REGION}
    - Add DYNAMO_TABLE: ${env:DYNAMO_TABLE}
    - Add S3_UPLOAD_BUCKET: wishlize-uploads
    - Add S3_RESULTS_BUCKET: wishlize-results
    - Add S3_CDN_BUCKET: wishlize-cdn
    - _Requirements: 6.2, 8.1, 8.5_
  
  - [x] 3.3 Configure IAM permissions in serverless.yml
    - Add S3 GetObject/PutObject permissions for wishlize-uploads, wishlize-results, wishlize-cdn buckets
    - Add Rekognition DetectFaces permission
    - Add DynamoDB GetItem, PutItem, UpdateItem, Query permissions for WishlizeSessions table
    - Use specific ARNs for S3 and DynamoDB (not wildcards)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 11.3_
  
  - [x] 3.4 Define Lambda functions in serverless.yml
    - Define validatePhoto function with handler, memorySize: 512, timeout: 10, HTTP POST endpoint with CORS
    - Define processTryOn function with handler, memorySize: 1024, timeout: 30, HTTP POST endpoint with CORS
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 11.10_
  
  - [x] 3.5 Add Serverless plugins to serverless.yml
    - Add serverless-offline plugin
    - Add serverless-dotenv-plugin
    - _Requirements: 6.2_
  
  - [x] 3.6 Write property tests for serverless.yml configuration
    - **Property 3: Serverless Provider Configuration**
    - **Property 4: Lambda Function Definitions**
    - **Property 5: IAM Least-Privilege Permissions**
    - **Property 6: Environment Variable Configuration**
    - **Property 14: CORS Enabled for All Endpoints**
    - **Validates: Requirements 3.2-3.8, 5.1-5.5, 6.2, 8.1, 8.5, 11.3, 11.4, 11.9, 11.10**

- [x] 4. Implement initial Lambda function handlers
  - [x] 4.1 Create backend/handler.js with validatePhoto function
    - Export async validatePhoto function
    - Log invocation with requestId and timestamp
    - Return statusCode 200
    - Include CORS headers (Access-Control-Allow-Origin: *, Content-Type: application/json)
    - Return JSON body with success: true, message, and requestId
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 12.5, 12.6_
  
  - [x] 4.2 Add processTryOn function to backend/handler.js
    - Export async processTryOn function
    - Log invocation with requestId and timestamp
    - Return statusCode 200
    - Include CORS headers
    - Return JSON body with success: true, message, and requestId
    - _Requirements: 4.3, 4.4, 4.5, 12.5, 12.6_
  
  - [x] 4.3 Write property tests for Lambda handler responses
    - **Property 7: Lambda Handler Response Structure**
    - **Property 8: Lambda Handler Logging**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 12.5, 12.6**

- [x] 5. Create placeholder service files
  - [x] 5.1 Create backend/validators/photoCheck.js
    - Export validatePhoto function that throws "Not yet implemented" error
    - Include JSDoc comments describing future implementation
    - _Requirements: 1.2_
  
  - [x] 5.2 Create backend/services/fashnClient.js
    - Export submitTryOnRequest function that throws "Not yet implemented" error
    - Include JSDoc comments describing future implementation
    - _Requirements: 1.3_
  
  - [x] 5.3 Create backend/services/s3Service.js
    - Export uploadFile and getPresignedUrl functions that throw "Not yet implemented" errors
    - Include JSDoc comments describing future implementation
    - _Requirements: 1.3_

- [x] 6. Create environment configuration files
  - [x] 6.1 Create backend/.env file
    - Add FASHN_API_KEY=your_fashn_api_key_here
    - Add AWS_REGION=ap-south-1
    - Add DYNAMO_TABLE=WishlizeSessions
    - Add S3_UPLOAD_BUCKET=wishlize-uploads
    - Add S3_RESULTS_BUCKET=wishlize-results
    - Add S3_CDN_BUCKET=wishlize-cdn
    - Include comments explaining each variable
    - _Requirements: 6.1_
  
  - [x] 6.2 Create widget/src/config.js
    - Export CONFIG object with API_BASE (placeholder URL)
    - Add S3_UPLOAD_BUCKET: "wishlize-uploads"
    - Add MAX_RETRIES: 3
    - Add REQUEST_TIMEOUT: 30000
    - Add SUPPORTED_FORMATS array: ['image/jpeg', 'image/png', 'image/webp']
    - Add MAX_FILE_SIZE: 10 * 1024 * 1024
    - Include comments explaining each configuration value
    - _Requirements: 6.3, 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 6.3 Write property tests for configuration files
    - **Property 9: Widget Configuration Constants**
    - **Property 10: Backend Environment File Structure**
    - **Validates: Requirements 6.1, 6.3, 9.2, 9.3, 9.4**

- [x] 7. Create demo store pages and assets
  - [x] 7.1 Create demo-store/index.html
    - Add HTML5 boilerplate with proper meta tags
    - Add header with "Wishlize Demo Store" title
    - Add main section with product grid
    - Add product card for Navy Blazer with link to product page
    - Add footer with copyright
    - Link to assets/css/store.css
    - _Requirements: 10.1_
  
  - [x] 7.2 Create demo-store/product/blazer.html
    - Add HTML5 boilerplate with proper meta tags
    - Add header with navigation back to store
    - Add product detail section with image and info
    - Add div with id="wishlize-widget-container" and placeholder text
    - Add "Add to Cart" button
    - Add footer with copyright
    - Include comment indicating where widget script will be loaded
    - _Requirements: 10.2, 10.5_
  
  - [x] 7.3 Create demo-store/assets/css/store.css
    - Add CSS reset and base styles
    - Add header and footer styles
    - Add product grid and product card styles
    - Add product detail page styles
    - Add wishlize-widget-container styles (dashed border, placeholder styling)
    - Add responsive styles for mobile
    - _Requirements: 10.4_
  
  - [x] 7.4 Write property test for demo store widget integration placeholder
    - **Property 13: Demo Store Widget Integration Placeholder**
    - **Validates: Requirements 10.5**

- [ ] 8. Create placeholder widget files
  - [ ] 8.1 Create widget/src/widget.js
    - Add comment: "Wishlize widget main logic - To be implemented in Phase 2"
    - Export placeholder function or class
    - _Requirements: 1.4_
  
  - [ ] 8.2 Create widget/src/modal.html
    - Add comment: "Wishlize modal UI template - To be implemented in Phase 2"
    - Add basic HTML structure for future modal
    - _Requirements: 1.4_
  
  - [ ] 8.3 Create widget/src/styles.css
    - Add comment: "Wishlize widget styles - To be implemented in Phase 2"
    - Add placeholder CSS rules
    - _Requirements: 1.4_

- [ ] 9. Create documentation and git configuration
  - [ ] 9.1 Create POST_DEPLOYMENT_TASKS.md
    - Add title and introduction
    - Add section 1: Verify S3 Bucket CORS Configuration with JSON example
    - Add section 2: Verify DynamoDB Table Configuration
    - Add section 3: Configure CloudWatch Alarms (error rate, duration, 5xx errors)
    - Add section 4: Test Deployed Endpoints with curl examples
    - Add section 5: Update Widget Configuration with API URL
    - Add section 6: Verify IAM Role Permissions
    - Add section 7: Configure API Gateway Custom Domain (optional)
    - Add section 8: Enable API Gateway Request Validation (optional)
    - Add section 9: Review CloudWatch Logs
    - Add section 10: Save Deployment Information
    - Add checklist at the end
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  
  - [ ] 9.2 Create .gitignore file
    - Add .env and .env.* patterns
    - Add node_modules/
    - Add .serverless/ and .build/
    - Add *.log patterns
    - Add OS files (.DS_Store, Thumbs.db)
    - Add IDE files (.vscode/, .idea/, *.swp)
    - Add widget/build/ and dist/
    - Add .aws/
    - _Requirements: 6.4_
  
  - [ ] 9.3 Create README.md
    - Add project title and description
    - Add technology stack section
    - Add prerequisites section
    - Add setup instructions
    - Add deployment instructions
    - Add testing instructions
    - Add project structure overview
    - Add links to POST_DEPLOYMENT_TASKS.md
    - _Requirements: (documentation best practice)_
  
  - [ ]* 9.4 Write property tests for documentation and git configuration
    - **Property 11: Git Ignore Security**
    - **Property 12: Post-Deployment Documentation Completeness**
    - **Validates: Requirements 6.4, 13.2-13.7**

- [ ] 10. Checkpoint - Validate complete project structure
  - [ ]* 10.1 Write comprehensive property test for project structure
    - **Property 1: Complete Project Structure**
    - **Validates: Requirements 1.1-1.7, 9.1, 10.1-10.4, 13.1**
  
  - [ ] 10.2 Run all property tests
    - Execute all property-based tests
    - Verify all tests pass
    - Generate test coverage report
    - _Requirements: (validation)_
  
  - [ ] 10.3 Ensure all tests pass, ask the user if questions arise
    - Review test results
    - Address any failures
    - Confirm setup is complete

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The checkpoint task ensures all setup is correct before attempting deployment
- After completing these tasks, follow POST_DEPLOYMENT_TASKS.md for AWS console configuration
- The actual deployment to AWS is not part of this implementation plan - it will be done manually by running `npm run deploy` after setup is complete
