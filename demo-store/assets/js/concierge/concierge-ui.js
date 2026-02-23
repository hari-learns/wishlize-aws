/**
 * Wishlize Concierge UI Integration
 * Connects Frontend Chat UI to the Phase 3 Matching Engine
 */
class WishlizeConciergeUI {
    constructor() {
        this.isOpen = false;
        this.isTyping = false;
        this.audience = 'woman';

        this.trigger = null;
        this.panel = null;
        this.chatBody = null;
        this.input = null;

        this.init();
    }

    init() {
        this.renderBaseHTML();
        this.bindEvents();
        this.addStylistMessage('Hello. I am your Wishlize Stylist. What is the occasion you are dressing for today?');
    }

    renderBaseHTML() {
        const html = `
            <button class="concierge-trigger" id="concierge-trigger" type="button" aria-label="Open concierge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-13.4 8.38 8.38 0 0 1 3.8.9L21 3.5Z"/>
                </svg>
            </button>
            <div class="concierge-panel" id="concierge-panel">
                <div class="concierge-header">
                    <h3>The Concierge</h3>
                    <button class="close-concierge" id="close-concierge" type="button" aria-label="Close concierge">&times;</button>
                </div>
                <div class="audience-switcher">
                    <button class="audience-btn active" data-val="woman" type="button">Women</button>
                    <button class="audience-btn" data-val="men" type="button">Men</button>
                </div>
                <div class="concierge-chat-body" id="concierge-chat-body"></div>
                <div class="concierge-input-area">
                    <input type="text" id="concierge-input" placeholder="e.g. A formal gala dinner...">
                    <button class="send-btn" id="concierge-send" type="button" aria-label="Send">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M5 12h14m-7-7 7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        const mount = document.createElement('div');
        mount.id = 'wishlize-concierge-mount';
        mount.innerHTML = html;
        document.body.appendChild(mount);

        this.trigger = document.getElementById('concierge-trigger');
        this.panel = document.getElementById('concierge-panel');
        this.chatBody = document.getElementById('concierge-chat-body');
        this.input = document.getElementById('concierge-input');
    }

    bindEvents() {
        this.trigger.addEventListener('click', () => this.togglePanel());
        document.getElementById('close-concierge').addEventListener('click', () => this.togglePanel());

        document.getElementById('concierge-send').addEventListener('click', () => this.handleSend());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });

        document.querySelectorAll('.audience-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.audience-btn').forEach((item) => item.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.audience = e.currentTarget.dataset.val;
            });
        });

        this.chatBody.addEventListener('click', (e) => {
            const wishlizeBtn = e.target.closest('.wishlize-card-btn');
            const uploadBtn = e.target.closest('.upload-prompt-btn');

            if (wishlizeBtn) {
                e.preventDefault();
                this.triggerWishlizeFlow(wishlizeBtn.dataset.productId);
            }

            if (uploadBtn) {
                e.preventDefault();
                const garmentUrl = uploadBtn.dataset.garmentUrl || '';
                const productName = uploadBtn.dataset.productName || 'this look';
                this.openWidgetUpload(garmentUrl, productName);
            }
        });
    }

    togglePanel() {
        this.isOpen = !this.isOpen;
        this.panel.classList.toggle('open', this.isOpen);

        if (this.isOpen) {
            document.body.style.overflow = 'hidden';
            this.input.focus();
        } else {
            document.body.style.overflow = '';
        }
    }

    async handleSend() {
        const text = this.input.value.trim();
        if (!text || this.isTyping) return;

        this.addUserMessage(text);
        this.input.value = '';
        this.showTypingIndicator();

        try {
            const result = await window.WishlizeMatchingEngine.recommend({
                text,
                context: { audience: this.audience },
                products: window.WishlizeProducts
            });

            this.hideTypingIndicator();
            this.handleEngineResult(result);
        } catch (err) {
            console.error('Engine Error:', err);
            this.hideTypingIndicator();
            this.addStylistMessage("I'm sorry, I'm having trouble connecting to my style archives. Please try again.");
        }
    }

    handleEngineResult(result) {
        if (!result || !result.success || !result.persona) {
            this.addStylistMessage("I couldn't complete that recommendation. Please try again.");
            return;
        }

        this.addStylistMessage(result.persona.intro);

        if (result.needsClarification || !result.top3 || result.top3.length === 0) {
            if (result.persona.followUpQuestion) {
                this.addStylistMessage(result.persona.followUpQuestion);
            }
            return;
        }

        this.renderRecommendationCards(result.top3);

        if (result.persona.followUpQuestion) {
            setTimeout(() => this.addStylistMessage(result.persona.followUpQuestion), 800);
        }
    }

    triggerWishlizeFlow(productId) {
        const product = Array.isArray(window.WishlizeProducts)
            ? window.WishlizeProducts.find((p) => p.id === productId)
            : null;

        if (!product) {
            this.addStylistMessage('I could not load this look. Please try another recommendation.');
            return;
        }

        const garmentUrl = this.resolveGarmentUrl(product);
        this.addStylistMessage(`Excellent choice! To see how the ${product.name} looks on you, please upload your photo.`);

        const promptDiv = document.createElement('div');
        promptDiv.className = 'message stylist';
        promptDiv.innerHTML = `
            <div class="upload-prompt-container">
                <p style="margin:0; font-weight:600; font-size:0.9rem; color:#0C2C55; margin-bottom:12px;">Ready for Visualisation</p>
                <button class="upload-prompt-btn" type="button" data-garment-url="${garmentUrl}" data-product-name="${this.escapeAttribute(product.name)}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:middle;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <span style="vertical-align:middle;">Upload Image</span>
                </button>
            </div>
        `;
        this.chatBody.appendChild(promptDiv);
        this.scrollToBottom();
    }

    openWidgetUpload(garmentUrl, productName) {
        if (!window.WishlizeWidget || typeof window.WishlizeWidget.open !== 'function') {
            this.addStylistMessage('Try-on is still loading. Please refresh and try again.');
            return;
        }

        if (!garmentUrl) {
            this.addStylistMessage(`I couldn't resolve the garment for ${productName}. Please try another look.`);
            return;
        }

