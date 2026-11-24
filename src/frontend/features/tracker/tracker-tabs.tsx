"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Coins, CreditCard, History, Receipt, Ticket, type LucideIcon } from "lucide-react";
import { useWallet } from "@/frontend/state/wallet-store";
import { chase524, historyContext } from "@/shared/lib/eligibility";
import { balanceStatus, certificateStatus, type ExpiryTone } from "@/shared/lib/trackers";
import { cn } from "@/shared/lib/format";
import { PointsTab, earningPrograms } from "./points-tab";
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
    const earning = earningPrograms(wallet);
    // Only dated expiries raise the dot (not, say, bank points with no earning card).
    const balanceTones = Object.entries(wallet.balances ?? {}).map(([id, b]) => {
      const st = balanceStatus(id, b, now, { earningCard: earning.has(id) });
      return st.kind === "date" ? st.tone : undefined;
    });
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
  // On narrow screens the bar scrolls sideways: keep the current tab in view (scrolling only the bar, not the page).
  useEffect(() => {
    const nav = navRef.current;
    const el = activeRef.current;
    if (!nav || !el) return;
    const left = el.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + el.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, left - 16) });
  }, [active]);
  return (
    <div className="relative border-b border-line bg-white">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent sm:hidden" />
      <div className="container-page">
        <nav ref={navRef} className="-mb-px flex gap-1 overflow-x-auto pr-8 [scrollbar-width:none] sm:pr-0 [&::-webkit-scrollbar]:hidden" aria-label="Tracker sections">
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = id === active;
            const badge = badges.counts[id];
            const alert = badges.alerts[id];
            return (
              <Link
                key={id}
                ref={on ? activeRef : undefined}
                href={trackerHref(id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 px-3 py-4 text-sm font-medium whitespace-nowrap transition-colors",
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
        </nav>
      </div>
    </div>
  );
}
