"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { Lounge, LoungeNetwork } from "@/shared/data/types";
import { loungeNetworks } from "@/shared/data/networks";
import { osmEmbedUrl, osmLink } from "@/shared/data/airport-geo";
import {
  accessFor,
  airportByCode,
  bigAirports,
  isClosed,
  networksFor,
  refusedAt,
  terminalsAt,
  type LoungeAccessGrant,
} from "@/shared/lib/lounge-access";
import {
  isConnected,
  linkKey,
  navFor,
  rankByDistance,
  resolveOrigin,
  routeTo,
  terminalsSeparate,
  zoneForLounge,
  type Origin,
} from "@/shared/lib/wayfinding";
import { isoDate } from "@/shared/lib/dates";
import { useHydrated } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";
import { AccessPicker, useAccessSelection } from "./access-picker";
import { LoungeRow } from "./lounge-row";
import { AirportMap } from "./airport-map";
import { DirectionsPanel } from "./directions-panel";
import { TerminalMap, type MapRoute, type MapRow } from "./terminal-map";

/** One airport: terminal map of its lounges, which ones your cards open, the real map, and the full list. */
export function AirportView({ code }: { code: string }) {
  const airport = airportByCode.get(code)!;
  const access = useAccessSelection();
  const hydrated = useHydrated();
  const [onlyMine, setOnlyMine] = useState(false);
  const [network, setNetwork] = useState<LoungeNetwork | "all">("all");
  // With no cards to check (an empty wallet, or none chosen yet), show every lounge and every card's rules, as the
  // finder does, rather than "no access" everywhere.
  const checking = access.mode !== "all" && access.selected.length > 0;
  const noCards = access.mode !== "all" && hydrated && access.selected.length === 0;
  // Closures have dates: before hydration (no visitor date yet) a listed closure counts as in effect.
  const today = hydrated ? isoDate(new Date()) : null;
  const closed = (l: Lounge) => isClosed(l, today);

  const groups = useMemo(() => terminalsAt(code), [code]);
  const all = groups.flatMap((g) => g.lounges);
  const selectedKey = access.selected.map((c) => c.id).join(",");
  const grants = useMemo(() => {
    const m = new Map<string, LoungeAccessGrant[]>();
    for (const l of all) m.set(l.id, accessFor(l, access.selected));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, selectedKey]);
  const open = all.filter((l) => !closed(l) && (grants.get(l.id)?.length ?? 0) > 0);
  const closedHere = all.filter(closed);
  // The map pins: a closed lounge gets you nowhere today.
  const openGrants = useMemo(() => {
    const m = new Map<string, LoungeAccessGrant[]>();
    for (const l of all) m.set(l.id, closed(l) ? [] : (grants.get(l.id) ?? []));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grants, today]);
  const networksHere = Array.from(new Set(all.flatMap(networksFor)));
  const visible = (l: Lounge) =>
    (network === "all" || networksFor(l).includes(network)) &&
    (!onlyMine || !checking || (!closed(l) && (grants.get(l.id)?.length ?? 0) > 0));
  const embed = osmEmbedUrl(code);
  const others = bigAirports.filter((a) => a.code !== code).slice(0, 12);

  // --- Directions -------------------------------------------------------------------------------------------
  const params = useSearchParams();
  const nav = navFor(code);
  const [from, setFrom] = useState(() => params.get("from") ?? "");
  const [toId, setToId] = useState(() => params.get("to") ?? "");
  useEffect(() => {
    // Keep the route in the URL (shareable) without a navigation.
    const sp = new URLSearchParams(window.location.search);
    if (from) sp.set("from", from);
    else sp.delete("from");
    if (toId) sp.set("to", toId);
    else sp.delete("to");
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [from, toId]);

  // Memoized on what was typed (the map redraws its route only when the origin or route really changes).
  const resolved = useMemo(() => (nav ? resolveOrigin(nav, from) : null), [nav, from]);
  // Until the traveler gives a gate, show the route from security so directions are always visible.
  const origin = useMemo<Origin | null>(() => (nav ? (resolved?.ok ? resolved.origin : { kind: "landside" }) : null), [nav, resolved]);
  const fromSecurityDefault = Boolean(nav) && !resolved?.ok;
  // Before you say where you are, at an airport whose terminals aren't connected after security, every terminal's
  // lounges tie: the first one isn't "nearest".
  const nearestUnknown = Boolean(nav && origin?.kind === "landside" && terminalsSeparate(nav));
  const isOpen = (l: Lounge) => !closed(l) && (grants.get(l.id)?.length ?? 0) > 0;
  // Closed lounges are never ranked or picked for you (you can still choose one to see where it is).
  const ranked =
    nav && origin
      ? rankByDistance(
          nav,
          origin,
          all.filter((l) => !closed(l)),
        ).map((r) => ({ ...r, open: isOpen(r.lounge) }))
      : [];
  const preferOpen = checking && hydrated && open.length > 0;
  const explicit = all.find((l) => l.id === toId) ?? null;
  const firstOpenToAll = all.find((l) => !closed(l)) ?? null;
  const target =
    explicit ??
    (ranked.find((r) => !preferOpen || r.open)?.lounge ?? (preferOpen ? open[0] : checking && hydrated ? null : firstOpenToAll));
  const route = nav && origin && target ? routeTo(nav, origin, target) : null;

  const pick = (l: Lounge) => {
    setToId(l.id);
    const panel = document.getElementById("directions-title");
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const rows: MapRow[] = nav
    ? nav.zones.map((z, i) => {
        const nextZone = nav.zones[i + 1];
        const link = nextZone ? nav.links.find((l) => linkKey(l.a, l.b) === linkKey(z.id, nextZone.id)) : undefined;
        return {
          id: z.id,
          title: z.name,
          lounges: all.filter((l) => zoneForLounge(nav, l)?.id === z.id),
          next: nextZone ? { link, connected: isConnected(nav, z.id, nextZone.id) } : undefined,
        };
      })
    : groups.map((g) => ({ id: g.terminal, title: g.terminal, lounges: g.lounges }));
  const mapRoute: MapRoute | undefined =
    route && origin
      ? {
          zones: new Set(route.zones),
          links: new Set(route.links),
          you:
            origin.kind === "gate"
              ? { row: origin.zone, gate: origin.gate?.number, label: origin.gate?.label ?? "Here" }
              : undefined,
          targetId: target?.id,
        }
      : target
        ? { zones: new Set(), links: new Set(), targetId: target.id }
        : undefined;
  return (
    <div className="bg-canvas">
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[320px_1fr]">
        <aside className="order-2 min-w-0 space-y-5 lg:order-1 lg:sticky lg:top-28 lg:self-start">
          <div id="check-access" className="scroll-mt-28">
            <AccessPicker access={access} />
          </div>
          {checking && hydrated && (
            <div className="panel p-5">
              <p className="text-sm font-semibold text-ink">Your access at {code}</p>
              <p className="mt-2 text-3xl font-semibold text-navy">
                {open.length}{" "}
                <span className="text-base font-normal text-ink-2">
                  of {all.length - closedHere.length} {closedHere.length ? "open lounges" : "lounges"}
                </span>
              </p>
              {closedHere.length > 0 && (
                <p className="mt-1 text-xs text-ink-3">
                  {closedHere.length === 1 ? "1 more is" : `${closedHere.length} more are`} closed for now and not counted.
                </p>
              )}
              {open.length === 0 ? (
                <p className="mt-2 text-sm text-ink-2">None of these cards gets you into an open lounge here.</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {open.map((l) => (
                    <li key={l.id}>
                      <a href={`#lounge-${l.id}`} className="flex items-center gap-2 text-ink-2 hover:text-brand">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: loungeNetworks[l.network].color }} />
                        <span className="truncate">{l.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-ink-3">{l.terminal.split(",")[0]}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          {noCards && (
            <p className="rounded-md border border-line bg-white p-3 text-sm text-ink-2">
              {access.mode === "wallet" ? "Your wallet is empty, so every lounge is shown with every card's rules. " : "No cards chosen yet, so every lounge is shown. "}
              <Link href="/tracker" className="link">
                Add your cards
              </Link>{" "}
              or{" "}
              <a href="#check-access" className="link">
                choose cards
              </a>{" "}
              to see which ones you can get into.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setNetwork("all")} className={cn("chip cursor-pointer", network === "all" && "border-brand bg-sky text-brand")}>
              All networks
            </button>
            {networksHere.map((n) => (
              <button
                key={n}
                onClick={() => setNetwork(n)}
                className={cn("chip cursor-pointer", network === n && "border-brand bg-sky text-brand")}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: loungeNetworks[n].color }} />
                {loungeNetworks[n].short}
              </button>
            ))}
            {checking && (
              <label className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand)]"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                />
                Only lounges I can enter
              </label>
            )}
          </div>

          <DirectionsPanel
            airport={airport}
            nav={nav}
            from={from}
            setFrom={setFrom}
            fromSecurityDefault={fromSecurityDefault}
            resolved={resolved}
            target={target}
            setTarget={setToId}
            autoTarget={!explicit}
            route={route}
            ranked={ranked}
            lounges={all}
            closed={closed}
            onlyClosed={checking && hydrated && open.length === 0 && closedHere.some((l) => (grants.get(l.id)?.length ?? 0) > 0)}
            nearestUnknown={nearestUnknown}
            checking={checking && hydrated}
            map={
              nav ? (
                <AirportMap
                  code={code}
                  nav={nav}
                  lounges={all.filter(visible)}
                  grants={openGrants}
                  closed={closed}
                  checking={checking && hydrated}
                  origin={origin}
                  route={route}
                  target={target}
                  onPick={pick}
                />
              ) : undefined
            }
          />

          <TerminalMap
            rows={rows}
            grants={openGrants}
            closed={closed}
            checking={checking && hydrated}
            visible={visible}
            route={mapRoute}
            onPick={pick}
            linkKey={linkKey}
          />

          <section aria-labelledby="lounge-list-title" className="space-y-4">
            <h2 id="lounge-list-title" className="text-lg font-semibold text-navy">
              Lounges at {code}
            </h2>
            {groups.map((g) => {
              const shown = g.lounges.filter(visible);
              if (shown.length === 0) return null;
              return (
                <div key={g.terminal} className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wide text-ink-3 uppercase">{g.terminal}</h3>
                  <ul className="space-y-3">
                    {shown.map((l) => (
                      <LoungeRow
                        key={l.id}
                        lounge={l}
                        airport={airport}
                        access={grants.get(l.id) ?? []}
                        refused={checking && hydrated ? refusedAt(l, access.selected) : []}
                        closed={closed(l)}
                        checking={checking && hydrated}
                        onDirections={() => pick(l)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="text-xs text-ink-3">
              Access rules change often (guest fees, same-day flight requirements, visit caps). Confirm in your issuer&apos;s app
              before you go.
            </p>
          </section>

          {embed && !nav && (
            <section className="panel overflow-hidden" aria-labelledby="airport-map-title">
              <div className="flex items-center justify-between gap-3 p-5 pb-3">
                <h2 id="airport-map-title" className="text-lg font-semibold text-navy">
                  {airport.name}
                </h2>
                <a href={osmLink(code)!} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline">
                  Larger map <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <iframe
                title={`Map of ${airport.name}`}
                src={embed}
                className="h-[360px] w-full border-t border-line"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
              <p className="px-5 py-2 text-xs text-ink-3">
                Map data ©{" "}
                <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                  OpenStreetMap contributors
                </a>
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-3 uppercase">More big airports</h2>
            <div className="flex flex-wrap gap-2">
              {others.map((a) => (
                <Link key={a.code} href={`/lounges/${a.code}${access.carry}`} className="chip hover:border-brand hover:text-brand">
                  {a.code}
                </Link>
              ))}
              <Link href={`/lounges${access.carry}`} className="chip hover:border-brand hover:text-brand">
                All airports →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
