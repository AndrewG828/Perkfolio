"use client";

import { useState } from "react";
import { BedDouble, CheckCircle2, Gift, Pencil, Plus, RotateCcw, Tag, Ticket, Trash2, Users, X, type LucideIcon } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { programForCard, programName } from "@/shared/data/strategy/programs";
import { ProgramSelect } from "@/frontend/components/program-select";
import { walletActions, type Certificate, type WalletState } from "@/frontend/state/wallet-store";
import type { CertificateKind } from "@/shared/lib/wallet";
import { WALLET_LIMITS, cleanLabel, cleanNotes } from "@/shared/lib/wallet-schema";
import { EXPIRY_AMBER_DAYS, certificateStatus, certificateTotals, sortCertificates } from "@/shared/lib/trackers";
import { formatDate, isoDate } from "@/shared/lib/dates";
import { cn, num, usd } from "@/shared/lib/format";
import { EmptyState, ExpiryChip, Stat, StatRow, TabFrame, relativeDays } from "./tab-parts";

const KINDS: { id: CertificateKind; label: string; icon: LucideIcon }[] = [
  { id: "free-night", label: "Free night", icon: BedDouble },
  { id: "companion", label: "Companion pass", icon: Users },
  { id: "voucher", label: "Voucher", icon: Ticket },
  { id: "gift-card", label: "Gift card", icon: Gift },
  { id: "other", label: "Other", icon: Tag },
];
const kindOf = (id: CertificateKind) => KINDS.find((k) => k.id === id) ?? KINDS[KINDS.length - 1];

type Draft = { kind: CertificateKind; label: string; program: string; value: string; points: string; expires: string; noExpiry: boolean; notes: string };
const EMPTY: Draft = { kind: "free-night", label: "", program: "", value: "", points: "", expires: "", noExpiry: false, notes: "" };

const draftOf = (c: Certificate): Draft => ({
  kind: c.kind,
  label: c.label,
  program: c.program ?? "",
  value: c.valueUsd !== undefined ? String(c.valueUsd) : "",
  points: c.points !== undefined ? String(c.points) : "",
  expires: c.expires ?? "",
  noExpiry: c.expires === null,
  notes: c.notes ?? "",
});

function toCertificate(d: Draft): Omit<Certificate, "id"> | string {
  const label = cleanLabel(d.label);
  const notes = cleanNotes(d.notes);
  if (!label) return "Give it a name, like \"Hyatt Category 1-4 night\".";
  const value = d.value.trim() === "" ? undefined : Number(d.value);
  const points = d.points.trim() === "" ? undefined : Math.round(Number(d.points));
  if (value !== undefined && !(Number.isFinite(value) && value >= 0)) return "The value should be a dollar amount.";
  if (points !== undefined && !(Number.isFinite(points) && points >= 0)) return "The points cap should be a number.";
  if (!d.noExpiry && !d.expires) return "Add the expiry date, or tick \"Doesn't expire\".";
  return {
    kind: d.kind,
    label,
    ...(d.program ? { program: d.program } : {}),
    ...(value !== undefined ? { valueUsd: Math.round(value * 100) / 100 } : {}),
    ...(points !== undefined ? { points } : {}),
    expires: d.noExpiry ? null : d.expires,
    ...(notes ? { notes } : {}),
  };
}

/** Certificates the wallet's cards hand out (free nights, companion certificates), ready to add with one click. */
function suggestionsFor(wallet: WalletState): { key: string; draft: Draft; label: string }[] {
  const cards = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  return cards.flatMap((card) =>
    card.credits
      .filter((c) => /free-night|companion/.test(c.id))
      .map((credit) => ({
        key: `${card.id}:${credit.id}`,
        label: credit.name,
        draft: {
          ...EMPTY,
          kind: /companion/.test(credit.id) ? ("companion" as const) : ("free-night" as const),
          label: credit.name.slice(0, WALLET_LIMITS.label),
          program: programForCard(card) ?? "",
          value: String(credit.annualValue),
        },
      })),
  );
}

