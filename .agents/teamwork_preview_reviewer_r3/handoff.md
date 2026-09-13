# Reviewer Round 3 Final Adversarial Handoff Report

> [!WARNING] **Skepticism Disclaimer**
> High confidence in the fraud detection pipeline, mathematical CV modeling, and UI badge stability across all test suites, though live Telegram MTProto bot collection remains mocked in test fixtures.

---

## 1. What the Prior Attempt Got Wrong

1. **Failure to Recognize Snake-Case Simulated Flag Properties in `runFraudAudit`**:
   - *Input*: `runFraudAudit({ views_to_subs_ratio: true, uniform_err: true })`
   - *Expected*: `fraudScore: 50` with both `views_to_subs_ratio` and `uniform_err` signals emitted.
   - *Actual*: `fraudScore: 0`, no signals emitted.
   - *Root Cause*: `runFraudAudit` only inspected camelCase property names (`channel.viewsToSubsRatio`, `channel.growthSmoothness`, etc.), completely ignoring snake_case properties that directly match database signal types.

2. **Failure to Recognize Snake-Case Inside `simulatedFlags`**:
   - *Input*: `runFraudAudit({ simulatedFlags: { uniform_err: true } })`
   - *Expected*: `fraudScore: 25`, signal emitted for `uniform_err`.
   - *Actual*: `fraudScore: 0`.
   - *Root Cause*: `channel.simulatedFlags` strictly checked `uniformReactionRatio` and `uniformErr`, ignoring `uniform_err` and `views_to_subs_ratio`.

3. **Incomplete CamelCase SignalType Support in Database `fraudSignals` Array**:
   - *Input*: `channel.fraudSignals` containing `{ signalType: 'viewsToSubsRatio' }` or `'growthSmoothness'` or `'uncorrelatedSpikes'` or `'uniformErr'`.
   - *Expected*: Signals recognized and aggregated into `fraudScore`.
   - *Actual*: Ignored because filters strictly expected snake_case signal types (except for partial aliases in uniform reaction).
   - *Root Cause*: Inconsistent casing normalization between triggers and `fraudSignals`.

4. **Failure to Parse String Numeric & BigInt Values in `post.err` / `post.ERR` / `post.errRate`**:
   - *Input*: `checkUniformReactionRatio({ posts: Array(15).fill({ err: "5.0" }) })` or `{ ERR: 5n }`.
   - *Expected*: Parse valid ERR values and evaluate CV.
   - *Actual*: Returned `flag: false, reason: "Недостаточно данных для анализа (менее 10 постов)"`.
   - *Root Cause*: `extractPostERR` strictly checked `typeof post.err === 'number'` without string or BigInt coercion.

5. **Complete Lack of Unit Tests for the New `RiskBadge` UI Component**:
   - *Input*: `npm test`.
   - *Expected*: Comprehensive unit testing verifying RiskBadge score rendering, styling (emerald/amber/rose), clamping, null safety, and tooltip output.
   - *Actual*: 0 test suites or tests existed in `src/components/__tests__`.
   - *Root Cause*: Prior rounds only tested `fraudDetector.ts` and skipped UI component testing entirely.

6. **Unnecessary Re-computation of `runFraudAudit` on Every React Render**:
   - *Input*: Rendering `MyChannelCard` or `ChannelHeader` when `channel.fraudScore` was already calculated and delivered by the server query (`queries.ts`).
   - *Expected*: Use pre-calculated `channel.fraudScore` and avoid re-auditing on every render.
   - *Actual*: `runFraudAudit(channel)` was unconditionally executed on every render cycle.
   - *Root Cause*: Missing check for `channel.fraudScore == null` before invoking `runFraudAudit`.

7. **Missing `Set` and String Support in `channel.triggers`**:
   - *Input*: `runFraudAudit({ triggers: new Set(['uniform_err']) })`.
   - *Expected*: `fraudScore: 25`.
   - *Actual*: `fraudScore: 0`.
   - *Root Cause*: Strictly checked `Array.isArray(channel.triggers)`.

---

## 2. What I Changed

