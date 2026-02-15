# Requirements Document

## Introduction

This document specifies the requirements for setting up the Wishlize project structure and initializing the Phase 1 serverless backend infrastructure. The Wishlize project is a production-ready virtual try-on widget that integrates with e-commerce stores, using AWS Lambda, S3, DynamoDB, and the FASHN API.

**Technology Stack:**
- **Backend Runtime:** Node.js 18.x on AWS Lambda
- **Infrastructure as Code:** Serverless Framework v3
- **AWS Services:** Lambda, API Gateway, S3, DynamoDB, Rekognition, CloudWatch
- **Frontend:** Vanilla JavaScript (ES6+) widget
- **Package Management:** npm
- **Security:** AWS IAM, environment variables, CORS, input validation

This specification covers the foundational project structure, backend initialization, security configuration, and environment setup needed to begin implementing photo validation and virtual try-on processing features in a production-ready manner.

## Glossary

- **Backend**: The serverless Node.js application running on AWS Lambda that handles photo validation and virtual try-on processing
- **Widget**: The embeddable JavaScript component that e-commerce stores integrate into their product pages
- **Demo_Store**: A sample e-commerce website used to demonstrate and test the Wishlize widget
- **Serverless_Framework**: The infrastructure-as-code tool (v3) used to deploy and manage AWS Lambda functions
- **API_Gateway**: AWS service that provides HTTP endpoints for invoking Lambda functions
- **FASHN_API**: Third-party service that performs the virtual try-on image processing
- **Session**: A user interaction tracked in DynamoDB with email and sessionId as identifiers
- **CloudWatch**: AWS monitoring and logging service for Lambda function logs and metrics
- **IAM_Role**: AWS Identity and Access Management role that grants Lambda functions permissions to access AWS services
- **CORS**: Cross-Origin Resource Sharing configuration that allows the widget to call backend APIs from different domains

## Requirements

### Requirement 1: Project Directory Structure

**User Story:** As a developer, I want a well-organized project directory structure, so that I can easily locate and maintain different components of the system.

#### Acceptance Criteria

1. THE System SHALL create a backend/ directory containing serverless.yml, handler.js, and package.json files
2. THE System SHALL create a backend/validators/ directory for photo validation logic
3. THE System SHALL create a backend/services/ directory for external service integrations
4. THE System SHALL create a widget/src/ directory containing widget.js, modal.html, and styles.css files
5. THE System SHALL create a widget/build/ directory for compiled widget output
6. THE System SHALL create a demo-store/ directory containing index.html and product/blazer.html files
7. THE System SHALL create a demo-store/assets/ directory for static resources

### Requirement 2: Backend Package Initialization

**User Story:** As a developer, I want the backend Node.js project properly initialized with required dependencies, so that I can use AWS services and make HTTP requests.

#### Acceptance Criteria

1. WHEN initializing the backend project, THE System SHALL create a package.json file with Node.js 18.x compatibility
2. THE System SHALL install the aws-sdk package for AWS service integration
3. THE System SHALL install the axios package for HTTP requests to external APIs
4. WHEN package.json is created, THE System SHALL include a name field set to "wishlize-backend"
5. WHEN package.json is created, THE System SHALL include appropriate scripts for deployment and testing

### Requirement 3: Serverless Framework Configuration

**User Story:** As a developer, I want a serverless.yml configuration file that defines Lambda functions and AWS resources, so that I can deploy the backend infrastructure consistently.

#### Acceptance Criteria

1. THE System SHALL create a serverless.yml file in the backend/ directory
2. THE serverless.yml file SHALL specify AWS as the cloud provider
3. THE serverless.yml file SHALL specify ap-south-1 as the deployment region
4. THE serverless.yml file SHALL specify nodejs18.x as the runtime
5. THE serverless.yml file SHALL define a validatePhoto Lambda function with an HTTP POST endpoint
6. THE serverless.yml file SHALL define a processTryOn Lambda function with an HTTP POST endpoint
7. THE processTryOn Lambda function SHALL have a timeout of 30 seconds
8. THE serverless.yml file SHALL enable CORS for all HTTP endpoints

### Requirement 4: Lambda Function Handlers

