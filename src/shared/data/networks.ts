import type { LoungeNetwork } from "./types";

export interface NetworkInfo {
  label: string;
  short: string;
  /** Badge color */
  color: string;
  description: string;
}

export const loungeNetworks: Record<LoungeNetwork, NetworkInfo> = {
  centurion: {
    label: "Centurion Lounge",
    short: "Centurion",
    color: "#2b2d30",
    description: "American Express's flagship lounges with chef-driven food and premium bars.",
  },
  "amex-international": {
    label: "American Express Lounge",
    short: "Amex Intl",
    color: "#006fcf",
    description: "Amex-branded lounges outside the U.S. (e.g. India, Mexico, Argentina).",
  },
  "delta-sky-club": {
    label: "Delta Sky Club",
    short: "Sky Club",
    color: "#c01933",
    description: "Delta's airport clubs. Card access generally requires a same-day Delta flight.",
  },
  "priority-pass": {
    label: "Priority Pass",
    short: "Priority Pass",
    color: "#4a4f55",
    description: "The largest independent lounge network, 1,700+ locations worldwide. Enrollment required.",
  },
  "capital-one": {
    label: "Capital One Lounge",
    short: "Capital One",
    color: "#d03027",
    description: "Capital One's lounges and Landings, with grab-and-go food and local drinks.",
  },
  "chase-sapphire": {
    label: "Chase Sapphire Lounge",
    short: "Sapphire",
    color: "#0f2a5c",
    description: "Chase Sapphire Lounges by The Club, with full dining and wellness rooms.",
  },
  "plaza-premium": {
    label: "Plaza Premium Lounge",
    short: "Plaza Premium",
    color: "#7a1f3d",
    description: "Global independent lounge brand; accessible with Amex Platinum and often Priority Pass.",
  },
  escape: {
    label: "Escape Lounge",
    short: "Escape",
    color: "#00857c",
    description: "Escape Lounges – The Centurion Studio Partner at several U.S. airports.",
  },
  airspace: {
    label: "Airspace Lounge",
    short: "Airspace",
    color: "#5a4ea0",
    description: "Boutique independent lounges at select U.S. airports.",
  },
  lufthansa: {
    label: "Lufthansa Lounge",
    short: "Lufthansa",
    color: "#05164d",
    description: "Lufthansa lounges; Amex Platinum access when flying Lufthansa Group.",
  },
  "united-club": {
    label: "United Club",
    short: "United Club",
    color: "#005daa",
    description: "United's airport clubs.",
  },
  "admirals-club": {
    label: "Admirals Club",
    short: "Admirals",
    color: "#36495a",
    description: "American Airlines' airport clubs.",
  },
  "alaska-lounge": {
    label: "Alaska Lounge",
    short: "Alaska",
    color: "#01426a",
    description: "Alaska Airlines lounges on the West Coast and beyond.",
  },
  "citi-strata": {
    label: "Citi Lounge",
    short: "Citi",
    color: "#056dae",
    description: "Citi-branded lounges.",
  },
};
