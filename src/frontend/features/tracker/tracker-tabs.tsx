"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Coins, CreditCard, History, Receipt, Ticket, type LucideIcon } from "lucide-react";
import { useWallet } from "@/frontend/state/wallet-store";
import { chase524, historyContext } from "@/shared/lib/eligibility";
import { certificateStatus, type ExpiryTone } from "@/shared/lib/trackers";
import { cn } from "@/shared/lib/format";
import { PointsTab, balanceStatuses } from "./points-tab";
import { CertificatesTab } from "./certificates-tab";
import { RedemptionsTab } from "./redemptions-tab";
import { ApplicationsTab } from "./applications-tab";

export type TrackerTab = "credits" | "points" | "certificates" | "redemptions" | "applications";

const TABS: { id: TrackerTab; label: string; icon: LucideIcon }[] = [
  { id: "credits", label: "Credits", icon: CreditCard },
  { id: "points", label: "Points", icon: Coins },
  { id: "certificates", label: "Certificates", icon: Ticket },
  { id: "redemptions", label: "Redemptions", icon: Receipt },
  { id: "applications", label: "Applications", icon: History },
];

const parseTab = (v: string | null): TrackerTab => TABS.find((t) => t.id === v)?.id ?? "credits";
export const trackerHref = (tab: TrackerTab) => (tab === "credits" ? "/tracker" : `/tracker?tab=${tab}`);

/** Tab bar + the active tab, from `?tab=` (credits when absent). Needs a Suspense boundary (useSearchParams). */
export function TrackerTabs({ credits }: { credits: ReactNode }) {
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));
  const wallet = useWallet();
  const [now] = useState(() => new Date());

  const badges = useMemo<Badges>(() => {
    const open = (wallet.certificates ?? []).filter((c) => !c.used);
    // Only dated expiries raise the dot (not, say, bank points with no earning card).
    const balanceTones = [...balanceStatuses(wallet, now).values()].map((st) => (st.kind === "date" ? st.tone : undefined));
    const counter = chase524(historyContext(wallet, now));
    return {
      counts: {
        credits: wallet.cards.length || null,
        points: Object.keys(wallet.balances ?? {}).length || null,
        certificates: open.length || null,
        redemptions: (wallet.redemptions ?? []).length || null,
        applications: Array.isArray(wallet.applications) ? `${counter.count}/${counter.months}` : null,
      },
      alerts: {
        points: alertOf(balanceTones),
        certificates: alertOf(open.map((c) => certificateStatus(c, now).tone)),
      },
    };
  }, [wallet, now]);

  return (
    <>
      <TabBar active={tab} badges={badges} />
      {tab === "credits" && credits}
      {tab === "points" && <PointsTab wallet={wallet} now={now} />}
      {tab === "certificates" && <CertificatesTab wallet={wallet} now={now} />}
      {tab === "redemptions" && <RedemptionsTab wallet={wallet} now={now} />}
      {tab === "applications" && <ApplicationsTab wallet={wallet} now={now} />}
    </>
  );
}

type Alert = "red" | "amber" | null;
interface Badges {
  counts: Record<TrackerTab, number | string | null>;
  alerts: Partial<Record<TrackerTab, Alert>>;
}

/** The most urgent expiry among `tones`: red (or already expired), amber, or nothing. */
const alertOf = (tones: (ExpiryTone | undefined)[]): Alert =>
  tones.includes("red") || tones.includes("expired") ? "red" : tones.includes("amber") ? "amber" : null;

