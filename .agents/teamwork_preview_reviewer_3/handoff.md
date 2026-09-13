# Review Round 3 Handoff Report: Quantitative Citation Index & Fraud Detection Signal

> [!WARNING] **Skepticism Disclaimer**
> High confidence in calculation precision, boundary handling, and test coverage (152 passed tests, clean lint, zero type errors, successful Next.js production build); residual operational risk remains limited to runtime Telegram network latency and rate limits when fetching live remote MTProto data.

---

## 1. What the prior attempt got wrong

### Defect 1: Numeric strings for citation index in `checkLowCitationGrowth` were piped to `calculateCitationIndex`, yielding 0 and falsely flagging legitimate channels
- **Input:** `checkLowCitationGrowth(10, "15")`
- **Expected:** `flag: false`, `citationIndex: 15` (citation index 15 clears the near-zero fraud threshold).
- **Actual:** `flag: true`, `citationIndex: 0` (`Подозрение на накрутку...`).
- **Root Cause:** In `src/lib/fraudDetector.ts`, `typeof citationIndexOrMentions === 'number'` checked only numbers. A string like `"15"` fell into the `calculateCitationIndex(...)` branch, which returned 0 because it did not parse direct numeric strings, falsely flagging legitimate channels as fraudulent.

### Defect 2: Object-level `citationIndex` passed as numeric string or BigInt evaluated to 0
- **Input:** `checkLowCitationGrowth({ growthRate: 10, citationIndex: "20" })` or `checkLowCitationGrowth({ growthRate: 10, citationIndex: 20n })`
- **Expected:** `flag: false`, `citationIndex: 20`.
- **Actual:** `flag: true`, `citationIndex: 0`.
- **Root Cause:** `typeof growthOrChannel.citationIndex === 'number'` omitted string and bigint, falling through to `calculateCitationIndex(growthOrChannel)` which returned 0.

### Defect 3: Growth rates formatted with percentage signs or BigInt evaluated to `NaN` -> 0, evading fraud detection
- **Input:** `checkLowCitationGrowth("10%", 0)` or `checkLowCitationGrowth("+15%", 0)` or `checkLowCitationGrowth(10n, 0)`
- **Expected:** `flag: true`, `growthRate: 10` (or 15) with fraud flag raised.
- **Actual:** `flag: false`, `growthRate: 0`.
- **Root Cause:** `Number("10%")` produced `NaN` in JavaScript, and `typeof val === 'bigint'` was not handled, causing `growthRate` to default to 0 and completely evading the `> minGrowth` fraud check.

### Defect 4: Reason strings hardcoded `5%` when custom `minGrowth` was configured
- **Input:** `checkLowCitationGrowth(8, 0, { minGrowth: 10 })`
- **Expected:** Reason string stating `не превышает порог 10%`.
- **Actual:** Reason string stated `не превышает порог 5%`.
- **Root Cause:** Hardcoded literal `'5%'` in the string templates of `fraudDetector.ts` instead of dynamic `${minGrowth}%`.

### Defect 5: Formatted subscriber numbers with commas, spaces, or underscores (`"10,000"`, `"10 000"`, `"10_000"`) evaluated to `NaN` -> 0 subscribers
- **Input:** `calculateCitationIndex([{ mentions: 1, subscribers: "10,000" }])` or `calculateCitationIndex([{ mentions: 1, subscribers: "10 000" }])`
- **Expected:** `4` ($\log_{10}(10000)$).
- **Actual:** `0`.
- **Root Cause:** `Number("10,000")` evaluates to `NaN`. String parsing in `parseSubscribers` did not strip commas, spaces, or underscores before parsing subscriber count.

### Defect 6: Mentions with snake_case timestamps (`created_at`, `published_at`) bypassed the 30-day window filter
- **Input:** `calculateCitationIndex([{ mentions: 1, subscribers: 1000, created_at: new Date(now - 40 days) }])`
- **Expected:** `0` (mention older than 30 days must be filtered out).
- **Actual:** `3` (mention was counted).
- **Root Cause:** `dateVal` only checked `date`, `createdAt`, `publishedAt`, and `timestamp`, omitting database snake_case columns `created_at` and `published_at`.

### Defect 7: Mentions with snake_case `source_channel_id` bypassed self-citation exclusion
- **Input:** Channel 15 with mentions `[{ source_channel_id: 15, subscribers: 10000 }, { source_channel_id: 25, subscribers: 1000 }]`
- **Expected:** `3` (self-citation from channel 15 excluded).
- **Actual:** `7` (both counted).
- **Root Cause:** Self-citation check only checked `m.sourceChannelId ?? m.channelId`, missing `m.source_channel_id` and `m.sourceChannel?.id`.

### Defect 8: Direct numeric strings passed to `calculateCitationIndex` returned 0
- **Input:** `calculateCitationIndex("1000")` or `calculateCitationIndex("10,000")`
- **Expected:** `3` and `4`.
- **Actual:** `0`.
- **Root Cause:** Top-level input branch only matched `number` or `bigint`, ignoring string subscriber inputs.

### Defect 9: Channel card (`MyChannelCard.tsx`) lacked fraud signal indicator when `checkLowCitationGrowth` was flagged
- **Input:** Viewing `MyChannelCard` for a channel exhibiting >5% growth with near-zero citation index.
- **Expected:** Alert indicator with tooltip explaining fraud risk on the channel card (Requirement R2 / R3).
- **Actual:** Plain slate-300 text `0` with no fraud warning.
- **Root Cause:** `MyChannelCard.tsx` did not connect `checkLowCitationGrowth`.

