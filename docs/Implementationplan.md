```markdown
# WISHLIZE DEMO BUILD PLAN
**Target:** Working Demo by March 5th, 2026  
**Article Deadline:** March 13th, 2026 (8:00 PM UTC)  
**Total Runtime:** 20 Days

---

## PRE-BUILD: AWS CONFIGURATION (Do This First - Day 0)

Before writing a single line of code, configure these AWS services:

### 1. IAM Setup
- Go to **IAM → Users → Create User** (name: `wishlize-deploy`)
- Attach policies: `AdministratorAccess` (remove later for security)
- Create **Access Key ID** and **Secret Access Key** → Save in `.env` file locally

### 2. S3 Buckets (Create 3)
| Bucket Name | Purpose | Settings |
|-------------|---------|----------|
| `wishlize-uploads` | User photos (24h auto-delete) | CORS enabled, private |
| `wishlize-results` | AI generated images (7-day auto-delete) | CORS enabled, public-read |
| `wishlize-cdn` | Widget.js file | Public-read, static website hosting |
| `demo.wishlize.ai` | Fake fashion store | Public-read, static website hosting |

**Lifecycle Rules to Set:**
- `wishlize-uploads`: Delete objects after 1 day
- `wishlize-results`: Delete objects after 7 days

### 3. DynamoDB Table
- **Table name:** `WishlizeSessions`
- **Partition key:** `email` (String)
- **Sort key:** `sessionId` (String) - optional but good practice
- **Billing mode:** On-demand (pay per request)

### 4. Cost Alarms (Critical)
- **CloudWatch → Alarms → Create Alarm**
- Metric: Billing → Estimated Charges
- Threshold: $10 (first warning), $50 (panic stop)

### 5. Credentials File
Create `~/.aws/credentials` on your machine:
```
[default]
aws_access_key_id = YOUR_KEY
aws_secret_access_key = YOUR_SECRET
region = ap-south-1  (or us-east-1)
```

---

## PROJECT STRUCTURE

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

## PHASE 1: INFRASTRUCTURE & API (Days 1-5)

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
**Save the API Gateway URL returned** (looks like: `https://xxx.execute-api.ap-south-1.amazonaws.com/dev/`)

### Day 2: Photo Validator Lambda
**File:** `backend/handler.js`

**Requirements:**
- Accept POST with `{imageUrl: "s3://bucket/photo.jpg"}`
- Use AWS Rekognition to detect:
  - Is it a person? (confidence > 90%)
  - Bounding box ratio (height/width > 2.0 = full body)
  - Is it blurry? (Rekognition quality check)
- Return: `{valid: boolean, message: string, type: "full_body" | "half_body" | "invalid"}`

**Test via Postman:**
POST to `https://xxx/validate`
Body: `{"imageUrl": "https://your-test-image.jpg"}`

### Day 3: FASHN Integration
**File:** `backend/services/fashnClient.js`

**Logic:**
1. Receive `personImageUrl` and `garmentImageUrl`
2. POST to `https://api.fashn.ai/v1/run` with:
   - model_image: personImageUrl
   - garment_image: garmentImageUrl
   - category: "tops" (or auto-detect)
3. Poll every 2 seconds for result (FASHN returns `id`, you check status)
4. Return final image URL when `status: "completed"`

**Handler Integration:**
- Check DynamoDB quota first (email → tries_left)
- If tries_left > 0: Call FASHN
- If success: Decrement tries_left, store result URL
- Return `{success: true, resultUrl: "...", triesRemaining: 2}`

### Day 4: S3 Presigned URLs
**Goal:** Secure upload directly from browser to S3

**New Endpoint:** `GET /get-upload-url?filename=user123.jpg`
- Generates presigned POST URL for `wishlize-uploads` bucket
- Returns: `{uploadUrl: "...", publicUrl: "..."}`

### Day 5: Integration Test
**Test full flow via Postman:**
1. Get upload URL → Upload Emma photo to S3
2. POST /validate → Should pass
3. POST /tryon with garment URL → Wait 15s → Get result
4. Check DynamoDB: Email should show 2 tries left

---

## PHASE 2: WIDGET DEVELOPMENT (Days 6-9)

### Day 6: Widget Skeleton
**File:** `widget/src/widget.js`

**Requirements:**
- IIFE pattern: `(function() { ... })()` (no global scope pollution)
- Auto-detect product image from page:
  - Look for `meta[property="og:image"]`
  - Or look for `img` with class `product-image`
  - Or read `data-product-image` attribute from widget div
- Inject "Try It On" button below product image

### Day 7: Modal UI
**File:** `widget/src/modal.html` (template string in JS)

**Components:**
- Drag & drop zone (with preview)
- Email input (for quota tracking)
- Checkbox: "I consent to AI processing of my image"
- "Analyze Photo" button (calls /validate first)
- Loading state: "AI is working... (10s)"
- Result view: Split screen (original vs AI result)
- Error states: "Please upload full body photo" / "Too blurry"

**Styling:** Use Shadow DOM to avoid CSS conflicts with host site

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

### Day 9: Build & Deploy
**Command:**
```bash
cd widget
# Minify (optional for demo)
cp src/widget.js build/widget.min.js
# Upload to S3
aws s3 cp build/widget.min.js s3://wishlize-cdn/widget.js --acl public-read
```
**URL:** `https://wishlize-cdn.s3.ap-south-1.amazonaws.com/widget.js`

---

## PHASE 3: DEMO STORE (Days 10-13)

### Day 10: Fake Fashion Site
**Create:** `demo-store/product/blazer.html`

