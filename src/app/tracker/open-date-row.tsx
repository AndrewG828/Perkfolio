"use client";

import { CalendarDays } from "lucide-react";
import type { Card } from "@/data/types";
import { cardmemberYear, isAnniversaryCredit } from "@/lib/credit-status";
import { walletActions, type WalletState } from "@/lib/wallet-store";

/** Shown for cards with credits that reset on the account anniversary (e.g. Venture X travel credit). */
export function OpenDateRow({ card, wallet, now }: { card: Card; wallet: WalletState; now: Date }) {
  const count = card.credits.filter(isAnniversaryCredit).length;
  if (count === 0) return null;
  const open = wallet.openDates?.[card.id];
  const cm = open ? cardmemberYear(open, now) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm">
      <span className="flex items-center gap-2 text-ink-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
        {cm ? (
          <span>
            {count} credit{count === 1 ? "" : "s"} reset on your card anniversary · current card year{" "}
            <span className="font-medium text-ink">{cm.label}</span>
          </span>
        ) : (
          <span>
            {count} credit{count === 1 ? " resets" : "s reset"} on your card anniversary.{" "}
            <span className="font-medium text-warn">Add your card&apos;s open date</span> so they reset on the right day.
          </span>
        )}
      </span>
      <label className="flex items-center gap-2">
        <span className="text-ink-2">Card opened</span>
        <input
          type="date"
          className="input h-9 w-auto py-1"
          value={open ?? ""}
          max={now.toISOString().slice(0, 10)}
          onChange={(e) => walletActions.setOpenDate(card.id, e.target.value || null)}
          aria-label={`${card.name} open date`}
        />
      </label>
    </div>
  );
}
