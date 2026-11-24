<!-- CLAUDE.md section from the claude/cards-trackers branch. Merge into "Frontend" / "Layout" as the integrator sees fit. -->

## Card strategy and trackers

**Strategy data** (`src/shared/data/strategy/`, shapes in `types.ts`). Three drop-in datasets, each a typed const in
the shape the research JSON uses. Files that start with `// SEED DATA: replaced by verified research before release`
still hold unverified placeholders. Replace the whole object, keep the export name, and run `npm test` (a test
checks that every rule's card ids exist and every program has a valuation and an expiration policy).
- `application-rules.ts` → `applicationRules: { rules: ApplicationRule[] }`. `logic.type`: `max-new-cards` (5/24),
  `velocity` (e.g. 1 per 6 months), `max-open`, `once-per-lifetime`, `family-bonus` (with `months`: while holding a
  family card or within `months` of a family bonus; without: ever had one), `cooldown` (within `months` of a bonus on
  the card or its `family`). `scope`: `personal`, `business`, `all` (any issuer), `issuer`, `issuer-personal`,
  `issuer-business` (the rule's `issuer` only) or `family`. `appliesTo` and `family` are card ids.
- `expiration.ts` → `expirationPolicies: { programs: ExpirationPolicy[] }`, `rule` = `never` | `inactivity` |
  `fixed-term` | `while-account-open`.
- `valuations.ts` → `valuations: { valuations: Valuation[] }` (cents per point; `median` is what we use).
- `programs.ts` (not seed): display names, kinds and units for the 42 bank-currency and program ids, the issuer list
  for the application editor, and `programForCard()` (which currency a card earns, from its `rewardsCurrency`).
  Kept local on purpose; it can point at the full points data later.

**Wallet fields** (all optional, still `version: 1`; validated in `parseWallet`, merged in `mergeWallets3`):
- `applications`: cards the user opened, `{ id, issuer, cardId?, name?, opened: "YYYY-MM", business, closed?,
  bonusEarned? }`. **`undefined` means "history not set up"**: rules that need it report unknown. `[]` means "nothing
  to add" (the editor's "I have nothing to add" button). A missing `bonusEarned` means no bonus was earned.
- `balances`: `{ [programId]: { points, updated, lastActivity? } }`.
- `certificates`: `{ id, kind, program?, label, valueUsd?, points?, expires?: date | null, used?, notes? }`
  (`expires: null` = doesn't expire).
- `redemptions`: `{ id, date, label, program?, points, taxesUsd, cashPriceUsd, notes? }`.
- Caps live in `WALLET_LIMITS` (150 applications, 100 balances, 100 certificates, 200 redemptions, labels 80 chars,
  notes 160); a maxed-out wallet stays under the 256 KB sync limit (tested). Lists merge three ways by `id`: an
  edit beats a delete, two edits merge field by field (this device wins a shared field), and a merged item that
  fails the schema falls back to this device's copy. Balances: the more recently `updated` wins.
- Every change goes through `walletActions` (`addApplication(s)`, `updateApplication`, `removeApplication`,
  `confirmNoApplications`, `setBalance`, `add/update/removeCertificate`, `add/update/removeRedemption`). They run the
  item through the schema first, refuse full lists and stop adding near 240 KB, so a saved wallet always syncs. Form
  text goes through `cleanLabel` / `cleanNotes` from `wallet-schema.ts`.

**Eligibility** (`shared/lib/eligibility.ts`, pure). `historyContext(wallet, today)` builds the account history:
applications plus wallet cards no open application covers (their open date comes from `openDates`, if set).
`evaluateCard(card, ctx)` checks every rule that applies: each is `eligible`, `blocked` (with `until`, the first day it
clears, and/or `action`, what the user must do; `permanent` for once-per-lifetime) or `unknown` (with `missing`).
`chase524(ctx)` is the 5/24 counter with each card's drop-off day. Month-only dates count to the end of the month
(`dropOffDate`: opened Nov 2024 + 24 months → drops off Dec 1, 2026), so dates are conservative by up to a month.

**Next card** (`/next-card`, `frontend/features/next-card/`). `rankNextCards()` (`shared/lib/next-card.ts`) splits
cards into eligible / unknown / blocked (held and closed-to-applicants cards are left out) and sorts by first-year
value = welcome offer + credits the user ticks as usable − annual fee. Without a history the page ranks eligible and
unknown together. `ApplicationsEditor` (with wallet prefill) and `FiveTwentyFourPanel` are shared with the tracker.
Card pages show `features/cards/eligibility-panel.tsx` ("Can I get it?") inside the welcome-offer box.

**Tracker tabs** (`/tracker?tab=credits|points|certificates|redemptions|applications`, `features/tracker/tracker-tabs.tsx`;
the page wraps it in `<Suspense>` for `useSearchParams`). Points: value at the median valuation (or the user's own),
expiry from the policy (red under 30 days, amber under 90, constants in `shared/lib/trackers.ts`), a nudge after 60
days without an update, and a warning for bank points with no earning card in the wallet. Certificates: sorted by
expiry, mark used, totals. Redemptions: cents per point = (cash − taxes) ÷ points × 100 against the valuation, lifetime
savings and the points-weighted average. `frontend/components/points-vs-cash.tsx` is the reusable "Points or cash?"
calculator (pass `onLog` to offer "Log this redemption").

**Per-browser preferences**: localStorage `perkfolio:strategy:v1` (`frontend/state/strategy-prefs.ts`) holds the
user's own cents-per-point values (`cpp`) and the credits they'd use on cards they don't have (`usable`). Not synced.

Tests: `tests/eligibility.test.ts` (5/24 with drop-off dates, lifetime, family, cooldown, velocity, max-open,
unknowns, ranking), `tests/trackers.test.ts` (dates, expiry tones, certificates, cents per point, points vs cash,
balances, data coverage), `tests/wallet.test.ts` (new fields: parse limits, merges, sync round trip).
