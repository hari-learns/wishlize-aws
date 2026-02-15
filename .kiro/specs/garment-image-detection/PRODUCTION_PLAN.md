# Production-Ready Garment Detection - SaaS Widget

## Business Context

**What we're building:** A drop-in widget that ANY e-commerce store can embed with one line of code.

**Merchant integration:**
```html
<script src="https://cdn.wishlize.ai/widget.js"></script>
```

**That's it.** No configuration, no API keys, no image URLs. The widget must:
1. Auto-detect the product image from the webpage
2. Let users upload their photo
3. Generate virtual try-on
4. Show results

**We CANNOT ask merchants for:**
- ❌ Product image URLs
- ❌ Database access
- ❌ API integration
- ❌ Configuration files

## The Real Challenge

**How do we reliably detect product images across:**
- Shopify stores (different themes)
- WooCommerce stores (different themes)
- Custom e-commerce sites
- Different HTML structures
- Different CSS frameworks

## Production Solution: Multi-Strategy Detection

### Strategy 1: Structured Metadata (80% coverage)
Most e-commerce platforms automatically add structured data for SEO/social sharing:

```javascript
// Check Schema.org JSON-LD (Shopify, WooCommerce auto-generate this)
<script type="application/ld+json">
{
  "@type": "Product",
  "image": "https://store.com/products/blazer.jpg"
}
</script>

// Check Open Graph (Facebook sharing)
<meta property="og:image" content="https://store.com/products/blazer.jpg">

// Check Twitter Cards
<meta name="twitter:image" content="https://store.com/products/blazer.jpg">
```

**Why this works:** E-commerce platforms add these automatically for SEO. We don't need merchant cooperation.

### Strategy 2: DOM Pattern Matching (15% coverage)
Common CSS patterns across platforms:

```javascript
const commonSelectors = [
  '.product-image img',           // Generic
  '.product-main-image img',      // WooCommerce
  '.product-single__photo img',   // Shopify Dawn theme
  '[data-product-featured-image]', // Shopify
  '.woocommerce-product-gallery__image img', // WooCommerce
  '#product-image img',           // Custom sites
];
```

### Strategy 3: Manual Fallback (5% coverage)
If auto-detection fails, show UI:
```
"Click on the garment image you want to try on"
[Hover overlays appear on all images]
```

## Implementation Plan

### Phase 1: Core Detection Engine (Day 1)

**File:** `widget/src/garmentDetector.js`

```javascript
class GarmentDetector {
  detect() {
    // Try strategies in order
    const url = 
      this.tryStructuredData() ||
      this.tryDOMPatterns() ||
      this.promptManualSelection();
    
    return this.normalizeURL(url);
  }

  tryStructuredData() {
    // Parse Schema.org JSON-LD
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const data = JSON.parse(script.textContent);
      if (data['@type'] === 'Product' && data.image) {
        return Array.isArray(data.image) ? data.image[0] : data.image;
      }
    }

    // Check Open Graph
    const og = document.querySelector('meta[property="og:image"]');
    if (og) return og.content;

    // Check Twitter Card
    const twitter = document.querySelector('meta[name="twitter:image"]');
    if (twitter) return twitter.content;

    return null;
  }

  tryDOMPatterns() {
    const selectors = [
      '[data-wishlize-product]',  // Merchant override
      '.product-image img',
      '.product-main-image img',
      '.product-single__photo img',
      '[data-product-featured-image]',
      '.woocommerce-product-gallery__image img',
      '#product-image img',
      'main img[src*="product"]',
    ];

    for (const selector of selectors) {
      const img = document.querySelector(selector);
      if (img && this.isValidProductImage(img)) {
        return img.src;
      }
    }

    return null;
  }

  isValidProductImage(img) {
    // Filter out icons, logos, thumbnails
    return img.naturalWidth >= 400 && 
           img.naturalHeight >= 400 &&
           img.naturalWidth / img.naturalHeight < 3; // Not a banner
  }

  normalizeURL(url) {
    if (!url) return null;
    
    // Already absolute
    if (url.startsWith('http')) return url;
    
    // Protocol-relative
    if (url.startsWith('//')) return window.location.protocol + url;
    
    // Relative to root
    if (url.startsWith('/')) return window.location.origin + url;
    
    // Relative to current path
    const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    return base + url;
  }

  promptManualSelection() {
    // Show UI: "Click the garment image"
    return new Promise((resolve) => {
      this.showManualUI(resolve);
    });
  }
}
```

### Phase 2: S3 Lifecycle Policies (Day 1)

**Already configured in your buckets, but verify:**

```bash
# Uploads bucket - delete after 1 day
aws s3api put-bucket-lifecycle-configuration \
  --bucket wishlize-uploads-mumbai \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "DeleteAfter1Day",
      "Status": "Enabled",
      "Expiration": { "Days": 1 }
    }]
  }'

# Results bucket - delete after 7 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket wishlize-results-mumbai \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "DeleteAfter7Days",
      "Status": "Enabled",
      "Expiration": { "Days": 7 }
    }]
  }'
```

### Phase 3: CORS Configuration (Day 1)

