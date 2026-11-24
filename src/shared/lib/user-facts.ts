import type { UserFact } from "@/shared/data/strategy/types";

/**
 * The questions some issuer rules depend on (Bank of America's limits for deposit customers), with how pages word the
 * answers. A module of its own, with no rules data, so the preferences store (frontend/state/strategy-prefs.ts) can
 * check saved answers without pulling the issuer rules into every page that values points. eligibility.ts re-exports it.
 */
export type UserFacts = Partial<Record<UserFact, boolean>>;

export const USER_FACTS: Record<UserFact, { question: string; yes: string; no: string; short: string }> = {
  hasBankOfAmericaDepositAccount: {
    question: "Do you have a Bank of America deposit account, like checking or savings?",
    yes: "you have a Bank of America deposit account",
    no: "you don't have a Bank of America deposit account",
    short: "Bank of America deposit account",
  },
};
