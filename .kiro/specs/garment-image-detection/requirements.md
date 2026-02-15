# Requirements Document: Garment Image Detection

## Introduction

This document specifies requirements for a robust, multi-strategy garment image detection system for the Wishlize virtual try-on widget. The system must automatically detect garment/product images from e-commerce product pages with high accuracy, handle various URL formats, provide validation, and offer manual fallback options when automatic detection fails.

## Glossary

- **Widget**: The Wishlize virtual try-on embeddable component that runs on e-commerce product pages
- **Garment_Image**: The product/clothing image that will be used for virtual try-on processing
- **Person_Image**: The user-uploaded photo used for virtual try-on
- **Detection_Strategy**: A method for identifying the garment image on a webpage
- **Structured_Data**: Standardized metadata formats like Schema.org JSON-LD, Open Graph, Twitter Cards
- **DOM**: Document Object Model - the HTML structure of the webpage
- **Absolute_URL**: A complete URL including protocol and domain (e.g., https://example.com/image.jpg)
- **Relative_URL**: A URL path without protocol/domain (e.g., /images/product.jpg)
- **File_URL**: A local file system URL (e.g., file:///path/to/image.jpg)
- **Backend**: The server-side API that processes virtual try-on requests
- **FASHN_API**: The third-party AI service that performs virtual try-on processing
- **S3**: Amazon S3 cloud storage service for temporary image hosting

## Requirements

### Requirement 1: Structured Data Detection

**User Story:** As a widget user, I want the system to automatically detect garment images using standardized metadata, so that detection works reliably across different e-commerce platforms.

#### Acceptance Criteria

1. WHEN a webpage contains Schema.org Product markup with image property, THE Widget SHALL extract the image URL from the JSON-LD data
2. WHEN a webpage contains og:image meta tag, THE Widget SHALL extract the image URL from the meta tag content attribute
3. WHEN a webpage contains twitter:image meta tag, THE Widget SHALL extract the image URL from the meta tag content attribute
4. WHEN multiple structured data sources are present, THE Widget SHALL prioritize Schema.org over Open Graph over Twitter Cards
5. WHEN structured data contains multiple images, THE Widget SHALL select the first image in the array

### Requirement 2: DOM-Based Detection

**User Story:** As a widget user, I want the system to detect garment images from HTML structure when standardized metadata is unavailable, so that detection works on sites without proper metadata.

#### Acceptance Criteria

1. WHEN structured data detection fails, THE Widget SHALL search for images using common e-commerce CSS selectors
2. WHEN multiple candidate images are found, THE Widget SHALL prioritize images with data attributes containing "product", "main", or "zoom"
3. WHEN evaluating candidate images, THE Widget SHALL exclude images smaller than 400x400 pixels
4. WHEN evaluating candidate images, THE Widget SHALL exclude images with aspect ratios indicating icons or logos (width/height > 3 or < 0.33)
5. WHEN multiple valid candidates exist, THE Widget SHALL select the largest image by pixel area

### Requirement 3: Manual Override

**User Story:** As a merchant, I want to specify which image should be used for virtual try-on, so that I can ensure the correct garment image is always selected.

#### Acceptance Criteria

1. WHEN an HTML element has data-wishlize-garment attribute, THE Widget SHALL use that element's image URL with highest priority
2. WHEN automatic detection fails, THE Widget SHALL display a visual interface allowing users to select the garment image
3. WHEN a user hovers over product images, THE Widget SHALL display a "Use this image" button overlay
4. WHEN a user clicks the "Use this image" button, THE Widget SHALL set that image as the selected garment image
5. WHEN a user manually selects an image, THE Widget SHALL store the selection for the current session

### Requirement 4: URL Normalization

**User Story:** As a developer, I want all detected image URLs to be converted to absolute URLs, so that the backend can reliably fetch the images.

#### Acceptance Criteria

1. WHEN a relative URL is detected, THE Widget SHALL convert it to an absolute URL using the page's base URL
2. WHEN a protocol-relative URL is detected (starting with //), THE Widget SHALL prepend the current page's protocol
3. WHEN a URL contains query parameters or fragments, THE Widget SHALL preserve them in the normalized URL
4. WHEN normalizing URLs, THE Widget SHALL handle both src attributes and srcset attributes
5. WHEN a URL is already absolute, THE Widget SHALL return it unchanged

### Requirement 5: File URL Handling

**User Story:** As a developer testing locally, I want file:// URLs to be handled gracefully, so that I can test the widget with local HTML files.

#### Acceptance Criteria

1. WHEN a file:// URL is detected, THE Widget SHALL identify it as a local file URL
2. WHEN a file:// URL is detected, THE Widget SHALL convert the image to a Blob object
3. WHEN a file:// URL is converted to Blob, THE Widget SHALL upload it to S3 temporary storage
4. WHEN uploading to S3, THE Widget SHALL generate a temporary accessible HTTPS URL
5. WHEN S3 upload completes, THE Widget SHALL use the S3 URL as the garment URL for backend processing

### Requirement 6: Image Validation

**User Story:** As a system operator, I want detected images to be validated before processing, so that invalid or inappropriate images are rejected early.

#### Acceptance Criteria

1. WHEN an image URL is detected, THE Widget SHALL verify the image loads successfully without 404 errors
2. WHEN an image loads, THE Widget SHALL verify its dimensions are at least 400x400 pixels
3. WHEN an image loads, THE Widget SHALL verify its aspect ratio is between 0.5 and 2.0 (width/height)
4. WHEN an image fails validation, THE Widget SHALL try the next detection strategy
5. WHEN all detection strategies fail validation, THE Widget SHALL display an error message requesting manual selection

### Requirement 7: Visual Preview and Confirmation

**User Story:** As a widget user, I want to see which garment image was detected, so that I can confirm it's correct before processing.

#### Acceptance Criteria

1. WHEN a garment image is detected, THE Widget SHALL display a preview thumbnail in the modal
2. WHEN displaying the preview, THE Widget SHALL show the image source URL as a tooltip
3. WHEN a user views the preview, THE Widget SHALL provide a "Change Image" button
4. WHEN a user clicks "Change Image", THE Widget SHALL activate manual selection mode
5. WHEN a user confirms the selection, THE Widget SHALL proceed to the next step with the confirmed image URL

### Requirement 8: Performance Requirements

**User Story:** As a widget user, I want garment detection to be fast, so that the virtual try-on experience feels responsive.

#### Acceptance Criteria

1. WHEN the widget initializes, THE Widget SHALL complete garment detection within 500 milliseconds
2. WHEN performing DOM queries, THE Widget SHALL limit selector searches to avoid blocking the main thread
3. WHEN validating images, THE Widget SHALL perform validation asynchronously
4. WHEN multiple images need validation, THE Widget SHALL validate them in parallel up to 3 concurrent requests
5. WHEN detection exceeds 500ms, THE Widget SHALL show a loading indicator to the user

### Requirement 9: Error Handling and Fallback

**User Story:** As a widget user, I want clear error messages when detection fails, so that I know what action to take.

#### Acceptance Criteria

1. WHEN no garment image can be detected, THE Widget SHALL display an error message explaining the issue
2. WHEN detection fails, THE Widget SHALL provide instructions for manual image selection
3. WHEN a network error occurs during validation, THE Widget SHALL retry up to 2 times before failing
4. WHEN validation fails after retries, THE Widget SHALL fall back to the next detection strategy
5. WHEN all strategies fail, THE Widget SHALL display a manual selection interface as the final fallback

### Requirement 10: Backend URL Validation

**User Story:** As a backend developer, I want to validate garment URLs before sending to FASHN API, so that invalid URLs don't cause processing failures.

#### Acceptance Criteria

1. WHEN receiving a garment URL, THE Backend SHALL verify it uses HTTPS or HTTP protocol
2. WHEN receiving a garment URL, THE Backend SHALL verify it is not a file:// URL
3. WHEN receiving a garment URL, THE Backend SHALL verify the URL is accessible via HEAD request
4. WHEN a garment URL fails validation, THE Backend SHALL return a 400 error with descriptive message
5. WHEN a garment URL passes validation, THE Backend SHALL proceed to send it to FASHN_API

### Requirement 11: Cross-Platform Compatibility

**User Story:** As a merchant, I want the widget to work on any e-commerce platform, so that I can use it regardless of my store's technology.

#### Acceptance Criteria

1. THE Widget SHALL successfully detect garment images on Shopify stores
2. THE Widget SHALL successfully detect garment images on WooCommerce stores
3. THE Widget SHALL successfully detect garment images on Magento stores
4. THE Widget SHALL successfully detect garment images on custom-built e-commerce sites
5. WHEN running on an unsupported platform, THE Widget SHALL fall back to manual selection

### Requirement 12: Detection Strategy Ordering

**User Story:** As a system designer, I want detection strategies to be executed in priority order, so that the most reliable methods are tried first.

#### Acceptance Criteria

1. THE Widget SHALL attempt detection in this order: manual override, structured data, DOM-based, manual selection
2. WHEN a strategy succeeds and passes validation, THE Widget SHALL not execute subsequent strategies
3. WHEN a strategy fails or returns invalid results, THE Widget SHALL proceed to the next strategy
4. WHEN all automatic strategies fail, THE Widget SHALL activate manual selection mode
5. THE Widget SHALL log which strategy successfully detected the garment image for debugging purposes
