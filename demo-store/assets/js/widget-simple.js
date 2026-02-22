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
    MAX_POLL_ATTEMPTS: 40,
    // Dev bypass token - set to null to disable
    DEV_BYPASS_TOKEN: 'wishlize-dev-2024-test-token'
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
        const garmentFromAttribute = element.getAttribute?.('data-wishlize-garment');
        if (garmentFromAttribute) {
          try {
            return new URL(garmentFromAttribute, window.location.href).href;
          } catch (error) {
            console.warn('[Wishlize] Invalid data-wishlize-garment URL, falling back to image src');
          }
        }

        if (element.tagName === 'META') {
          return element.getAttribute('content');
        }
        if (element.tagName === 'IMG') {
          const img = new Image();
          img.src = element.src;
          return img.src;
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      <span>Visualise on Me</span>
    `;
    button.style.cssText = `
      background: linear-gradient(135deg, #FF5F6D 0%, #FFC371 100%);
      color: white;
      border: none;
      padding: 1.25rem 2.5rem;
      border-radius: 50px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      box-shadow: 0 10px 20px rgba(255, 95, 109, 0.2);
      margin: 20px 0;
      font-family: 'Inter', sans-serif;
      letter-spacing: 0.5px;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-3px)';
      button.style.boxShadow = '0 15px 30px rgba(255, 95, 109, 0.3)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 10px 20px rgba(255, 95, 109, 0.2)';
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
              <button class="wishlize-close-btn" id="wishlize-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div class="wishlize-modal-body">
              
              <!-- Step 1: Upload Photo -->
              <div id="wishlize-step-upload" class="wishlize-step">
                <div class="wishlize-upload-area" id="wishlize-dropzone">
                  <input type="file" id="wishlize-file-input" accept="image/jpeg,image/png" hidden>
                  <div class="upload-content">
                    <div class="upload-icon-wrapper">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF5F6D" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                      </svg>
                    </div>
                    <p class="upload-text">Upload your photo</p>
                    <p class="upload-subtext">Drag & drop or click to browse</p>
                    <p class="upload-hint">JPG or PNG • Max 10MB</p>
                  </div>
                </div>
                
                <div class="wishlize-photo-tips">
                  <h4>Tips for best results</h4>
                  <ul>
                    <li>Stand straight facing the camera</li>
                    <li>Ensure good, natural lighting</li>
                    <li>Full body or half body photo</li>
                    <li>Plain background recommended</li>
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
                  <div class="spinner-wrapper">
                    <div class="spinner"></div>
                  </div>
                  <div class="processing-text">
                    <h3>Creating your try-on...</h3>
                    <p id="wishlize-status-text">Uploading photo</p>
                  </div>
                </div>
                <div class="wishlize-progress-bar">
                  <div class="wishlize-progress-fill" id="wishlize-progress"></div>
                </div>
                <p class="processing-note">This usually takes about 30-60 seconds</p>
              </div>

              <!-- Result Step -->
              <div id="wishlize-step-result" class="wishlize-step" style="display: none;">
                <div class="wishlize-result-comparison">
                  <div class="comparison-item">
                    <label>Original</label>
                    <div class="img-frame">
                      <img id="wishlize-result-original" alt="Original">
                    </div>
                  </div>
                  <div class="comparison-arrow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                  <div class="comparison-item">
                    <label>Wishlized</label>
                    <div class="img-frame primary-frame">
                      <img id="wishlize-result-final" alt="Result">
                    </div>
                  </div>
                </div>
                
                <div class="wishlize-result-actions">
                  <button class="wishlize-btn wishlize-btn-secondary" id="wishlize-try-another">Try Another Photo</button>
                  <a class="wishlize-btn wishlize-btn-primary" id="wishlize-download" download>Download Result</a>
                </div>
              </div>

              <!-- Error Step -->
              <div id="wishlize-step-error" class="wishlize-step" style="display: none;">
                <div class="wishlize-error-message">
                  <div class="error-icon-wrapper">⚠️</div>
                  <h3 id="wishlize-error-title">Unable to Process</h3>
                  <p id="wishlize-error-text">Something went wrong during the visualisation.</p>
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .wishlize-modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 999999;
          font-family: 'Inter', -apple-system, sans-serif;
          opacity: 0;
          transition: opacity 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
          color: #1a1a1a;
        }

        .wishlize-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .wishlize-modal-content {
          background: white;
          border-radius: 24px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .wishlize-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 32px 32px 24px;
        }

        .wishlize-modal-header h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .wishlize-close-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #999;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .wishlize-close-btn:hover {
          background: #f5f5f5;
          color: #1a1a1a;
        }

        .wishlize-modal-body {
          padding: 0 32px 32px;
        }

        .wishlize-upload-area {
          border: 2px dashed #eee;
          border-radius: 20px;
          padding: 60px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
          background: #fafafa;
        }

        .wishlize-upload-area:hover, .wishlize-upload-area.dragover {
          border-color: #FF5F6D;
          background: #fffafa;
          transform: scale(1.01);
        }

        .upload-icon-wrapper { margin-bottom: 20px; }
        .upload-text { font-size: 1.1rem; font-weight: 600; margin-bottom: 4px; }
        .upload-subtext { font-size: 0.9rem; color: #666; margin-bottom: 12px; }
        .upload-hint { font-size: 0.8rem; color: #999; }

        .wishlize-photo-tips {
          margin-top: 32px;
          padding: 24px;
          background: #fbfbfb;
          border-radius: 16px;
        }

        .wishlize-photo-tips h4 { margin: 0 0 16px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; color: #1a1a1a; }
        .wishlize-photo-tips ul { margin: 0; padding-left: 0; list-style: none; font-size: 0.9rem; color: #666; }
        .wishlize-photo-tips li { margin-bottom: 8px; position: relative; padding-left: 20px; }
        .wishlize-photo-tips li:before { content: "•"; position: absolute; left: 0; color: #FF5F6D; font-weight: bold; }

        .wishlize-preview-container {
          border-radius: 16px;
          overflow: hidden;
          background: #f0f0f0;
          margin-bottom: 24px;
          aspect-ratio: 3/4;
        }

        .wishlize-preview-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .preview-actions {
          display: flex;
          gap: 16px;
        }

        .wishlize-processing-animation {
          text-align: center;
          padding: 60px 20px;
        }

        .spinner-wrapper { margin-bottom: 32px; }
        .spinner {
          width: 48px;
          height: 48px;
          border: 3px solid #f0f0f0;
          border-top-color: #FF5F6D;
          border-radius: 50%;
          animation: spin 1s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
          margin: 0 auto;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .processing-text h3 { margin: 0 0 8px; font-size: 1.25rem; font-weight: 600; }
        .processing-text p { margin: 0; color: #666; font-size: 0.95rem; }

        .wishlize-progress-bar {
          height: 6px;
          background: #f0f0f0;
          border-radius: 10px;
          overflow: hidden;
          margin: 32px 0 16px;
        }

        .wishlize-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #FF5F6D 0%, #FFC371 100%);
          width: 0%;
          transition: width 0.5s ease;
        }

        .processing-note { text-align: center; font-size: 0.8rem; color: #999; }

        .wishlize-result-comparison {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 32px;
        }

        .comparison-item { flex: 1; text-align: center; }
        .comparison-item label { display: block; font-size: 0.75rem; font-weight: 700; color: #999; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
        .img-frame { border-radius: 16px; overflow: hidden; background: #f0f0f0; aspect-ratio: 3/4; }
        .primary-frame { box-shadow: 0 20px 40px rgba(255, 95, 109, 0.15); border: 2px solid #fff; }
        .img-frame img { width: 100%; height: 100%; object-fit: cover; }
        .comparison-arrow { flex-shrink: 0; }

        .wishlize-result-actions { display: flex; gap: 16px; }

        .wishlize-error-message { text-align: center; padding: 60px 20px; }
        .error-icon-wrapper { font-size: 40px; margin-bottom: 24px; }
        .wishlize-error-message h3 { margin: 0 0 12px; font-size: 1.25rem; font-weight: 700; }
        .wishlize-error-message p { margin: 0; color: #666; font-size: 0.95rem; line-height: 1.6; }

        .wishlize-btn {
          flex: 1;
          padding: 1rem 1.5rem;
          border-radius: 50px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
        }

        .wishlize-btn-primary {
          background: linear-gradient(135deg, #FF5F6D 0%, #FFC371 100%);
          color: white;
          box-shadow: 0 10px 20px rgba(255, 95, 109, 0.2);
        }

        .wishlize-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 15px 30px rgba(255, 95, 109, 0.3); }

        .wishlize-btn-secondary {
          background: white;
          color: #1a1a1a;
          border: 1px solid #e0e0e0;
        }
        
        .wishlize-btn-secondary:hover { border-color: #1a1a1a; }

        @media (max-width: 640px) {
          .wishlize-modal-content { border-radius: 0; max-height: 100vh; }
          .wishlize-result-comparison { flex-direction: column; }
          .comparison-arrow { transform: rotate(90deg); padding: 10px 0; }
          .preview-actions, .wishlize-result-actions { flex-direction: column; }
          .wishlize-modal-header, .wishlize-modal-body { padding: 24px; }
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
          const status = await apiCall(`/status/${state.sessionId}`, null, 'GET');

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
    const headers = {};
    
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    // Add dev bypass token only for rate-limited endpoints (POST calls)
    if (CONFIG.DEV_BYPASS_TOKEN && method !== 'GET') {
      headers['X-Dev-Bypass-Token'] = CONFIG.DEV_BYPASS_TOKEN;
    }
    
    const options = { method, headers };
    
    if (method === 'GET' && data) {
      const params = new URLSearchParams(data).toString();
      return fetch(`${url}?${params}`, options).then(r => r.json()).then(r => { if (!r.success) throw new Error(r.error?.message); return r; });
    }
    
    if (data) options.body = JSON.stringify(data);
    
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
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
