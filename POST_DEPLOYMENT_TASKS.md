# Post-Deployment Tasks for Wishlize Backend

## Introduction

After running `npm run deploy` to deploy your Wishlize backend to AWS, complete these tasks in the AWS Console to finalize the setup. These steps ensure proper security configuration, monitoring, and functionality verification for your production-ready virtual try-on system.

**Important:** Complete these tasks in order, as some steps depend on previous configurations.

---

## 1. Verify S3 Bucket CORS Configuration

**Location:** S3 Console → Buckets → [bucket-name] → Permissions → CORS

**Required CORS Configuration:**
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

**Action:** Verify this configuration exists for all three buckets:
- `wishlize-uploads`
- `wishlize-results`
- `wishlize-cdn`

**Why:** CORS configuration allows the widget to upload photos directly to S3 from the browser and access result images.

---

## 2. Verify DynamoDB Table Configuration

**Location:** DynamoDB Console → Tables → WishlizeSessions

**Verify the following settings:**
- ✅ **Partition key:** `email` (String)
- ✅ **Sort key:** `sessionId` (String)
- ✅ **Billing mode:** On-demand (recommended) or Provisioned with appropriate capacity
- ✅ **Point-in-time recovery:** Enabled (recommended for production)
- ✅ **Encryption:** Enabled with AWS managed keys

**Action:** If the table doesn't exist, create it manually with the above configuration.

---

## 3. Configure CloudWatch Alarms

**Location:** CloudWatch Console → Alarms → Create Alarm

Create the following alarms to monitor system health:

### Alarm 1: Lambda Error Rate
- **Metric:** AWS/Lambda → Errors
- **Dimensions:** FunctionName = wishlize-backend-dev-validatePhoto, wishlize-backend-dev-processTryOn
- **Statistic:** Sum
- **Period:** 5 minutes
- **Threshold:** > 5 errors in 5 minutes
- **Action:** Send SNS notification to your email

### Alarm 2: Lambda Duration (processTryOn)
- **Metric:** AWS/Lambda → Duration
- **Dimensions:** FunctionName = wishlize-backend-dev-processTryOn
- **Statistic:** Average
- **Period:** 5 minutes
- **Threshold:** > 25000 ms (25 seconds)
- **Action:** Send SNS notification to your email

### Alarm 3: API Gateway 5xx Errors
- **Metric:** AWS/ApiGateway → 5XXError
- **Dimensions:** ApiName = wishlize-backend-dev
- **Statistic:** Sum
- **Period:** 5 minutes
- **Threshold:** > 10 errors in 5 minutes
- **Action:** Send SNS notification to your email

---

## 4. Test Deployed Endpoints

**Get API Gateway URL from deployment output:**
The URL format will be: `https://{api-id}.execute-api.ap-south-1.amazonaws.com/dev`

### Test validatePhoto endpoint:
```bash
curl -X POST https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/dev/validate-photo \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "validatePhoto endpoint is working",
  "requestId": "..."
}
```

### Test processTryOn endpoint:
```bash
curl -X POST https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/dev/process-tryon \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "processTryOn endpoint is working",
  "requestId": "..."
}
```

**Troubleshooting:** If you get CORS errors, verify Step 1. If you get 5xx errors, check CloudWatch logs in Step 9.

---

## 5. Update Widget Configuration with API URL

**File:** `widget/src/config.js`

**Action:** Replace the placeholder API_BASE URL with your actual API Gateway URL:

```javascript
const CONFIG = {
  // Replace with your actual API Gateway URL
  API_BASE: 'https://YOUR_ACTUAL_API_ID.execute-api.ap-south-1.amazonaws.com/dev',
  
  // Keep other settings unchanged
  S3_UPLOAD_BUCKET: 'wishlize-uploads',
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT: 30000,
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_FILE_SIZE: 10 * 1024 * 1024
};
```

**Important:** Commit this change to your repository after updating.

---

## 6. Verify IAM Role Permissions

**Location:** IAM Console → Roles → Search for "wishlize-backend"

**Verify the Lambda execution role has policies for:**
- ✅ **S3 Access:** GetObject/PutObject permissions for `wishlize-uploads`, `wishlize-results`, `wishlize-cdn` buckets
- ✅ **DynamoDB Access:** GetItem, PutItem, UpdateItem, Query permissions for `WishlizeSessions` table
- ✅ **Rekognition Access:** DetectFaces permission
- ✅ **CloudWatch Logs:** CreateLogGroup, CreateLogStream, PutLogEvents permissions
- ✅ **X-Ray Tracing:** PutTraceSegments, PutTelemetryRecords permissions

