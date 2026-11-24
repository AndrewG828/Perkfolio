<!-- CLAUDE.md section from the claude/cards-trackers branch. Merge into "Frontend" / "Layout" as the integrator sees fit. -->

## Card strategy and trackers

**Strategy data** (`src/shared/data/strategy/`, shapes in `types.ts`): verified research from November 2026, typed
consts in the shape the research JSON uses (additions are marked "Added" in `types.ts`). Facts come only from the
research files; anything they list as rejected, still missing or unconfirmed stays out. To refresh, regenerate the
whole object from new research, keep the export names, keep `asOf`/`lastVerified`/`sources`, and run `npm test`.
- `application-rules.ts` → `applicationRules: { verified, cardTypes, rules }`: 49 rules (32 `official` = the issuer's
  own wording, read on its site; 17 `widely reported` = two or more of The Points Guy, Upgraded Points, NerdWallet and
  Doctor of Credit agree on it: mostly unwritten rules, plus a few issuer texts that couldn't be read, like Amex's
  Platinum, Gold and Blue Cash offer terms and BofA's Atmos terms; `basis` says which). Rule `name`s are display
  titles that match the effect ("Gold: a past Gold or Platinum may cost the bonus", "Same card within 48 months:
  bonus and intro APR may not apply"), so never title a "may" rule "blocked" or "no bonus" (a test checks); ids
  never change. `logic.type`: `max-new-cards`, `velocity` (`windows`, each with `count` and
  `days` or `months`, optional `segments`), `max-open`, `once-per-lifetime` / `family-bonus` / `cooldown` (an OR-list
  of `conditions`: `event`, `products` with `$self`, `otherProducts`, `withinDays`/`withinMonths`, `effect`, `note`)
  and `notice` (nothing to compute). Effects: `ineligible` and `no-bonus` block; `bonus-at-risk` warns;
  `likely-denied` blocks unless the rule is `soft`. `counts` says what a numeric rule counts (issuers, segments,
  `cardTypes`, business cards on personal reports for 5/24, `includeAuthorizedUser`, `brand`, and `mayCount`: cards
  the research leaves open, like Discover cards under Capital One's six months or the Green Card under the Amex cap,
  which count only as "may count" with the research's note as the caveat). A bonus-received condition with
  `includesUpgradeBonuses` (the Brilliant's Chase Marriott window) also covers upgrade offers. `appliesWhen: { userFact, equals }` makes a rule depend
  on an answer (BofA 7/12 vs 3/12). `calendarMonths` (5/24) counts calendar months. `cardTypes` (credit/charge) matters
  for Amex, whose pacing limits count credit cards only. Rules with `appliesTo: []` (Barclays, U.S. Bank, Chase
  Marriott Boundless) cover cards we don't list; the next-card page shows them for reference.
- `other-products.ts`: how to recognize cards the rules name but the dataset doesn't list ("Marriott Bonvoy
  Boundless", "Southwest Rapid Rewards Plus"...) in a card history (issuer + segment + name words), the named cards
  the history editor offers, and labels that stay descriptive ("earlier versions of the card"). A test requires every
  `otherProducts` label of an evaluated rule to be one or the other. A matcher can carry `cardType` (the Schwab and
  Morgan Stanley Platinum and the Premier Rewards Gold are charge cards) and `uncertainIfBusiness` (Chase's "any
  United Club credit card" may or may not include the Business card: the rule warns instead of blocking).
- `expiration.ts` → `expirationPolicies: { verified, programs, missing }`: 41 programs, `rule` = `never` |
  `inactivity` | `fixed-term` | `while-account-open`, with notes on recent and upcoming changes. `change` flags a dated
  change (Aeroplan Nov 30, 2026; Flying Blue May 4, 2026); `expiryResumes` (Aeroplan) moves a deadline that fell during
  the expiry pause to the day it resumes; `caveat` is one sentence from the notes shown on the balance row (every
  fixed-term program has one: elite exemptions, paid extensions, EVA's disputed extensions; also Wyndham's four-year
  cap, IHG and Choice elite status, and inactivity programs whose activity is narrow or disputed: Etihad (flights
  only), Accor, Qatar, Avianca, Finnair, Flying Blue's exemptions, Aeroméxico's unread terms);
  `cardExemption: { card, primary?, afterClosingMonths? }` (World of Hyatt, AAdvantage) means points don't expire while
  the member holds that co-brand card (AAdvantage: as primary cardmember, and four months' grace after closing it).
  `missing`: Thai Royal Orchid Plus (one outlet only).
- `valuations.ts` → `valuations: { verified, unit, datasets, valuations, missing }`: per-outlet November 2026 figures
  (TPG, Upgraded Points, NerdWallet) with `low`/`median`/`high` (`median` is what we use) and the outlet tables in
  `datasets`. `missing`: EVA, TAP, Thai and Virgin Red have no published value, so the UI asks for the user's own.
- `programs.ts`: display names, kinds and units for the 42 bank-currency and program ids, the issuer list for the
  application editor, `programForCard()`, and `programForName()` for history cards we don't list ("AAdvantage Aviator
  Red"). Every program needs a valuation and a policy or a `missing` entry
  (tested).

**Wallet fields** (all optional, still `version: 1`; validated in `parseWallet`, merged in `mergeWallets3`):
- `applications`: cards the user opened, `{ id, issuer, cardId?, name?, opened, business, closed?, bonusEarned?,
  authorizedUser? }`. `opened` and `closed` are `YYYY-MM` or `YYYY-MM-DD` (the day is optional; day windows need it; the
  editor won't take future dates). **`undefined` means "history not set up"**: rules that need it report unknown. `[]`
  means "nothing to add". `bonusEarned` is `YYYY-MM`, or `NO_BONUS` ("none") when the user says there was none;
  **absent means not recorded**, so bonus rules ask, unless the card opened long enough ago: we assume a welcome bonus
  posts within `BONUS_POSTS_WITHIN_MONTHS` (12) of opening and say so in a caveat (never for conditions that cover
  upgrade offers, which can post any time). The editor and the wallet prefill ask "Not sure / No bonus / Earned it in…". `authorizedUser: true` marks
  someone else's account. Cards outside the dataset have `name` (the editor offers the named products from
  `other-products.ts`).
- `balances`: `{ [programId]: { points, updated, lastActivity? } }`.
- `certificates`: `{ id, kind, program?, label, valueUsd?, points?, expires?: date | null, used?, notes? }`.
- `redemptions`: `{ id, date, label, program?, points, taxesUsd, cashPriceUsd, notes? }`.
- Caps live in `WALLET_LIMITS` (150 applications, 100 balances, 100 certificates, 200 redemptions, labels 80 chars,
  notes 160); a maxed-out wallet stays under the 256 KB sync limit (tested). Lists merge three ways by `id`.
- Every change goes through `walletActions`. Form text goes through `cleanLabel` / `cleanNotes`.

**Eligibility** (`shared/lib/eligibility.ts`, pure). `historyContext(wallet, today, facts)` builds the account history
(applications plus wallet cards no open application covers) and carries the user's answers. `evaluateCard(card, ctx)`
checks every rule whose `appliesTo` has the card. Each result is `eligible`, `warning` (soft limit, a bonus the
issuer "may" withhold, or a card that counts only if the rule covers it), `unknown` (with `missing` and the history
entries it's about in `records`, or a `question` when an `appliesWhen` answer would change it; without a card history
the answer can't, so cards don't ask), `blocked` (`until`, `action`, `permanent`; `missing` and a caveat when
an undated card could make it last longer) or `notice` (nothing to check, or events the history can't show: declines,
product changes); `caveats` list what we couldn't check. Authorized-user cards count toward a numeric rule only when
its `counts.includeAuthorizedUser` is true (5/24); `null` (BofA 7/12 and 3/12) makes them "may count" (a warning if
they'd reach the limit); otherwise, and for every product or bonus rule, they aren't the user's own account (a caveat
says so, and `held` ignores them). `counts.brand` (Wells Fargo-branded cards) counts dataset cards surely and cards we
don't list as "may count". Card status: blocked > unknown > warning > eligible; notices
never count. Windows: day windows are exact (`windowEnd`), and a month-only date that straddles one is unknown until
the user adds the day; month windows run through the same day N months later and take a month-only date as its last
day (safe side); 5/24 uses calendar months (opened Oct 2024 → stops counting Nov 1, 2026). `chase524(ctx)` is the 5/24
counter. Cards outside the dataset count by issuer and segment; an Amex card we don't list counts as a credit card,
with a caveat.

**Next card** (`/next-card`, `frontend/features/next-card/`; `?type=business|all` keeps the card-type filter in the URL).
`rankNextCards()` splits cards into eligible / warning / unknown / blocked (held and closed-to-applicants cards are
left out) and sorts by `rankValue`. First-year value = welcome offer + credits the user would use − fee, with the
welcome offer read by `shared/lib/welcome-offer.ts` (points, cash, tiers, "as high as", "offers vary", limited time,
spend) and its points valued like the points tracker: the valuations median or the user's own cents per point
(`cents` option). Tiered offers rank on the first tier (Venture X Business: $40k spend, not $120k). `bonusBasis()`
says whether the ranking counts the bonus: only "counted" offers do; "at-risk" (the issuer may withhold it),
"unconfirmed" (a bonus rule needs something specific, like the month a Venture X bonus posted; a missing history
alone doesn't count) and "varies" ("as high as": the most anyone gets, and no outlet gives a typical amount) rank on
credits − fee, and the row shows what the bonus would add ("Up to $2,605 with the full advertised offer"). "Not yet"
rows show the same, plus the bonus rule. "Needs:" links to the history entry (`#history-<id>` opens its form). The
page shows "Ready to apply", "Check first" (warnings and unknowns), "Not yet" (cards blocked by the same rules for
the same reasons share one block), the 5/24 panel, "About you" (questions a card in the list depends on, unless a
card already asks it) and "How we check". Rule counts read "4 rules · 1 note" (notices apart), on card pages too. On phones the
lists come first. Card pages show the welcome value and, under "Earning rewards", the one value used for the card's
currency (`features/cards/welcome-value.tsx`: the median or the user's own; a cash offer counts at face value).
/about#methodology describes the medians (outlets, month) and lists them next to the card files' earning estimates,
which the calculator, Compare and Which Card? use. `rule-results.tsx` renders results with certainty, effect and soft-limit chips,
caveats, the question, and "More about this rule" (scope, notes, outlet sources with dates, as-of and verified dates).
Card pages show `features/cards/eligibility-panel.tsx` ("Can I get it?").

**Tracker tabs** (`/tracker?tab=credits|points|certificates|redemptions|applications`). Points: value at the median
valuation (or the user's own; "Set your own" where no outlet publishes one), expiry from the policy (red under 30 days,
amber under 90; no date while the user's own co-brand card that stops expiry is open), the policy's caveat, a tappable
chip for dated program changes, a nudge after 60 days without an update, a warning for bank points with no earning
card, and "Where these numbers come from" with every outlet's figure and table month. "Own cards" (`ownCardPrograms`
in `shared/lib/trackers.ts`) are wallet cards and card-history entries, never authorized-user cards. Expired balances
don't count toward the estimated value; the stat is "Expiring or expired". The balance forms say what counts as
activity for the program. On phones the tab bar snaps to tab edges, so a label is never cut at the left. "Points or cash?" asks for the
user's own value when the program has none. Redemption stats compare only the redemptions that have a valuation
with those valuations, and say how many are left out. Expired certificates offer Remove first and count in the
"Expiring or expired" stat.

**Per-browser preferences**: localStorage `perkfolio:strategy:v1` (`frontend/state/strategy-prefs.ts`) holds `cpp`
(own cents-per-point), `usable` (credits they'd use on cards they don't have) and `facts` (answers to rule questions,
keys from `USER_FACTS`). Not synced.

Tests: `tests/eligibility.test.ts` (windows and drop-off, 5/24 with business cards on personal reports, Citi 8/65 in
days, Amex 1/5 and soft 2/90, the Amex cap, Capital One 6 months, BofA 2/3/4 and 7/12 vs 3/12 with the question, the
24-month BofA rule, Amex ladders, Brilliant vs Chase Marriott windows (upgrade offers), Chase families, notices,
unknowns, bonus months not recorded and the posting assumption, authorized-user cards, uncertain scope and the
research's open questions (Discover, the Green Card), undated cards in a block, no question without a history, the
ranking's bonus basis (at risk, unconfirmed, "as high as"), rule names that match the effect, rule-data consistency),
`tests/welcome-offer.test.ts` (every offer parses; values match the tracker's), `tests/trackers.test.ts` (dates,
expiry, Aeroplan's pause, co-brand exemptions from the user's own cards (history-only cards count, authorized-user
cards don't, grace after closing), fixed-term and inactivity caveats, like-for-like redemption stats, missing values
and policies, data coverage), `tests/wallet.test.ts` (application days, bonus and
authorized-user fields, limits, merges, sync round trip).
