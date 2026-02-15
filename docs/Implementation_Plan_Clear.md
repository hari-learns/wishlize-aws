# Wishlize Demo Build Plan

| **Target** | Working Demo by March 5th, 2026 |
|------------|---------------------------------|
| **Article Deadline** | March 13th, 2026 (8:00 PM UTC) |
| **Total Runtime** | 20 Days |

---

## Pre-Build: AWS Configuration (Day 0) ✅ COMPLETED

> ~~**Important:** Complete these AWS setup steps before writing any code.~~  
> **Status:** All AWS infrastructure configured and verified on 2026-02-14.

---

### ✅ 1. IAM Setup

| Step | Status | Details |
|------|--------|---------|
| Create IAM User | ✅ Done | User: `wishlize-deploy` |
| Attach Policy | ✅ Done | `AdministratorAccess` |
| Create Access Keys | ✅ Done | Access Key ID: `AKIAUO5M5SHDKRQ26VSN` |
| Store Credentials | ✅ Done | Saved in `~/.aws/credentials` |

---

### ✅ 2. S3 Buckets (Created 4)

| Bucket Name | Purpose | Settings Applied |
|-------------|---------|------------------|
| `wishlize-uploads` | User photos (24h auto-delete) | ✅ Private, **CORS enabled**, Lifecycle: 1 day |
| `wishlize-results` | AI generated images (7-day auto-delete) | ✅ Public-read, **CORS enabled**, Lifecycle: 7 days |
| `wishlize-cdn` | Widget.js file | ✅ Public-read, static website hosting |
| `demo.wishlize.ai` | Fake fashion store | ✅ Public-read, static website hosting |

**CORS Configuration (uploads & results buckets):**
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
        "AllowedOrigins": ["*"],
        "MaxAgeSeconds": 3000
    }
]
```

**Lifecycle Rules Applied:**

| Bucket | Expiration | Status |
|--------|------------|--------|
| `wishlize-uploads` | 1 day | ✅ Active |
| `wishlize-results` | 7 days | ✅ Active |

---

### ✅ 3. DynamoDB Table

| Attribute | Value | Status |
|-----------|-------|--------|
| **Table name** | `WishlizeSessions` | ✅ Created |
| **Partition key** | `email` (String) | ✅ Set |
| **Sort key** | `sessionId` (String) | ✅ Set |
| **Billing mode** | On-demand (pay per request) | ✅ Set |

---

### ✅ 4. Cost Alarms (Critical)

**Method Used:** AWS Budgets (simpler than CloudWatch)

| Budget | Amount | Purpose | Status |
|--------|--------|---------|--------|
| `wishlize-warning` | $10 | First warning alert | ✅ Created |
| `wishlize-panic` | $50 | Panic stop alert | ✅ Created |

---

### ✅ 5. Credentials File & AWS CLI

**AWS CLI Installation:**
| Component | Status | Version |
|-----------|--------|---------|
| AWS CLI | ✅ Installed | v2.33.19 |
| Path Configured | ✅ Done | Available in PowerShell |

**Credentials File:** `C:\Users\harij\.aws\credentials`
```ini
[default]
aws_access_key_id = AKIAUO5M5SHDKRQ26VSN
aws_secret_access_key = [REDACTED]
```

**Config File:** `C:\Users\harij\.aws\config`
```ini
[default]
region = ap-south-1
output = json
```

**Verification Test:**
```powershell
$ aws sts get-caller-identity
{
    "UserId": "AIDAUO5M5SHDN4LIAZ4AC",
    "Account": "306915938758",
    "Arn": "arn:aws:iam::306915938758:user/wishlize-deploy"
}
```
✅ **Verified Working!**

---

> 🎉 **Day 0 Complete!** Ready to proceed with Project Structure →

---

## Project Structure

Create this folder structure on your local machine:

```
wishlize/
├── backend/
│   ├── serverless.yml          # Infrastructure as code
│   ├── handler.js              # Main Lambda entry
│   ├── validators/
│   │   └── photoCheck.js       # Rekognition logic
│   ├── services/
│   │   ├── fashnClient.js      # FASHN API wrapper
│   │   └── s3Service.js        # Upload/download logic
│   └── package.json
├── widget/
│   ├── src/
│   │   ├── widget.js           # Main embeddable script
│   │   ├── modal.html          # UI template
│   │   └── styles.css          # Widget styling
│   └── build/
│       └── widget.min.js       # Deploy this to S3
└── demo-store/
    ├── index.html              # Fake fashion homepage
    ├── product/
    │   └── blazer.html         # Product page with widget
    ├── assets/
    │   ├── images/             # Product photos (blazer, dress)
    │   └── css/
    └── thank-you.html