export function CertificatesTab({ wallet, now }: { wallet: WalletState; now: Date }) {
  const [form, setForm] = useState<{ key: string; draft: Draft } | null>(null);
  const list = sortCertificates(wallet.certificates ?? []);
  const open = list.filter((c) => !c.used);
  const used = list.filter((c) => c.used);
  const t = certificateTotals(list, now);
  const suggestions = suggestionsFor(wallet).filter((s) => !list.some((c) => c.label === s.draft.label && !c.used));

  return (
    <TabFrame>
      <StatRow>
        <Stat label="Unused value" value={usd(t.openValue)} sub={`${t.openCount} certificate${t.openCount === 1 ? "" : "s"} to use`} />
        <Stat
          label={`Expiring within ${EXPIRY_AMBER_DAYS} days`}
          value={String(t.soonCount)}
          tone={t.soonCount ? (open.some((c) => certificateStatus(c, now).tone === "red") ? "danger" : "warn") : undefined}
          sub={t.soonCount ? `${usd(t.soonValue)} at stake` : t.expiredCount ? `${t.expiredCount} already expired` : "Nothing expiring soon"}
        />
        <Stat label="Used" value={usd(t.usedValue)} tone={t.usedValue ? "success" : undefined} sub={`${t.usedCount} certificate${t.usedCount === 1 ? "" : "s"} redeemed`} />
      </StatRow>

      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-semibold text-navy">Certificates</h2>
            <p className="text-sm text-ink-2">Soonest to expire first. Red within 30 days, amber within 90.</p>
          </div>
          {!form && list.length > 0 && (
            <button className="btn-primary" onClick={() => setForm({ key: "new", draft: EMPTY })}>
              <Plus className="h-4 w-4" /> Add certificate
            </button>
          )}
        </header>
        {form && (
          <CertificateForm
            key={form.key}
            initial={form.draft}
            today={now}
            onCancel={() => setForm(null)}
            onSave={(c) => {
              const ok = walletActions.addCertificate(c);
              if (ok) setForm(null);
              return ok;
            }}
          />
        )}
        {list.length === 0 && !form ? (
          <EmptyState
            icon={Ticket}
            title="Keep free nights and companion passes from expiring"
            actions={
              <>
                {suggestions.slice(0, 3).map((s) => (
                  <button key={s.key} className="btn-secondary px-3 py-2 text-xs" onClick={() => setForm({ key: s.key, draft: s.draft })}>
                    <Plus className="h-3.5 w-3.5" /> {s.label}
                  </button>
                ))}
                <button className="btn-primary" onClick={() => setForm({ key: "new", draft: EMPTY })}>
                  <Plus className="h-4 w-4" /> Add a certificate
                </button>
              </>
            }
          >
            Add the free nights, companion certificates, vouchers and gift cards you&apos;re holding. We sort them by expiry and
            flag the ones running out.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((c) => (
              <CertificateRow key={c.id} cert={c} now={now} />
            ))}
          </ul>
        )}
        {list.length > 0 && suggestions.length > 0 && !form && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3 text-sm">
            <span className="text-ink-2">From your cards:</span>
            {suggestions.map((s) => (
              <button key={s.key} className="chip cursor-pointer hover:border-brand hover:text-brand" onClick={() => setForm({ key: s.key, draft: s.draft })}>
                <Plus className="h-3 w-3" /> {s.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {used.length > 0 && (
        <section className="panel overflow-hidden">
          <header className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-navy">Used</h2>
          </header>
          <ul className="divide-y divide-line">
            {used.map((c) => (
              <CertificateRow key={c.id} cert={c} now={now} />
            ))}
          </ul>
        </section>
      )}
    </TabFrame>
  );
}

function CertificateRow({ cert, now }: { cert: Certificate; now: Date }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { daysLeft, tone } = certificateStatus(cert, now);
  const kind = kindOf(cert.kind);
  const Icon = kind.icon;

  if (editing) {
    return (
      <li>
        <CertificateForm
          initial={draftOf(cert)}
          today={now}
          onCancel={() => setEditing(false)}
          onSave={(c) => {
            const ok = walletActions.updateCertificate({ ...c, id: cert.id, ...(cert.used ? { used: true } : {}) });
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </li>
    );
  }

  return (
    <li className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center", cert.used && "opacity-60")}>
      <span className={cn("grid h-10 w-10 place-items-center rounded-full", cert.used ? "bg-canvas text-ink-3" : "bg-sky text-brand")}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{cert.label}</span>
          {cert.used ? (
            <span className="chip py-0.5">Used</span>
          ) : tone && cert.expires ? (
            <ExpiryChip tone={tone}>
              {tone === "expired" ? `Expired ${formatDate(cert.expires)}` : `Expires ${formatDate(cert.expires)}`}
            </ExpiryChip>
          ) : (
            <span className="chip py-0.5">No expiry</span>
          )}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {[
            kind.label,
            cert.program ? programName(cert.program) : null,
            cert.valueUsd !== undefined ? `worth ${usd(cert.valueUsd, { cents: cert.valueUsd % 1 !== 0 })}` : null,
            cert.points !== undefined ? `up to ${num(cert.points)} points` : null,
            !cert.used && daysLeft !== undefined && daysLeft >= 0 ? relativeDays(daysLeft) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {cert.notes && <p className="mt-1 text-sm whitespace-pre-line text-ink-3">{cert.notes}</p>}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1 sm:col-start-auto sm:justify-end">
        {confirming ? (
          <>
            <span className="mr-1 text-sm text-ink-2">Remove?</span>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => walletActions.removeCertificate(cert.id)}>
              Remove
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            {cert.used ? (
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => walletActions.updateCertificate({ ...cert, used: false })}>
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </button>
            ) : (
              <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => walletActions.updateCertificate({ ...cert, used: true })}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark used
              </button>
            )}
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button className="grid h-8 w-8 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger" onClick={() => setConfirming(true)} aria-label={`Remove ${cert.label}`} title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function CertificateForm({
  initial,
  today,
  onSave,
  onCancel,
}: {
  initial: Draft;
  today: Date;
  onSave: (c: Omit<Certificate, "id">) => boolean;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setError(null);
  };
  return (
    <form
      className="space-y-4 border-b border-line bg-canvas/60 px-5 py-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const c = toCertificate(d);
        if (typeof c === "string") return setError(c);
        if (!onSave(c)) setError("Couldn't save that certificate. The list may be full.");
      }}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="space-y-1">
          <span className="font-medium text-ink">Type</span>
          <select className="input" value={d.kind} onChange={(e) => set({ kind: e.target.value as CertificateKind })}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">Name</span>
          <input className="input" value={d.label} maxLength={WALLET_LIMITS.label} placeholder="e.g. Hyatt Category 1-4 night" onChange={(e) => set({ label: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">
            Program <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <ProgramSelect label="Program" placeholder="None" value={d.program} onChange={(program) => set({ program })} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="font-medium text-ink">
            Worth <span className="font-normal text-ink-3">(USD)</span>
          </span>
          <input className="input" type="number" min={0} step="any" inputMode="decimal" placeholder="e.g. 250" value={d.value} onChange={(e) => set({ value: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">
            Points cap <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <input className="input" type="number" min={0} step={1} inputMode="numeric" placeholder="e.g. 35000" value={d.points} onChange={(e) => set({ points: e.target.value })} />
        </label>
        <div className="space-y-1">
          <label htmlFor="cert-expires" className="font-medium text-ink">
            Expires
          </label>
          <input
            id="cert-expires"
            className="input"
            type="date"
            min={isoDate(new Date(today.getFullYear() - 2, 0, 1))}
            value={d.noExpiry ? "" : d.expires}
            disabled={d.noExpiry}
            onChange={(e) => set({ expires: e.target.value })}
          />
          <label className="flex items-center gap-2 pt-1 text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={d.noExpiry} onChange={(e) => set({ noExpiry: e.target.checked })} />
            Doesn&apos;t expire
          </label>
        </div>
      </div>
      <label className="block space-y-1">
        <span className="font-medium text-ink">
          Notes <span className="font-normal text-ink-3">(optional)</span>
        </span>
        <textarea className="input min-h-16" maxLength={WALLET_LIMITS.notes} rows={2} placeholder="Where it's valid, blackout dates, confirmation number…" value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {error && (
        <p className="font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary">Save certificate</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </form>
  );
}