### Defect 10: Mobile list (`ChannelsMobileList.tsx`) and Desktop table (`ChannelsDesktopTable.tsx`) tooltip safety
- **Input:** Mobile view of channels, and channels with null/undefined `delta30d` on desktop.
- **Expected:** Mobile list shows `AlertTriangle` with tooltip when flagged; Desktop table safely formats reason without throwing `Cannot read properties of undefined (reading 'percent')`.
- **Actual:** Mobile list had no fraud indicator; Desktop table performed raw string concatenation `${channel.delta30d.percent}%` which risked runtime TypeError or printed `рост null%`.
- **Root Cause:** Mobile list omitted fraud check; Desktop table bypassed `fraud.reason`.

---

## 2. What I changed

### `src/lib/fraudDetector.ts`
1. **Universal growth parsing (`parseGrowth`):** Robustly sanitizes numbers, bigints, and numeric strings with percent signs, spaces, commas, plus/minus (e.g. `"10%"`, `"+15%"`, `10n`).
2. **Universal citation index parameter parsing (`parseCitationIndexParam`):** Resolves numeric strings (e.g. `"15"`), bigints, and numbers directly to valid citation scores, preventing false fraud flags.
3. **Dynamic threshold interpolation:** Updated reason strings to dynamically render `${minGrowth}%` instead of hardcoded `5%`.
4. **Enhanced type signature:** Added `bigint`, `string`, `null`, `undefined` support to `growthOrChannel` and `citationIndexOrMentions`.

### `src/lib/citationIndex.ts`
1. **Formatted string support:** Handled commas, spaces, underscores in subscriber counts (`"10,000"`, `"10 000"`, `"10_000"`).
2. **Direct numeric strings:** Allowed passing `"1000"` directly to `calculateCitationIndex`.
3. **Snake_case date filtering:** Added `created_at` and `published_at` to the 30-day date window filter.
4. **Snake_case self-citation exclusion:** Added `source_channel_id`, `sourceChannel.id`, and `source_channel.id` to self-citation filtering.
5. **Robust nested subscribers extraction:** Added snake_case variations (`members_count`, `current_members`, `source_channel`, `citing_channel`).

### `src/components/MyChannelCard.tsx`
1. **Fraud signal UI integration:** Connected `checkLowCitationGrowth(channel)`. When a channel exhibits >5% growth with near-zero citation index, it renders in `text-rose-400 font-bold` with an `AlertTriangle` icon and an explanatory tooltip (`title={fraud.reason}`).

### `src/components/channel/ChannelsDesktopTable.tsx`
1. **Safe reason tooltip:** Replaced raw `${channel.delta30d.percent}%` concatenation with `fraud.reason`, protecting against null/undefined `delta30d` runtime crashes.

### `src/components/channel/ChannelsMobileList.tsx`
1. **Mobile fraud indicator:** Added `AlertTriangle` icon and rose-400 styling with `title={fraud.reason}` to the mobile CI badge when flagged by `checkLowCitationGrowth`.

### `src/lib/__tests__/citationIndex.test.ts`
- Added tests for formatted subscriber strings (`"10,000"`, `"10 000"`, `"10_000"`).
- Added tests for snake_case date fields (`created_at`, `published_at`).
- Added tests for snake_case `source_channel_id` self-citation exclusion.
- Added tests for direct numeric strings.

### `src/lib/__tests__/fraudDetector.test.ts`
- Added tests verifying numeric string and BigInt citationIndex inputs clear fraud flags (`checkLowCitationGrowth(10, "15")`).
- Added tests for growth rates formatted with `%` and BigInt (`checkLowCitationGrowth("10%", 0)`).
- Added tests for custom `minGrowth` reason string formatting.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - `npm test`: **18 test files passed, 152 tests passed (0 failed)** in 16.8s.
  - `npx vitest run src/lib/__tests__/citationIndex.test.ts`: **22 passed (0 failed)**.
  - `npx vitest run src/lib/__tests__/fraudDetector.test.ts`: **35 passed (0 failed)**.
  - `npx tsc --noEmit`: **0 errors**.
  - `npm run lint`: **0 warnings, 0 errors** (✔ No ESLint warnings or errors).
  - `npm run build`: **Next.js 15.5 production build completed successfully**, compiling all 36 routes and static pages with zero errors.
- **Shallow Verification (manual only):**
  - Inspected responsive styles in desktop table and mobile list for UI consistency and 3px border radius per GEMINI.md.
  - Verified Russian copy across reason strings and tooltip labels per AGENTS.md.
- **Unverified aspects:**
  - Live Telegram MTProto daemon network connection against active Telegram data centers (mocked in unit test suite per project test harness).

---

## 4. Known Issues
- `Minor Robustness Risk`: Private channel mentions that do not expose a public `@username` or numerical channel ID cannot be matched to monitored channels in Telegram's schema.
- `Minor Robustness Risk`: If a referring channel has neither snapshots nor posts with `subscribersAtPublish`, its subscriber count remains unknown (defaults to 0, yielding 0 weight).

---

## 5. Remaining risk & next step
The implementation meets all requirements from the task specification:
1. **R1**: Quantitative Citation Index based on logarithmic formula $\sum (\text{mentions} \times \log_{10}(\text{citing\_subscribers}))$ with 30-day window.
2. **R2**: Fraud detection signal `checkLowCitationGrowth` flagging >5% growth with near-zero citation index.
3. **R3**: UI integration across `MyChannelCard`, `ChannelsDesktopTable`, and `ChannelsMobileList`.

The test suite contains 152 passing tests, the linter is clean, TypeScript compilation succeeds with 0 errors, and the production build completes cleanly. The task is complete and ready for final victory audit.