**User Story:** As a developer, I want initial Lambda function handlers that respond successfully, so that I can verify the deployment works before implementing business logic.

#### Acceptance Criteria

1. THE System SHALL create a handler.js file in the backend/ directory
2. THE handler.js file SHALL export a validatePhoto function that returns HTTP 200 status
3. THE handler.js file SHALL export a processTryOn function that returns HTTP 200 status
4. WHEN a Lambda function is invoked, THE System SHALL return a JSON response with a success message
5. WHEN a Lambda function is invoked, THE System SHALL include CORS headers in the response

### Requirement 5: IAM Permissions Configuration

**User Story:** As a developer, I want Lambda functions to have appropriate IAM permissions, so that they can access S3, Rekognition, and DynamoDB services.

#### Acceptance Criteria

1. THE serverless.yml file SHALL grant Lambda functions permission to read from wishlize-uploads S3 bucket
2. THE serverless.yml file SHALL grant Lambda functions permission to write to wishlize-results S3 bucket
3. THE serverless.yml file SHALL grant Lambda functions permission to read from wishlize-cdn S3 bucket
4. THE serverless.yml file SHALL grant Lambda functions permission to invoke AWS Rekognition DetectFaces API
5. THE serverless.yml file SHALL grant Lambda functions permission to read and write to the WishlizeSessions DynamoDB table

### Requirement 6: Environment Variables Configuration

**User Story:** As a developer, I want environment variables properly configured for both backend and widget, so that the application can access API keys and AWS resources securely.

#### Acceptance Criteria

1. THE System SHALL create a backend/.env file containing FASHN_API_KEY, AWS_REGION, and DYNAMO_TABLE variables
2. THE serverless.yml file SHALL reference environment variables from the .env file
3. THE System SHALL create a widget/src/config.js file containing API_BASE, S3_UPLOAD_BUCKET, and MAX_RETRIES constants
4. THE System SHALL add .env to .gitignore to prevent committing secrets
5. WHEN environment variables are missing, THE System SHALL provide clear error messages indicating which variables are required

### Requirement 7: Initial Deployment Verification

**User Story:** As a developer, I want to deploy the initial Lambda functions and verify they are accessible, so that I can confirm the infrastructure is working before implementing features.

#### Acceptance Criteria

1. WHEN the serverless deploy command is executed, THE Serverless_Framework SHALL deploy both Lambda functions to AWS
2. WHEN deployment completes, THE Serverless_Framework SHALL output the API Gateway base URL
3. WHEN the validatePhoto endpoint is invoked via HTTP POST, THE API_Gateway SHALL return HTTP 200 status
4. WHEN the processTryOn endpoint is invoked via HTTP POST, THE API_Gateway SHALL return HTTP 200 status
5. THE System SHALL save the API Gateway base URL to a deployment-info.txt file for reference

### Requirement 8: DynamoDB Integration Configuration

**User Story:** As a developer, I want the backend configured to interact with the WishlizeSessions DynamoDB table, so that I can track user sessions during virtual try-on operations.

#### Acceptance Criteria

1. THE serverless.yml file SHALL reference the WishlizeSessions DynamoDB table name via environment variable
2. THE WishlizeSessions table SHALL use email as the partition key
3. THE WishlizeSessions table SHALL use sessionId as the sort key
4. WHEN Lambda functions access DynamoDB, THE System SHALL use the AWS SDK DynamoDB DocumentClient
5. THE System SHALL configure the DynamoDB table name to be accessible via process.env.DYNAMO_TABLE

### Requirement 9: Widget Configuration File

**User Story:** As a developer, I want a configuration file for the widget that contains API endpoints and settings, so that the widget can communicate with the backend services.

#### Acceptance Criteria

1. THE System SHALL create a widget/src/config.js file
2. THE config.js file SHALL export an API_BASE constant for the API Gateway URL
3. THE config.js file SHALL export an S3_UPLOAD_BUCKET constant set to "wishlize-uploads"
4. THE config.js file SHALL export a MAX_RETRIES constant set to 3 for retry logic
5. THE config.js file SHALL include comments explaining each configuration value

### Requirement 10: Demo Store Structure

**User Story:** As a developer, I want a demo store with sample product pages, so that I can test the widget integration in a realistic e-commerce environment.

