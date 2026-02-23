/**
 * Wishlize Intent Parser (Phase 3.1)
 *
 * Demo-first deterministic parser that extracts occasion/vibe intent
 * from free-form text and returns normalized tokens + confidence.
 */
(function initWishlizeIntentParser(globalScope) {
  'use strict';

  const CONFIDENCE = {
    NONE: 'none',
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  };

  const LEXICON = {
    occasion: {
      business: ['office', 'work', 'corporate', 'meeting', 'interview'],
      casual: ['everyday', 'daily', 'laidback', 'weekend', 'chill'],
      date: ['date night', 'romance', 'dinner date'],
      evening: ['night', 'nightout', 'cocktail', 'sundown'],
      formal: ['gala', 'black tie', 'ceremony', 'formal dinner'],
      party: ['club', 'celebration', 'birthday', 'festive'],
      'smart-casual': ['smart casual', 'semi formal', 'semi-formal'],
      travel: ['airport', 'vacation', 'trip', 'journey'],
      wedding: ['wedding', 'reception', 'bride', 'groom']
    },
    vibe: {
      bold: ['statement', 'edgy', 'confident'],
      classic: ['timeless', 'traditional'],
      minimalist: ['minimal', 'clean', 'simple'],
      modern: ['sleek', 'contemporary', 'trendy'],
      refined: ['polished', 'elegant', 'sharp'],
      relaxed: ['cozy', 'soft', 'easy'],
      romantic: ['romantic', 'dreamy'],
      royal: ['luxury', 'opulent', 'regal'],
      street: ['streetwear', 'urban']
    },
    audience: {
      men: ['men', 'man', 'male', 'guy', 'boys', 'him'],
      woman: ['women', 'woman', 'female', 'girl', 'girls', 'her', 'lady', 'ladies']
    }
  };

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function containsPhrase(normalizedText, phrase) {
    if (!normalizedText || !phrase) {
      return false;
    }
    const normalizedPhrase = normalizeText(phrase);
    if (!normalizedPhrase) {
      return false;
    }

    const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase).replace(/\\ /g, '\\s+')}($|\\s)`);
    return pattern.test(normalizedText);
  }

  function uniqueList(values) {
    const seen = new Set();
    const output = [];

    (Array.isArray(values) ? values : []).forEach((value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    });

    return output;
  }

  function getAllowedSet(taxonomy, family) {
    const values = taxonomy && Array.isArray(taxonomy[family]) ? taxonomy[family] : [];
    return new Set(values.map((value) => String(value || '').trim().toLowerCase()));
  }

  function extractTagsByFamily(normalizedText, familyLexicon, allowedSet) {
    const extracted = [];

    Object.keys(familyLexicon || {}).forEach((canonicalTag) => {
      const normalizedCanonical = String(canonicalTag || '').trim().toLowerCase();
      if (!normalizedCanonical) {
        return;
      }

      const terms = [normalizedCanonical].concat(Array.isArray(familyLexicon[canonicalTag]) ? familyLexicon[canonicalTag] : []);
      const isMatch = terms.some((term) => containsPhrase(normalizedText, term));

      if (!isMatch) {
        return;
      }

      if (allowedSet && allowedSet.size > 0 && !allowedSet.has(normalizedCanonical)) {
        return;
      }

      extracted.push(normalizedCanonical);
    });

    return uniqueList(extracted);
  }

  function extractAudienceHint(normalizedText, contextAudience) {
    const normalizedContext = String(contextAudience || '').trim().toLowerCase();
    if (normalizedContext === 'men' || normalizedContext === 'woman') {
      return normalizedContext;
    }

    if (extractTagsByFamily(normalizedText, LEXICON.audience).includes('men')) {
      return 'men';
    }

    if (extractTagsByFamily(normalizedText, LEXICON.audience).includes('woman')) {
      return 'woman';
    }

    return null;
  }

  function deriveConfidence(totalMatches) {
    if (totalMatches <= 0) return CONFIDENCE.NONE;
    if (totalMatches === 1) return CONFIDENCE.LOW;
    if (totalMatches === 2) return CONFIDENCE.MEDIUM;
    return CONFIDENCE.HIGH;
  }

  function parse(text, options = {}) {
    const normalizedText = normalizeText(text);
    const tokens = uniqueList(normalizedText.split(' ').filter(Boolean));
    const taxonomy = globalScope.WishlizeProductTaxonomy || {};

    const occasion = extractTagsByFamily(
      normalizedText,
      LEXICON.occasion,
      getAllowedSet(taxonomy, 'occasion')
    );

    const vibe = extractTagsByFamily(
      normalizedText,
      LEXICON.vibe,
      getAllowedSet(taxonomy, 'vibe')
    );

    const totalMatches = occasion.length + vibe.length;

    return {
      occasion,
      vibe,
      keywords: tokens,
      confidence: deriveConfidence(totalMatches),
      audienceHint: extractAudienceHint(normalizedText, options.contextAudience),
      missingIntent: totalMatches === 0
    };
  }

  globalScope.WishlizeIntentParser = {
    parse,
    debugLexicon() {
      return JSON.parse(JSON.stringify(LEXICON));
    }
  };
})(window);
