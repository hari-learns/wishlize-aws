# Wishlize - Virtual Try-On Widget

A production-ready virtual try-on widget that integrates with e-commerce stores, allowing customers to visualize how clothing items look on them using AI-powered image processing.

## Technology Stack

### Backend
- **Runtime:** Node.js 18.x on AWS Lambda
- **Infrastructure:** Serverless Framework v3
- **Cloud Services:** AWS (Lambda, API Gateway, S3, DynamoDB, Rekognition, CloudWatch)
- **External API:** FASHN API for virtual try-on processing
- **Package Manager:** npm

### Frontend
- **Widget:** Vanilla JavaScript (ES6+)
- **Demo Store:** HTML5, CSS3
- **Build Tools:** To be configured in Phase 2

### Development Tools
- **Linting:** ESLint
- **Testing:** Jest (property-based testing with fast-check)
- **Deployment:** Serverless Framework CLI

## Prerequisites

Before setting up the project, ensure you have:

1. **Node.js 18.x or higher**
   ```bash
   node --version  # Should be >= 18.0.0
   ```

2. **AWS CLI configured**
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, and region (ap-south-1)
   ```

3. **FASHN API Key**
   - Sign up at [FASHN API](https://fashn.ai) to get your API key
   - You'll need this for the environment configuration

4. **Git** (for version control)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd wishlize

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Environment Configuration

Create the backend environment file:

```bash
# Copy the example environment file
cp backend/.env.example backend/.env

# Edit the environment file with your actual values
# backend/.env should contain:
FASHN_API_KEY=your_actual_fashn_api_key_here
AWS_REGION=ap-south-1
DYNAMO_TABLE=WishlizeSessions
```

### 3. AWS Resources Setup

The following AWS resources will be created automatically during deployment:
- **S3 Buckets:** wishlize-uploads, wishlize-results, wishlize-cdn
- **DynamoDB Table:** WishlizeSessions
- **Lambda Functions:** validatePhoto, processTryOn
- **API Gateway:** REST API with CORS enabled
- **IAM Roles:** Least-privilege permissions for Lambda functions

## Deployment Instructions

### Deploy to Development Environment

```bash
cd backend
npm run deploy:dev
```

### Deploy to Production Environment

```bash
cd backend
npm run deploy:prod
```

### View Deployment Information

After deployment, the Serverless Framework will output:
- API Gateway URL
- Lambda function names
- S3 bucket names

**Important:** Save the API Gateway URL - you'll need it for the post-deployment configuration.

### Post-Deployment Configuration

After deployment, complete the AWS Console configuration steps:

```bash
# Open the post-deployment tasks guide
cat POST_DEPLOYMENT_TASKS.md
```

**Critical Steps:**
1. Verify S3 bucket CORS configuration
2. Update widget configuration with actual API URL
3. Set up CloudWatch alarms
4. Test deployed endpoints

See [POST_DEPLOYMENT_TASKS.md](./POST_DEPLOYMENT_TASKS.md) for detailed instructions.

## Testing Instructions

### Run Property-Based Tests

```bash
cd backend
npm test
```

### Test Individual Functions Locally

```bash
# Start serverless offline (for local testing)
npm run offline

# Test endpoints locally
curl -X POST http://localhost:3000/validate-photo -H "Content-Type: application/json" -d '{}'
curl -X POST http://localhost:3000/process-tryon -H "Content-Type: application/json" -d '{}'
```

### View Lambda Logs

```bash
# Tail logs for validatePhoto function
npm run logs