        // Close concierge panel before opening try-on modal for a clean experience.
        this.isOpen = false;
        this.panel.classList.remove('open');
        document.body.style.overflow = '';

        window.WishlizeWidget.open(garmentUrl);
    }

    normalizeBaseUrl(baseUrl) {
        return String(baseUrl || '').replace(/\/+$/, '');
    }

    resolveGarmentUrl(product) {
        if (!product || typeof product !== 'object') {
            return '';
        }

        if (typeof product.garmentUrl === 'string' && product.garmentUrl.trim()) {
            return product.garmentUrl.trim();
        }

        const image = Array.isArray(product.images) ? product.images[0] : '';
        if (typeof image !== 'string' || !image.trim()) {
            return '';
        }

        if (image.startsWith('http://') || image.startsWith('https://')) {
            return image;
        }

        const catalogPrefix = 'assets/images/catalog/';
        if (image.startsWith(catalogPrefix)) {
            const relative = image.slice(catalogPrefix.length);
            const base = this.normalizeBaseUrl(
                window.WISHLIZE_GARMENT_CDN_BASE ||
                'https://wishlize-cdn-mumbai.s3.ap-south-1.amazonaws.com/garments/catalog'
            );
            return `${base}/${relative}`;
        }

        try {
            return new URL(image, window.location.href).href;
        } catch (error) {
            return '';
        }
    }

    escapeAttribute(value) {
        return String(value || '').replace(/"/g, '&quot;');
    }

    addUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'message user';
        div.textContent = text;
        this.chatBody.appendChild(div);
        this.scrollToBottom();
    }

    addStylistMessage(text) {
        const div = document.createElement('div');
        div.className = 'message stylist';
        div.textContent = text;
        this.chatBody.appendChild(div);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        this.isTyping = true;
        const div = document.createElement('div');
        div.className = 'message stylist typing-indicator';
        div.id = 'typing-indicator';
        div.innerHTML = `
            <div class="typing-dots">
                <span></span><span></span><span></span>
            </div>
        `;
        this.chatBody.appendChild(div);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    renderRecommendationCards(top3) {
        const container = document.createElement('div');
        container.className = 'concierge-recommendations';

        top3.forEach((item) => {
            const p = item.product;
            const card = document.createElement('div');
            card.className = 'product-card-mini';
            card.innerHTML = `
                <img src="${p.images[0]}" class="card-img" alt="${p.name}">
                <div class="card-content">
                    <h4>${p.name}</h4>
                    <p class="price">${this.formatPrice(p.price)}</p>
                    <button class="wishlize-card-btn" data-product-id="${p.id}" type="button">Wishlize</button>
                </div>
            `;
            container.appendChild(card);
        });

        this.chatBody.appendChild(container);
        this.scrollToBottom();
    }

    formatPrice(price) {
        const value = Number(price);
        if (Number.isNaN(value)) {
            return '$0';
        }
        return `$${value}`;
    }

    scrollToBottom() {
        this.chatBody.scrollTop = this.chatBody.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.WishlizeConcierge = new WishlizeConciergeUI();
});
