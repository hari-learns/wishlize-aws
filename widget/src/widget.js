/**
 * Wishlize Virtual Try-On Widget
 * 
 * Features:
 * - Auto-detects product image from webpage
 * - Shows "Try It On" button
 * - Modal with consent checkbox
 * - Photo upload (drag & drop)
 * - Integration with backend APIs
 * - Progress tracking and result display
 */

(function() {
  'use strict';

  // Widget Configuration
  const CONFIG = {
    API_BASE: 'https://ofu8qmpqt9.execute-api.ap-south-1.amazonaws.com/dev',
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    SUPPORTED_FORMATS: ['image/jpeg', 'image/png'],
    POLL_INTERVAL: 3000, // 3 seconds
    MAX_POLL_ATTEMPTS: 40 // ~2 minutes
  };

  // Widget State
  const state = {
    isOpen: false,
    currentFile: null,
    sessionId: null,
    email: null,
    garmentUrl: null,
    predictionId: null,
    triesRemaining: 3,
    pollingInterval: null
  };

  // Shadow DOM container
  let shadowHost = null;
  let shadowRoot = null;

  /**
   * Initialize the widget
   */
  function init() {
    // Find product image
    const productImage = detectProductImage();
    if (!productImage) {
      console.warn('[Wishlize] Could not detect product image');
      return;
    }
    state.garmentUrl = productImage;

    // Create Shadow DOM for style isolation
    createShadowHost();

    // Inject trigger button
    injectTriggerButton();

    // Listen for messages from backend
    window.addEventListener('message', handleMessage);
  }

  /**
   * Auto-detect product image from the page
   */
  function detectProductImage() {
    // Priority order for detection
    const selectors = [
      // Custom data attribute
      '[data-wishlize-garment]',
      // Common product image patterns
      '.product-image img',
      '.product-main-image img',
      '.product-single__image img',
      '#product-image img',
      // Meta tags
      'meta[property="og:image"]',
      // Main product image (common e-commerce patterns)
      'main img[src*="product"]',
      'main img[alt*="product" i]',
      // First large image in main content
      'main img'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        // For meta tags, get content attribute
        if (element.tagName === 'META') {
          return element.getAttribute('content');
        }
        // For images, get src
        if (element.tagName === 'IMG') {
          // Convert relative URLs to absolute
          const img = new Image();
          img.src = element.src;
          return img.src;
        }
      }
    }

    return null;
  }

  /**
   * Create shadow DOM host for style isolation
   */
  function createShadowHost() {
    shadowHost = document.createElement('div');
    shadowHost.id = 'wishlize-widget-host';
    document.body.appendChild(shadowHost);
    
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  }

  /**
   * Inject "Try It On" button into the page
   */
  function injectTriggerButton() {
    // Find the widget container
    let container = document.getElementById('wishlize-widget-container');
    
    if (!container) {
      // Try to find product info section
      const productInfo = document.querySelector('.product-info, .product-details, [class*="product"]');
      if (productInfo) {
        container = document.createElement('div');
        container.id = 'wishlize-widget-container';
        productInfo.appendChild(container);
      }
    }

    if (!container) {
      console.warn('[Wishlize] No container found for widget');
      return;
    }

    // Check if there's already a button in the container
    const existingButton = container.querySelector('button');
    if (existingButton) {
      // Attach click handler to existing button
      existingButton.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
      console.log('[Wishlize] Attached to existing button');
      return;
    }

    // Create new button if none exists
    const button = document.createElement('button');
    button.className = 'wishlize-trigger-btn';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      <span>Try It On Virtually</span>
    `;
    button.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
    });

    button.addEventListener('click', openModal);
    container.appendChild(button);
  }

  /**
   * Open the virtual try-on modal
   */
  function openModal() {
    if (state.isOpen) return;
    state.isOpen = true;

    // Reset state
    state.currentFile = null;
    state.sessionId = null;
    state.predictionId = null;
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
    }

    // Inject modal HTML and CSS into shadow DOM
    shadowRoot.innerHTML = getModalHTML() + getModalCSS();

    // Setup event listeners
    setupModalEvents();

    // Show modal
    const modal = shadowRoot.getElementById('wishlize-modal');
    if (modal) {
      modal.style.display = 'block';
      // Trigger animation
      setTimeout(() => {
        modal.style.opacity = '1';
      }, 10);
    }
  }

  /**
   * Close the modal
   */
  function closeModal() {
    state.isOpen = false;
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
    }

    const modal = shadowRoot.getElementById('wishlize-modal');
    if (modal) {
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.style.display = 'none';
        shadowRoot.innerHTML = '';
      }, 300);
    }
  }

  /**
   * Get modal HTML
   */
  function getModalHTML() {
    return `
      <div id="wishlize-modal" class="wishlize-modal">
        <div class="wishlize-modal-overlay">
          <div class="wishlize-modal-content">
            <!-- Header -->
            <div class="wishlize-modal-header">
              <h2>👕 Virtual Try-On</h2>
              <button class="wishlize-close-btn" id="wishlize-close">&times;</button>
            </div>

            <!-- Body -->
            <div class="wishlize-modal-body">
              
              <!-- Step 1: Email & Consent -->
              <div id="wishlize-step-email" class="wishlize-step">
                <div class="wishlize-form-group">
                  <label>Email Address *</label>
                  <input type="email" id="wishlize-email" placeholder="your@email.com" required>
                  <small>We'll send your try-on result to this email</small>
                </div>
                
                <div class="wishlize-form-group">
                  <label class="wishlize-checkbox">
                    <input type="checkbox" id="wishlize-consent" required>
                    <span class="checkmark"></span>
                    <span class="label-text">
                      I consent to uploading my photo for virtual try-on processing. 
                      My photo will be stored securely and deleted after 24 hours.
                    </span>
                  </label>
                </div>

                <div class="wishlize-quota-info">
                  <span class="quota-badge">🎁 3 free try-ons per day</span>
                </div>
              </div>

              <!-- Step 2: Photo Upload -->
              <div id="wishlize-step-upload" class="wishlize-step" style="display: none;">
                <div class="wishlize-upload-area" id="wishlize-dropzone">
                  <input type="file" id="wishlize-file-input" accept="image/jpeg,image/png" hidden>
                  <div class="upload-content">
                    <span class="upload-icon">📸</span>
                    <p class="upload-text">Drag & drop your photo here</p>
                    <p class="upload-subtext">or click to browse</p>
                    <p class="upload-hint">JPG or PNG, max 10MB</p>
                  </div>
                </div>
                
                <div class="wishlize-photo-tips">
                  <h4>📸 Photo Tips:</h4>
                  <ul>
                    <li>Stand straight facing the camera</li>
                    <li>Good lighting (natural light works best)</li>
                    <li>Full body or half body shot</li>
                    <li>Clear background</li>
                  </ul>
                </div>
              </div>

              <!-- Preview Section -->
              <div id="wishlize-step-preview" class="wishlize-step" style="display: none;">
                <div class="wishlize-preview-container">
                  <img id="wishlize-preview-img" alt="Your photo">
                </div>
                <button class="wishlize-link-btn" id="wishlize-change-photo">Change Photo</button>
              </div>

              <!-- Processing Section -->
              <div id="wishlize-step-processing" class="wishlize-step" style="display: none;">
                <div class="wishlize-processing-animation">
                  <div class="spinner"></div>
                  <div class="processing-text">
                    <h3>Creating your virtual try-on...</h3>
                    <p id="wishlize-status-text">Uploading photo...</p>
                  </div>
                </div>
                <div class="wishlize-progress-bar">
                  <div class="wishlize-progress-fill" id="wishlize-progress"></div>
                </div>
                <p class="processing-note">This may take up to 2 minutes</p>
              </div>

              <!-- Result Section -->
              <div id="wishlize-step-result" class="wishlize-step" style="display: none;">
                <div class="wishlize-result-comparison">
                  <div class="comparison-item">
                    <label>Original</label>
                    <img id="wishlize-result-original" alt="Original">
                  </div>
                  <div class="comparison-arrow">→</div>
                  <div class="comparison-item">
                    <label>Try-On Result</label>
                    <img id="wishlize-result-final" alt="Try-on result">
                  </div>
                </div>
                
                <div class="wishlize-result-actions">
                  <button class="wishlize-btn wishlize-btn-secondary" id="wishlize-try-another">
                    Try Another Photo
                  </button>
                  <a class="wishlize-btn wishlize-btn-primary" id="wishlize-download" download>
                    Download Result
                  </a>
                </div>

                <div class="wishlize-tries-remaining" id="wishlize-tries-left"></div>
              </div>

              <!-- Error Section -->
              <div id="wishlize-step-error" class="wishlize-step" style="display: none;">
                <div class="wishlize-error-message">
                  <span class="error-icon">⚠️</span>
                  <h3 id="wishlize-error-title">Something went wrong</h3>
                  <p id="wishlize-error-text">Please try again</p>
                </div>
                <button class="wishlize-btn wishlize-btn-primary" id="wishlize-retry">
                  Try Again
                </button>
              </div>

            </div>

            <!-- Footer -->
            <div class="wishlize-modal-footer" id="wishlize-footer">
              <button class="wishlize-btn wishlize-btn-secondary" id="wishlize-cancel">Cancel</button>
              <button class="wishlize-btn wishlize-btn-primary" id="wishlize-continue" disabled>
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get modal CSS
   */
  function getModalCSS() {
    return `
      <style>
        .wishlize-modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .wishlize-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .wishlize-modal-content {
          background: white;
          border-radius: 16px;
          max-width: 550px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .wishlize-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 24px 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .wishlize-modal-header h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: #1f2937;
        }

        .wishlize-close-btn {
          background: #f3f4f6;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #6b7280;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .wishlize-close-btn:hover {
          background: #e5e7eb;
          color: #374151;
        }

        .wishlize-modal-body {
          padding: 24px;
        }

        .wishlize-form-group {
          margin-bottom: 20px;
        }

        .wishlize-form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #374151;
          font-size: 14px;
        }

        .wishlize-form-group input[type="email"] {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .wishlize-form-group input[type="email"]:focus {
          outline: none;
          border-color: #667eea;
        }

        .wishlize-form-group small {
          display: block;
          margin-top: 6px;
          color: #6b7280;
          font-size: 12px;
        }

        .wishlize-checkbox {
          display: flex;
          align-items: flex-start;
          cursor: pointer;
          font-size: 14px;
          color: #374151;
          line-height: 1.5;
        }

        .wishlize-checkbox input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          min-width: 20px;
          border: 2px solid #d1d5db;
          border-radius: 4px;
          margin-right: 12px;
          margin-top: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .wishlize-checkbox input:checked ~ .checkmark {
          background: #667eea;
          border-color: #667eea;
        }

        .wishlize-checkbox input:checked ~ .checkmark:after {
          content: '✓';
          color: white;
          font-size: 14px;
        }

        .wishlize-quota-info {
          margin-top: 20px;
          text-align: center;
        }

        .quota-badge {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
        }

        .wishlize-upload-area {
          border: 3px dashed #d1d5db;
          border-radius: 12px;
          padding: 48px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
          background: #f9fafb;
        }

        .wishlize-upload-area:hover,
        .wishlize-upload-area.dragover {
          border-color: #667eea;
          background: #eef2ff;
        }

        .upload-icon {
          font-size: 48px;
          margin-bottom: 12px;
          display: block;
        }

        .upload-text {
          font-size: 18px;
          font-weight: 600;
          color: #374151;
          margin: 0 0 4px;
        }

        .upload-subtext {
          font-size: 14px;
          color: #6b7280;
          margin: 0 0 8px;
        }

        .upload-hint {
          font-size: 12px;
          color: #9ca3af;
          margin: 0;
        }

        .wishlize-photo-tips {
          margin-top: 24px;
          padding: 16px;
          background: #f3f4f6;
          border-radius: 8px;
        }

        .wishlize-photo-tips h4 {
          margin: 0 0 12px;
          font-size: 14px;
          color: #374151;
        }

        .wishlize-photo-tips ul {
          margin: 0;
          padding-left: 20px;
          font-size: 13px;
          color: #6b7280;
        }

        .wishlize-photo-tips li {
          margin-bottom: 4px;
        }

        .wishlize-preview-container {
          border-radius: 12px;
          overflow: hidden;
          background: #f3f4f6;
        }

        .wishlize-preview-container img {
          width: 100%;
          max-height: 350px;
          object-fit: contain;
          display: block;
        }

        .wishlize-link-btn {
          background: none;
          border: none;
          color: #667eea;
          text-decoration: underline;
          cursor: pointer;
          font-size: 14px;
          margin-top: 12px;
        }

        .wishlize-processing-animation {
          text-align: center;
          padding: 40px 20px;
        }

        .spinner {
          width: 60px;
          height: 60px;
          border: 4px solid #e5e7eb;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 24px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .processing-text h3 {
          margin: 0 0 8px;
          font-size: 18px;
          color: #374151;
        }

        .processing-text p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
        }

        .wishlize-progress-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin: 20px 0 12px;
        }

        .wishlize-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          width: 0%;
          transition: width 0.5s ease;
        }

        .processing-note {
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
          margin: 0;
        }

        .wishlize-result-comparison {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .comparison-item {
          flex: 1;
          text-align: center;
        }

        .comparison-item label {
          display: block;
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .comparison-item img {
          width: 100%;
          max-height: 200px;
          object-fit: contain;
          border-radius: 8px;
          background: #f3f4f6;
        }

        .comparison-arrow {
          font-size: 24px;
          color: #9ca3af;
        }

        .wishlize-result-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .wishlize-tries-remaining {
          text-align: center;
          font-size: 14px;
          color: #6b7280;
        }

        .wishlize-error-message {
          text-align: center;
          padding: 40px 20px;
        }

        .error-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 16px;
        }

        .wishlize-error-message h3 {
          margin: 0 0 8px;
          color: #dc2626;
          font-size: 18px;
        }

        .wishlize-error-message p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
        }

        .wishlize-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px 24px;
          border-top: 1px solid #e5e7eb;
        }

        .wishlize-btn {
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }

        .wishlize-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .wishlize-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .wishlize-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .wishlize-btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .wishlize-btn-secondary:hover {
          background: #e5e7eb;
        }

        @media (max-width: 640px) {
          .wishlize-modal-overlay {
            padding: 10px;
          }

          .wishlize-modal-content {
            max-height: 95vh;
          }

          .wishlize-result-comparison {
            flex-direction: column;
          }

          .comparison-arrow {
            transform: rotate(90deg);
          }

          .wishlize-result-actions {
            flex-direction: column;
          }

          .wishlize-modal-footer {
            flex-direction: column-reverse;
          }

          .wishlize-btn {
            width: 100%;
          }
        }
      </style>
    `;
  }

  /**
   * Setup modal event listeners
   */
  function setupModalEvents() {
    // Close button
    const closeBtn = shadowRoot.getElementById('wishlize-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Cancel button
    const cancelBtn = shadowRoot.getElementById('wishlize-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Email input
    const emailInput = shadowRoot.getElementById('wishlize-email');
    if (emailInput) {
      emailInput.addEventListener('input', validateForm);
    }

    // Consent checkbox
    const consentCheckbox = shadowRoot.getElementById('wishlize-consent');
    if (consentCheckbox) {
      consentCheckbox.addEventListener('change', validateForm);
    }

    // Continue button
    const continueBtn = shadowRoot.getElementById('wishlize-continue');
    if (continueBtn) {
      continueBtn.addEventListener('click', handleContinue);
    }

    // File upload
    const fileInput = shadowRoot.getElementById('wishlize-file-input');
    const dropzone = shadowRoot.getElementById('wishlize-dropzone');

    if (dropzone) {
      dropzone.addEventListener('click', () => fileInput?.click());
      
      // Drag and drop
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          handleFileSelect(files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileSelect(e.target.files[0]);
        }
      });
    }

    // Change photo button
    const changePhotoBtn = shadowRoot.getElementById('wishlize-change-photo');
    if (changePhotoBtn) {
      changePhotoBtn.addEventListener('click', () => {
        showStep('upload');
      });
    }

    // Try another button
    const tryAnotherBtn = shadowRoot.getElementById('wishlize-try-another');
    if (tryAnotherBtn) {
      tryAnotherBtn.addEventListener('click', () => {
        showStep('upload');
        state.currentFile = null;
      });
    }

    // Retry button
    const retryBtn = shadowRoot.getElementById('wishlize-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        showStep('email');
      });
    }

    // Close on overlay click
    const overlay = shadowRoot.querySelector('.wishlize-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }
  }

  /**
   * Validate form inputs
   */
  function validateForm() {
    const emailInput = shadowRoot.getElementById('wishlize-email');
    const consentCheckbox = shadowRoot.getElementById('wishlize-consent');
    const continueBtn = shadowRoot.getElementById('wishlize-continue');

    const email = emailInput?.value?.trim();
    const hasConsent = consentCheckbox?.checked;
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (continueBtn) {
      continueBtn.disabled = !isValidEmail || !hasConsent;
    }
  }

  /**
   * Handle continue button click
   */
  function handleContinue() {
    const currentStep = getCurrentStep();

    if (currentStep === 'email') {
      const emailInput = shadowRoot.getElementById('wishlize-email');
      state.email = emailInput?.value?.trim();
      showStep('upload');
      updateFooter('upload');
    } else if (currentStep === 'preview') {
      startProcessing();
    }
  }

  /**
   * Get current visible step
   */
  function getCurrentStep() {
    const steps = ['email', 'upload', 'preview', 'processing', 'result', 'error'];
    for (const step of steps) {
      const el = shadowRoot.getElementById(`wishlize-step-${step}`);
      if (el && el.style.display !== 'none') {
        return step;
      }
    }
    return 'email';
  }

  /**
   * Show specific step
   */
  function showStep(step) {
    const steps = ['email', 'upload', 'preview', 'processing', 'result', 'error'];
    steps.forEach(s => {
      const el = shadowRoot.getElementById(`wishlize-step-${s}`);
      if (el) el.style.display = s === step ? 'block' : 'none';
    });
    updateFooter(step);
  }

  /**
   * Update footer buttons based on step
   */
  function updateFooter(step) {
    const continueBtn = shadowRoot.getElementById('wishlize-continue');
    const cancelBtn = shadowRoot.getElementById('wishlize-cancel');
    const footer = shadowRoot.getElementById('wishlize-footer');

    if (!continueBtn || !footer) return;

    switch (step) {
      case 'email':
        continueBtn.textContent = 'Continue';
        continueBtn.disabled = true;
        validateForm();
        break;
      case 'upload':
        continueBtn.style.display = 'none';
        break;
      case 'preview':
        continueBtn.style.display = 'inline-block';
        continueBtn.textContent = 'Visualize';
        continueBtn.disabled = false;
        break;
      case 'processing':
      case 'result':
      case 'error':
        footer.style.display = 'none';
        return;
    }

    footer.style.display = 'flex';
  }

  /**
   * Handle file selection
   */
  function handleFileSelect(file) {
    // Validate file
    if (!CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
      showError('Invalid file type', 'Please upload a JPG or PNG image.');
      return;
    }

    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showError('File too large', 'Please upload an image smaller than 10MB.');
      return;
    }

    state.currentFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = shadowRoot.getElementById('wishlize-preview-img');
      if (previewImg) {
        previewImg.src = e.target.result;
      }
      showStep('preview');
    };
    reader.readAsDataURL(file);
  }

  /**
   * Start the processing workflow
   */
  async function startProcessing() {
    showStep('processing');
    updateProgress(10, 'Getting upload URL...');

    try {
      // Step 1: Get upload URL
      const uploadData = await apiCall('/get-upload-url', {
        email: state.email,
        fileType: state.currentFile.type
      });

      if (uploadData.quotaExceeded) {
        throw new Error('Daily try-on limit reached. Please try again tomorrow.');
      }

      state.sessionId = uploadData.sessionId;
      state.triesRemaining = uploadData.triesRemaining;

      // Step 2: Upload photo to S3
      updateProgress(30, 'Uploading photo...');
      await uploadToS3(uploadData, state.currentFile);

      // Step 3: Validate photo
      updateProgress(50, 'Validating photo...');
      const validationResult = await apiCall('/validate-photo', {
        email: state.email,
        sessionId: state.sessionId,
        imageUrl: uploadData.publicUrl
      });

      if (!validationResult.valid) {
        throw new Error(validationResult.message || 'Photo validation failed. Please try a different photo.');
      }

      // Step 4: Process try-on
      updateProgress(70, 'Generating virtual try-on...');
      const processResult = await apiCall('/process-tryon', {
        email: state.email,
        sessionId: state.sessionId,
        garmentUrl: state.garmentUrl
      });

      state.predictionId = processResult.predictionId;
      state.triesRemaining = processResult.triesRemaining;

      // Step 5: Poll for result
      await pollForResult();

    } catch (error) {
      showError('Processing failed', error.message);
    }
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async function uploadToS3(uploadData, file) {
    const formData = new FormData();
    
    // Add all fields from presigned URL
    Object.entries(uploadData.fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    
    formData.append('file', file);

    const response = await fetch(uploadData.uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to upload photo');
    }

    return uploadData.publicUrl;
  }

  /**
   * Poll for try-on result
   */
  async function pollForResult() {
    let attempts = 0;

    return new Promise((resolve, reject) => {
      state.pollingInterval = setInterval(async () => {
        attempts++;

        try {
          const status = await apiCall('/status', {
            email: state.email,
            sessionId: state.sessionId
          }, 'GET');

          if (status.status === 'completed') {
            clearInterval(state.pollingInterval);
            showResult(status.resultUrl);
            resolve(status);
          } else if (status.status === 'failed') {
            clearInterval(state.pollingInterval);
            reject(new Error(status.errorMessage || 'Try-on generation failed'));
          }

          // Update progress
          const progress = Math.min(70 + (attempts * 2), 95);
          updateProgress(progress, 'Generating virtual try-on...');

          if (attempts >= CONFIG.MAX_POLL_ATTEMPTS) {
            clearInterval(state.pollingInterval);
            reject(new Error('Generation timed out. Please try again.'));
          }
        } catch (error) {
          clearInterval(state.pollingInterval);
          reject(error);
        }
      }, CONFIG.POLL_INTERVAL);
    });
  }

  /**
   * Show final result
   */
  function showResult(resultUrl) {
    updateProgress(100, 'Complete!');

    const originalImg = shadowRoot.getElementById('wishlize-result-original');
    const finalImg = shadowRoot.getElementById('wishlize-result-final');
    const downloadBtn = shadowRoot.getElementById('wishlize-download');
    const triesLeft = shadowRoot.getElementById('wishlize-tries-left');

    if (originalImg) {
      const reader = new FileReader();
      reader.onload = (e) => {
        originalImg.src = e.target.result;
      };
      reader.readAsDataURL(state.currentFile);
    }

    if (finalImg) {
      finalImg.src = resultUrl;
    }

    if (downloadBtn) {
      downloadBtn.href = resultUrl;
      downloadBtn.download = 'wishlize-tryon.jpg';
    }

    if (triesLeft) {
      triesLeft.textContent = `${state.triesRemaining} try-ons remaining today`;
    }

    setTimeout(() => {
      showStep('result');
    }, 500);
  }

  /**
   * Update progress bar
   */
  function updateProgress(percent, text) {
    const progressEl = shadowRoot.getElementById('wishlize-progress');
    const statusText = shadowRoot.getElementById('wishlize-status-text');

    if (progressEl) {
      progressEl.style.width = `${percent}%`;
    }
    if (statusText && text) {
      statusText.textContent = text;
    }
  }

  /**
   * Show error
   */
  function showError(title, message) {
    const errorTitle = shadowRoot.getElementById('wishlize-error-title');
    const errorText = shadowRoot.getElementById('wishlize-error-text');

    if (errorTitle) errorTitle.textContent = title;
    if (errorText) errorText.textContent = message;

    showStep('error');
  }

  /**
   * Make API call
   */
  async function apiCall(endpoint, data, method = 'POST') {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (method === 'GET' && data) {
      const params = new URLSearchParams(data).toString();
      return fetch(`${url}?${params}`, options).then(r => r.json());
    }

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || 'Request failed');
    }

    return result;
  }

  /**
   * Handle postMessage from backend (for webhooks)
   */
  function handleMessage(event) {
    if (event.data.type === 'wishlize-result') {
      // Handle result from webhook
      if (state.predictionId === event.data.predictionId) {
        showResult(event.data.resultUrl);
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose to window for debugging
  window.WishlizeWidget = {
    open: openModal,
    close: closeModal,
    state: () => state
  };
})();
