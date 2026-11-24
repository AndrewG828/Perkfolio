import { test } from "node:test";
import assert from "node:assert/strict";
import { hasWalletData, mergeWallets, mergeWallets3 } from "../src/shared/lib/wallet-merge";
import { parseWallet } from "../src/shared/lib/wallet-schema";
import type { WalletState } from "../src/shared/lib/wallet";

const W = (o: Partial<WalletState> = {}): WalletState => ({ version: 1, cards: [], usage: {}, ignored: {}, ...o });

const base = W({
  cards: ["amex-gold", "amex-platinum"],
  usage: { "amex-gold:dining:2026-11": 10, "amex-platinum:uber:2026-11": 15 },
  ignored: { "amex-platinum:clear": true },
  bonus: { "amex-gold": { target: 6000, spent: 1000, deadline: "2027-01-01" } },
  openDates: { "amex-platinum": "2024-03-01" },
});

test("three-way merge keeps removals and additions from both sides", () => {
  const local = W({ ...base, cards: ["amex-gold"], usage: { "amex-platinum:uber:2026-11": 15 } });
  const remote = W({ ...base, cards: [...base.cards, "venture-x"], usage: { ...base.usage, "venture-x:travel:2026": 300 } });
  const m = mergeWallets3(base, local, remote);
  assert.deepEqual(m.cards, ["amex-gold", "venture-x"]);
  assert.deepEqual(m.usage, { "amex-platinum:uber:2026-11": 15, "venture-x:travel:2026": 300 });
  assert.deepEqual(m.ignored, { "amex-platinum:clear": true });
});

test("un-ignoring and edits on one side win over an untouched side", () => {
  assert.deepEqual(mergeWallets3(base, W({ ...base, ignored: {} }), base).ignored, {});
  assert.deepEqual(mergeWallets3(base, W({ ...base, openDates: { "amex-platinum": "2024-05-01" } }), base).openDates, {
    "amex-platinum": "2024-05-01",
  });
});

test("true conflicts on amounts keep the larger value", () => {
  const l = W({ ...base, usage: { ...base.usage, "amex-gold:dining:2026-11": 5 } });
  const r = W({ ...base, usage: { ...base.usage, "amex-gold:dining:2026-11": 8 } });
  assert.equal(mergeWallets3(base, l, r).usage["amex-gold:dining:2026-11"], 8);
});

test("merge with no shared history unions cards and keeps the larger amounts", () => {
  const m = mergeWallets(W({ cards: ["a"], usage: { "x:y:1": 1 } }), W({ cards: ["b"], usage: { "x:y:1": 4, "y:z:1": 2 } }));
  assert.deepEqual(m.cards, ["b", "a"]);
  assert.deepEqual(m.usage, { "x:y:1": 4, "y:z:1": 2 });
});

test("parseWallet accepts real wallets and strips unknown fields", () => {
  const parsed = parseWallet({ ...base, tally: { "amex-gold:dining-cap:my-2026": 500 }, updatedAt: 5, evil: "x" });
  assert.ok(parsed);
  assert.equal((parsed as unknown as Record<string, unknown>).evil, undefined);
  assert.equal(parsed.tally?.["amex-gold:dining-cap:my-2026"], 500);
});

test("parseWallet rejects hostile or malformed input", () => {
  const bad: unknown[] = [
    null,
    "wallet",
    { cards: "amex-gold", usage: {} },
    { cards: ["<script>alert(1)</script>"], usage: {} },
    { cards: [], usage: JSON.parse('{"__proto__": 5}') },
    { cards: [], usage: { "a:b:1": -1 } },
    { cards: [], usage: { "a:b:1": 1e300 } },
    { cards: [], usage: { "a:b:1": "10" } },
    { cards: [], usage: {}, ignored: { "a:b": "yes" } },
    { cards: [], usage: {}, openDates: { "amex-gold": "tomorrow" } },
    { cards: [], usage: {}, bonus: { "amex-gold": { target: 1, spent: 0 } } },
    { cards: Array.from({ length: 201 }, (_, i) => `c${i}`), usage: {} },
  ];
  for (const b of bad) assert.equal(parseWallet(b), null, JSON.stringify(b));
});

