# Reviewer Round 2 Handoff Report

## 1. What the Prior Attempt Got Wrong

1. **Fatal React Crash on `null` Signals in `RiskBadge`**:
   - *Input*: `<RiskBadge score={50} signals={null} />` (common when API serializes optional fields or DB query returns null).
   - *Expected*: Safely render default empty state without throwing runtime exceptions.
   - *Actual*: Runtime `TypeError: Cannot read properties of null (reading 'length')`.
   - *Root Cause*: Relying on ES6 parameter default (`signals = []`), which only activates on `undefined`, not `null`.

2. **Lost `channelId` Propagation in `runFraudAudit` Signal Output**:
   - *Input*: Calling `runFraudAudit({ channelId: 888, viewsToSubsRatio: true })` with an object using `channelId` instead of `id`.
   - *Expected*: All aggregated signals in `result.signals` contain `channelId: 888`.
   - *Actual*: `signals[0].channelId` evaluated to `undefined`.
   - *Root Cause*: Lines 740, 751, 761, 770 in `runFraudAudit` hardcoded `channel.id` instead of resolving `channel.id ?? channel.channelId` (unlike `checkUniformReactionRatio` which correctly supported both).

3. **Incomplete DB Signal Type Matching for Uniform ERR in `runFraudAudit`**:
   - *Input*: `channel.fraudSignals` containing `{ signalType: 'uniform_reaction_ratio' }` or `'uniformReactionRatio'`.
   - *Expected*: Flagged and aggregated into `fraudScore` just like triggers and simulated flags.
   - *Actual*: Ignored because the filter strictly checked `s?.signalType === 'uniform_err'`.
   - *Root Cause*: Missing alias check for `uniform_reaction_ratio` and `uniformReactionRatio` in the `fraudSignals` branch.

4. **Nondeterministic Post Sorting on Invalid Date Formats in `checkUniformReactionRatio`**:
   - *Input*: Array of posts where some `publishedAt` or `date` fields contain invalid date strings (e.g. `"invalid-date"`).
   - *Expected*: Posts with invalid dates handled gracefully without producing `NaN` in comparator.
   - *Actual*: `new Date(item).getTime()` returned `NaN`, causing `timeB - timeA` to return `NaN`, leading to V8 Timsort array corruption.
   - *Root Cause*: Lack of `Number.isFinite()` check on parsed timestamps before subtracting.

5. **Failure to Parse String Numeric Values & BigInts in Synthetic Series and Views**:
   - *Input*: Synthetic ERR series passed as string decimals `["5.0", "5.02", "4.98"]` or posts with string/BigInt views and engagement fields.
   - *Expected*: Parse numeric strings and BigInts safely.
   - *Actual*: `typeof post === 'number'` and `typeof post.views === 'number'` failed, resulting in `extractPostERR` returning `null` and falsely claiming insufficient data.
   - *Root Cause*: Strict primitive `number` checks in `extractPostERR` without string/BigInt coercion.

6. **Hardcoded Magic Spike Date in `runFraudAudit`**:
   - *Input*: Channel with database fraud signal for `uncorrelated_spikes`.
   - *Expected*: Details and reasons reflect the actual spike date or detection date.
   - *Actual*: Dates were hardcoded to `['2026-09-01']`.
   - *Root Cause*: Hardcoded string constant instead of extracting from signal dates or `detectedAt`.

7. **Potential Unhandled Exception on Null Elements in Metrics**:
   - *Input*: `channel.metrics` containing `null` or `undefined` elements.
   - *Expected*: Gracefully filter out invalid entries.
   - *Actual*: Produced invalid dates `{ date: new Date(0), followers: 0 }`.
   - *Root Cause*: Missing `.filter(m => m !== null && m !== undefined)` in `runFraudAudit`.

---

## 2. What I Changed

- `src/components/RiskBadge.tsx`:
  - Added null safety for `signals`: `const safeSignals = Array.isArray(signals) ? signals.filter(s => s && typeof s === 'object') : [];`.
  - Added safe parsing for string numeric scores: coerces string integers, clamps to 0..100, defaults to 0 on null/undefined/NaN.
  - Added fallback in tooltip generation to avoid crashes on missing reason fields (`s.reason || s.signalType`).

- `src/lib/fraudDetector.ts`:
  - In `extractPostERR`: added parsing for string numbers (e.g. `"5.0"` or `"1000"`), BigInt support for views and engagement fields, and sanitized `isFinite` checks.
  - In `checkUniformReactionRatio`: guarded sorting comparator with `Number.isFinite(time)` check to prevent `NaN` during sort.
  - In `runFraudAudit`:
    - Resolved `resolvedChannelId = channel?.id ?? channel?.channelId` across all four signal generators.
    - Added alias checks for `uniform_reaction_ratio` and `uniformReactionRatio` in `fraudSignals`.
    - Used dynamic detection date from DB signal instead of hardcoded `'2026-09-01'`.
    - Filtered out `null` and `undefined` entries in `channel.metrics`.

- `src/lib/__tests__/fraudDetector.test.ts`:
  - Added 6 new adversarial test suites:
    - Safe handling of invalid date strings in `checkUniformReactionRatio` without sort corruption.
    - String numeric series and BigInt post metrics.
    - Extreme views boundary: 1 view with 1 reaction mixed with normal posts (normal CV, not flagged) vs all posts having 1 view / 1 reaction (flagged).
    - `channelId` property propagation across all signals in `runFraudAudit`.
    - Alias support for `uniform_reaction_ratio` and `uniformReactionRatio` DB signals in `runFraudAudit`.
    - Null and undefined element filtering in `metrics` arrays for `runFraudAudit`.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - `npx vitest run src/lib/__tests__/fraudDetector.test.ts`: 67 passed (100%), duration 22ms.
  - `npm test`: 18 test files, 184 tests passed (0 failures).
  - `npx tsc --noEmit`: Passed with 0 errors.
  - `npm run lint`: Passed with 0 warnings and 0 errors.
  - `npm run build`: Production Next.js build compiled successfully (all 35+ routes and static pages generated).

- **Shallow Verification (manual only):**
  - Inspected DOM structures and styling of `RiskBadge` across `MyChannelCard.tsx`, `ChannelHeader.tsx`, and `ChannelsMobileList.tsx`.
  - Confirmed compliance with 3px border radius and Tailwind color palette standards.

- **Unverified aspects:**
  - Real MTProto live stream collection against the live Telegram network with bots active in real-time (mocked in unit and integration test suite).
  - Browser layout rendering under screen widths < 320px with unusually long Russian channel titles.

---

## 4. Known Issues

- `Minor Robustness Risk`: If a channel has < 10 total posts across its entire history in Telegram, bot template reactions cannot be mathematically distinguished with statistical significance (CV requires sufficient sample size), so the system deliberately reports `flag: false` ("Недостаточно данных для анализа") to avoid false positives.

---

## 5. Remaining Risk & Next Step

The fraud detection pipeline and unified scoring are complete and robust against malformed data, invalid dates, missing types, and adversarial inputs. All 184 test suite scenarios pass and the production build compiles cleanly.
The task is ready for final signoff.