**Action:** If any permissions are missing, add them through the IAM console or update your serverless.yml file.

---

## 7. Configure API Gateway Custom Domain (Optional)

**Location:** API Gateway Console → Custom Domain Names

**If you want a custom domain (e.g., `api.wishlize.ai`):**

1. **Request SSL Certificate:**
   - Go to AWS Certificate Manager (ACM)
   - Request a public certificate for your domain
   - Validate domain ownership via DNS or email

2. **Create Custom Domain:**
   - In API Gateway, create a new custom domain name
   - Select your SSL certificate
   - Choose Regional endpoint type

3. **Map Domain to API:**
   - Create a base path mapping
   - Map your domain to the wishlize-backend API

4. **Update DNS:**
   - In Route 53 (or your DNS provider)
   - Create an A record pointing to the API Gateway domain name

---

## 8. Enable API Gateway Request Validation (Optional)

**Location:** API Gateway Console → Your API → Models & Request Validators

**Benefits:** Reject malformed requests before they reach Lambda, saving costs and improving security.

**Steps:**
1. **Create Request Validators:**
   - Body validator: Validates request body against JSON schema
   - Query string validator: Validates query parameters
   - Headers validator: Validates required headers

2. **Create Models:**
   - Define JSON schemas for your request bodies
   - Example: Photo upload schema with required fields

3. **Apply Validators:**
   - Edit each method (POST /validate-photo, POST /process-tryon)
   - Enable request validation
   - Select appropriate validator and model

---

## 9. Review CloudWatch Logs

**Location:** CloudWatch Console → Log Groups

**Verify log groups exist:**
- `/aws/lambda/wishlize-backend-dev-validatePhoto`
- `/aws/lambda/wishlize-backend-dev-processTryOn`

**Check log functionality:**
1. Invoke the endpoints using the curl commands from Step 4
2. Refresh the log streams in CloudWatch
3. Verify you see invocation logs with requestId and timestamps

**Log Retention:** Set log retention to 30 days to manage costs:
- Select each log group
- Actions → Edit retention setting → 30 days

---

## 10. Save Deployment Information

**Create a file:** `deployment-info.txt` in your project root

**Save the following information:**
```
Wishlize Backend Deployment Information
=====================================

Deployment Date: [CURRENT_DATE]
Stage: dev
Region: ap-south-1
API Gateway URL: [YOUR_ACTUAL_URL]

AWS Resources:
--------------
Lambda Functions:
  - wishlize-backend-dev-validatePhoto
  - wishlize-backend-dev-processTryOn

S3 Buckets:
  - wishlize-uploads
  - wishlize-results
  - wishlize-cdn

DynamoDB Table: WishlizeSessions

CloudWatch Log Groups:
  - /aws/lambda/wishlize-backend-dev-validatePhoto
  - /aws/lambda/wishlize-backend-dev-processTryOn

IAM Role: wishlize-backend-dev-ap-south-1-lambdaRole

API Endpoints:
  - POST /validate-photo
  - POST /process-tryon
```

---

## Completion Checklist

**Infrastructure Verification:**
- [ ] S3 CORS configuration verified for all buckets
- [ ] DynamoDB table configuration verified
- [ ] CloudWatch alarms created and configured
- [ ] IAM role permissions verified

**Functionality Testing:**
- [ ] validatePhoto endpoint tested successfully
- [ ] processTryOn endpoint tested successfully
- [ ] CloudWatch logs verified and retention set
- [ ] Widget config.js updated with actual API URL

**Optional Enhancements:**
- [ ] Custom domain configured (if applicable)
- [ ] API Gateway request validation enabled (if applicable)

**Documentation:**
- [ ] Deployment information saved to deployment-info.txt
- [ ] Team notified of deployment completion

---

## Next Steps

Once all tasks are complete, you're ready to proceed with Phase 2 development:

1. **Day 2:** Implement photo validation logic using AWS Rekognition
2. **Day 3-4:** Integrate FASHN API for virtual try-on processing
3. **Day 5-6:** Build and test the widget UI components
4. **Day 7:** End-to-end testing and optimization

**Support:** If you encounter issues during these steps, check the CloudWatch logs first, then refer to the AWS documentation for each service.