**Design:**
- Clean product page (copy Zara/ Myntra layout)
- Product: "Premium Wool Blazer - Grey"
- Price: $129
- Images: Use the blazer image you tested with FASHN
- Embed widget:
```html
<div id="wishlize-widget" 
     data-product-id="blazer-001"
     data-garment-image="https://demo.wishlize.ai/images/blazer.jpg">
</div>
<script src="https://wishlize-cdn.s3.ap-south-1.amazonaws.com/widget.js"></script>
```

### Day 11: Mobile Responsive
- Test on mobile device (iPhone/Android)
- Ensure modal fits screen
- Touch-friendly drag & drop

### Day 12: Ghost Page Features
- Add password protection (simple HTTP Basic Auth via S3, or just obscure URL)
- Add "Powered by AWS Lambda" badge (shows AWS usage for competition)
- Add quota indicator: "3 free try-ons remaining"

### Day 13: End-to-End Testing
**Test scenarios:**
1. First-time user: Upload good photo → Success → Shows 2 tries left
2. Same email: Try 3 times → 4th attempt shows "Quota exceeded"
3. Bad photo: Upload blurry selfie → Error message "Please retake"
4. Wrong format: Upload PDF → Error "Please upload JPG/PNG"

---

## PHASE 4: ARTICLE & LAUNCH (Days 14-20)

### Day 14: Article Draft
**Title options:**
- "How I Built a Virtual Try-On Widget Using AWS Lambda and $200 in Credits"
- "Reducing Fashion Returns by 40% with Serverless AI"

**Structure:**
1. **The Problem:** Your personal story (sister's returns/ carbon footprint)
2. **The Architecture:** Use the diagram generated earlier
3. **Technical Deep Dive:**
   - Why DynamoDB over RDS (cost/ops)
   - The Photo Validator innovation (saving API costs)
   - FASHN integration challenges
4. **Cost Breakdown:** "$0.02 per try-on vs competitors at $2.00"
5. **The Demo:** Link to demo.wishlize.ai
6. **Call to Action:** "Like this article to help us reach top 300"

### Day 15: Demo Video (2 Minutes)
**Script:**
- 0:00-0:15: Problem statement (show messy returns)
- 0:15-0:45: Screen record of widget working (upload → result)
- 0:45-1:15: Architecture explanation (show AWS console briefly)
- 1:15-1:45: Cost comparison spreadsheet
- 1:45-2:00: Call to action

**Upload:** YouTube (unlisted) or S3 + CloudFront

### Day 16: AWS Builder Center Submission
- Go to [AWS Builder Center](https://aws.amazon.com/developer/community/community-builders/)
- Submit article with tags: `#aideas-2025`, `#commercial-solutions`, `#apjc`
- Embed video link
- Use architecture diagram as cover image

### Day 17-18: Polish & Bug Fixes
- Fix CORS issues if any
- Optimize image loading (add CloudFront if time permits)
- Ensure DynamoDB TTL is working (auto-delete old sessions)

### Day 19-20: Vote Campaign
- Share article on LinkedIn (tag AWS, D2C founders)
- Post in WhatsApp groups (Indian startup communities)
- Email to 20+ D2C founders you know
- Hacker News "Show HN" post

---

## DAILY STANDUP CHECKLIST

Every day, ask yourself:
1. [ ] Did I deploy to AWS today (not just local testing)?
2. [ ] Did I test on mobile?
3. [ ] Is the $10 billing alarm still silent?
4. [ ] Did I commit code to Git?

---

## CRITICAL ENVIRONMENT VARIABLES

Create `backend/.env` (never commit this):
```
FASHN_API_KEY=your_fashn_key_here
AWS_REGION=ap-south-1
DYNAMO_TABLE=WishlizeSessions
```

Create `widget/src/config.js`:
```javascript
const CONFIG = {
  API_BASE: 'https://xxx.execute-api.ap-south-1.amazonaws.com/dev',
  S3_UPLOAD_BUCKET: 'wishlize-uploads',
  MAX_RETRIES: 3
};
```

---

## BACKUP PLAN (If Things Break)

**If FASHN API fails:**
- Day 1: Test immediately. If quality <80%, switch to **Replicate API** (Kolors model) or **RunPod** (self-host).

**If AWS is too complex:**
- Skip DynamoDB, use **JSON files on S3** for session storage (hacky but works for demo)
- Skip Rekognition validation, do **manual checks** (aspect ratio calculation in Lambda only)

**If time runs out:**
- Remove "Photo Validator" feature, go straight to FASHN
- Remove "Quota" system, allow unlimited tries for demo
- Remove dashboard, just show the widget working

---

## SUCCESS METRICS FOR MARCH 5TH

- [ ] Widget loads in <2 seconds
- [ ] End-to-end try-on takes <15 seconds
- [ ] Works on mobile Chrome & Safari
- [ ] 3 try-ons per email enforced
- [ ] Demo page looks professional (not bootstrap-default)
- [ ] No AWS bills >$25

**Save this file. Open it in VS Code alongside your code. Build. Ship. Win.**

---

*Reference Architecture: Lambda + API Gateway + S3 + DynamoDB + FASHN API*
*Estimated Cost: $15-25/month*
*Credits Available: $200 (8 months runway)*
```

**Save this as `BUILD_PLAN.md` in your project root.** Open it in VS Code, open Kiro/terminal beside it, and tackle Day 0 (AWS Setup) first. 

**Do not start coding until you've created those S3 buckets and the DynamoDB table.** The code will fail otherwise.

Ready to configure AWS?