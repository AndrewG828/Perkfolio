import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWallets, mergeWallets3 } from "../src/shared/lib/wallet-merge";
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