```

---

## Phase 1: Infrastructure & API (Days 1-5)

### Day 1: Serverless Framework Setup

**Goal:** Deploy a "Hello World" Lambda function

**Commands:**

```bash
mkdir wishlize && cd wishlize/backend
npm install -g serverless
npm init -y
npm install aws-sdk axios
serverless create --template aws-nodejs
```

**Edit `serverless.yml`:**

```yaml
service: wishlize-api

provider:
  name: aws
  runtime: nodejs18.x
  region: ap-south-1  # Choose closest to you
  environment:
    FASHN_API_KEY: ${env:FASHN_API_KEY}
    S3_UPLOAD_BUCKET: wishlize-uploads
    S3_RESULTS_BUCKET: wishlize-results
  iamRoleStatements:
    - Effect: Allow
      Action:
        - s3:PutObject
        - s3:GetObject
        - rekognition:DetectLabels
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:UpdateItem
      Resource: "*"

functions:
  validatePhoto:
    handler: handler.validatePhoto
    events:
      - http:
          path: validate
          method: post
          cors: true

  processTryOn:
    handler: handler.processTryOn
    timeout: 30  # FASHN takes time
    events:
      - http:
          path: tryon
          method: post
          cors: true
```

**Deploy:**

```bash
serverless deploy
```

> **Note:** Save the API Gateway URL returned (format: `https://xxx.execute-api.ap-south-1.amazonaws.com/dev/`)

---

### Day 2: Photo Validator Lambda

**File:** `backend/handler.js`

**Requirements:**

- Accept POST with payload:
  ```json
  { "imageUrl": "s3://bucket/photo.jpg" }
  ```
- Use AWS Rekognition to detect:
  - Is it a person? (confidence > 90%)
  - Bounding box ratio (height/width > 2.0 = full body)
  - Is it blurry? (Rekognition quality check)
- Return:
  ```json
  {
    "valid": boolean,
    "message": string,
    "type": "full_body" | "half_body" | "invalid"
  }
  ```

**Test via Postman:**

- **Method:** POST
- **URL:** `https://xxx/validate`
- **Body:** `{"imageUrl": "https://your-test-image.jpg"}`

---

### Day 3: FASHN Integration

**File:** `backend/services/fashnClient.js`

**Logic:**

1. Receive `personImageUrl` and `garmentImageUrl`
2. POST to `https://api.fashn.ai/v1/run` with:
   - `model_image`: personImageUrl
   - `garment_image`: garmentImageUrl
   - `category`: "tops" (or auto-detect)
3. Poll every 2 seconds for result (FASHN returns `id`, you check status)
4. Return final image URL when `status: "completed"`

**Handler Integration:**

- Check DynamoDB quota first (email → tries_left)
- If `tries_left > 0`: Call FASHN
- If success: Decrement tries_left, store result URL
- Return:
  ```json
  {
    "success": true,
    "resultUrl": "...",
    "triesRemaining": 2
  }
  ```

---

### Day 4: S3 Presigned URLs

**Goal:** Secure upload directly from browser to S3

**New Endpoint:** `GET /get-upload-url?filename=user123.jpg`