- `src/lib/fraudDetector.ts`:
  - Extended `FraudSignal` interface to include optional `id?: number` and `detectedAt?: Date | string` to align with Prisma database model.
  - In `extractPostERR`: added `parseVal` supporting string numerics, percent strings, and BigInts for `post.err`, `post.ERR`, and `post.errRate`.
  - In `checkUniformReactionRatio`: added support for choosing the richer array between `posts` and `recentPosts`, plus added `createdAt` date parsing.
  - In `runFraudAudit`:
    - Implemented `hasTriggerKey` supporting `Array`, `Set`, and substring triggers.
    - Added comprehensive snake_case and camelCase property checks across all 4 detection checks (`views_to_subs_ratio`, `growth_smoothness`, `uncorrelated_spikes`, `uniform_err`).
    - Added snake_case support inside `channel.simulatedFlags`.
    - Added camelCase alias support in `channel.fraudSignals`.
    - Added `s.flag !== false` check to prevent inactive/falsified signals from triggering fraud points.
    - Supported passing a raw array of posts directly to `runFraudAudit`.
    - Sanitized `spikesCount` to ensure >= 1 when `uncorrelated_spikes` signal is recorded.

- `src/components/RiskBadge.tsx`:
  - Added BigInt score parsing (`typeof score === 'bigint' ? Number(score) : ...`).
  - Added `'Подозрительная активность'` fallback in tooltip when both `s.reason` and `s.signalType` are empty.

- `src/components/MyChannelCard.tsx` & `src/components/channel/ChannelHeader.tsx`:
  - Optimized fraud audit so `runFraudAudit(channel)` is only called as a fallback when `channel.fraudScore == null || !channel.fraudSignals`.

- `vitest.config.ts`:
  - Added `oxc: { jsx: { runtime: 'automatic' } }` to enable Vitest to parse JSX syntax when testing React UI components.

- `src/components/__tests__/RiskBadge.test.ts`:
  - Created 10 comprehensive unit tests covering:
    - Low risk state (0%) with emerald styling and `ShieldCheck` icon.
    - Medium risk state (25%) with amber styling and `AlertTriangle` icon.
    - High risk state (50%, 75%, 100%) with rose styling and `AlertTriangle` icon.
    - Score clamping for < 0 (clamped to 0%) and > 100 (clamped to 100%).
    - String numeric (`"75"`) and BigInt (`50n`) score parsing.
    - Null, undefined, and NaN score defaults to 0%.
    - Null/undefined `signals` prop crash safety.
    - Tooltip formatting with signal reasons and fallbacks.
    - Alias `FraudScoreBadge` support.
    - Custom `className` prop propagation.

- `src/lib/__tests__/fraudDetector.test.ts`:
  - Added 6 new adversarial test cases covering:
    - Direct snake_case boolean properties in `runFraudAudit`.
    - Snake_case properties inside `simulatedFlags`.
    - CamelCase `signalType` in database `fraudSignals`.
    - `triggers` passed as a `Set`.
    - String numeric and BigInt in `post.err`, `post.ERR`, and `post.errRate`.
    - Passing a raw posts array directly to `runFraudAudit`.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - `npx vitest run src/components/__tests__/RiskBadge.test.ts`: 10 passed (100%).
  - `npx vitest run src/lib/__tests__/fraudDetector.test.ts`: 73 passed (100%).
  - `npm test`: 19 test files, 200 tests passed (0 failures).
  - `npx tsc --noEmit`: 0 errors.
  - `npm run lint`: 0 warnings, 0 errors.
  - `npm run build`: Next.js production build succeeded, generating all static and dynamic routes (`/`, `/channel/[id]`, `/compare`, etc.).

- **Shallow Verification (manual only):**
  - Verified UI styling matches 3px border radius guidelines (`rounded-full` used specifically for badges as per project guidelines).
  - Verified Russian localization for reasons and diagnostic tooltips.

- **Unverified aspects:**
  - Live browser rendering in a headless browser driver (mocked via JSDOM and Testing Library).
  - Real Telegram MTProto live socket anomaly collection against real Russian Telegram channels (tested via comprehensive synthetic fixture suites).

---

## 4. Known Issues

- `Minor Robustness Risk`: Channels with fewer than 10 lifetime posts in Telegram return `flag: false` ("Недостаточно данных для анализа"), because Coefficient of Variation requires an adequate sample size (10-20 posts) to avoid false positives. This is by design per requirement R1.

---

## 5. Remaining Risk & Next Step

All requirements (R1, R2, R3, R4) and acceptance criteria are thoroughly implemented, tested, and verified.
All 19 test suites with 200 tests pass cleanly, linting has 0 warnings/errors, TypeScript compiles with 0 errors, and the production Next.js build succeeds.
The task is ready for final delivery.
