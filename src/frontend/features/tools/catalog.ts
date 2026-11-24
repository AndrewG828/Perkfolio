import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Armchair,
  BedDouble,
  Calculator,
  CalendarClock,
  Coins,
  Compass,
  CreditCard,
  Landmark,
  Luggage,
  Plane,
  Route,
  Scale,
  ScrollText,
  Sparkles,
  Stamp,
  Trophy,
} from "lucide-react";

/** Every tool on the site, for the /tools index and the Start here wizard's results. */

export type ToolGroup = "trip" | "points" | "cards";

export interface Tool {
  href: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  group: ToolGroup;
  /** A "New" badge: keep it to two or three tools worth pointing at, so it still means something. */
  isNew?: boolean;
}

export const TOOL_GROUPS: { id: ToolGroup; title: string; blurb: string }[] = [
  { id: "trip", title: "Plan and take a trip", blurb: "Before you book, before you pack, and once you're at the airport." },
  { id: "points", title: "Points and miles", blurb: "What your points are worth and the awards that stretch them furthest." },
  { id: "cards", title: "Pick and use your cards", blurb: "Choose the right card, then get every dollar of value from it." },
];

export const START_TOOL: Tool = {
  href: "/start",
  title: "Start here",
  blurb: "Answer a few one-tap questions and we'll open the right tool, already filled in.",
  icon: Compass,
  group: "trip",
  isNew: true,
};

export const TOOLS: Tool[] = [
  { href: "/lounges", title: "Lounge finder", blurb: "Every lounge we cover, marked with the ones your cards open, with terminal maps at the big airports.", icon: Armchair, group: "trip" },
  { href: "/tools/distance", title: "Flight distance", blurb: "Great-circle miles and flight time for any route, with up to three stops.", icon: Route, group: "trip" },
  { href: "/tools/entry-requirements", title: "Entry requirements", blurb: "Visas and travel authorizations for U.S. passport holders, by country.", icon: Stamp, group: "trip", isNew: true },
  { href: "/tools/baggage", title: "Baggage fees", blurb: "Official bag pages, U.S. checked-bag fees and award-ticket rules.", icon: Luggage, group: "trip" },
  { href: "/tools/hotel-points", title: "Hotel points", blurb: "What a paid stay earns in hotel and card points, and what it's worth.", icon: BedDouble, group: "trip", isNew: true },
  { href: "/points", title: "Points overview", blurb: "What each points currency is worth and the best ways to use it.", icon: Coins, group: "points" },
  { href: "/points/sweet-spots", title: "Award sweet spots", blurb: "Awards that cost far fewer points than the cash fare suggests.", icon: Sparkles, group: "points", isNew: true },
  { href: "/points/transfers", title: "Transfer partners", blurb: "Where each bank's points transfer, at what ratio and how fast.", icon: ArrowLeftRight, group: "points" },
  { href: "/points/programs", title: "Loyalty programs", blurb: "How each airline and hotel program prices awards, and what it's good for.", icon: Landmark, group: "points" },
  { href: "/points/airlines", title: "Who can book", blurb: "Pick an airline and see which programs book its award seats, and from which banks.", icon: Plane, group: "points" },
  { href: "/points/booking-rules", title: "Booking rules", blurb: "Holds, stopovers, change and phone fees, and how far ahead each program books.", icon: ScrollText, group: "points" },
  { href: "/best-card", title: "Which card to use", blurb: "The card in your wallet that earns the most on each purchase.", icon: Trophy, group: "cards" },
  { href: "/next-card", title: "Your next card", blurb: "The best card to add next, with issuer rules like Chase 5/24.", icon: CreditCard, group: "cards" },
  { href: "/calculator", title: "Value calculator", blurb: "What each card earns you after its annual fee, for your spending.", icon: Calculator, group: "cards" },
  { href: "/compare", title: "Compare cards", blurb: "Fees, earn rates, credits and lounge access, side by side.", icon: Scale, group: "cards" },
  { href: "/tracker", title: "Benefits tracker", blurb: "Credits, caps and lounge visits in one place, so nothing goes unused.", icon: CalendarClock, group: "cards" },
];

/** The tool a link opens (longest matching path), for its icon. */
export function toolFor(href: string): Tool | undefined {
  const path = href.split(/[?#]/)[0];
  return [START_TOOL, ...TOOLS]
    .filter((t) => path === t.href || path.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
