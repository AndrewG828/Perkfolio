import type { Card, CreditFrequency } from "@/data/types";
import { shortCardName } from "./card-name";
import { cardmemberYear, isAnniversaryCredit } from "./credit-status";
import type { WalletState } from "./wallet-store";

/**
 * Builds an iCalendar (.ics) file with repeating reminders a few days before each credit resets.
 * Credits are grouped per card and cadence so a card with five monthly credits gets one reminder.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n.toLocaleString("en-US")}`;

/** RFC 5545 lines are folded at 75 octets. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** Day `fromEnd` days before the end of the month containing `monthStart`. */
const nearMonthEnd = (y: number, m: number, fromEnd: number) => new Date(y, m + 1, 1 - fromEnd);

interface Ev {
  uid: string;
  start: Date;
  rrule?: string;
  summary: string;
  description: string;
}

function firstOnOrAfter(candidates: Date[], today: Date) {
  return candidates.find((d) => d >= today) ?? candidates[candidates.length - 1];
}

export function buildCalendar(cards: Card[], wallet: WalletState, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = today.getFullYear();
  const m = today.getMonth();
  const events: Ev[] = [];

  for (const card of cards) {
    const name = shortCardName(card.name);
    const live = card.credits.filter((c) => !wallet.ignored[`${card.id}:${c.id}`]);
    const groups = new Map<CreditFrequency | "anniversary", typeof live>();
    for (const c of live) {
      if (c.frequency === "every-4-years" || c.frequency === "one-time") continue;
      const k = isAnniversaryCredit(c) && wallet.openDates?.[card.id] ? "anniversary" : c.frequency;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }

    for (const [freq, credits] of groups) {
      const total = credits.reduce((s, c) => s + c.amountPerPeriod, 0);
      const list = credits.map((c) => `• ${c.name}: ${money(c.amountPerPeriod)}`).join("\n");
      const base = { uid: `${card.id}-${freq}@perkfolio`, description: `${list}\n\nTrack them at perkfolio-app.vercel.app/tracker` };
      const what = credits.length === 1 ? credits[0].name : `${credits.length} ${freq === "anniversary" ? "anniversary" : freq} credits`;

      if (freq === "monthly") {
        events.push({
          ...base,
          start: firstOnOrAfter([nearMonthEnd(y, m, 5), nearMonthEnd(y, m + 1, 5)], today),
          rrule: "FREQ=MONTHLY;BYMONTHDAY=-5",
          summary: `${name}: use ${money(total)} in ${what} before they reset`,
        });
      } else if (freq === "quarterly") {
        const qEnd = Math.floor(m / 3) * 3 + 2;
        events.push({
          ...base,
          start: firstOnOrAfter([nearMonthEnd(y, qEnd, 7), nearMonthEnd(y, qEnd + 3, 7)], today),
          rrule: "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-7",
          summary: `${name}: ${money(total)} in ${what} reset at quarter end`,
        });
      } else if (freq === "semiannual") {
        const hEnd = m < 6 ? 5 : 11;
        events.push({
          ...base,
          start: firstOnOrAfter([nearMonthEnd(y, hEnd, 14), nearMonthEnd(y, hEnd + 6, 14)], today),
          rrule: "FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-14",
          summary: `${name}: ${money(total)} in ${what} reset in 2 weeks`,
        });
      } else if (freq === "annual") {
        events.push({
          ...base,
          start: firstOnOrAfter([new Date(y, 11, 1), new Date(y + 1, 11, 1)], today),
          rrule: "FREQ=YEARLY",
          summary: `${name}: ${money(total)} in ${what} reset Jan 1`,
        });
      } else if (freq === "anniversary") {
        const cm = cardmemberYear(wallet.openDates![card.id], today);
        const remind = new Date(cm.end.getTime() - 30 * 86_400_000);
        events.push({
          ...base,
          start: remind >= today ? remind : new Date(remind.getFullYear() + 1, remind.getMonth(), remind.getDate()),
          rrule: "FREQ=YEARLY",
          summary: `${name}: ${money(total)} in ${what} reset on your card anniversary in 30 days`,
        });
      }
    }

    const bonus = wallet.bonus?.[card.id];
    if (bonus && bonus.spent < bonus.target) {
      const deadline = new Date(bonus.deadline + "T00:00:00");
      const remind = new Date(Math.max(today.getTime(), deadline.getTime() - 14 * 86_400_000));
      events.push({
        uid: `${card.id}-bonus@perkfolio`,
        start: remind,
        summary: `${name}: welcome bonus spend deadline ${deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        description: `${money(bonus.target - bonus.spent)} left to spend by ${bonus.deadline} to earn the welcome offer.`,
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Perkfolio//Credit reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Perkfolio credit reminders",
  ];
  for (const e of events) {
    const next = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.start)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
      `SUMMARY:${esc(e.summary)}`,
      `DESCRIPTION:${esc(e.description)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(e.summary)}`,
      "TRIGGER:PT9H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadCalendar(ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "perkfolio-reminders.ics";
  a.click();
  URL.revokeObjectURL(a.href);
}