- Generates presigned POST URL for `wishlize-uploads` bucket
- Returns:
  ```json
  {
    "uploadUrl": "...",
    "publicUrl": "..."
  }
  ```

---

### Day 5: Integration Test

**Test full flow via Postman:**

1. Get upload URL → Upload Emma photo to S3
2. POST `/validate` → Should pass
3. POST `/tryon` with garment URL → Wait 15s → Get result
4. Check DynamoDB: Email should show 2 tries left

---

## Phase 2: Widget Development (Days 6-9)

### Day 6: Widget Skeleton

**File:** `widget/src/widget.js`

**Requirements:**

- Use IIFE pattern:
  ```javascript
  (function() { ... })()
  ```
  (prevents global scope pollution)
- Auto-detect product image from page:
  - Look for `meta[property="og:image"]`
  - Or look for `img` with class `product-image`
  - Or read `data-product-image` attribute from widget div
- Inject "Try It On" button below product image

---

### Day 7: Modal UI

**File:** `widget/src/modal.html` (template string in JS)

**Components:**

| Component | Description |
|-----------|-------------|
| Drag & drop zone | With image preview |
| Email input | For quota tracking |
| Consent checkbox | "I consent to AI processing of my image" |
| Analyze button | Calls `/validate` first |
| Loading state | "AI is working... (10s)" |
| Result view | Split screen (original vs AI result) |
| Error states | "Please upload full body photo" / "Too blurry" |

**Styling:** Use Shadow DOM to avoid CSS conflicts with host site

---

### Day 8: API Integration

**Connect to your Lambda endpoints:**

1. User drops photo → Get presigned URL → Upload to S3
2. POST to `/validate` → Show green check or red error
3. If valid: POST to `/tryon` with:
   - `personImageUrl` (S3 URL)
   - `garmentImageUrl` (scraped from page)
   - `email` (from input)
4. Poll for result (every 2 seconds) or wait for response
5. Display result image from S3

---

### Day 9: Build & Deploy

**Commands:**

```bash
cd widget
# Minify (optional for demo)
cp src/widget.js build/widget.min.js
# Upload to S3
aws s3 cp build/widget.min.js s3://wishlize-cdn/widget.js --acl public-read
```

**URL:** `https://wishlize-cdn.s3.ap-south-1.amazonaws.com/widget.js`

---

## Phase 3: Demo Store (Days 10-13)

### Day 10: Fake Fashion Site

**Create:** `demo-store/product/blazer.html`

**Design:**

- Clean product page (copy Zara/Myntra layout)
- Product: "Premium Wool Blazer - Grey"
- Price: $129
- Images: Use the blazer image you tested with FASHN

**Embed widget:**

```html
<div id="wishlize-widget"
     data-product-id="blazer-001"
     data-garment-image="https://demo.wishlize.ai/images/blazer.jpg">
</div>
<script src="https://wishlize-cdn.s3.ap-south-1.amazonaws.com/widget.js"></script>
```

---

### Day 11: Mobile Responsive

- Test on mobile device (iPhone/Android)
- Ensure modal fits screen
- Touch-friendly drag & drop

---

### Day 12: Ghost Page Features

- Add password protection (simple HTTP Basic Auth via S3, or obscure URL)
- Add "Powered by AWS Lambda" badge (shows AWS usage for competition)
- Add quota indicator: "3 free try-ons remaining"

---

### Day 13: End-to-End Testing

**Test Scenarios:**

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | First-time user uploads good photo | Success → Shows 2 tries left |
| 2 | Same email tries 3 times | 4th attempt shows "Quota exceeded" |
| 3 | Upload blurry selfie | Error message "Please retake" |
| 4 | Upload PDF (wrong format) | Error "Please upload JPG/PNG" |

---

## Phase 4: Article & Launch (Days 14-20)

### Day 14: Article Draft

**Title Options:**

- "How I Built a Virtual Try-On Widget Using AWS Lambda and $200 in Credits"
- "Reducing Fashion Returns by 40% with Serverless AI"

