"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { awardPrograms, sweetSpots } from "@/shared/data/points";
import { cn } from "@/shared/lib/format";
import { ProgramTile } from "./program-tile";
import { SweetSpotCard } from "./sweet-spot-card";
import { SectionHeading } from "./ui";
import { useWalletReach } from "./use-wallet-reach";

/** Hub: three sweet spots, the ones the wallet can book first. */
export function FeaturedSweetSpots() {
  const wallet = useWalletReach();
  const hasCards = wallet.hydrated && wallet.points.cards.length > 0;
  const bookable = hasCards ? sweetSpots.filter((s) => wallet.reach.has(s.program)) : [];
  const list = (bookable.length ? [...bookable, ...sweetSpots.filter((s) => !wallet.reach.has(s.program))] : sweetSpots).slice(0, 3);

  return (
    <section aria-labelledby="featured-sweet-spots">
      <SectionHeading
        id="featured-sweet-spots"
        eyebrow="Sweet spots"
        title={bookable.length ? "Sweet spots you can book" : "Featured sweet spots"}
        action={
          <Link href={bookable.length ? "/points/sweet-spots?mine=1" : "/points/sweet-spots"} className="btn-secondary">
            {bookable.length ? `All ${bookable.length} you can book` : `All ${sweetSpots.length} sweet spots`} <ArrowRight className="h-4 w-4" />
          </Link>
        }
      >
        {bookable.length
          ? `Your cards reach ${bookable.length} of the ${sweetSpots.length} redemptions we track.`
          : "Redemptions where points go furthest: fixed-price business class, cheap short hops and hotel nights that cost less than they should."}
      </SectionHeading>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s, i) => (
          <SweetSpotCard
            key={s.id}
            spot={s}
            reach={hasCards ? (wallet.reach.get(s.program) ?? null) : undefined}
            mine={wallet.mine}
            className={cn(i === 2 && "sm:max-lg:hidden")}
          />
        ))}
      </div>
    </section>
  );
}

/** Hub: a preview of the program directory, reachable programs marked. */
export function ProgramPreview({ limit = 8 }: { limit?: number }) {
  const wallet = useWalletReach();
  const hasCards = wallet.hydrated && wallet.points.cards.length > 0;
  const ordered = [...awardPrograms].sort(
    (a, b) => Number(a.kind === "hotel") - Number(b.kind === "hotel") || a.name.localeCompare(b.name),
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ordered.slice(0, limit).map((p) => (
        <ProgramTile key={p.id} program={p} compact reach={hasCards ? (wallet.reach.get(p.id) ?? null) : undefined} mine={wallet.mine} />
      ))}
    </div>
  );
}
