/**
 * Product page renderer for demo-store/product/blazer.html.
 *
 * Reads `productId` from query params and renders product details from
 * `window.WishlizeProducts` so each card opens its own product context.
 */
(function initWishlizeProductPage(globalScope) {
  'use strict';

  function getCatalog() {
    return Array.isArray(globalScope.WishlizeProducts) ? globalScope.WishlizeProducts : [];
  }

  function toProductPageAssetPath(imagePath) {
    if (typeof imagePath !== 'string' || imagePath.length === 0) {
      return '../assets/images/blazer.jpg';
    }

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }

    if (imagePath.startsWith('../')) {
      return imagePath;
    }

    if (imagePath.startsWith('assets/')) {
      return `../${imagePath}`;
    }

    return imagePath;
  }

  function formatPrice(value) {
    const price = Number(value);
    if (Number.isNaN(price)) {
      return '$0.00';
    }
    return `$${price.toFixed(2)}`;
  }

  function buildDescription(product) {
    const tags = product.tags || {};
    const occasion = Array.isArray(tags.occasion) ? tags.occasion.join(', ') : 'curated occasions';
    const vibe = Array.isArray(tags.vibe) ? tags.vibe.join(', ') : 'a refined look';
    const material = Array.isArray(tags.material) ? tags.material.join(', ') : 'premium fabric';
    const audience = product.audience ? ` for ${product.audience}` : '';

    return `A curated ${product.name.toLowerCase()}${audience} designed for ${occasion}. `
      + `Built with a ${vibe} aesthetic and tailored around ${material}.`;
  }

  function renderSpecs(product) {
    const specsList = document.getElementById('product-specs');
    if (!specsList) return;

    const materialTags = (product.tags && Array.isArray(product.tags.material))
      ? product.tags.material
      : [];
    const occasionTags = (product.tags && Array.isArray(product.tags.occasion))
      ? product.tags.occasion
      : [];
    const vibeTags = (product.tags && Array.isArray(product.tags.vibe))
      ? product.tags.vibe
      : [];

    const specs = [
      `Primary Material: ${materialTags.join(', ') || 'not specified'}`,
      `Best For: ${occasionTags.join(', ') || 'not specified'}`,
      `Style Vibe: ${vibeTags.join(', ') || 'not specified'}`,
      `Availability: ${product.inStock ? 'In Stock' : 'Out of Stock'}`
    ];

    specsList.innerHTML = specs
      .map((spec) => `<li>• ${spec}</li>`)
      .join('');
  }

  function resolveProductFromQuery(products) {
    const params = new URLSearchParams(globalScope.location.search);
    const requestedId = params.get('productId');

    if (requestedId) {
      const matched = products.find((product) => product.id === requestedId);
      if (matched) return matched;
    }

    return products[0] || null;
  }

  function renderProductPage() {
    const products = getCatalog();
    if (products.length === 0) {
      console.warn('[WishlizeProductPage] Catalog missing; keeping static fallback content');
      return;
    }

    const product = resolveProductFromQuery(products);
    if (!product) {
      console.warn('[WishlizeProductPage] Could not resolve product from query');
      return;
    }

    const imageElement = document.getElementById('main-product-image');
    const titleElement = document.getElementById('product-title');
    const priceElement = document.getElementById('product-price');
    const descriptionElement = document.getElementById('product-description');

    const displayImage = toProductPageAssetPath((product.images || [])[0]);
    const garmentUrl = (typeof product.garmentUrl === 'string' && product.garmentUrl.length > 0)
      ? product.garmentUrl
      : new URL(displayImage, globalScope.location.href).href;

    if (imageElement) {
      imageElement.src = displayImage;
      imageElement.alt = product.name;
      imageElement.setAttribute('data-wishlize-garment', garmentUrl);
      imageElement.setAttribute('data-product-id', product.id);
    }

    if (titleElement) titleElement.textContent = product.name;
    if (priceElement) priceElement.textContent = formatPrice(product.price);
    if (descriptionElement) descriptionElement.textContent = buildDescription(product);

    globalScope.document.title = `${product.name} | Wishlize`;
    renderSpecs(product);
  }

  renderProductPage();
})(window);
