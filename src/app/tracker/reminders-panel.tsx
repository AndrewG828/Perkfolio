"use client";

import { BellRing, CalendarPlus } from "lucide-react";
import type { Card } from "@/data/types";
import { buildCalendar, downloadCalendar } from "@/lib/ics";
import type { WalletState } from "@/lib/wallet-store";

export function RemindersPanel({ cards, wallet }: { cards: Card[]; wallet: WalletState }) {
  return (
    <section className="panel flex flex-col gap-4 p-6 md:flex-row md:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky text-brand">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <h2 className="font-semibold text-navy">Never miss a reset</h2>
        <p className="mt-1 text-sm text-ink-2">
          Add repeating reminders to Google, Apple or Outlook Calendar: a few days before monthly, quarterly and semi-annual
          credits reset, a month before card-anniversary credits, and two weeks before a welcome-bonus deadline. Re-download
          after you add or remove cards.
        </p>
      </div>
      <button className="btn-primary shrink-0" onClick={() => downloadCalendar(buildCalendar(cards, wallet))}>
        <CalendarPlus className="h-4 w-4" /> Add to calendar
      </button>
    </section>
  );
}