function TabBar({ active, badges }: { active: TrackerTab; badges: Badges }) {
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const spacerRef = useRef<HTMLSpanElement>(null);
  // Which edges have more tabs past them: each gets a fade, so the bar reads as "scroll for more".
  const [more, setMore] = useState({ left: false, right: false });
  const measure = () => {
    const nav = navRef.current;
    if (!nav) return;
    const max = nav.scrollWidth - nav.clientWidth;
    setMore({ left: nav.scrollLeft > 2, right: nav.scrollLeft < max - 2 });
  };
  /**
   * On narrow screens the bar scrolls sideways and snaps to tab edges, so the left edge never shows a fragment of a
   * label ("ates" of "Certificates"). For the end of the bar to be a tab edge too, a spacer after the last tab
   * makes room to line up the first tab that fits with the rest. Returns the tabs' left edges and right edges.
   */
  const layout = () => {
    const nav = navRef.current;
    const spacer = spacerRef.current;
    if (!nav || !spacer) return null;
    const tabs = [...nav.querySelectorAll<HTMLElement>("[data-tab]")];
    if (!tabs.length) return null;
    const origin = tabs[0].offsetLeft;
    const lefts = tabs.map((t) => t.offsetLeft - origin);
    const rights = tabs.map((t, i) => lefts[i] + t.offsetWidth);
    const width = nav.clientWidth;
    const end = rights[rights.length - 1];
    const fit = lefts.findIndex((l) => end - l <= width);
    // The flex gap sits before the spacer too.
    const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
    const room = end <= width ? 0 : Math.ceil(lefts[fit] + width - end - gap);
    spacer.style.display = room > 0 ? "" : "none";
    spacer.style.width = `${Math.max(0, room)}px`;
    return { tabs, lefts, rights, width };
  };
  // Show the current tab in full, with as many of the tabs before it as fit (scrolling only the bar, not the page).
  useEffect(() => {
    const nav = navRef.current;
    const l = layout();
    if (nav && l && nav.scrollWidth > nav.clientWidth) {
      const i = l.tabs.findIndex((t) => t === activeRef.current);
      const k = i < 0 ? 0 : l.lefts.findIndex((left) => l.rights[i] - left <= l.width);
      nav.scrollTo({ left: l.lefts[Math.max(0, k)] });
    }
    measure();
  }, [active]);
  useEffect(() => {
    const onResize = () => {
      layout();
      measure();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <div className="relative border-b border-line bg-white">
      {/* The left fade covers the page gutter and a tab's own padding, never its label. */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-y-0 left-0 z-10 w-7 bg-gradient-to-r from-white to-transparent transition-opacity sm:hidden", more.left ? "opacity-100" : "opacity-0")}
      />
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white from-30% to-transparent transition-opacity sm:hidden", more.right ? "opacity-100" : "opacity-0")}
      />
      <div className="container-page">
        <nav
          ref={navRef}
          onScroll={measure}
          className="-mb-px flex snap-x snap-mandatory gap-1 overflow-x-auto [scrollbar-width:none] sm:snap-none [&::-webkit-scrollbar]:hidden"
          aria-label="Tracker sections"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = id === active;
            const badge = badges.counts[id];
            const alert = badges.alerts[id];
            return (
              <Link
                key={id}
                ref={on ? activeRef : undefined}
                data-tab={id}
                href={trackerHref(id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 snap-start items-center gap-2 px-3 py-4 text-sm font-medium whitespace-nowrap transition-colors",
                  on ? "text-brand" : "text-ink-2 hover:text-brand",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {badge !== null && (
                  <span className={cn("rounded-full px-1.5 text-xs font-semibold", on ? "bg-sky text-brand" : "bg-canvas text-ink-3")}>{badge}</span>
                )}
                {alert && (
                  <span
                    role="img"
                    aria-label={alert === "red" ? "Something expires within 30 days" : "Something expires within 90 days"}
                    title={alert === "red" ? "Something expires within 30 days" : "Something expires within 90 days"}
                    className={cn("h-2 w-2 rounded-full", alert === "red" ? "bg-danger" : "bg-warn")}
                  />
                )}
                <span className={cn("absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-brand transition-opacity", on ? "opacity-100" : "opacity-0")} />
              </Link>
            );
          })}
          <span ref={spacerRef} aria-hidden className="shrink-0 sm:hidden" />
        </nav>
      </div>
    </div>
  );
}
