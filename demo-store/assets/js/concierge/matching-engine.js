/**
 * Wishlize Matching Engine (Phase 3 Orchestrator)
 *
 * Connects parser + scorer + personas and exposes a single recommend API.
 */
(function initWishlizeMatchingEngine(globalScope) {
  'use strict';

  const MAX_RECOMMENDATIONS = 2;
  let enhancer = null;

  function normalizeAudience(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'men' || normalized === 'woman') {
      return normalized;
    }
    return null;
  }

  function buildError(code, message, details) {
    return {
      success: false,
      error: {
        code,
        message,
        details: details || null
      }
    };
  }

  function getDependencies() {
    return {
      parser: globalScope.WishlizeIntentParser,
      scorer: globalScope.WishlizeScoring,
      personas: globalScope.WishlizePersonas
    };
  }

  function validateDependencies(deps) {
    if (!deps.parser || typeof deps.parser.parse !== 'function') {
      return 'WishlizeIntentParser.parse missing';
    }

    if (!deps.scorer || typeof deps.scorer.rankProducts !== 'function') {
      return 'WishlizeScoring.rankProducts missing';
    }

    if (!deps.personas || typeof deps.personas.compose !== 'function') {
      return 'WishlizePersonas.compose missing';
    }

    return null;
  }

  async function applyEnhancer(basePayload, enhancerInput) {
    if (typeof enhancer !== 'function') {
      return basePayload;
    }

    try {
      const maybeEnhanced = enhancer(enhancerInput);
      const resolved = maybeEnhanced && typeof maybeEnhanced.then === 'function'
        ? await maybeEnhanced
        : maybeEnhanced;

      if (!resolved || typeof resolved !== 'object') {
        return basePayload;
      }

      const merged = Object.assign({}, basePayload);

      if (Array.isArray(resolved.top3)) {
        merged.top3 = resolved.top3;
      }

      if (resolved.personaOverride && typeof resolved.personaOverride === 'object') {
        merged.persona = resolved.personaOverride;
      }

      if (typeof resolved.confidenceOverride === 'string' && merged.intent) {
        merged.intent = Object.assign({}, merged.intent, {
          confidence: resolved.confidenceOverride
        });
      }

      merged.debug = Object.assign({}, merged.debug, {
        enhancerApplied: true
      });

      return merged;
    } catch (error) {
      return Object.assign({}, basePayload, {
        debug: Object.assign({}, basePayload.debug, {
          enhancerError: error && error.message ? error.message : 'enhancer failed'
        })
      });
    }
  }

  async function recommend(input = {}) {
    const deps = getDependencies();
    const dependencyError = validateDependencies(deps);
    if (dependencyError) {
      return buildError(
        'ENGINE_DEPENDENCY_MISSING',
        'Concierge engine dependency is missing',
        { dependencyError }
      );
    }

    const text = String(input.text || '').trim();
    const context = input.context && typeof input.context === 'object' ? input.context : {};
    const products = Array.isArray(input.products)
      ? input.products
      : (Array.isArray(globalScope.WishlizeProducts) ? globalScope.WishlizeProducts : null);

    if (!Array.isArray(products)) {
      return buildError(
        'CATALOG_UNAVAILABLE',
        'Product catalog is unavailable for recommendation'
      );
    }

    if (!text) {
      const emptyIntent = deps.parser.parse('', { contextAudience: normalizeAudience(context.audience) });
      return {
        success: true,
        intent: emptyIntent,
        top3: [],
        needsClarification: true,
        persona: deps.personas.compose({ mode: 'clarify', intent: emptyIntent, top3: [] }),
        debug: {
          reason: 'empty-input',
          rankedCount: 0,
          enhancerApplied: false
        }
      };
    }

    let intent;
    try {
      intent = deps.parser.parse(text, { contextAudience: normalizeAudience(context.audience) });
    } catch (error) {
      return buildError(
        'INVALID_INPUT',
        'Failed to parse recommendation intent',
        { message: error && error.message ? error.message : 'parse failed' }
      );
    }

    if (intent.missingIntent) {
      const clarifyPayload = {
        success: true,
        intent,
        top3: [],
        needsClarification: true,
        persona: deps.personas.compose({ mode: 'clarify', intent, top3: [] }),
        debug: {
          reason: 'missing-intent',
          rankedCount: 0,
          enhancerApplied: false
        }
      };

      return applyEnhancer(clarifyPayload, {
        text,
        context,
        intent,
        ranked: []
      });
    }

    const requestedMax = Number.isFinite(context.maxResults)
      ? Math.floor(context.maxResults)
      : MAX_RECOMMENDATIONS;
    const boundedMax = Math.max(1, Math.min(MAX_RECOMMENDATIONS, requestedMax));

    const scoringResult = deps.scorer.rankProducts({
      products,
      intent,
      context: {
        audience: normalizeAudience(context.audience || intent.audienceHint),
        maxResults: boundedMax
      }
    });

    const top3 = Array.isArray(scoringResult.top3)
      ? scoringResult.top3.slice(0, boundedMax)
      : [];
    const hasOutOfStockMatches = Array.isArray(scoringResult.debug && scoringResult.debug.outOfStockMatched)
      && scoringResult.debug.outOfStockMatched.length > 0;

    const personaMode = top3.length > 0
      ? 'curated'
      : (hasOutOfStockMatches ? 'no-stock' : 'clarify');

    const basePayload = {
      success: true,
      intent,
      top3,
      needsClarification: personaMode === 'clarify',
      persona: deps.personas.compose({ mode: personaMode, intent, top3 }),
      debug: {
        reason: top3.length > 0 ? 'ranked' : personaMode,
        rankedCount: Array.isArray(scoringResult.ranked) ? scoringResult.ranked.length : 0,
        rankedIds: Array.isArray(scoringResult.ranked)
          ? scoringResult.ranked.map((entry) => entry.productId)
          : [],
        scoring: scoringResult.debug || {},
        enhancerApplied: false
      }
    };

    return applyEnhancer(basePayload, {
      text,
      context,
      intent,
      ranked: scoringResult.ranked || []
    });
  }

  function setEnhancer(fn) {
    enhancer = typeof fn === 'function' ? fn : null;
  }

  function clearEnhancer() {
    enhancer = null;
  }

  globalScope.WishlizeMatchingEngine = {
    recommend,
    setEnhancer,
    clearEnhancer
  };
})(window);
