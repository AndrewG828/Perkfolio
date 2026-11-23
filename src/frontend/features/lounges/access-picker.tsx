"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { cards, getCard } from "@/shared/data/cards";
import { CardArt } from "@/frontend/components/card-art";
import { useWallet } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";

export type AccessMode = "wallet" | "pick" | "all";

export interface AccessSelection {
  mode: AccessMode;
  setMode: (m: AccessMode) => void;
  picked: string[];
  setPicked: (f: (p: string[]) => string[]) => void;
  /** Cards to check access with (empty in "all" mode). */
  selected: Card[];
  /** Query string to carry the choice to another lounge page ("?card=..." or ""). */
  carry: string;
}

/** Which cards to check lounge access with: the wallet (default), hand-picked cards (?card=...), or none. */
export function useAccessSelection(): AccessSelection {
  const params = useSearchParams();
  const wallet = useWallet();
  const cardParams = params.getAll("card").filter((c) => getCard(c));
  const [mode, setMode] = useState<AccessMode>(cardParams.length ? "pick" : "wallet");
  const [picked, setPickedState] = useState<string[]>(cardParams);
  const ids = mode === "wallet" ? wallet.cards : mode === "pick" ? picked : [];
  const selected = ids.map(getCard).filter((c): c is Card => Boolean(c));
  const carry = mode === "pick" && picked.length ? `?${picked.map((c) => `card=${encodeURIComponent(c)}`).join("&")}` : "";
  return { mode, setMode, picked, setPicked: (f) => setPickedState(f), selected, carry };
}

export function AccessPicker({ access }: { access: AccessSelection }) {
  const { mode, setMode, picked, setPicked, selected } = access;
  const loungeCards = useMemo(() => cards.filter((c) => c.loungeAccess.length > 0), []);
  return (
    <div className="panel p-5">
      <h2 className="text-sm font-semibold text-ink">Check access with</h2>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-canvas p-1 text-sm" role="radiogroup">
        {(
          [
            ["wallet", "My wallet"],
            ["pick", "Choose"],
            ["all", "All"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn("rounded px-2 py-1.5 font-medium", mode === m ? "bg-white text-brand shadow-sm" : "text-ink-2")}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "wallet" && (
        <div className="mt-4 space-y-2">
          {selected.length === 0 ? (
            <p className="text-sm text-ink-2">
              Your wallet is empty.{" "}
              <Link href="/tracker" className="link">
                Add your cards
              </Link>{" "}
              or choose cards here.
            </p>
          ) : (
            selected.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <CardArt card={c} size="xs" />
                <span className="truncate font-medium text-ink">{c.name}</span>
              </div>
            ))
          )}
        </div>
      )}
      {mode === "pick" && (
        <div className="mt-4 max-h-[360px] space-y-1 overflow-y-auto pr-1">
          {loungeCards.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                className={cn("flex w-full items-center gap-3 rounded-md p-2 text-left text-sm", on ? "bg-sky" : "hover:bg-canvas")}
              >
                <CardArt card={c} size="xs" />
                <span className="flex-1 truncate font-medium text-ink">{c.name}</span>
                {on && <Check className="h-4 w-4 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
      {mode === "all" && <p className="mt-4 text-sm text-ink-2">Showing every lounge without checking card access.</p>}
    </div>
  );
}
