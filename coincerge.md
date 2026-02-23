# Wishlize Concierge Roadmap (Phase 2 Deferred)

Date: February 23, 2026
Scope: Execute Phase 1, Phase 3, Phase 4, and Phase 5 only. Phase 2 UI shell work is intentionally postponed.

## 1) Execution Model (How We Move Fast Without Breaking)

For every bit, use the same loop:

1. Implement the smallest vertical slice.
2. Run only targeted tests for that slice.
3. Run a short manual smoke check in demo store.
4. Commit immediately with a scoped message.
5. Move to next bit.

Branching:
- Work on one feature branch: `feat/concierge-foundation-engine-experience-polish`.
- Keep each bit as one commit (or max two if a hotfix is needed).

Commit style:
- `feat(phase1): add product metadata schema with vibe tags + stock flag`
- `feat(phase3): add intent parser and scoring top-3 ranking`
- `feat(phase4): add thread-flow loader + scanline reveal`
- `feat(phase5): persist concierge session and graceful fallback states`

## 2) Phase 2 Status

Deferred intentionally:
- Bit 2.1 trigger
- Bit 2.2 frosted panel
- Bit 2.3 chat bubbles/typing
- Bit 2.4 recommendation card UI

Constraint while Phase 2 is deferred:
- Build data + engine + effects as reusable modules now.
- Wire temporary test harness in `demo-store/diagnostic.html` so behavior is testable before final UI lands.

## 3) Full File Map (Planned)

| File | Purpose | Phase/Bit |
|---|---|---|
| `demo-store/assets/js/concierge/products.js` | 20-item metadata, vibe tags, `inStock` flag | 1.1, 1.3 |
| `demo-store/assets/js/concierge/shadow-crawler.js` | DOM tag crawler for `data-wishlize-tags` | 1.2 |
| `demo-store/assets/js/concierge/intent-parser.js` | Extract occasion/vibe from text | 3.1 |
| `demo-store/assets/js/concierge/scoring.js` | Score products and select top 3 | 3.2 |
| `demo-store/assets/js/concierge/personas.js` | Stylist intro templates | 3.3 |
| `demo-store/assets/js/concierge/experience.js` | Visual pulse, thread-flow loader, reveal state hooks | 4.1, 4.2, 4.3 |
| `demo-store/assets/css/concierge-effects.css` | Heartbeat, loader, scanline/reveal styles | 4.1, 4.2, 4.3 |
| `demo-store/assets/js/concierge/result-comparison.js` | Original vs Wishlized output + download action | 4.4 |
| `demo-store/assets/js/concierge/session-memory.js` | localStorage persistence and restore | 5.3 |
| `demo-store/assets/js/concierge/error-fallback.js` | Graceful failure responses and fallback picks | 5.2 |
| `backend/handler-simple.js` | Enforce quota parity for concierge “Wishlize This” flow | 5.1 |
| `backend/lib/validators.js` | Add/extend validator for concierge-triggered requests | 5.1 |
| `backend/__tests__/integration/handler-simple-flow.integration.test.js` | Quota + state transition regression | 5.1 |
| `backend/__tests__/property/demo-store-widget-integration.property.test.js` | Concierge integration contracts | 1.x, 3.x, 5.x |
| `demo-store/diagnostic.html` | Temporary harness to test parser/scoring/effects before Phase 2 UI | all |

## 4) Milestone Plan By Bit (Implement -> Test -> Commit)

## Phase 1: Semantic Foundation (Data Layer)

### Bit 1.1 Product Metadata Schema
Implement:
- Create `products.js` with all 20 products.
- Required shape per item:
  - `id`, `name`, `price`, `imageUrl`
  - `tags.occasion[]`, `tags.vibe[]`, `tags.material[]`
  - `inStock` (boolean)

Test:
- Add a lightweight shape assertion script in `demo-store/diagnostic.html` console flow.
- Confirm all products have arrays for each tag family.

Commit:
- `feat(phase1): add product metadata schema for concierge matching`

### Bit 1.2 Shadow Crawler
Implement:
- Add `shadow-crawler.js` that scans `document.querySelectorAll('[data-wishlize-tags]')`.
- Parse comma-separated tags safely (trim/lowercase/de-duplicate).
- Return normalized object list `{ elementRef, tags[] }`.

Test:
- Add test fixture nodes in `demo-store/diagnostic.html`.
- Verify parser tolerates bad spacing, duplicates, and empty tags.

Commit:
- `feat(phase1): add shadow crawler for data-wishlize-tags extraction`