**Problem:** Widget runs on merchant's domain (e.g., `shopify-store.com`) but needs to access images from their CDN.

**Solution:** Backend proxies images if CORS fails.

**File:** `backend/handler.js` - Add new endpoint:

```javascript
// GET /proxy-image?url=https://merchant.com/product.jpg
const proxyImageHandler = async (event) => {
  const imageUrl = event.queryStringParameters.url;
  
  // Validate URL
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return { statusCode: 400, body: 'Invalid URL' };
  }

  try {
    // Fetch image
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000 
    });

    // Return image with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Content-Type': response.headers['content-type'],
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: Buffer.from(response.data).toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return { statusCode: 404, body: 'Image not found' };
  }
};
```

**Widget fallback:**
```javascript
async validateImageAccess(url) {
  try {
    // Try direct access first
    await fetch(url, { mode: 'no-cors' });
    return url;
  } catch (error) {
    // Fallback to proxy
    return `${API_BASE}/proxy-image?url=${encodeURIComponent(url)}`;
  }
}
```

### Phase 4: Security & Privacy (Day 2)

**1. Rate Limiting (Already implemented)**
- 3 try-ons per email per day
- Prevents abuse

**2. Image Validation (Already implemented)**
- Rekognition checks for person in uploaded photo
- Prevents spam/abuse

**3. Data Retention (Configure)**
- User photos: Auto-delete after 1 day
- Results: Auto-delete after 7 days
- DynamoDB sessions: TTL after 30 days

**4. GDPR Compliance**
```javascript
// Add to widget modal
const consentText = `
  By uploading your photo, you consent to:
  - Temporary storage for virtual try-on processing
  - Automatic deletion after 24 hours
  - No sharing with third parties
  - No use for training AI models
`;
```

### Phase 5: Merchant Override (Optional)

**For merchants who want control:**

```html
<!-- Merchant can specify exact image -->
<div id="wishlize-widget" 
     data-wishlize-product="https://cdn.store.com/blazer-hq.jpg">
</div>
<script src="https://cdn.wishlize.ai/widget.js"></script>
```

Widget checks `data-wishlize-product` first before auto-detection.

## Production Deployment Checklist

### Infrastructure
- [x] S3 buckets with lifecycle policies (1 day, 7 days)
- [x] DynamoDB with TTL enabled (30 days)
- [x] Lambda functions deployed
- [x] API Gateway with CORS enabled
- [ ] CloudFront CDN for widget.js
- [ ] Custom domain: cdn.wishlize.ai

### Widget
- [ ] Implement GarmentDetector with 3 strategies
- [ ] Add manual selection UI
- [ ] Add image proxy fallback
- [ ] Minify and deploy to S3/CloudFront
- [ ] Test on Shopify demo store
- [ ] Test on WooCommerce demo store
- [ ] Test on custom HTML site

### Backend
- [ ] Add /proxy-image endpoint
- [ ] Verify lifecycle policies active
- [ ] Add monitoring/logging
- [ ] Set up CloudWatch alarms

### Legal/Privacy
- [ ] Add consent checkbox to widget
- [ ] Create privacy policy page
- [ ] Add GDPR data deletion endpoint
- [ ] Terms of service

## Testing Strategy

### Test on Real Platforms

**1. Shopify (Dawn theme)**
```html
<!-- They auto-generate Schema.org -->
<script type="application/ld+json">
{"@type":"Product","image":"..."}
</script>
```
Expected: Strategy 1 (structured data) succeeds

**2. WooCommerce (Storefront theme)**
```html
<div class="woocommerce-product-gallery">
  <img src="product.jpg">
</div>
```
Expected: Strategy 2 (DOM patterns) succeeds

**3. Custom site (no metadata)**
```html
<img src="blazer.jpg" class="product-photo">
```
Expected: Strategy 2 or 3 (manual) succeeds

## Success Metrics

**Detection Accuracy:**
- 80%+ auto-detection success rate
- <5% manual selection fallback
- <1% complete failure

**Performance:**
- Widget loads in <2 seconds
- Detection completes in <500ms
- End-to-end try-on in <15 seconds

**Security:**
- 100% of user photos deleted after 1 day
- 100% of results deleted after 7 days
- Zero data breaches

## What You Already Have ✅

- ✅ S3 buckets configured
- ✅ Photo upload working
- ✅ FASHN API integration
- ✅ Rate limiting (3 per day)
- ✅ Photo validation (Rekognition)
- ✅ Backend handlers

## What You Need to Build 🔨

1. **GarmentDetector class** (2 hours)
   - Structured data parsing
   - DOM pattern matching
   - Manual selection UI

2. **Image proxy endpoint** (1 hour)
   - Handle CORS issues
   - Cache proxied images

3. **Testing on real platforms** (2 hours)
   - Shopify store
   - WooCommerce store
   - Custom site

**Total: 5 hours of focused work**

## Next Steps

1. Implement GarmentDetector
2. Test on Shopify/WooCommerce
3. Add image proxy endpoint
4. Deploy to CloudFront
5. Create merchant documentation

Ready to build this?