// --- Applications, balances, certificates and redemptions --------------------------------------------------------

const rich = W({
  ...base,
  applications: [
    { id: "app-1", issuer: "Chase", cardId: "chase-sapphire-preferred", opened: "2025-03", business: false, bonusEarned: "2025-05" },
    { id: "app-2", issuer: "Barclays", name: "AAdvantage Aviator", opened: "2024-01", business: false, closed: "2025-02" },
  ],
  balances: {
    "chase-ur": { points: 120_000, updated: "2026-11-01" },
    "american-aadvantage": { points: 40_000, updated: "2026-10-01", lastActivity: "2025-06-01" },
  },
  certificates: [
    { id: "c-1", kind: "free-night", program: "world-of-hyatt", label: "Cat 1-4 night", valueUsd: 250, expires: "2027-02-01" },
    { id: "c-2", kind: "companion", program: "delta-skymiles", label: "Companion cert", expires: null, used: true, notes: "LAX-JFK\nMain cabin" },
  ],
  redemptions: [
    { id: "r-1", date: "2026-05-02", label: "Tokyo in business", program: "united-mileageplus", points: 88_000, taxesUsd: 56, cashPriceUsd: 4200 },
  ],
});

test("parseWallet keeps the new fields, and older wallets don't gain them", () => {
  const parsed = parseWallet(JSON.parse(JSON.stringify(rich)));
  assert.ok(parsed);
  assert.deepEqual(parsed.applications, rich.applications);
  assert.deepEqual(parsed.balances, rich.balances);
  assert.deepEqual(parsed.certificates, rich.certificates);
  assert.deepEqual(parsed.redemptions, rich.redemptions);
  const old = parseWallet({ cards: ["amex-gold"], usage: {} });
  assert.ok(old);
  for (const k of ["applications", "balances", "certificates", "redemptions"]) assert.equal(k in old, false, k);
  // An empty application list is kept: it means "nothing to add", not "not set up".
  assert.deepEqual(parseWallet({ cards: [], usage: {}, applications: [] })?.applications, []);
});

test("parseWallet enforces list caps, text limits and field formats on the new fields", () => {
  const app = rich.applications![0];
  const certificate = rich.certificates![0];
  const redemption = rich.redemptions![0];
  const many = <T,>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));
  const bad: unknown[] = [
    { applications: many(151, (i) => ({ ...app, id: `a${i}` })) },
    { applications: [{ ...app, opened: "2025-13" }] },
    { applications: [{ ...app, opened: "March 2025" }] },
    { applications: [{ ...app, closed: "2024-01" }] }, // closed before opened
    { applications: [{ ...app, business: "no" }] },
    { applications: [{ ...app, issuer: "" }] },
    { applications: [{ ...app, issuer: "x".repeat(41) }] },
    { applications: [{ ...app, name: "y".repeat(81) }] },
    { applications: [{ ...app, id: "bad id!" }] },
    { applications: [{ ...app, cardId: "<b>" }] },
    { applications: "chase" },
    { balances: { "chase-ur": { points: -1, updated: "2026-11-01" } } },
    { balances: { "chase-ur": { points: 2e9, updated: "2026-11-01" } } },
    { balances: { "chase-ur": { points: 1, updated: "yesterday" } } },
    { balances: JSON.parse('{"__proto__": {"points": 1, "updated": "2026-11-01"}}') },
    { balances: { "Chase UR": { points: 1, updated: "2026-11-01" } } },
    { balances: Object.fromEntries(many(101, (i) => [`p${i}`, { points: 1, updated: "2026-11-01" }])) },
    { certificates: [{ ...certificate, kind: "coupon" }] },
    { certificates: [{ ...certificate, label: "" }] },
    { certificates: [{ ...certificate, label: "tab\there" }] },
    { certificates: [{ ...certificate, notes: "z".repeat(161) }] },
    { certificates: [{ ...certificate, expires: "soon" }] },
    { certificates: [{ ...certificate, valueUsd: Infinity }] },
    { certificates: many(101, (i) => ({ ...certificate, id: `c${i}` })) },
    { redemptions: [{ ...redemption, points: "88000" }] },
    { redemptions: [{ ...redemption, taxesUsd: -5 }] },
    { redemptions: [{ ...redemption, date: "2026-02-30x" }] },
    { redemptions: many(201, (i) => ({ ...redemption, id: `r${i}` })) },
  ];
  for (const b of bad) assert.equal(parseWallet({ cards: [], usage: {}, ...(b as object) }), null, JSON.stringify(b).slice(0, 120));
  // Duplicate ids keep the first copy instead of failing the whole wallet.
  const dup = parseWallet({ cards: [], usage: {}, redemptions: [redemption, { ...redemption, label: "Copy" }] });
  assert.deepEqual(dup?.redemptions?.map((r) => r.label), ["Tokyo in business"]);
  // Unknown item fields are stripped.
  const stripped = parseWallet({ cards: [], usage: {}, certificates: [{ ...certificate, evil: 1 }] });
  assert.equal((stripped?.certificates?.[0] as unknown as Record<string, unknown>).evil, undefined);
});

