/**
 * Wishlize Scoring Engine (Phase 3.2)
 *
 * Ranks products by intent match strength while enforcing inventory filters
 * and deterministic tie-breaking.
 */
(function initWishlizeScoring(globalScope) {
  'use strict';

  const DEFAULT_WEIGHTS = {
    occasionMatch: 3,
    vibeMatch: 2,
    audienceBoost: 1,
    maxResults: 2
  };

  function normalizeTagList(values) {
    const set = new Set();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized) {
        set.add(normalized);
      }
    });
    return Array.from(set);
  }

  function overlap(left, right) {
    const rightSet = new Set(normalizeTagList(right));
    return normalizeTagList(left).filter((value) => rightSet.has(value));
  }

  function normalizeAudience(value) {
    const audience = String(value || '').trim().toLowerCase();
    if (audience === 'men' || audience === 'woman') {
      return audience;
    }
    return null;
  }

  function rankProducts(params = {}) {
    const products = Array.isArray(params.products) ? params.products : [];
    const intent = params.intent && typeof params.intent === 'object' ? params.intent : {};
    const context = params.context && typeof params.context === 'object' ? params.context : {};

    const desiredAudience = normalizeAudience(context.audience || intent.audienceHint);
    const maxResults = Number.isFinite(context.maxResults) && context.maxResults > 0
      ? Math.floor(context.maxResults)
      : DEFAULT_WEIGHTS.maxResults;

    const result = {
      ranked: [],
      top3: [],
      debug: {
        excludedOutOfStock: [],
        excludedNoSemanticMatch: [],
        outOfStockMatched: [],
        zeroScore: [],
        tieBreakApplied: false,
        weights: Object.assign({}, DEFAULT_WEIGHTS)
      }
    };

    if (intent.missingIntent) {
      return result;
    }

    const scored = [];

    products.forEach((product) => {
      if (!product || typeof product !== 'object') {
        return;
      }

      const productId = String(product.id || '').trim();
      if (!productId) {
        return;
      }

      const productTags = product.tags || {};
      const matchedOccasion = overlap(intent.occasion, productTags.occasion);
      const matchedVibe = overlap(intent.vibe, productTags.vibe);

      const occasionPoints = matchedOccasion.length * DEFAULT_WEIGHTS.occasionMatch;
      const vibePoints = matchedVibe.length * DEFAULT_WEIGHTS.vibeMatch;
      const semanticPoints = occasionPoints + vibePoints;
      const audiencePoints = desiredAudience && normalizeAudience(product.audience) === desiredAudience
        ? DEFAULT_WEIGHTS.audienceBoost
        : 0;

      // Audience should refine relevant matches, never create a match by itself.
      if (semanticPoints <= 0) {
        result.debug.excludedNoSemanticMatch.push(productId);
        return;
      }

      const score = semanticPoints + audiencePoints;

      if (product.inStock === false) {
        result.debug.excludedOutOfStock.push(productId);
        result.debug.outOfStockMatched.push(productId);
        return;
      }

      if (score <= 0) {
        result.debug.zeroScore.push(productId);
        return;
      }

      scored.push({
        product,
        productId,
        score,
        breakdown: {
          occasionMatches: matchedOccasion,
          vibeMatches: matchedVibe,
          occasionPoints,
          vibePoints,
          audiencePoints,
          stockEligible: true
        }
      });
    });

    scored.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      result.debug.tieBreakApplied = true;

      const leftPrice = Number(left.product && left.product.price);
      const rightPrice = Number(right.product && right.product.price);

      if (!Number.isNaN(leftPrice) && !Number.isNaN(rightPrice) && leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }

      return String(left.productId).localeCompare(String(right.productId));
    });

    result.ranked = scored;
    result.top3 = scored.slice(0, maxResults);

    return result;
  }

  globalScope.WishlizeScoring = {
    rankProducts,
    getDefaultWeights() {
      return Object.assign({}, DEFAULT_WEIGHTS);
    }
  };
})(window);
