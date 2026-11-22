"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { CardArt } from "@/frontend/components/card-art";
import { getWalletSnapshot, useHydrated, walletActions, type WalletState } from "@/frontend/state/wallet-store";
import { isWalletLike, mergeWallets } from "@/shared/lib/wallet-merge";

function readFragment(): WalletState | null {
  const m = window.location.hash.match(/^#w=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const data = JSON.parse(json);
    return isWalletLike(data) ? data : null;
  } catch {
    return null;
  }
}

export function ImportWallet() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="container-page py-16"><div className="panel h-48 animate-pulse bg-canvas" /></div>;
  return <ImportInner />;
}

function ImportInner() {
  const router = useRouter();
  const [incoming] = useState(readFragment);
  const [done, setDone] = useState(false);
  const cards = (incoming?.cards ?? []).map(getCard).filter((c): c is Card => Boolean(c));

  if (!incoming || cards.length === 0) {
    return (
      <div className="container-page py-12 text-center text-ink-2">
        Nothing to import. <Link href="/tracker" className="link">Go to your tracker</Link>
      </div>
    );
  }

  const confirm = () => {
    // Merge so anything already saved here is kept; stamp it so cloud sync uploads the result.
    walletActions.importState({ ...mergeWallets(getWalletSnapshot(), incoming), updatedAt: Date.now() });
    history.replaceState(null, "", "/import");
    setDone(true);
    setTimeout(() => router.push("/tracker"), 900);
  };

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="panel p-6">
        <h2 className="text-xl font-semibold text-navy">
          {done ? "Imported" : `Import ${cards.length} card${cards.length === 1 ? "" : "s"} and your credit history?`}
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          This adds them to the wallet on this address. Anything already here is kept.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-3 text-sm font-medium text-ink">
              <CardArt card={c} size="xs" /> {c.name}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-3">
          {done ? (
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-5 w-5" /> Done — opening your tracker…
            </p>
          ) : (
            <>
              <button className="btn-primary" onClick={confirm}>Import my wallet</button>
              <Link href="/tracker" className="btn-ghost">Skip</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
