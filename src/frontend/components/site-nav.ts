import {
  ArrowLeftRight,
  BadgeDollarSign,
  BedDouble,
  Briefcase,
  Calculator,
  Coins,
  Columns3,
  Compass,
  CreditCard,
  FileCheck,
  History,
  Landmark,
  LayoutGrid,
  Plane,
  Receipt,
  Ruler,
  ScrollText,
  Sparkles,
  Star,
  Target,
  Ticket,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * The site's menus: the header's groups, the strip above it and the footer. `tests/navigation.test.ts` checks that every
 * link here has a page and that every page under src/app is linked here or from a parent page that is.
 */

export type NavItem = { href: string; label: string; blurb: string; icon: LucideIcon };
export type NavGroup = {
  label: string;
  /** Path prefixes that make this group the active one. */
  match: string[];
  /** A plain link (no menu). */
  href?: string;
  items?: NavItem[];
};
export type NavLink = { href: string; label: string };

export const NAV: NavGroup[] = [
  { label: "Lounges", href: "/lounges", match: ["/lounges"] },
  {
    label: "Points & Miles",
    match: ["/points"],
    items: [
      { href: "/points", label: "Overview", blurb: "What your points are worth and where they can go", icon: Sparkles },
      { href: "/points/sweet-spots", label: "Sweet spots", blurb: "Award flights and hotel nights that stretch points furthest", icon: Star },
      { href: "/points/transfers", label: "Transfer partners", blurb: "Every bank-to-airline and hotel ratio, plus current bonuses", icon: ArrowLeftRight },
      { href: "/points/programs", label: "Programs", blurb: "Airline and hotel loyalty programs, explained", icon: Landmark },
      { href: "/points/airlines", label: "Who can book", blurb: "Which programs book a given airline's award seats", icon: Plane },
      { href: "/points/booking-rules", label: "Booking rules", blurb: "Holds, changes, stopovers and fees by program", icon: ScrollText },
    ],
  },
  {
    label: "Cards",
    match: ["/cards", "/compare", "/best-card", "/next-card", "/calculator"],
    items: [
      { href: "/cards", label: "Explore cards", blurb: "Fees, credits and lounge access for every card we track", icon: CreditCard },
      { href: "/compare", label: "Compare", blurb: "Put cards side by side", icon: Columns3 },
      { href: "/best-card", label: "Which card to use", blurb: "The best card in your wallet for each purchase", icon: Target },
      { href: "/next-card", label: "Your next card", blurb: "Ranked for you, with issuer application rules checked", icon: TrendingUp },
      { href: "/calculator", label: "Value calculator", blurb: "Does the annual fee pay for itself?", icon: Calculator },
    ],
  },
  {
    label: "Tracker",
    match: ["/tracker"],
    items: [
      { href: "/tracker", label: "Credits", blurb: "Statement credits, caps and lounge visits", icon: BadgeDollarSign },
      { href: "/tracker?tab=points", label: "Points balances", blurb: "Balances and when they expire", icon: Coins },
      { href: "/tracker?tab=certificates", label: "Certificates", blurb: "Free nights and companion fares before they lapse", icon: Ticket },
      { href: "/tracker?tab=redemptions", label: "Redemptions", blurb: "What you booked and what each point got you", icon: Receipt },
      { href: "/tracker?tab=applications", label: "Applications", blurb: "Your card history and 5/24 count", icon: History },
    ],
  },
  {
    label: "Tools",
    match: ["/tools", "/start"],
    items: [
      { href: "/start", label: "Start here", blurb: "A short guided path for what you want to do", icon: Compass },
      { href: "/tools/distance", label: "Flight distance", blurb: "Miles between airports, for distance-based award charts", icon: Ruler },
      { href: "/tools/baggage", label: "Baggage fees", blurb: "Checked bag fees and which cards waive them", icon: Briefcase },
      { href: "/tools/entry-requirements", label: "Entry requirements", blurb: "Visas and entry rules for U.S. passport holders", icon: FileCheck },
      { href: "/tools/hotel-points", label: "Hotel points", blurb: "What a stay earns with each chain and card", icon: BedDouble },
      { href: "/tools", label: "All tools", blurb: "Everything in one place", icon: LayoutGrid },
    ],
  },
];

/** The strip above the header (md and up). */
export const TOP_LINKS: NavLink[] = [
  { href: "/start", label: "New here? Start here" },
  { href: "/about", label: "About our data" },
  { href: "/tracker", label: "My Wallet" },
];

export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: "Lounges & travel",
    links: [
      { href: "/lounges", label: "Lounge finder" },
      { href: "/start", label: "Start here" },
      { href: "/tools/distance", label: "Flight distance" },
      { href: "/tools/baggage", label: "Baggage fees" },
      { href: "/tools/entry-requirements", label: "Entry requirements" },
      { href: "/tools/hotel-points", label: "Hotel points" },
      { href: "/tools", label: "All tools" },
    ],
  },
  {
    title: "Points & miles",
    links: [
      { href: "/points", label: "Overview" },
      { href: "/points/sweet-spots", label: "Sweet spots" },
      { href: "/points/transfers", label: "Transfer partners" },
      { href: "/points/programs", label: "Programs" },
      { href: "/points/airlines", label: "Who can book" },
      { href: "/points/booking-rules", label: "Booking rules" },
    ],
  },
  {
    title: "Cards",
    links: [
      { href: "/cards", label: "Explore cards" },
      { href: "/compare", label: "Compare cards" },
      { href: "/best-card", label: "Which card should I use?" },
      { href: "/next-card", label: "Your next card" },
      { href: "/calculator", label: "Value calculator" },
      { href: "/tracker", label: "Benefits tracker" },
    ],
  },
  {
    title: "Perkfolio",
    links: [
      { href: "/about", label: "About our data" },
      { href: "/about#methodology", label: "Point valuations" },
      { href: "/about#points-data", label: "Points & miles sources" },
      { href: "/about#photos", label: "Photo credits" },
      { href: "/about#disclaimer", label: "Disclaimer" },
    ],
  },
];

/** Whether a group's section is the current page's. */
export const groupActive = (g: NavGroup, pathname: string) => g.match.some((p) => pathname === p || pathname.startsWith(p + "/"));