test("a maxed-out wallet of realistic items stays under the 256 KB sync limit", () => {
  const big = W({
    applications: Array.from({ length: 150 }, (_, i) => ({ id: crypto.randomUUID(), issuer: "Bank of America", cardId: `some-card-id-${i}`, name: "A card with a fairly long product name", opened: "2025-03", business: false, closed: "2026-01", bonusEarned: "2025-05" })),
    balances: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`program-id-number-${i}`, { points: 123_456_789, updated: "2026-11-01", lastActivity: "2026-10-01" }])),
    certificates: Array.from({ length: 100 }, () => ({ id: crypto.randomUUID(), kind: "free-night" as const, program: "marriott-bonvoy", label: "x".repeat(80), valueUsd: 1234.56, points: 85_000, expires: "2027-01-01", used: false, notes: "n".repeat(160) })),
    redemptions: Array.from({ length: 200 }, () => ({ id: crypto.randomUUID(), date: "2026-01-01", label: "x".repeat(80), program: "air-france-klm-flying-blue", points: 123_456, taxesUsd: 1234.56, cashPriceUsd: 9876.54, notes: "n".repeat(160) })),
  });
  assert.ok(parseWallet(big));
  assert.ok(JSON.stringify({ data: big, base: 1 }).length < 256 * 1024, String(JSON.stringify(big).length));
});

test("lists merge three ways by id: adds from both sides, deletes only when the other side didn't edit", () => {
  const [c1, c2] = rich.certificates!;
  // Local adds one and deletes c2; remote adds another and leaves c2 alone.
  const local = W({ ...rich, certificates: [c1, { id: "c-3", kind: "voucher", label: "Upgrade" }] });
  const remote = W({ ...rich, certificates: [c1, c2, { id: "c-4", kind: "gift-card", label: "Gift card", valueUsd: 50 }] });
  const m = mergeWallets3(rich, local, remote);
  assert.deepEqual(m.certificates?.map((c) => c.id).sort(), ["c-1", "c-3", "c-4"]);

  // Local deletes c2 but remote edited it meanwhile: the edit wins.
  const edited = W({ ...rich, certificates: [c1, { ...c2, notes: "Booked" }] });
  assert.deepEqual(mergeWallets3(rich, W({ ...rich, certificates: [c1] }), edited).certificates?.find((c) => c.id === "c-2")?.notes, "Booked");

  // Both edit different fields of the same item: both changes survive. Same field: this device wins.
  const l = W({ ...rich, certificates: [{ ...c1, used: true }, c2] });
  const r = W({ ...rich, certificates: [{ ...c1, notes: "Park Hyatt" }, c2] });
  const both = mergeWallets3(rich, l, r).certificates?.find((c) => c.id === "c-1");
  assert.equal(both?.used, true);
  assert.equal(both?.notes, "Park Hyatt");
  const same = mergeWallets3(rich, W({ ...rich, certificates: [{ ...c1, label: "Mine" }, c2] }), W({ ...rich, certificates: [{ ...c1, label: "Theirs" }, c2] }));
  assert.equal(same.certificates?.find((c) => c.id === "c-1")?.label, "Mine");
});

