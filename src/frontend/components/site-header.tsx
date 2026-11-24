"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowLeftRight,
  BadgeDollarSign,
  BedDouble,
  Briefcase,
  Calculator,
  ChevronDown,
  Coins,
  Columns3,
  Compass,
  CreditCard,
  FileCheck,
  History,
  Landmark,
  LayoutGrid,
  Menu,
  Plane,
  Receipt,
  Ruler,
  ScrollText,
  Sparkles,
  Star,
  Target,
  Ticket,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./logo";
import { AccountMenu } from "./account-menu";
import { useWallet } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";

type NavItem = { href: string; label: string; blurb: string; icon: LucideIcon };
type NavGroup = {
  label: string;
  /** Path prefixes that make this group the active one. */
  match: string[];
  /** A plain link (no menu). */
  href?: string;
  items?: NavItem[];
};

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

const groupActive = (g: NavGroup, pathname: string) =>
  g.match.some((p) => pathname === p || pathname.startsWith(p + "/"));

/** One desktop menu: a button that opens a panel of links (click, hover with a mouse, or the keyboard). */
function DesktopMenu({
  group,
  active,
  open,
  onOpen,
  onClose,
}: {
  group: NavGroup;
  active: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When hovering just opened the menu, the click that usually follows shouldn't close it again.
  const hoverOpenedAt = useRef(0);

  const clearTimer = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  useEffect(() => {
    const timer = hoverTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const focusItem = (index: number) => {
    const links = panel.current?.querySelectorAll<HTMLAnchorElement>("a");
    if (!links?.length) return;
    links[(index + links.length) % links.length].focus();
  };

  const onButtonKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onOpen();
      requestAnimationFrame(() => focusItem(0));
    }
  };

  const onPanelKey = (e: ReactKeyboardEvent) => {
    const links = Array.from(panel.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(at + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(at - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      button.current?.focus();
    }
  };

  return (
    <div
      className="relative flex h-full items-stretch"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimer();
        hoverTimer.current = setTimeout(() => {
          hoverOpenedAt.current = performance.now();
          onOpen();
        }, 60);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimer();
        hoverTimer.current = setTimeout(onClose, 160);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (!open) onOpen();
          else if (performance.now() - hoverOpenedAt.current > 600) onClose();
        }}
        onKeyDown={onButtonKey}
        className={cn(
          "relative flex items-center gap-1 px-2.5 text-[14px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
          active || open ? "text-brand" : "text-ink hover:text-brand",
        )}
      >
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        <span className={cn("absolute inset-x-2.5 bottom-0 h-[3px] rounded-t bg-brand transition-opacity", active ? "opacity-100" : "opacity-0")} />
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!open}
        onKeyDown={onPanelKey}
        className="absolute top-full left-0 z-50 -mt-px w-[23rem] rounded-b-lg border border-line bg-white p-2 shadow-[0_18px_40px_-12px_rgba(0,23,90,0.28)]"
      >
        <ul className="space-y-0.5">
          {group.items?.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className="group flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-sky focus-visible:bg-sky focus-visible:outline-none"
              >
                <item.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-navy">{item.label}</span>
                  <span className="block text-[12.5px] leading-snug text-ink-2">{item.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const wallet = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close menus on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(null);
    setMobileOpen(false);
  }

  // Escape and clicks outside close the open desktop menu.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="hidden bg-navy text-[12px] text-white/80 md:block">
        <div className="container-page flex h-8 items-center justify-between">
          <span>Independent card research · Terms verified November 2026</span>
          <span className="flex gap-5">
            <Link href="/start" className="hover:text-white">New here? Start here</Link>
            <Link href="/about" className="hover:text-white">About our data</Link>
            <Link href="/tracker" className="hover:text-white">My Wallet</Link>
          </span>
        </div>
      </div>
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav ref={navRef} className="hidden h-full items-stretch lg:flex" aria-label="Primary">
          {NAV.map((g) => {
            const active = groupActive(g, pathname);
            if (!g.items) {
              return (
                <Link
                  key={g.label}
                  href={g.href!}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center px-2.5 text-[14px] font-medium whitespace-nowrap transition-colors",
                    active ? "text-brand" : "text-ink hover:text-brand",
                  )}
                >
                  {g.label}
                  <span className={cn("absolute inset-x-2.5 bottom-0 h-[3px] rounded-t bg-brand transition-opacity", active ? "opacity-100" : "opacity-0")} />
                </Link>
              );
            }
            return (
              <DesktopMenu
                key={g.label}
                group={g}
                active={active}
                open={menu === g.label}
                onOpen={() => setMenu(g.label)}
                onClose={() => setMenu((m) => (m === g.label ? null : m))}
              />
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <AccountMenu />
          <Link href="/tracker" className="btn-primary hidden whitespace-nowrap sm:inline-flex">
            <Wallet className="h-4 w-4" />
            My Wallet
            {wallet.cards.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 text-xs">{wallet.cards.length}</span>
            )}
          </Link>
          <button
            className="grid h-10 w-10 place-items-center rounded text-navy hover:bg-sky lg:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-white lg:hidden" aria-label="Mobile">
          <div className="container-page py-2">
            {NAV.map((g) =>
              g.items ? (
                <details key={g.label} open={groupActive(g, pathname)} className="group border-b border-line last:border-b-0">
                  <summary
                    className={cn(
                      "flex cursor-pointer list-none items-center justify-between px-2 py-3 text-base font-semibold [&::-webkit-details-marker]:hidden",
                      groupActive(g, pathname) ? "text-brand" : "text-navy",
                    )}
                  >
                    {g.label}
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="grid gap-x-4 pb-3 sm:grid-cols-2">
                    {g.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 rounded px-2 py-2.5 text-[15px] text-ink hover:bg-sky"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <Link
                  key={g.label}
                  href={g.href!}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "block border-b border-line px-2 py-3 text-base font-semibold",
                    groupActive(g, pathname) ? "text-brand" : "text-navy",
                  )}
                >
                  {g.label}
                </Link>
              ),
            )}
            <Link
              href="/tracker"
              onClick={() => setMobileOpen(false)}
              className="btn-primary mt-3 mb-2 w-full justify-center sm:hidden"
            >
              <Wallet className="h-4 w-4" />
              My Wallet
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
