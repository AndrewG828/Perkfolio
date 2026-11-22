"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cards, issuers } from "@/shared/data/cards";
import { CardArt } from "@/frontend/components/card-art";
import { useWallet, walletActions } from "@/frontend/state/wallet-store";
import { cn, usd } from "@/shared/lib/format";

export function CardPickerGrid({ onPick }: { onPick?: () => void } = {}) {
  const wallet = useWallet();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards.filter((c) => !s || `${c.name} ${c.issuer}`.toLowerCase().includes(s));
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input className="input pl-9" placeholder="Search cards" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
      </div>
      {issuers.map((issuer) => {
        const group = list.filter((c) => c.issuer === issuer);
        if (group.length === 0) return null;
        return (
          <div key={issuer}>
            <h3 className="mb-3 text-sm font-semibold text-ink-2">{issuer}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((c) => {
                const owned = wallet.cards.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      walletActions.toggleCard(c.id);
                      onPick?.();
                    }}
                    aria-pressed={owned}
                    className={cn(
                      "flex items-center gap-4 rounded-lg border p-3 text-left transition-colors",
                      owned ? "border-brand bg-sky" : "border-line bg-white hover:border-brand/50",
                    )}
                  >
                    <CardArt card={c} size="xs" className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                      <span className="text-xs text-ink-3">{c.annualFee ? usd(c.annualFee) + " annual fee" : "No annual fee"}</span>
                    </span>
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                        owned ? "border-brand bg-brand text-white" : "border-line text-transparent",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CardPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(960px,calc(100%-2rem))] rounded-xl p-0 backdrop:bg-navy/50"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <h2 className="text-lg font-semibold text-navy">Manage my cards</h2>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded hover:bg-canvas" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-6">
        <CardPickerGrid />
      </div>
      <div className="flex justify-end border-t border-line px-6 py-4">
        <button className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
