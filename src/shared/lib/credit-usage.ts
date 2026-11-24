/**
 * How much of a card's credits someone really uses, as Start here asks it ("Is my card worth its fee?") and the value
 * calculator reads it back from its link (?credits=half): the share of each credit's value that counts.
 */
export const USAGE: Record<string, { label: string; share: number }> = {
  all: { label: "Nearly all of them", share: 0.9 },
  half: { label: "About half", share: 0.5 },
  little: { label: "Hardly any", share: 0.15 },
};