test("merged list items always pass the schema (a field merge that breaks a rule falls back to this device)", () => {
  const a = rich.applications![1]; // opened 2024-01, closed 2025-02
  const local = W({ ...rich, applications: [rich.applications![0], { ...a, opened: "2025-01" }] }); // still before closed
  const remote = W({ ...rich, applications: [rich.applications![0], { ...a, closed: "2024-06" }] }); // still after opened
  const merged = mergeWallets3(rich, local, remote);
  // Field by field would give opened 2025-01 + closed 2024-06 (closed before opened): keep the local copy instead.
  assert.deepEqual(merged.applications?.find((x) => x.id === a.id), { ...a, opened: "2025-01" });
  assert.ok(parseWallet(merged));
});

test("balances merge per program; when both sides changed one, the more recently updated wins", () => {
  const l = W({ ...rich, balances: { ...rich.balances, "chase-ur": { points: 125_000, updated: "2026-11-10" } } });
  const r = W({ ...rich, balances: { ...rich.balances, "chase-ur": { points: 90_000, updated: "2026-11-20" }, "amex-mr": { points: 5, updated: "2026-11-20" } } });
  const m = mergeWallets3(rich, l, r);
  assert.equal(m.balances?.["chase-ur"].points, 90_000);
  assert.equal(m.balances?.["amex-mr"].points, 5);
  // Removing a balance on one side carries over when the other side didn't touch it.
  const removed = { ...rich.balances };
  delete removed["american-aadvantage"];
  assert.equal(mergeWallets3(rich, W({ ...rich, balances: removed }), rich).balances?.["american-aadvantage"], undefined);
});

test("merging wallets that never had the new fields leaves them out", () => {
  const m = mergeWallets3(base, W({ ...base }), W({ ...base, cards: ["amex-gold"] }));
  for (const k of ["applications", "balances", "certificates", "redemptions"]) assert.equal(k in m, false, k);
  // One side starting its history is enough to keep it, and an import (no shared base) unions the lists.
  assert.deepEqual(mergeWallets3(base, W({ ...base, applications: [] }), base).applications, []);
  const imported = mergeWallets(W({ redemptions: rich.redemptions }), W({ redemptions: [{ ...rich.redemptions![0], id: "r-2" }] }));
  assert.deepEqual(imported.redemptions?.map((x) => x.id).sort(), ["r-1", "r-2"]);
});

test("cloud sync carries the new fields unchanged (server parse, then a merge with nothing new remotely)", () => {
  const local = W({ ...rich, updatedAt: 1764000000000 });
  // What the server stores and later returns: only parseWallet's output.
  const stored = parseWallet(JSON.parse(JSON.stringify({ data: local }))?.data);
  assert.ok(stored);
  const merged = mergeWallets3(stored, local, stored);
  for (const k of ["applications", "balances", "certificates", "redemptions"] as const) {
    assert.deepEqual(stored[k], local[k], `stored ${k}`);
    assert.deepEqual(merged[k], local[k], `merged ${k}`);
  }
  assert.ok(hasWalletData(W({ balances: { "chase-ur": { points: 1, updated: "2026-11-01" } } })));
  assert.ok(hasWalletData(W({ applications: [] })));
  assert.equal(hasWalletData(W()), false);
});
