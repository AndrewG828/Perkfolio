"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AlarmClock, X } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { expiringSoon, statusFor } from "@/shared/lib/credit-status";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { usd } from "@/shared/lib/format";

const DISMISS_KEY = "perkfolio:banner-dismissed";

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/** Site-wide nudge when unused credits reset within a week. Lives under the header; hidden on the tracker. */
export function ReminderBanner() {
  const hydrated = useHydrated();
  const pathname = usePathname();
  if (!hydrated || pathname.startsWith("/tracker")) return null;
  return <Banner />;
}

function Banner() {
  const wallet = useWallet();
  const [now] = useState(() => new Date());
  const dismissed = useSyncExternalStore(
    (cb) => {
      window.addEventListener("perkfolio:banner", cb);
      return () => window.removeEventListener("perkfolio:banner", cb);
    },
    readDismissed,
    () => null,
  );
  const owned = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  const soon = expiringSoon(
    owned.flatMap((card) => card.credits.map((credit) => statusFor(card, credit, wallet, now))),
    7,
  );
  if (soon.length === 0) return null;
  // Dismissal lasts until the soonest reset date changes (i.e. the next cycle).
  const token = soon[0].periodEnd.toISOString().slice(0, 10);
  if (dismissed === token) return null;

  const total = soon.reduce((s, x) => s + x.remaining, 0);
  const days = soon[0].daysLeft;
  const names = soon.slice(0, 3).map((s) => s.credit.name);

  return (
    <div className="border-b border-warn/20 bg-[#fdf3e7]">
      <div className="container-page flex items-center gap-3 py-2.5 text-sm">
        <AlarmClock className="h-4 w-4 shrink-0 text-warn" aria-hidden />
        <p className="min-w-0 flex-1 text-ink">
          <span className="font-semibold">{usd(total, { cents: total % 1 !== 0 })} in credits reset in {days} day{days === 1 ? "" : "s"}</span>
          <span className="hidden text-ink-2 sm:inline">
            {" "}
            — {names.join(", ")}
            {soon.length > 3 ? ` and ${soon.length - 3} more` : ""}
          </span>
        </p>
        <Link href="/tracker" className="font-semibold whitespace-nowrap text-brand hover:underline">
          Review
        </Link>
        <button
          className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-white hover:text-ink"
          aria-label="Dismiss until next reset"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, token);
            } catch {}
            window.dispatchEvent(new Event("perkfolio:banner"));
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
