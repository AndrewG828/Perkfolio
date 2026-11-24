"use client";

import { useSyncExternalStore } from "react";
import type { UserFact } from "@/shared/data/strategy/types";
import { USER_FACTS, type UserFacts } from "@/shared/lib/eligibility";

/**
 * Small per-browser preferences for the points tracker and the next-card ranking, kept in localStorage
 * `perkfolio:strategy:v1` (not synced; the wallet holds everything that must follow the user):
 * - `cpp`: the user's own cents-per-point for a program, overriding the published median on every page (read through
 *   useValueContext() in ./point-values.ts and shared/lib/point-value.ts);
 * - `usable`: credits on cards they don't have yet that they'd actually use, keyed `${cardId}:${creditId}`;
 * - `facts`: answers to the questions some issuer rules depend on (USER_FACTS in shared/lib/eligibility), like
 *   whether they have a Bank of America deposit account.
 */
export interface StrategyPrefs {
  cpp: Record<string, number>;
  usable: Record<string, true>;
  facts: UserFacts;
}

const KEY = "perkfolio:strategy:v1";
const EMPTY: StrategyPrefs = { cpp: {}, usable: {}, facts: {} };
const PROGRAM = /^[a-z0-9][a-z0-9-]{0,79}$/;
const USABLE = /^[a-z0-9][a-z0-9-]{0,79}:[a-z0-9][a-z0-9-]{0,79}$/;

let state: StrategyPrefs = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function clean(x: unknown): StrategyPrefs {
  if (typeof x !== "object" || x === null) return EMPTY;
  const { cpp, usable, facts } = x as Partial<Record<keyof StrategyPrefs, unknown>>;
  const out: StrategyPrefs = { cpp: {}, usable: {}, facts: {} };
  if (typeof cpp === "object" && cpp !== null) {
    for (const [k, v] of Object.entries(cpp)) if (PROGRAM.test(k) && typeof v === "number" && v > 0 && v <= 100) out.cpp[k] = v;
  }
  if (typeof usable === "object" && usable !== null) {
    for (const [k, v] of Object.entries(usable)) if (USABLE.test(k) && v === true) out.usable[k] = true;
  }
  if (typeof facts === "object" && facts !== null) {
    for (const [k, v] of Object.entries(facts)) if (Object.hasOwn(USER_FACTS, k) && typeof v === "boolean") out.facts[k as UserFact] = v;
  }
  return out;
}

function read() {
  try {
    state = clean(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    state = EMPTY;
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  read();
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    read();
    listeners.forEach((l) => l());
  });
}

function update(fn: (s: StrategyPrefs) => StrategyPrefs) {
  load();
  state = fn(state);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode without storage: keep it for this page view.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  load();
  return state;
}

export function useStrategyPrefs(): StrategyPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export const strategyPrefs = {
  /** Sets the user's cents-per-point for a program, or clears it with null. */
  setCpp(programId: string, cents: number | null) {
    if (!PROGRAM.test(programId)) return;
    update((s) => {
      const cpp = { ...s.cpp };
      if (cents === null || !(cents > 0) || cents > 100) delete cpp[programId];
      else cpp[programId] = Math.round(cents * 100) / 100;
      return { ...s, cpp };
    });
  },
  /** Records the user's answer to a rule question, or forgets it with null. */
  setFact(fact: UserFact, value: boolean | null) {
    if (!Object.hasOwn(USER_FACTS, fact)) return;
    update((s) => {
      const facts = { ...s.facts };
      if (value === null) delete facts[fact];
      else facts[fact] = value;
      return { ...s, facts };
    });
  },
  /** Marks credits on a card as ones the user would (or wouldn't) use. */
  setUsable(cardId: string, creditIds: string[], on: boolean) {
    update((s) => {
      const usable = { ...s.usable };
      for (const id of creditIds) {
        const k = `${cardId}:${id}`;
        if (!USABLE.test(k)) continue;
        if (on) usable[k] = true;
        else delete usable[k];
      }
      return { ...s, usable };
    });
  },
};
