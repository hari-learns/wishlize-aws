/**
 * Wishlize Shadow Crawler
 *
 * Demo-first utility to:
 * 1) Hydrate data-wishlize-tags from products.js metadata
 * 2) Crawl data-wishlize-tags back from DOM
 * 3) Validate extracted tags against catalog and taxonomy
 */
(function initWishlizeShadowCrawler(globalScope) {
  'use strict';

  const TAG_FAMILIES = ['occasion', 'vibe', 'material'];

  function normalizeTag(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeTagList(values) {
    const unique = new Set();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const normalized = normalizeTag(value);
      if (normalized) unique.add(normalized);
    });
    return Array.from(unique);
  }

  function normalizeTagsShape(tags) {
    const normalized = {};
    TAG_FAMILIES.forEach((family) => {
      normalized[family] = normalizeTagList(tags && tags[family]);
    });
    return normalized;
  }

  function serializeTags(tags) {
    const normalized = normalizeTagsShape(tags);
    return TAG_FAMILIES
      .map((family) => `${family}:${normalized[family].join(',')}`)
      .join(';');
  }

  function parseTags(raw) {
    const parsed = {
      occasion: [],
      vibe: [],
      material: []
    };
    const errors = [];

    if (typeof raw !== 'string' || raw.trim() === '') {
      return { tags: parsed, errors: ['missing data-wishlize-tags'] };
    }

    const segments = raw
      .split(';')
      .map((segment) => segment.trim())
      .filter(Boolean);

    segments.forEach((segment) => {
      const separatorIndex = segment.indexOf(':');
      if (separatorIndex <= 0) {
        errors.push(`invalid segment "${segment}"`);
        return;
      }

      const family = normalizeTag(segment.slice(0, separatorIndex));
      const valuesRaw = segment.slice(separatorIndex + 1);

      if (!TAG_FAMILIES.includes(family)) {
        errors.push(`unknown family "${family}"`);
        return;
      }

      parsed[family] = normalizeTagList(valuesRaw.split(','));
    });

    TAG_FAMILIES.forEach((family) => {
      if (parsed[family].length === 0) {
        errors.push(`missing tags for ${family}`);
      }
    });

    return {
      tags: parsed,
      errors
    };
  }

  function buildCatalogMap(products) {
    const map = new Map();
    (Array.isArray(products) ? products : []).forEach((product) => {
      if (product && product.id) {
        map.set(String(product.id), product);
      }
    });
    return map;
  }

  function hydrateProductCardTags(options = {}) {
    const root = options.root || document;
    const products = options.products || globalScope.WishlizeProducts || [];
    const productMap = buildCatalogMap(products);
    const cards = Array.from(root.querySelectorAll('.product-card[data-product-id]'));

    const report = {
      cardsFound: cards.length,
      hydratedCount: 0,
      missingProductIds: [],
      unknownCardIds: [],
      duplicateCardIds: [],
      errors: [],
      warnings: []
    };

    const seenCardIds = new Set();

    cards.forEach((card) => {
      const productId = normalizeTag(card.getAttribute('data-product-id'));

      if (!productId) {
        report.errors.push('product card missing data-product-id');
        return;
      }

      if (seenCardIds.has(productId)) {
        report.duplicateCardIds.push(productId);
      }
      seenCardIds.add(productId);

      const product = productMap.get(productId);
      if (!product) {
        report.unknownCardIds.push(productId);
        report.errors.push(`data-product-id "${productId}" not found in catalog`);
        return;
      }

      const serialized = serializeTags(product.tags);
      card.setAttribute('data-wishlize-tags', serialized);
      report.hydratedCount += 1;
    });

    productMap.forEach((_, productId) => {
      if (!seenCardIds.has(productId)) {
        report.missingProductIds.push(productId);
        report.warnings.push(`catalog product "${productId}" is not rendered on page`);
      }
    });

    return report;
  }

  function crawlProductTags(root = document) {
    const cards = Array.from(root.querySelectorAll('.product-card[data-product-id]'));

    return cards.map((card) => {
      const productId = normalizeTag(card.getAttribute('data-product-id'));
      const raw = card.getAttribute('data-wishlize-tags') || '';
      const parsed = parseTags(raw);

      return {
        productId,
        tags: parsed.tags,
        raw,
        parseErrors: parsed.errors,
        element: card
      };
    });
  }

  function areTagSetsEqual(left, right) {
    const leftSet = new Set(normalizeTagList(left));
    const rightSet = new Set(normalizeTagList(right));

    if (leftSet.size !== rightSet.size) {
      return false;
    }

    for (const value of leftSet) {
      if (!rightSet.has(value)) {
        return false;
      }
    }
    return true;
  }

  function validateCrawlerOutput(options = {}) {
    const crawled = Array.isArray(options.crawled) ? options.crawled : [];
    const products = options.products || globalScope.WishlizeProducts || [];
    const taxonomy = options.taxonomy || globalScope.WishlizeProductTaxonomy || {};
    const productMap = buildCatalogMap(products);

    const report = {
      checked: crawled.length,
      errors: [],
      warnings: []
    };

    const seenIds = new Set();

    crawled.forEach((entry, index) => {
      const context = entry.productId || `index-${index}`;

      if (!entry.productId) {
        report.errors.push(`${context}: missing productId on card`);
        return;
      }

      if (seenIds.has(entry.productId)) {
        report.errors.push(`${context}: duplicate crawled productId`);
      }
      seenIds.add(entry.productId);

      const product = productMap.get(entry.productId);
      if (!product) {
        report.errors.push(`${context}: productId not found in catalog`);
        return;
      }

      if (Array.isArray(entry.parseErrors) && entry.parseErrors.length > 0) {
        entry.parseErrors.forEach((message) => {
          report.errors.push(`${context}: ${message}`);
        });
      }

      TAG_FAMILIES.forEach((family) => {
        const expected = product.tags && product.tags[family];
        const actual = entry.tags && entry.tags[family];

        if (!areTagSetsEqual(actual, expected)) {
          report.errors.push(`${context}: tags mismatch for ${family}`);
        }

        const allowedValues = new Set(Array.isArray(taxonomy[family]) ? taxonomy[family] : []);
        normalizeTagList(actual).forEach((tag) => {
          if (!allowedValues.has(tag)) {
            report.errors.push(`${context}: unknown taxonomy tag "${tag}" in ${family}`);
          }
        });
      });
    });

    productMap.forEach((_, productId) => {
      if (!seenIds.has(productId)) {
        report.warnings.push(`catalog product "${productId}" not crawled from DOM`);
      }
    });

    return report;
  }

  globalScope.WishlizeShadowCrawler = {
    TAG_FAMILIES,
    serializeTags,
    parseTags,
    hydrateProductCardTags,
    crawlProductTags,
    validateCrawlerOutput,
    normalizeTagList
  };
})(window);