#### Acceptance Criteria

1. THE System SHALL create a demo-store/index.html file as the store homepage
2. THE System SHALL create a demo-store/product/blazer.html file as a sample product page
3. THE System SHALL create a demo-store/assets/images/ directory for product images
4. THE System SHALL create a demo-store/assets/css/ directory for store stylesheets
5. THE demo store pages SHALL include placeholder content indicating where the Wishlize widget will be integrated

### Requirement 11: Security and Production Readiness

**User Story:** As a developer, I want the backend configured with production-grade security practices, so that the application is secure and ready for real-world use.

#### Acceptance Criteria

1. THE System SHALL configure API Gateway to use HTTPS only for all endpoints
2. THE System SHALL implement request size limits of 10MB for photo uploads
3. THE System SHALL configure Lambda functions with least-privilege IAM permissions
4. THE System SHALL enable AWS CloudWatch logging for all Lambda functions
5. THE System SHALL configure log retention period of 30 days in CloudWatch
6. THE System SHALL add input validation middleware to reject malformed requests
7. THE System SHALL configure rate limiting on API Gateway endpoints to prevent abuse
8. THE System SHALL use AWS Secrets Manager or Parameter Store for sensitive configuration values
9. THE System SHALL enable AWS X-Ray tracing for Lambda functions to monitor performance
10. THE System SHALL configure appropriate Lambda memory allocation (minimum 512MB for processTryOn)

### Requirement 12: Error Handling and Monitoring

**User Story:** As a developer, I want comprehensive error handling and monitoring configured, so that I can quickly identify and resolve issues in production.

#### Acceptance Criteria

1. WHEN a Lambda function encounters an error, THE System SHALL log the error details to CloudWatch
2. WHEN a Lambda function encounters an error, THE System SHALL return an appropriate HTTP status code (4xx for client errors, 5xx for server errors)
3. THE System SHALL configure CloudWatch alarms for Lambda function errors exceeding 5% error rate
4. THE System SHALL configure CloudWatch alarms for Lambda function duration exceeding 25 seconds
5. THE System SHALL include correlation IDs in all log messages for request tracing
6. THE System SHALL log all API requests with timestamp, endpoint, and response status
7. WHEN environment variables are missing, THE System SHALL fail fast with clear error messages during Lambda initialization

### Requirement 13: AWS Console Post-Deployment Tasks

**User Story:** As a developer, I want clear documentation of AWS console tasks required after deployment, so that I can complete the infrastructure setup correctly.

#### Acceptance Criteria

1. THE System SHALL create a POST_DEPLOYMENT_TASKS.md file listing all required AWS console actions
2. THE POST_DEPLOYMENT_TASKS.md file SHALL include instructions for verifying S3 bucket CORS configuration
3. THE POST_DEPLOYMENT_TASKS.md file SHALL include instructions for verifying DynamoDB table configuration
4. THE POST_DEPLOYMENT_TASKS.md file SHALL include instructions for setting up CloudWatch alarms for cost monitoring
5. THE POST_DEPLOYMENT_TASKS.md file SHALL include instructions for configuring API Gateway custom domain (if applicable)
6. THE POST_DEPLOYMENT_TASKS.md file SHALL include instructions for testing the deployed endpoints using curl or Postman
7. THE POST_DEPLOYMENT_TASKS.md file SHALL include instructions for verifying IAM role permissions are correctly applied

### Requirement 14: Development and Deployment Scripts

**User Story:** As a developer, I want npm scripts for common development and deployment tasks, so that I can efficiently manage the project lifecycle.

#### Acceptance Criteria

1. THE package.json file SHALL include a "deploy" script that runs serverless deploy
2. THE package.json file SHALL include a "deploy:dev" script that deploys to a development stage
3. THE package.json file SHALL include a "deploy:prod" script that deploys to a production stage
4. THE package.json file SHALL include a "logs" script that tails CloudWatch logs for Lambda functions
5. THE package.json file SHALL include a "remove" script that removes deployed resources
6. THE package.json file SHALL include a "test" script placeholder for future unit tests
7. THE package.json file SHALL include a "lint" script for code quality checks using ESLint