# Tail logs for processTryOn function
npm run logs:tryon
```

### Lint Code

```bash
npm run lint
```

## Project Structure

```
wishlize/
├── backend/                          # Serverless backend
│   ├── serverless.yml               # Infrastructure configuration
│   ├── handler.js                   # Lambda function handlers
│   ├── package.json                 # Node.js dependencies and scripts
│   ├── .env                         # Environment variables (gitignored)
│   ├── validators/                  # Photo validation logic
│   │   └── photoCheck.js           # Rekognition-based validation
│   ├── services/                    # External service integrations
│   │   ├── fashnClient.js          # FASHN API client
│   │   └── s3Service.js            # S3 operations
│   └── __tests__/                   # Property-based tests
│       └── property/               # PBT test files
├── widget/                          # Embeddable widget
│   ├── src/                        # Widget source code
│   │   ├── widget.js               # Main widget logic
│   │   ├── modal.html              # Modal UI template
│   │   ├── styles.css              # Widget styles
│   │   └── config.js               # Configuration constants
│   └── build/                      # Compiled widget output
├── demo-store/                      # Demo e-commerce site
│   ├── index.html                  # Store homepage
│   ├── product/                    # Product pages
│   │   └── item.html            # Sample product page
│   └── assets/                     # Static assets
│       ├── images/                 # Product images
│       └── css/                    # Store stylesheets
├── POST_DEPLOYMENT_TASKS.md         # AWS Console configuration guide
├── .gitignore                       # Git ignore rules
└── README.md                        # This file
```

## Development Workflow

### Phase 1: Infrastructure Setup ✅
- [x] Project structure creation
- [x] Serverless Framework configuration
- [x] Basic Lambda handlers
- [x] Environment configuration
- [x] Deployment verification

### Phase 2: Core Functionality (In Progress)
- [ ] Photo validation with AWS Rekognition
- [ ] FASHN API integration
- [ ] Session management with DynamoDB
- [ ] Error handling and logging

### Phase 3: Widget Development
- [ ] Widget UI components
- [ ] Photo upload functionality
- [ ] Try-on result display
- [ ] Integration with demo store

### Phase 4: Production Optimization
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Monitoring and alerting
- [ ] Documentation completion

## API Endpoints

### POST /validate-photo
Validates uploaded photos for virtual try-on compatibility.

**Request:**
```json
{
  "email": "user@example.com",
  "imageData": "base64_encoded_image_or_s3_key",
  "sessionId": "optional_existing_session_id"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "generated_or_existing_session_id",
  "validation": {
    "isValid": true,
    "faceDetected": true,
    "quality": "good"
  }
}
```

### POST /process-tryon
Processes virtual try-on requests using the FASHN API.

**Request:**
```json
{
  "email": "user@example.com",
  "sessionId": "validated_session_id",
  "garmentUrl": "s3_url_of_garment_image"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "session_id",
  "status": "processing",
  "estimatedTime": 30
}
```

## Monitoring and Logging

### CloudWatch Logs
- Lambda function logs: `/aws/lambda/wishlize-backend-{stage}-{function}`
- API Gateway logs: Enabled for all endpoints
- X-Ray tracing: Enabled for performance monitoring

### CloudWatch Alarms
- Lambda error rate > 5%
- Lambda duration > 25 seconds
- API Gateway 5xx errors > 10

### Cost Monitoring
- Set up billing alerts in AWS Console
- Monitor Lambda invocations and duration
- Track S3 storage and transfer costs

## Security Considerations

### Environment Variables
- Never commit `.env` files to version control
- Use AWS Secrets Manager for production secrets
- Rotate API keys regularly

### IAM Permissions
- Lambda functions use least-privilege IAM roles
- S3 buckets have specific access policies
- DynamoDB access limited to required operations

### API Security
- CORS enabled for widget integration
- Request validation at API Gateway level
- Rate limiting configured to prevent abuse

## Troubleshooting

### Common Issues

**Deployment Fails:**
- Check AWS credentials: `aws sts get-caller-identity`
- Verify Node.js version: `node --version`
- Check serverless.yml syntax

**CORS Errors:**
- Verify S3 bucket CORS configuration
- Check API Gateway CORS settings
- Ensure widget uses correct API URL

**Lambda Timeouts:**
- Check CloudWatch logs for error details
- Verify external API connectivity
- Increase memory allocation if needed

### Getting Help

1. Check CloudWatch logs first
2. Review [POST_DEPLOYMENT_TASKS.md](./POST_DEPLOYMENT_TASKS.md)
3. Verify AWS resource configuration
4. Check environment variables

## Contributing

### Development Setup
1. Follow setup instructions above
2. Create feature branch: `git checkout -b feature/your-feature`
3. Make changes and test locally
4. Run tests: `npm test`
5. Deploy to dev environment: `npm run deploy:dev`
6. Submit pull request

### Code Standards
- Use ESLint for code formatting
- Write property-based tests for new features
- Follow serverless best practices
- Document API changes

## License

[Your License Here]

## Support

For technical support or questions:
- Check the troubleshooting section above
- Review AWS CloudWatch logs
- Consult the [POST_DEPLOYMENT_TASKS.md](./POST_DEPLOYMENT_TASKS.md) guide