/**
 * Wishlize Stylist Personas (Phase 3.3)
 *
 * Generates deterministic concierge copy for curated, clarification,
 * and no-stock outcomes.
 */
(function initWishlizePersonas(globalScope) {
  'use strict';

  const TEMPLATES = {
    curated: [
      {
        id: 'curated-atelier-01',
        render: ({ occasionText, vibeText, countText }) =>
          `For ${occasionText}, I curated ${countText} with a ${vibeText} direction and clean match confidence.`
      },
      {
        id: 'curated-editorial-02',
        render: ({ occasionText, vibeText, countText }) =>
          `These ${countText} align with your ${occasionText} plan and keep the vibe ${vibeText} without overstyling.`
      },
      {
        id: 'curated-premium-03',
        render: ({ occasionText, vibeText, countText }) =>
          `I narrowed this to ${countText} for ${occasionText}, tuned toward a ${vibeText} finish.`
      },
      {
        id: 'curated-runway-04',
        render: ({ occasionText, vibeText, countText }) =>
          `Based on ${occasionText}, these ${countText} carry the ${vibeText} energy best in the current catalog.`
      },
      {
        id: 'curated-precision-05',
        render: ({ occasionText, vibeText, countText }) =>
          `Your best ${countText} are ready: optimized for ${occasionText} with a ${vibeText} visual language.`
      }
    ],
    clarify: [
      {
        id: 'clarify-signature-01',
        render: () => 'I can style this quickly, but I need one detail first so the recommendations stay accurate.'
      },
      {
        id: 'clarify-tailor-02',
        render: () => 'Let me tighten the fit: share the occasion and style mood, then I will return your best matching looks.'
      },
      {
        id: 'clarify-concierge-03',
        render: () => 'I need clearer intent before curating. Tell me where you are wearing it and the vibe you want.'
      }
    ],
    'no-stock': [
      {
        id: 'nostock-atelier-01',
        render: ({ occasionText }) =>
          `I found close matches for ${occasionText}, but the best ones are currently out of stock. Give me an alternate vibe and I will rebalance.`
      }
    ]
  };

  function normalizeMode(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'curated' || normalized === 'clarify' || normalized === 'no-stock') {
      return normalized;
    }
    return 'clarify';
  }

  function hashString(value) {
    const input = String(value || '');
    let hash = 5381;

    for (let index = 0; index < input.length; index += 1) {
      hash = ((hash << 5) + hash) + input.charCodeAt(index);
      hash = hash >>> 0;
    }

    return hash;
  }

  function pickTemplate(mode, seedValue) {
    const templates = TEMPLATES[mode] || TEMPLATES.clarify;
    const hash = hashString(seedValue);
    const index = templates.length === 0 ? 0 : hash % templates.length;
    return templates[index] || templates[0];
  }

  function summarizeTags(tags, fallbackValue) {
    const normalized = Array.isArray(tags)
      ? tags.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (normalized.length === 0) {
      return fallbackValue;
    }

    return normalized.join(', ');
  }

  function buildSeed(mode, intent, top3, externalSeed) {
    if (externalSeed) {
      return String(externalSeed);
    }

    const occasion = summarizeTags(intent && intent.occasion, 'none');
    const vibe = summarizeTags(intent && intent.vibe, 'none');
    const productIds = (Array.isArray(top3) ? top3 : [])
      .map((entry) => String(entry && entry.productId ? entry.productId : ''))
      .join('|');

    return [mode, occasion, vibe, productIds].join('::');
  }

  function formatCountText(count) {
    const safeCount = Number.isFinite(count) ? count : 0;
    if (safeCount <= 1) {
      return '1 look';
    }
    return `${safeCount} looks`;
  }

  function compose(input = {}) {
    const mode = normalizeMode(input.mode);
    const intent = input.intent && typeof input.intent === 'object' ? input.intent : {};
    const top3 = Array.isArray(input.top3) ? input.top3 : [];

    const template = pickTemplate(mode, buildSeed(mode, intent, top3, input.seed));

    const templateParams = {
      occasionText: summarizeTags(intent.occasion, 'your occasion'),
      vibeText: summarizeTags(intent.vibe, 'refined'),
      audienceText: intent.audienceHint === 'men' ? 'men' : (intent.audienceHint === 'woman' ? 'women' : 'our collection'),
      count: top3.length,
      countText: formatCountText(top3.length)
    };

    const output = {
      intro: template.render(templateParams),
      personaId: template.id
    };

    // Include audience in intro for better feedback
    if (intent.audienceHint && mode === 'curated') {
        output.intro = `For ${templateParams.audienceText}, ${output.intro}`;
    }

    if (mode === 'clarify') {
      const isAudienceKnown = !!intent.audienceHint;
      if (isAudienceKnown) {
        output.followUpQuestion = 'Could you specify the occasion or the type of vibe you are looking for?';
      } else {
        output.followUpQuestion = 'What is the occasion, preferred vibe, and audience (men or woman)?';
      }
    }

    if (mode === 'no-stock') {
      output.followUpQuestion = 'Want me to broaden to nearby vibes so I can return in-stock alternatives?';
    }

    return output;
  }

  globalScope.WishlizePersonas = {
    compose,
    availableModes() {
      return Object.keys(TEMPLATES);
    }
  };
})(window);