### Bit 1.3 Mock Inventory Sensor
Implement:
- Add `inStock` to all products in `products.js`.
- Export utility `filterInStock(products)`.

Test:
- Validate out-of-stock items never appear in top-3 candidates.

Commit:
- `feat(phase1): add inventory-aware filtering for concierge recommendations`

## Phase 3: Matching Engine (Intelligence)

### Bit 3.1 Intent Keyword Parser
Implement:
- Build dictionary-based parser in `intent-parser.js`.
- Input: raw user text.
- Output:
  - `occasion[]`
  - `vibe[]`
  - `keywords[]`
  - `confidence` (low/medium/high by match count)

Test:
- Table-driven tests (can live in simple JS test harness first) with phrases like:
  - “Need something for a wedding reception”
  - “minimal clean look for a formal dinner”
  - “party blazer under control lighting”

Commit:
- `feat(phase3): add rule-based occasion and vibe intent parser`

### Bit 3.2 Scoring Algorithm (Top 3)
Implement:
- `scoring.js` with weighted scoring:
  - occasion match = 3 points
  - vibe match = 2 points
  - material match = 1 point
  - `inStock=false` => excluded
- Stable tie-breaker: higher score -> lower price -> deterministic `id`.

Test:
- Deterministic ranking test cases.
- Edge cases: no matches, all out of stock, ties.

Commit:
- `feat(phase3): add weighted product scoring and deterministic top3 ranking`

### Bit 3.3 Curation Response (Stylist Personas)
Implement:
- Add `personas.js` with 5-10 safe templates.
- API:
  - `composeCurationIntro({ intent, topProducts, tone })`
- Keep templates short, premium, and reusable.

Test:
- Validate non-empty output for all tones.
- Ensure output gracefully handles empty recommendations.

Commit:
- `feat(phase3): add stylist persona templates for curated recommendation intros`

## Phase 4: Aether-weave Magic (Experience)

### Bit 4.1 Visualise Pulse
Implement:
- Add heartbeat animation class for “Wishlize This” button in `concierge-effects.css`.
- Trigger pulse only on actionable state (avoid constant distraction).

Test:
- Check animation starts/stops by toggling class in `diagnostic.html`.
- Mobile check for reduced jank.

Commit:
- `feat(phase4): add sunset-rose heartbeat pulse for primary concierge action`

### Bit 4.2 Thread-Flow Loader
Implement:
- Add CSS-based glowing threads loader (prefer CSS first; canvas optional later).
- Expose `showThreadFlowLoader()` / `hideThreadFlowLoader()` in `experience.js`.

Test:
- 30-second simulated processing run in diagnostic page.
- Validate CPU impact is acceptable on mobile viewport.

Commit:
- `feat(phase4): add thread-flow loading animation for try-on wait state`

### Bit 4.3 Scanline Reveal
Implement:
- Build reveal mask animation from top 0% to 100%.
- New image layer overlays old image; scanline drives mask progression.

Test:
- Simulate completion event and verify reveal runs once per result.
- Ensure fallback to instant swap if mask unsupported.

Commit:
- `feat(phase4): add scanline mask reveal transition for generated results`

### Bit 4.4 Result Comparison UI
Implement:
- Add side-by-side container module in `result-comparison.js`.
- Include `Download Style Card` button with predictable filename.

Test:
- Verify both images render and download action is wired.
- Check layout in desktop and mobile widths.

Commit:
- `feat(phase4): add original-vs-wishlized comparison with download action`

## Phase 5: Security & Optimization (Polish)

### Bit 5.1 Rate Limiting & Quotas Parity
Implement:
- Reuse existing backend session/quota flow in `handler-simple.js` for concierge-triggered actions.
- Ensure no bypass path for “Wishlize This”.
- Keep ordering invariant: submit to FASHN first, then consume try.

Test:
- Integration test: concierge calls consume same quota bucket as main widget.
- Regression for quota exceeded response shape.

Commit:
- `feat(phase5): enforce concierge quota parity with existing session limits`

### Bit 5.2 Graceful Failure UI
Implement:
- Add fallback decision helper in `error-fallback.js`:
  - no perfect match => suggest timeless classics
  - service failure => apology + safe alternatives
  - out-of-stock heavy set => substitute in-stock nearest matches

Test:
- Force each error state through harness.
- Ensure user-facing messages are polite and actionable.

Commit:
- `feat(phase5): add graceful concierge fallback messaging and safe alternatives`

### Bit 5.3 Session Memory
Implement:
- Persist recommendations + intent + timestamp in localStorage (`wishlizeConciergeState`).
- TTL strategy: 24 hours; auto-expire stale state.
- Restore state on reopen and re-render recommendations.

