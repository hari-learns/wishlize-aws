/**
 * Wishlize Virtual Try-On Widget (Simplified - No Email)
 * 
 * Flow: Click Button → Upload Photo → Visualize → See Result
 * No email, no delays, instant gratification!
 */

(function() {
  'use strict';

  // Widget Configuration
  const CONFIG = {
    API_BASE: 'https://ofu8qmpqt9.execute-api.ap-south-1.amazonaws.com/dev',
    MAX_FILE_SIZE: 10 * 1024 * 1024,
    SUPPORTED_FORMATS: ['image/jpeg', 'image/png'],
    POLL_INTERVAL: 3000,
    MAX_POLL_ATTEMPTS: 40
  };

  // Widget State
  const state = {
    isOpen: false,
    currentFile: null,
    sessionId: null,
    garmentUrl: null,
    predictionId: null,
    triesRemaining: 3,
    pollingInterval: null
  };

  let shadowHost = null;
  let shadowRoot = null;

  /**
   * Initialize the widget
   */
  function init() {
    const productImage = detectProductImage();
    if (!productImage) {
      console.warn('[Wishlize] Could not detect product image');
      return;
    }
    state.garmentUrl = productImage;

    createShadowHost();
    injectTriggerButton();
  }

  /**
   * Auto-detect product image from the page
   */
  function detectProductImage() {
    const selectors = [
      '[data-wishlize-garment]',
      '.product-image img',
      '.product-main-image img',
      'main img[src*="product"]',
      '#main-product-image',
      'main img'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        let src;
        if (element.tagName === 'META') {
          src = element.getAttribute('content');
        } else if (element.tagName === 'IMG') {
          // Get absolute URL
          src = new URL(element.src, window.location.href).href;
        }
        // Force HTTPS
        if (src) {
          return src.replace(/^http:/, 'https:');
        }
      }
    }
    return null;
  }

  function createShadowHost() {
    shadowHost = document.createElement('div');
    shadowHost.id = 'wishlize-widget-host';
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  }

  function injectTriggerButton() {
    let container = document.getElementById('wishlize-widget-container');
    
    if (!container) {
      const productInfo = document.querySelector('.product-info, .product-details');
      if (productInfo) {
        container = document.createElement('div');
        container.id = 'wishlize-widget-container';
        productInfo.appendChild(container);
      }
    }

    if (!container) return;

    const button = document.createElement('button');
    button.className = 'wishlize-trigger-btn';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      <span>Try It On</span>
    `;
    button.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      margin: 20px 0;
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

    container.innerHTML = '';
    container.appendChild(button);
  }

  function openModal() {
    if (state.isOpen) return;
    state.isOpen = true;
    state.currentFile = null;
    state.sessionId = null;
    state.predictionId = null;
    if (state.pollingInterval) clearInterval(state.pollingInterval);

    shadowRoot.innerHTML = getModalHTML() + getModalCSS();
    setupModalEvents();

    const modal = shadowRoot.getElementById('wishlize-modal');
    if (modal) {
      modal.style.display = 'block';
      setTimeout(() => modal.style.opacity = '1', 10);
    }
  }

  function closeModal() {
    state.isOpen = false;
    if (state.pollingInterval) clearInterval(state.pollingInterval);

    const modal = shadowRoot.getElementById('wishlize-modal');
    if (modal) {
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.style.display = 'none';
        shadowRoot.innerHTML = '';
      }, 300);
    }
  }

  function getModalHTML() {
    return `
      <div id="wishlize-modal" class="wishlize-modal">
        <div class="wishlize-modal-overlay">
          <div class="wishlize-modal-content">
            <div class="wishlize-modal-header">
              <h2>Virtual Try-On</h2>
              <button class="wishlize-close-btn" id="wishlize-close">&times;</button>
            </div>

            <div class="wishlize-modal-body">
              
              <!-- Step 1: Upload Photo -->
              <div id="wishlize-step-upload" class="wishlize-step">
                <div class="wishlize-upload-area" id="wishlize-dropzone">
                  <input type="file" id="wishlize-file-input" accept="image/jpeg,image/png" hidden>
                  <div class="upload-content">
                    <span class="upload-icon">📸</span>
                    <p class="upload-text">Upload your photo</p>
                    <p class="upload-subtext">Drag & drop or click to browse</p>
                    <p class="upload-hint">JPG or PNG, max 10MB</p>
                  </div>
                </div>
                
                <div class="wishlize-photo-tips">
                  <h4>💡 Tips for best results:</h4>
                  <ul>
                    <li>Stand straight facing the camera</li>
                    <li>Use good lighting</li>
                    <li>Full body or half body photo</li>
                    <li>Plain background works best</li>
                  </ul>
                </div>
              </div>

              <!-- Preview Step -->
              <div id="wishlize-step-preview" class="wishlize-step" style="display: none;">
                <div class="wishlize-preview-container">
                  <img id="wishlize-preview-img" alt="Your photo">
                </div>
                <div class="preview-actions">
                  <button class="wishlize-btn wishlize-btn-secondary" id="wishlize-change-photo">Change Photo</button>
                  <button class="wishlize-btn wishlize-btn-primary" id="wishlize-visualize">Visualize</button>
                </div>
              </div>

              <!-- Processing Step -->
              <div id="wishlize-step-processing" class="wishlize-step" style="display: none;">
                <div class="wishlize-processing-animation">
                  <div class="spinner"></div>
                  <div class="processing-text">
                    <h3>Creating your try-on...</h3>
                    <p id="wishlize-status-text">Uploading...</p>
                  </div>
                </div>
                <div class="wishlize-progress-bar">
                  <div class="wishlize-progress-fill" id="wishlize-progress"></div>
                </div>
                <p class="processing-note">This takes about 30-60 seconds</p>
              </div>

              <!-- Result Step -->
              <div id="wishlize-step-result" class="wishlize-step" style="display: none;">
                <div class="wishlize-result-comparison">
                  <div class="comparison-item">
                    <label>You</label>
                    <img id="wishlize-result-original" alt="Original">
                  </div>
                  <div class="comparison-arrow">→</div>
                  <div class="comparison-item">
                    <label>Try-On</label>
                    <img id="wishlize-result-final" alt="Result">
                  </div>
                </div>
                
                <div class="wishlize-result-actions">
                  <button class="wishlize-btn wishlize-btn-secondary" id="wishlize-try-another">Try Another Photo</button>
                  <a class="wishlize-btn wishlize-btn-primary" id="wishlize-download" download>Download</a>
                </div>
              </div>

              <!-- Error Step -->
              <div id="wishlize-step-error" class="wishlize-step" style="display: none;">
                <div class="wishlize-error-message">
                  <span class="error-icon">⚠️</span>
                  <h3 id="wishlize-error-title">Oops!</h3>
                  <p id="wishlize-error-text">Something went wrong</p>
                </div>
                <button class="wishlize-btn wishlize-btn-primary" id="wishlize-retry">Try Again</button>
              </div>

            </div>
          </div>
        </div>
      </div>
    `;
  }

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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
        }

        .wishlize-modal-body {
          padding: 24px;
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

        .wishlize-upload-area:hover, .wishlize-upload-area.dragover {
          border-color: #667eea;
          background: #eef2ff;
        }

        .upload-icon { font-size: 48px; display: block; margin-bottom: 12px; }
        .upload-text { font-size: 18px; font-weight: 600; color: #374151; margin: 0 0 4px; }
        .upload-subtext { font-size: 14px; color: #6b7280; margin: 0 0 8px; }
        .upload-hint { font-size: 12px; color: #9ca3af; margin: 0; }

        .wishlize-photo-tips {
          margin-top: 24px;
          padding: 16px;
          background: #f3f4f6;
          border-radius: 8px;
        }

        .wishlize-photo-tips h4 { margin: 0 0 12px; font-size: 14px; color: #374151; }
        .wishlize-photo-tips ul { margin: 0; padding-left: 20px; font-size: 13px; color: #6b7280; }
        .wishlize-photo-tips li { margin-bottom: 4px; }

        .wishlize-preview-container {
          border-radius: 12px;
          overflow: hidden;
          background: #f3f4f6;
          margin-bottom: 16px;
        }

        .wishlize-preview-container img {
          width: 100%;
          max-height: 350px;
          object-fit: contain;
          display: block;
        }

        .preview-actions {
          display: flex;
          gap: 12px;
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

        @keyframes spin { to { transform: rotate(360deg); } }

        .processing-text h3 { margin: 0 0 8px; font-size: 18px; color: #374151; }
        .processing-text p { margin: 0; color: #6b7280; font-size: 14px; }

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

        .processing-note { text-align: center; font-size: 12px; color: #9ca3af; }

        .wishlize-result-comparison {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .comparison-item { flex: 1; text-align: center; }
        .comparison-item label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; }
        .comparison-item img { width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; background: #f3f4f6; }
        .comparison-arrow { font-size: 24px; color: #9ca3af; }

        .wishlize-result-actions { display: flex; gap: 12px; }

        .wishlize-error-message { text-align: center; padding: 40px 20px; }
        .error-icon { font-size: 48px; display: block; margin-bottom: 16px; }
        .wishlize-error-message h3 { margin: 0 0 8px; color: #dc2626; font-size: 18px; }
        .wishlize-error-message p { margin: 0; color: #6b7280; font-size: 14px; }

        .wishlize-btn {
          flex: 1;
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

        .wishlize-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .wishlize-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }

        .wishlize-btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        @media (max-width: 640px) {
          .wishlize-result-comparison { flex-direction: column; }
          .comparison-arrow { transform: rotate(90deg); }
          .preview-actions, .wishlize-result-actions { flex-direction: column; }
        }
      </style>
    `;
  }

  function setupModalEvents() {
    shadowRoot.getElementById('wishlize-close')?.addEventListener('click', closeModal);
    
    const fileInput = shadowRoot.getElementById('wishlize-file-input');
    const dropzone = shadowRoot.getElementById('wishlize-dropzone');

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });

    shadowRoot.getElementById('wishlize-change-photo')?.addEventListener('click', () => showStep('upload'));
    shadowRoot.getElementById('wishlize-visualize')?.addEventListener('click', startProcessing);
    shadowRoot.getElementById('wishlize-try-another')?.addEventListener('click', () => { showStep('upload'); state.currentFile = null; });
    shadowRoot.getElementById('wishlize-retry')?.addEventListener('click', () => showStep('upload'));
    shadowRoot.querySelector('.wishlize-modal-overlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  }

  function showStep(step) {
    const steps = ['upload', 'preview', 'processing', 'result', 'error'];
    steps.forEach(s => {
      const el = shadowRoot.getElementById(`wishlize-step-${s}`);
      if (el) el.style.display = s === step ? 'block' : 'none';
    });
  }

  function handleFileSelect(file) {
    if (!CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
      showError('Invalid file', 'Please upload JPG or PNG');
      return;
    }
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showError('File too large', 'Max 10MB');
      return;
    }

    state.currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      shadowRoot.getElementById('wishlize-preview-img').src = e.target.result;
      showStep('preview');
    };
    reader.readAsDataURL(file);
  }

  async function startProcessing() {
    showStep('processing');
    updateProgress(10, 'Getting upload URL...');

    try {
      // 1. Get upload URL
      const uploadData = await apiCall('/get-upload-url', {
        fileType: state.currentFile.type
      });

      if (uploadData.quotaExceeded) {
        throw new Error('Daily limit reached. Try again tomorrow.');
      }

      state.sessionId = uploadData.sessionId;
      state.triesRemaining = uploadData.triesRemaining;

      // 2. Upload to S3
      updateProgress(30, 'Uploading photo...');
      await uploadToS3(uploadData, state.currentFile);

      // 3. Validate
      updateProgress(50, 'Validating photo...');
      const validation = await apiCall('/validate-photo', {
        sessionId: state.sessionId,
        imageUrl: uploadData.publicUrl
      });

      if (!validation.valid) {
        throw new Error(validation.message || 'Photo validation failed');
      }

      // 4. Process
      updateProgress(70, 'Generating try-on...');
      const process = await apiCall('/process-tryon', {
        sessionId: state.sessionId,
        garmentUrl: state.garmentUrl
      });

      state.predictionId = process.predictionId;
      state.triesRemaining = process.triesRemaining;

      // 5. Poll for result
      await pollForResult();

    } catch (error) {
      showError('Error', error.message);
    }
  }

  async function uploadToS3(uploadData, file) {
    const formData = new FormData();
    Object.entries(uploadData.fields).forEach(([key, value]) => formData.append(key, value));
    formData.append('file', file);

    const response = await fetch(uploadData.uploadUrl, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Upload failed');
  }

  async function pollForResult() {
    let attempts = 0;
    return new Promise((resolve, reject) => {
      state.pollingInterval = setInterval(async () => {
        attempts++;
        try {
          const status = await apiCall('/status', { sessionId: state.sessionId }, 'GET');

          if (status.status === 'completed') {
            clearInterval(state.pollingInterval);
            showResult(status.resultUrl);
            resolve(status);
          } else if (status.status === 'failed') {
            clearInterval(state.pollingInterval);
            reject(new Error(status.errorMessage || 'Failed'));
          }

          updateProgress(Math.min(70 + attempts, 95), 'Generating...');

          if (attempts >= CONFIG.MAX_POLL_ATTEMPTS) {
            clearInterval(state.pollingInterval);
            reject(new Error('Timeout'));
          }
        } catch (error) {
          clearInterval(state.pollingInterval);
          reject(error);
        }
      }, CONFIG.POLL_INTERVAL);
    });
  }

  function showResult(resultUrl) {
    updateProgress(100, 'Done!');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      shadowRoot.getElementById('wishlize-result-original').src = e.target.result;
    };
    reader.readAsDataURL(state.currentFile);

    shadowRoot.getElementById('wishlize-result-final').src = resultUrl;
    shadowRoot.getElementById('wishlize-download').href = resultUrl;

    setTimeout(() => showStep('result'), 500);
  }

  function updateProgress(percent, text) {
    const progressEl = shadowRoot.getElementById('wishlize-progress');
    const statusText = shadowRoot.getElementById('wishlize-status-text');
    if (progressEl) progressEl.style.width = `${percent}%`;
    if (statusText) statusText.textContent = text;
  }

  function showError(title, message) {
    shadowRoot.getElementById('wishlize-error-title').textContent = title;
    shadowRoot.getElementById('wishlize-error-text').textContent = message;
    showStep('error');
  }

  async function apiCall(endpoint, data, method = 'POST') {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    
    if (method === 'GET' && data) {
      const params = new URLSearchParams(data).toString();
      return fetch(`${url}?${params}`, options).then(r => r.json()).then(r => { if (!r.success) throw new Error(r.error?.message); return r; });
    }
    
    if (data) options.body = JSON.stringify(data);
    
    const response = await fetch(url, options);
    const result = await response.json();
    if (!result.success) throw new Error(result.error?.message || 'Failed');
    return result;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.WishlizeWidget = { open: openModal, close: closeModal };
})();
