# Wishlize Concierge - Production-Later Reference

Date: February 23, 2026  
Purpose: Track what to upgrade from demo implementation to production-grade implementation for every bit.

## Usage Rule
- Every future plan must end with: `Prod-later update: append relevant items to coincerge_prod_later.md`.

## Phase 1 - Semantic Foundation (Data Layer)

### Bit 1.1 - Product Metadata Schema
- Move catalog from static JS global to managed source (`catalog` service or CMS-backed API).
- Add schema validation (JSON Schema + CI validation gate).
- Add localization fields (`title`, `description`, `currency`, `locale prices`).
- Add stable product IDs synced with commerce platform IDs (not display-name slugs).
- Add media metadata (`width`, `height`, `dominantColor`, `checksum`, `license`).

### Bit 1.2 - Shadow Crawler
- Replace simple DOM parsing with resilient parser + versioned extractor rules.
- Add fallback extractors per page template version.
- Add telemetry for extractor failures and low-confidence extractions.
- Add content integrity checks to prevent malformed tag ingestion.
- Add CI contract test to assert `data-product-id` and crawled tags stay in sync with catalog source.
- Move hydration/crawl diagnostics to automated browser smoke checks in deployment pipeline.

### Bit 1.3 - Mock Inventory Sensor
- Replace `inStock` mock flags with live inventory adapter from source of truth.
- Add stock freshness TTL and cache invalidation strategy.
- Add regional inventory awareness and backorder states.
- Add graceful stale-data behavior when upstream inventory APIs fail.
- Activate recommendation filter using `inStock` once live stock feed is connected.
- Add fallback policy for inventory API outages (stale cache + user-safe messaging).

## Phase 2 - Concierge UI (Deferred, Prod-Later Notes)

### Bit 2.1 - Stylist Trigger
- Add accessibility controls (keyboard nav, focus rings, ARIA labels).
- Add intersection/nav collision detection for all responsive breakpoints.
- Add feature flags for rollout and per-page opt-out.

### Bit 2.2 - Frosted Glass Panel
- Add browser compatibility fallback for no `backdrop-filter` support.
- Add adaptive performance mode for low-end devices.
- Add robust scroll locking and body interaction guardrails.

### Bit 2.3 - Chat Bubbles + Typing State
- Add message model with IDs, roles, timestamps, and replay support.
- Add deterministic state machine (idle/thinking/responded/error/retry).
- Add anti-flicker timing strategy for short/long inference times.

### Bit 2.4 - Recommendation Card UI
- Add skeleton loading state and lazy image loading.
- Add analytics events for impressions/click-through/wishlize clicks.
- Add accessibility semantics for horizontal carousel navigation.

## Phase 3 - Matching Engine (Intelligence)

### Bit 3.1 - Intent Keyword Parser
- Evolve rules to hybrid model: deterministic rules + lightweight ML/NLU fallback.
- Add language normalization (stemming, synonyms, typo tolerance).
- Add ambiguity handling (`party` vs `formal party`) with confidence thresholds.
- Add versioned parser profiles for experimentation.

### Bit 3.2 - Scoring Algorithm
- Move from fixed weights to configurable ranking profiles (A/B test ready).
- Add diversity penalty to avoid repetitive recommendations.
- Add business constraints (margin, availability, category balancing).
- Add explanation payload per recommendation for observability.

### Bit 3.3 - Curation Response (Stylist Personas)
- Externalize persona templates to managed content config.
- Add tone safety and policy filters for generated text.
- Add locale-aware copy variants and brand voice guardrails.
- Add deterministic fallback copy when generation pipeline fails.

## Phase 4 - Aether-weave Magic (Experience)

### Bit 4.1 - Visualise Pulse
- Add reduced-motion compliance and runtime animation disable switch.
- Add CSS perf profiling and battery-aware throttling strategy.
- Add design-token driven animation variables.

### Bit 4.2 - Thread-Flow Loader
- Add fallback loader for constrained devices and unsupported effects.
- Add lifecycle cleanup to prevent animation leaks on route/state changes.
- Add instrumentation for average wait and abandonment during loader state.

### Bit 4.3 - Scanline Reveal
- Add compatibility fallback when mask/compositing APIs are unsupported.
- Add strict image aspect-ratio normalization before reveal.
- Add one-shot guard to prevent double-triggered reveals.

### Bit 4.4 - Result Comparison UI
- Add responsive layout contracts with visual regression tests.
- Add downloadable asset pipeline (watermarking, naming, metadata).
- Add optional share actions with secure URL handling.

## Phase 5 - Security & Optimization (Polish)

### Bit 5.1 - Rate Limiting + Quotas
- Enforce per-user + per-IP + per-session layered limits.
- Add abuse detection signals and dynamic throttling policy.
- Add quota audit logs and admin diagnostics for support.
- Add idempotency key support for retry-safe request handling.

### Bit 5.2 - Error Handling
- Add standardized user-safe error taxonomy across frontend/backend.
- Add incident correlation IDs in all error surfaces.
- Add automated fallback route tests for all major failure classes.
- Add recovery UX for partial failures (retry from last known step).

### Bit 5.3 - Session Memory
- Encrypt or sign local persisted state to detect tampering.
- Add explicit user consent controls and privacy expiration settings.
- Add cross-tab synchronization and stale state reconciliation.
- Add migration handlers for persisted state schema version changes.

## Cross-Cutting Production Upgrades
- Observability: structured logs, metrics, traces, dashboard + alerting.
- Security: CSP, strict CORS policy, dependency scanning, secret rotation.
- QA: integration/e2e suite for concierge path and visual regression tests.
- Delivery: feature flags, canary rollout, rollback playbook.
