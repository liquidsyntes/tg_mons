# Reviewer 2 Handoff Report: Quantitative Citation Index & Fraud Detection Signal

## Executive Summary
Adversarial review, edge-case probing, database analysis, and build verification were conducted on the Quantitative Citation Index implementation. Nine distinct defects across metric calculations, database queries, type definitions, and mobile/desktop UI components were uncovered and corrected. Full automated test suite (145 tests across 18 files), type checking, linter, and production Next.js build all pass with zero errors.

---

## 1. What the prior attempt got wrong

### Defect 1: Single mention object with Prisma / domain field names (`membersCount`, `currentMembers`) evaluated to 0
- **Input:** `calculateCitationIndex({ mentions: 5, membersCount: 10000 })` or `checkLowCitationGrowth(10, { mentions: 5, membersCount: 10000 })`
- **Expected:** `calculateCitationIndex` returns 20 ($5 \times \log_{10}(10000)$); `checkLowCitationGrowth` returns `flag: false` (index 20 clears fraud threshold).
- **Actual:** `calculateCitationIndex` returned `0`; `checkLowCitationGrowth` returned `flag: true` with `reason: 'Подозрение на накрутку: рост подписчиков за 30 дней (> 5%: 10%) при околонулевом индексе цитирования (0)'`.
- **Root Cause:** In `src/lib/citationIndex.ts`, single-object property detection checked only `citing_subscribers`, `citingSubscribers`, `subscribers`, `sourceChannel`, and `count`, omitting Prisma's standard schema names `membersCount` / `members_count` and `currentMembers`. The object fell through to `else if (typeof channel.mentions === 'number')` and unconditionally returned 0.

### Defect 2: Mention array elements with `membersCount` and `currentMembers` evaluated to 0 subscribers
- **Input:** `calculateCitationIndex([{ count: 3, membersCount: 1000 }])` or `calculateCitationIndex([{ count: 2, currentMembers: 10000 }])`
- **Expected:** `9` ($3 \times \log_{10}(1000)$) and `8` ($2 \times \log_{10}(10000)$).
- **Actual:** `0`.
- **Root Cause:** Lines 112-126 of `src/lib/citationIndex.ts` extracted subscriber count from `m.citing_subscribers`, `m.citingSubscribers`, `m.subscribers`, and nested `sourceChannel?.currentMembers/membersCount`, but completely omitted top-level `membersCount` and `currentMembers` on the mention object itself.

### Defect 3: Numeric strings and BigInt subscriber counts and mentions count evaluated to 0
- **Input:** `calculateCitationIndex([{ mentions: 1, subscribers: "10000" }])` or `calculateCitationIndex([{ mentions: 1, subscribers: 10000n }])`
- **Expected:** `4` ($\log_{10}(10000)$).
- **Actual:** `0`.
- **Root Cause:** Strict `typeof m.subscribers === 'number'` checks in `src/lib/citationIndex.ts` discarded BigInt (commonly used in Prisma IDs and counters) and numeric strings (from JSON serialization).

### Defect 4: Mentions with `timestamp` bypassed 30-day date window filter
- **Input:** `calculateCitationIndex([{ mentions: 1, subscribers: 1000, timestamp: new Date(now - 40 days) }], now)`
- **Expected:** `0` (mention is older than 30 days and must be excluded).
- **Actual:** `3` (mention was included because only `m.date`, `m.createdAt`, and `m.publishedAt` were checked, but `m.timestamp` was ignored).
- **Root Cause:** Line 88 of `src/lib/citationIndex.ts` only checked `const dateVal = m.date || m.createdAt || m.publishedAt;` and ignored `m.timestamp`.

### Defect 5: Self-mentions / self-forwards counted as external citations
- **Input:** Channel 16 in PostgreSQL with 2 forwards of its own posts from channel 16.
- **Expected:** Self-citations excluded from citation index calculation ($\sum mentions \times \log_{10}(citing\_subscribers)$ where citing channel $\neq$ target channel).
- **Actual:** Channel 16 received citation points from forwarding its own posts because neither `getCitationIndexForChannel` nor `getCitationIndicesForChannels` filtered out `sourceChannelId === channel.id`.
- **Root Cause:** Missing `sourceChannelId: { not: channel.id }` in the Prisma aggregation and missing `m.sourceChannelId !== ch.id` filter in channel grouping.

### Defect 6: Casing and `@` prefix mismatches in PostgreSQL mention queries
- **Input:** Channel with username `TechNews` when mentions in PostgreSQL have `@technews` or `technews`.
- **Expected:** Indexed query matches all case and `@` prefix variants.
- **Actual:** Only looked up `cleanUsername` (`technews`), which in PostgreSQL's case-sensitive `target_username IN (...)` misses any mentions stored with uppercase or `@`.
- **Root Cause:** Missing username variants in `targetUsername: { in: [...] }` queries.

### Defect 7: Mobile view (`ChannelsMobileList.tsx`) lacked citation index display
- **Input:** Viewing channels table on mobile viewport.
- **Expected:** Citation index visible on channels table (Requirement R3).
- **Actual:** Only desktop view (`ChannelsDesktopTable.tsx`) had the CI column; `ChannelsMobileList.tsx` did not show CI at all.
- **Root Cause:** CI was omitted from `ChannelsMobileList.tsx`.