Test:
- Close/reopen simulation (reload page).
- Corrupted JSON recovery path.
- TTL expiration path.

Commit:
- `feat(phase5): add local storage session memory with ttl and safe restore`

## 5) Suggested Delivery Order (Exact)

1. 1.1 -> 1.2 -> 1.3
2. 3.1 -> 3.2 -> 3.3
3. 4.1 -> 4.2 -> 4.3 -> 4.4
4. 5.1 -> 5.2 -> 5.3

Reason:
- Phase 3 needs Phase 1 data.
- Phase 4 animations are easiest once recommendation/result data exists.
- Phase 5 should finalize behavior and resilience after core flow is stable.

## 6) Test Strategy (Fast + Trustworthy)

Per-bit checks (mandatory):
- `backend`: run only impacted tests with Jest pattern targeting touched suite.
- `demo-store`: manual harness check in `demo-store/diagnostic.html`.
- Keep one final nightly broader run for backend suite once per day.

Test gates before moving to next phase:
- Phase 1 gate: metadata + crawler + stock filter all deterministic.
- Phase 3 gate: parser + scoring produce consistent top-3 for fixed prompts.
- Phase 4 gate: all animations have fallback behavior.
- Phase 5 gate: quota parity and state restore validated.

## 7) Definition of Done (for This Track)

Done when all are true:
- Data layer exists and is queryable without DB.
- Matching engine returns top-3 deterministic in-stock results.
- Experience effects run and degrade safely.
- Concierge flow respects backend quotas.
- Recommendations survive close/reopen via local storage.
- Every bit has a focused commit and basic test evidence.

## 8) Risks and Controls

Risks:
- Existing backend test instability may hide regressions.
- UI deferred (Phase 2) can delay full end-to-end user validation.
- Heavy animations can impact low-end devices.

Controls:
- Keep logic in modular JS files now and connect to Phase 2 later.
- Use deterministic scoring and fallback rendering paths.
- Add reduced-motion safe classes and non-animated fallback states.

---

If you want, next step is I start Bit 1.1 immediately and ship it as the first isolated commit.

## Phase 3 Implementation Snapshot (Executed Plan)

Date: February 23, 2026
Scope: Bits 3.1, 3.2, 3.3 implemented as demo-first deterministic modules.

### Files Added
- `demo-store/assets/js/concierge/intent-parser.js`
- `demo-store/assets/js/concierge/scoring.js`
- `demo-store/assets/js/concierge/personas.js`
- `demo-store/assets/js/concierge/matching-engine.js`

### Files Updated
- `demo-store/diagnostic.html`

### Bit 3.1 Intent Parser
- Implemented dictionary-based extraction for `occasion` and `vibe` from free text.
- Added normalization and de-duplication for stable tag output.
- Added confidence levels (`none|low|medium|high`) and `missingIntent` flag.
- Added optional audience hint extraction (`men|woman`) from text/context.

### Bit 3.2 Scoring Algorithm
- Implemented weighted ranking:
  - occasion match = 3
  - vibe match = 2
  - audience soft boost = 1
- Enforced stock filtering: `inStock === false` items are excluded.
- Implemented deterministic tie-breaker: `score desc -> price asc -> id asc`.
- Added scoring debug payload for diagnostics.

### Bit 3.3 Stylist Personas
- Added deterministic persona template engine with modes:
  - `curated`
  - `clarify`
  - `no-stock`
- Added stable template selection via hash seed for repeatable demo output.
- Added follow-up questions for clarify and no-stock scenarios.

### Orchestration Layer
- Added `WishlizeMatchingEngine.recommend()` to connect parser + scorer + personas.
- Added failure-safe structured error returns (no uncaught throws to UI).
- Added extension hooks for future AI enhancement:
  - `setEnhancer(fn)`
  - `clearEnhancer()`

### Diagnostic Harness Coverage
- Added Phase 3 interactive controls (prompt + audience toggle + presets).
- Added result panels for intent, top3, persona, and debug output.
- Added automated assertion checks for:
  - parser extraction
  - deterministic ranking/persona
  - vague-input clarification flow
  - out-of-stock exclusion
  - engine output contract shape

### Commit Strategy for Phase 3 (Recommended)
1. `feat(phase3): add intent parser for occasion and vibe extraction`
2. `feat(phase3): add deterministic scoring with stock filter and audience boost`
3. `feat(phase3): add personas and matching engine orchestration`
4. `test(phase3): extend diagnostic harness with phase3 assertions`
