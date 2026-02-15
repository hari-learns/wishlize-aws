# Wishlize End-to-End Data Flow

## Step-by-Step Flow

### 1. Browser Loads Page
```
User → http://localhost:8080/product/blazer.html
     → Loads widget-simple.js
     → Widget detects product image (purple blazer)
```

### 2. User Clicks "Try It On"
```
Browser → Widget opens modal
        → Shows upload screen immediately
```

### 3. Widget Gets Upload URL
```
Browser → POST https://api.../get-upload-url
        → API Gateway → Lambda (getUploadUrl)
        → Lambda creates session (DynamoDB)
        → Lambda generates S3 presigned POST
        ← Returns:
          {
            uploadUrl: "https://wishlize-uploads.s3...",
            publicUrl: "https://wishlize-uploads.s3.../image.jpg",
            fields: { ... },  <-- REQUIRED for POST
            sessionId: "..."
          }
```

### 4. Browser Uploads to S3
```
Browser → POST uploadUrl (S3)
        → WITH fields in FormData
        → S3 returns 204 (success)
```

### 5. Widget Validates Photo
```
Browser → POST /validate-photo
        → { sessionId, imageUrl }
        → Lambda downloads from S3
        → Lambda calls AWS Rekognition
        ← Returns: { valid: true/false }
```

### 6. Widget Processes Try-On
```
Browser → POST /process-tryon
        → { sessionId, garmentUrl }
        → Lambda calls FASHN API
        ← Returns: { predictionId, status: "processing" }
```

### 7. Widget Polls for Result
```
Browser → GET /status/{sessionId} (every 3 sec)
        → Lambda checks FASHN API
        ← Returns: { status: "processing|completed|failed" }
```

### 8. Result Displayed
```
FASHN → Returns generated image URL
      → Lambda saves to S3 results bucket
      → Widget displays side-by-side
```

---

## CURRENT ISSUE: Step 4 Fails

Error: `CORS policy: No 'Access-Control-Allow-Origin' header`

### Root Cause Checklist:

1. ✅ Lambda generates correct S3 URL
2. ❓ S3 bucket has CORS policy
3. ❓ Browser sends correct request
4. ❓ Widget includes all fields in FormData

---

## AWS Console Checks Needed

### 1. Check S3 Bucket CORS (REQUIRED)
```bash
aws s3api get-bucket-cors --bucket wishlize-uploads --region ap-south-1
```

Should show:
```json
{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
```

### 2. Check S3 Bucket Permissions
- Bucket policy should allow public read (for results)
- Uploads use presigned POST (temporary access)

### 3. Check CloudWatch Logs
- /aws/lambda/wishlize-backend-dev-getUploadUrl
- Check if Lambda is being called
- Check if it returns correct fields

---

## Fix Steps

### Fix 1: Verify CORS is Actually Set
Go to AWS Console → S3 → wishlize-uploads → Permissions → CORS:

```xml
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Fix 2: Clear Browser Cache
Chrome DevTools → Network tab → Disable cache checkbox

### Fix 3: Check Widget Code
Verify widget sends FormData correctly:
```javascript
const formData = new FormData();
Object.entries(uploadData.fields).forEach(([key, value]) => {
  formData.append(key, value);
});
formData.append('file', file);

fetch(uploadData.uploadUrl, {
  method: 'POST',
  body: formData  // NO headers - browser sets them
});
```

---

## Quick Test

Test if S3 is accessible:
```bash
curl -I https://wishlize-uploads.s3.ap-south-1.amazonaws.com/
```

Should return 403 (not 301 or CORS error)
