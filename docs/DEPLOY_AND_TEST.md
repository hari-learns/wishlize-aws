# Wishlize Deployment & Testing Guide

## 🚀 Quick Deployment Steps

### Step 1: Deploy Backend

```bash
cd backend

# Install dependencies
npm install

# Deploy to AWS (dev stage first)
npm run deploy:dev
```

**Expected output:**
```
Deploying wishlize-backend to stage dev (ap-south-1)
...
endpoints:
  POST - https://xxxxx.execute-api.ap-south-1.amazonaws.com/dev/get-upload-url
  POST - https://xxxxx.execute-api.ap-south-1.amazonaws.com/dev/validate-photo
  POST - https://xxxxx.execute-api.ap-south-1.amazonaws.com/dev/process-tryon
  GET  - https://xxxxx.execute-api.ap-south-1.amazonaws.com/dev/status/{sessionId}
```

### Step 2: Update Widget API URL

Edit `widget/src/config.js` and update `API_BASE` with your deployed URL:

```javascript
const CONFIG = {
  API_BASE: 'https://xxxxx.execute-api.ap-south-1.amazonaws.com/dev', // <-- Your URL
  // ...
};
```

Then rebuild:
```bash
cd widget
node build.js
```

### Step 3: Upload Widget to S3 CDN

```bash
# Upload widget to S3
aws s3 cp widget/build/wishlize-widget.min.js s3://wishlize-cdn/widget.js \
  --acl public-read

# Upload a test garment image
aws s3 cp demo-store/assets/images/blazer-placeholder.jpg s3://wishlize-cdn/garments/blazer.jpg \
  --acl public-read
```

### Step 4: Configure CORS on S3 Buckets

```bash
# Set CORS policy on uploads bucket
aws s3api put-bucket-cors --bucket wishlize-uploads --cors-configuration file://s3-cors.json

# Set CORS policy on results bucket  
aws s3api put-bucket-cors --bucket wishlize-results --cors-configuration file://s3-cors.json
```

`s3-cors.json`:
```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

---

## 🧪 Testing the Visualization

### Option 1: Local Testing (Fastest)

1. **Start local server for demo store:**
```bash
cd demo-store
python -m http.server 8080
```

2. **Open in browser:**
```
http://localhost:8080/product/blazer.html
```

3. **Test the flow:**
   - Click "Try It On Virtually" button
   - Enter email and check consent
   - Upload a photo (full body or half body)
   - Click "Visualize"
   - Wait for processing (~30-60 seconds)
   - See the result!

### Option 2: Test with Deployed Backend

1. **Deploy backend** (see Step 1 above)

2. **Update API URL** in widget (Step 2)

3. **Open demo store locally** but widget will use deployed backend

### Option 3: Full Production Test

1. **Deploy backend to prod:**
```bash
cd backend
npm run deploy:prod
```

2. **Host demo store on S3/CloudFront:**
```bash
aws s3 sync demo-store/ s3://wishlize-demo-store --acl public-read
```

3. **Access via CloudFront URL**

---

## 📊 How It Works (Data Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER INTERACTION                                                │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Click "Try It On" Button                                     │
│     - Widget auto-detects product image                          │
│     - Opens modal with email + consent form                      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. User Uploads Photo                                           │
│     - Drag & drop or click to select                             │
│     - File validated (JPG/PNG, <10MB)                            │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Backend Processing                                           │
│     a. Get presigned S3 URL    →  POST /get-upload-url           │
│     b. Upload photo to S3      →  Direct browser→S3 upload       │
│     c. Validate photo          →  POST /validate-photo           │
│        • AWS Rekognition face detection                          │
│        • Content moderation                                      │
│        • Quality checks (sharpness, lighting)                    │
│     d. Process try-on          →  POST /process-tryon            │
│        • Submit to FASHN AI API                                  │
│        • Returns prediction ID                                   │
│     e. Poll for result         →  GET /status/{sessionId}        │
│        • Check every 3 seconds                                   │
│        • FASHN generates AI image                                │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Display Result                                               │
│     - Side-by-side: original vs try-on                           │
│     - Download button                                            │
│     - Show remaining try-ons count                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Widget not appearing?
```bash
# Check if widget.js is accessible
curl https://wishlize-cdn.s3.ap-south-1.amazonaws.com/widget.js
```

### API errors?
```bash
# Check Lambda logs
aws logs tail /aws/lambda/wishlize-backend-dev-getUploadUrl --follow
aws logs tail /aws/lambda/wishlize-backend-dev-validatePhoto --follow
aws logs tail /aws/lambda/wishlize-backend-dev-processTryOn --follow
```

### CORS errors?
- Check S3 bucket CORS configuration
- Verify `Access-Control-Allow-Origin` headers

### Photo upload failing?
- Verify S3 presigned URL generation
- Check bucket permissions
- Ensure file size < 10MB

### FASHN API errors?
- Verify `FASHN_API_KEY` is set correctly
- Check API key hasn't expired
- Review FASHN API dashboard for usage limits

---

## 📝 Testing Checklist

### Backend Tests
- [ ] `npm test` passes in backend/
- [ ] Deploy succeeds without errors
- [ ] API endpoints respond (test with curl/Postman)
- [ ] S3 presigned URLs work
- [ ] DynamoDB table exists

### Widget Tests
- [ ] Widget button appears on product page
- [ ] Modal opens correctly
- [ ] Email validation works
- [ ] Consent checkbox required
- [ ] File upload accepts JPG/PNG
- [ ] Photo preview displays
- [ ] Progress bar animates
- [ ] Result displays correctly
- [ ] Download button works

### Integration Tests
- [ ] End-to-end flow works (upload → visualize → result)
- [ ] Rate limiting works (3 per email)
- [ ] Photo validation works (face detection)
- [ ] Error handling works (quota exceeded, invalid photo)
- [ ] Mobile responsive

---

## 🎯 Expected Behavior

### Happy Path (Success)
1. User clicks "Try It On Virtually"
2. Enters email → checks consent → continues
3. Uploads photo → sees preview
4. Clicks "Visualize"
5. Sees progress: "Uploading..." → "Validating..." → "Generating..."
6. After ~30-60 seconds, sees side-by-side result
7. Can download or try another photo

### Error Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid email | Button disabled, validation error |
| No consent | Button disabled |
| Wrong file type | Error message, can retry |
| File too large | Error message (>10MB) |
| No face detected | Error after validation |
| Multiple faces | Error after validation |
| Blurry photo | Error after validation |
| Quota exceeded | Error message, retry tomorrow |
| API timeout | Error message, can retry |

---

## 🚀 Production Deployment

### 1. Environment Setup
```bash
# Set production env vars
export FASHN_API_KEY=your_production_key
export NODE_ENV=production
```

### 2. Deploy
```bash
cd backend
npm run deploy:prod
```

### 3. Update Widget Config
```bash
# Update API_BASE to production URL
# Rebuild widget
node build.js

# Upload to CDN
aws s3 cp widget/build/wishlize-widget.min.js s3://wishlize-cdn/widget.js --acl public-read
```

### 4. Monitor
- Set up CloudWatch alarms
- Monitor error rates
- Track usage metrics

---

**Ready to deploy? Run:**
```bash
cd backend && npm run deploy:dev
```

Then open `demo-store/product/blazer.html` in your browser!