**Structure:**

1. **The Problem:** Your personal story (sister's returns/carbon footprint)
2. **The Architecture:** Use the diagram generated earlier
3. **Technical Deep Dive:**
   - Why DynamoDB over RDS (cost/ops)
   - The Photo Validator innovation (saving API costs)
   - FASHN integration challenges
4. **Cost Breakdown:** "$0.02 per try-on vs competitors at $2.00"
5. **The Demo:** Link to demo.wishlize.ai
6. **Call to Action:** "Like this article to help us reach top 300"

---

### Day 15: Demo Video (2 Minutes)

**Script:**

| Time | Content |
|------|---------|
| 0:00-0:15 | Problem statement (show messy returns) |
| 0:15-0:45 | Screen record of widget working (upload → result) |
| 0:45-1:15 | Architecture explanation (show AWS console briefly) |
| 1:15-1:45 | Cost comparison spreadsheet |
| 1:45-2:00 | Call to action |

**Upload:** YouTube (unlisted) or S3 + CloudFront

---

### Day 16: AWS Builder Center Submission

1. Go to [AWS Builder Center](https://aws.amazon.com/developer/community/community-builders/)
2. Submit article with tags:
   - `#aideas-2025`
   - `#commercial-solutions`
   - `#apjc`
3. Embed video link
4. Use architecture diagram as cover image

---

### Day 17-18: Polish & Bug Fixes

- Fix CORS issues if any
- Optimize image loading (add CloudFront if time permits)
- Ensure DynamoDB TTL is working (auto-delete old sessions)

---

### Day 19-20: Vote Campaign

- Share article on LinkedIn (tag AWS, D2C founders)
- Post in WhatsApp groups (Indian startup communities)
- Email to 20+ D2C founders you know
- Hacker News "Show HN" post

---

## Daily Standup Checklist

Every day, ask yourself:

- [ ] Did I deploy to AWS today (not just local testing)?
- [ ] Did I test on mobile?
- [ ] Is the $10 billing alarm still silent?
- [ ] Did I commit code to Git?

---

## Critical Environment Variables

### Backend Config

Create `backend/.env` (**never commit this**):

```ini
FASHN_API_KEY=your_fashn_key_here
AWS_REGION=ap-south-1
DYNAMO_TABLE=WishlizeSessions
```

### Widget Config

Create `widget/src/config.js`:

```javascript
const CONFIG = {
  API_BASE: 'https://xxx.execute-api.ap-south-1.amazonaws.com/dev',
  S3_UPLOAD_BUCKET: 'wishlize-uploads',
  MAX_RETRIES: 3
};
```

---

## Backup Plan (If Things Break)

### If FASHN API Fails

- **Day 1:** Test immediately
- If quality < 80%, switch to:
  - **Replicate API** (Kolors model), or
  - **RunPod** (self-host)

### If AWS Is Too Complex

| Workaround | Implementation |
|------------|----------------|
| Skip DynamoDB | Use JSON files on S3 for session storage |
| Skip Rekognition | Do manual checks (aspect ratio calculation in Lambda only) |

### If Time Runs Out

- Remove "Photo Validator" feature, go straight to FASHN
- Remove "Quota" system, allow unlimited tries for demo
- Remove dashboard, just show the widget working

---

## Success Metrics for March 5th

- [ ] Widget loads in < 2 seconds
- [ ] End-to-end try-on takes < 15 seconds
- [ ] Works on mobile Chrome & Safari
- [ ] 3 try-ons per email enforced
- [ ] Demo page looks professional (not bootstrap-default)
- [ ] No AWS bills > $25

---

## Reference Information

| Attribute | Value |
|-----------|-------|
| **Architecture** | Lambda + API Gateway + S3 + DynamoDB + FASHN API |
| **Estimated Cost** | $15-25/month |
| **Credits Available** | $200 (8 months runway) |

---

> **Build. Ship. Win.**
