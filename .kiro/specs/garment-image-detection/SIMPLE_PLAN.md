# Garment Image Detection - Simple Fix

## Current Problem
Widget detects `file:///C:/startups/wishlize/demo-store/assets/images/blazer.jpg` which backend can't access.

## What Actually Needs to Happen

### 1. Upload Blazer Image to S3 (5 minutes)
- Upload `demo-store/assets/images/blazer.jpg` to your S3 bucket
- Get the public HTTPS URL
- Use that URL for testing

### 2. Fix Widget URL Detection (10 minutes)
Update `detectProductImage()` in widget to:
- Convert relative URLs to absolute URLs
- Handle file:// URLs by converting to absolute
- For production: detect og:image, Schema.org, or img src properly

### 3. Update Backend Validator (5 minutes)
- Allow HTTP/HTTPS URLs in dev environment
- Keep HTTPS-only for production

## Implementation

### Step 1: Upload Blazer to S3
```bash
cd demo-store/assets/images
aws s3 cp blazer.jpg s3://wishlize-cdn-mumbai/demo/blazer.jpg --acl public-read
```

Get URL: `https://wishlize-cdn-mumbai.s3.ap-south-1.amazonaws.com/demo/blazer.jpg`

### Step 2: Fix Widget Detection
In `demo-store/assets/js/wishlize-widget.js`, update `detectProductImage()`:

```javascript
function detectProductImage() {
  // Priority 1: Manual override
  const manual = document.querySelector('[data-wishlize-garment]');
  if (manual) {
    return normalizeURL(manual.getAttribute('data-wishlize-garment'));
  }

  // Priority 2: og:image meta tag
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) {
    return normalizeURL(ogImage.getAttribute('content'));
  }

  // Priority 3: Product image selectors
  const selectors = [
    '.product-image img',
    '#product-image img',
    'main img'
  ];

  for (const selector of selectors) {
    const img = document.querySelector(selector);
    if (img && img.src) {
      return normalizeURL(img.src);
    }
  }

  return null;
}

function normalizeURL(url) {
  if (!url) return null;

  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Protocol-relative
  if (url.startsWith('//')) {
    return window.location.protocol + url;
  }

  // Relative to root
  if (url.startsWith('/')) {
    return window.location.origin + url;
  }

  // Relative to current path
  const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  return base + url;
}
```

### Step 3: For Local Testing
Update `demo-store/product/blazer.html` to use S3 URL:

```html
<img src="https://wishlize-cdn-mumbai.s3.ap-south-1.amazonaws.com/demo/blazer.jpg" 
     alt="Premium Wool Blazer" 
     class="product-image">
```

## Testing Flow

1. Open `demo-store/product/blazer.html` in browser
2. Click "Try It On Virtually"
3. Upload Brad Pitt photo
4. Widget detects blazer image from S3
5. Backend receives:
   - `personImageUrl`: S3 URL of Brad Pitt photo
   - `garmentUrl`: S3 URL of blazer
6. FASHN API generates result
7. Display result to user

## That's It!

No need for:
- ❌ Complex detection strategies
- ❌ DeepSeek AI prompts (FASHN doesn't use text prompts for try-on)
- ❌ File URL handlers
- ❌ Manual selection UI

Just:
- ✅ Upload blazer to S3
- ✅ Fix URL normalization in widget
- ✅ Test with Brad Pitt photo

Total time: 20 minutes
