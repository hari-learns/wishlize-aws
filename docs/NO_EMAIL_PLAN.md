# Wishlize No-Email Architecture Plan

## Goal
Eliminate email requirement for instant visual try-on experience.

## New User Flow
1. Click "Try It On" button
2. Upload photo immediately
3. See processing animation
4. View result side-by-side

## Technical Changes

### 1. Backend API Changes

#### GET /get-upload-url
**Before:**
```json
{
  "email": "user@example.com",
  "fileType": "image/jpeg"
}
```

**After:**
```json
{
  "fileType": "image/jpeg"
}
```

- Remove email validation
- Use IP address hash for quota tracking
- Auto-generate session ID

#### POST /validate-photo
**Before:**
```json
{
  "email": "user@example.com",
  "sessionId": "uuid",
  "imageUrl": "https://..."
}
```

**After:**
```json
{
  "sessionId": "uuid",
  "imageUrl": "https://..."
}
```

#### POST /process-tryon
**Before:**
```json
{
  "email": "user@example.com",
  "sessionId": "uuid",
  "garmentUrl": "https://..."
}
```

**After:**
```json
{
  "sessionId": "uuid",
  "garmentUrl": "https://..."
}
```

### 2. Quota Management (IP-Based)

Instead of email-based quota (3 per email), use IP-based:
- Track by IP hash
- 3 try-ons per IP per 24 hours
- Less accurate but much faster UX

### 3. Session Storage

```javascript
// New session schema
{
  ipHash: "sha256(ip)",          // PK
  sessionId: "uuid",             // SK
  triesLeft: 3,
  status: "created",
  createdAt: timestamp,
  expiresAt: timestamp + 24h
}
```

### 4. Widget Changes

Remove from modal:
- Email input field
- Consent checkbox
- "Continue" button

New flow:
```
[Try It On Button] 
    ↓
[Upload Photo Screen] (immediate)
    ↓
[Preview] → [Visualize Button]
    ↓
[Processing Animation]
    ↓
[Result Display]
```

### 5. Privacy Improvements

- No PII collected
- No email storage
- Only IP hash + session data
- Auto-delete after 24h

## Files to Modify

### Backend
1. `lib/validators.js` - Remove email validation functions
2. `lib/middleware.js` - Remove email rate limiting
3. `services/sessionStore.js` - Use IP instead of email
4. `handler.js` - Remove email from request bodies

### Frontend
1. `widget/src/widget.js` - Skip email step
2. `widget/src/modal.html` - Remove email/consent UI

## Pros
- Faster user experience (3 steps → 2 steps)
- No PII collection
- Higher conversion rate
- Simpler code

## Cons
- Less accurate quota tracking (shared IPs)
- No way to recover results later
- Can't email results to user

## Decision
Accept trade-offs for better UX - this is a demo/visualization tool, not a production e-commerce feature.