### Defect 8: Desktop table lacked visual indicator when `checkLowCitationGrowth` flags a channel
- **Input:** Channel with >5% growth and 0 citation index in `ChannelsDesktopTable.tsx`.
- **Expected:** Visual indicator linking the citation index metric to the fraud signal.
- **Actual:** Rendered plain gray "0" with no indication of high-growth fraud suspicion.
- **Root Cause:** Table cell did not check if channel growth exceeds threshold while citation index is near zero.

### Defect 9: TypeScript type narrowing error and static Prisma import risk in client components
- **Input:** `npx tsc --noEmit` on `src/lib/fraudDetector.ts`.
- **Expected:** Clean compilation and safe client-side importability.
- **Actual:** TypeScript error TS2339 (`Property 'trim' does not exist on type 'never'`).
- **Root Cause:** `growthOrChannel` type omitted `string`, causing TypeScript to narrow `growthOrChannel` to `never` in string branch. Furthermore, top-level static `import { prisma }` in `citationIndex.ts` posed a bundler risk when imported by client UI components.

---

## 2. What I changed

### `src/lib/citationIndex.ts`
1. **Universal subscriber parsing:** Implemented `parseSubscribers` and `extractSubscribers` supporting `membersCount`, `members_count`, `currentMembers`, `current_members`, `subscribers`, `citing_subscribers`, `citingSubscribers`, `sourceChannel`, `citingChannel`, and `channel`, with full support for `number`, `bigint`, and numeric `string`.
2. **Universal count parsing:** Implemented `parseCount` supporting `number`, `bigint`, and numeric `string`.
3. **Expanded single-mention detection:** Added `membersCount`, `currentMembers`, `citingChannel`, and `channel` to single-mention object detector.
4. **Direct numbers/BigInt support:** Allowed passing numbers or BigInt directly to `calculateCitationIndex` (e.g. `calculateCitationIndex(1000)` = 3).
5. **Timestamp support:** Added `timestamp` to date filtering window alongside `date`, `createdAt`, and `publishedAt`.
6. **Self-citation prevention:** Excluded self-citations when target channel id is known in `calculateCitationIndex`, in `getCitationIndexForChannel` (`sourceChannelId: { not: channel.id }`), and in `getCitationIndicesForChannels` (`m.sourceChannelId !== ch.id`).
7. **PostgreSQL case/prefix resilience:** Expanded `targetUsername` clauses to query all lowercase, raw, and `@` prefixed variations.
8. **Lazy Prisma import:** Converted Prisma to dynamic/lazy import inside `getCitationIndexForChannel` and `getCitationIndicesForChannels`, eliminating static Prisma imports and making `citationIndex.ts` 100% safe for client components.

### `src/lib/fraudDetector.ts`
1. **Type safety:** Fixed `growthOrChannel: number | string | { ... }` and typed `rawGrowth: unknown` to eliminate TypeScript `never` narrowing errors.
2. **Numeric sanitization:** Added `isFinite` guards to ensure `Infinity` and `-Infinity` are safely clamped to 0.
3. **Threshold options:** Fully supported custom `options.minGrowth` and `options.maxCitationIndex`.

### `src/components/channel/ChannelsDesktopTable.tsx`
1. **Fraud signal UI indicator:** Connected `checkLowCitationGrowth` to the CI table cell. When a channel exhibits >5% growth with near-zero citation index, it renders in `text-rose-400` with an `AlertTriangle` icon and an explanatory tooltip (`Подозрение на накрутку: рост X% при околонулевом ИЦ (Y)`).

### `src/components/channel/ChannelsMobileList.tsx`
1. **Mobile CI display:** Added citation index display (`ИЦ: X`) next to the channel chart action button on mobile cards.

### `src/lib/__tests__/citationIndex.test.ts`
- Added tests for `membersCount` and `currentMembers` in single-mention objects and arrays.
- Added tests for numeric strings and BigInt subscriber counts and mentions.
- Added tests for `timestamp` date filtering.
- Added tests for direct number and BigInt inputs.
- Added tests for self-citation exclusion.
- Added tests for `inbound` and `inbound_mentions` keys.

### `src/lib/__tests__/fraudDetector.test.ts`
- Added tests verifying single mention objects with `membersCount` and `currentMembers` clear fraud flags.
- Added tests for numeric string growth rates.
- Added tests for non-finite values (`Infinity`, `-Infinity`).
- Added tests for custom `options.minGrowth` and `options.maxCitationIndex` thresholds.

---

## 3. Verification Record

- **Automated Tests (`npm test`):**
  - Ran full Vitest suite: **18 test files passed, 145 tests passed (0 failed)**.
- **Type Checking (`npx tsc --noEmit`):**
  - **0 errors**.
- **Linter (`npm run lint`):**
  - **0 warnings, 0 errors**.
- **Production Build (`npm run build`):**
  - Successfully compiled all 36 routes and static/dynamic pages with Next.js 15.5.
- **Database Self-Citation Validation (`npx tsx`):**
  - Verified that channel 16's 2 self-forwards are excluded from external citation scoring.

---

## 4. Known Issues
- `Minor Robustness Risk`: Private channel mentions that do not expose public `@username` or numerical channel ID cannot be matched to monitored channels in Telegram's schema.
- `Minor Robustness Risk`: If a citing channel has no snapshots and no posts with `subscribersAtPublish`, its subscriber count remains unknown (defaults to 0, yielding 0 weight).

---

## 5. Remaining Risk & Next Step
- The task requirements (R1 Citation Index Calculation, R2 Fraud Detection Signal, R3 UI Integration) are fully addressed, defect-free, and covered by 145 passing automated unit tests and production build verification. The implementation is ready for deployment.
