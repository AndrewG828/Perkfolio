import { Check, Navigation, X } from "lucide-react";
import type { Airport, Lounge } from "@/shared/data/types";
import { loungeNetworks } from "@/shared/data/networks";
import type { LoungeAccessGrant } from "@/shared/lib/lounge-access";
import { CardArt } from "@/frontend/components/card-art";
import { cn } from "@/shared/lib/format";

export function LoungeRow({
  lounge,
  airport,
  access,
  checking,
  onDirections,
}: {
  lounge: Lounge;
  airport: Airport;
  access: LoungeAccessGrant[];
  checking: boolean;
  onDirections?: () => void;
}) {
  const net = loungeNetworks[lounge.network];
  const ok = access.length > 0;
  return (
    <li
      id={`lounge-${lounge.id}`}
      className={cn(
        "panel scroll-mt-28 overflow-hidden target:ring-2 target:ring-brand",
        checking && !ok && "opacity-75",
      )}
    >
      <div className="flex">
        <span className="w-1.5 shrink-0" style={{ background: net.color }} />
        <div className="flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: net.color }}>
                {net.label}
              </span>
              <h3 className="mt-0.5 text-lg font-semibold text-ink">{lounge.name}</h3>
              <p className="mt-1 text-sm text-ink-2">
                {lounge.terminal}
                {lounge.location ? ` · ${lounge.location}` : ""}
              </p>
              {lounge.notes && <p className="mt-1 text-sm text-ink-3">{lounge.notes}</p>}
              {onDirections && (
                <button
                  type="button"
                  onClick={onDirections}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                  aria-label={`Directions to ${lounge.name} at ${airport.code}`}
                >
                  <Navigation className="h-3.5 w-3.5" /> Directions
                </button>
              )}
            </div>
            {checking && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                  ok ? "bg-success/10 text-success" : "bg-canvas text-ink-3",
                )}
              >
                {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {ok ? "You have access" : "No access with selected cards"}
              </span>
            )}
          </div>
          {ok && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {access.map((a) => (
                <li key={a.card.id + a.via} className="flex items-start gap-3 text-sm">
                  <CardArt card={a.card} size="xs" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold text-ink">{a.card.name}</span>
                    {a.via !== lounge.network && <span className="text-ink-3"> via {loungeNetworks[a.via].label}</span>}
                    <span className="block text-ink-2">{a.terms}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
