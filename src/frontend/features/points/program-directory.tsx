"use client";

import { useSearchParams } from "next/navigation";
import { ALLIANCES, awardPrograms, type Alliance, type AwardProgram } from "@/shared/data/points";
import { Segmented, Switch } from "./controls";
import { ProgramTile } from "./program-tile";
import { useWalletReach, type WalletReach } from "./use-wallet-reach";

export interface ProgramFilters {
  kind: "all" | "airline" | "hotel";
  /** "none" = airlines outside the three alliances. */
  alliance: Alliance | "none" | "all";
  mine: boolean;
}

export const DEFAULT_PROGRAM_FILTERS: ProgramFilters = { kind: "all", alliance: "all", mine: false };

const ALLIANCE_SLUG: Record<Alliance | "none", string> = { "Star Alliance": "star-alliance", oneworld: "oneworld", SkyTeam: "skyteam", none: "none" };

export function readProgramFilters(params: Pick<URLSearchParams, "get">): ProgramFilters {
  const kind = params.get("kind");
  const slug = params.get("alliance");
  const alliance = (Object.keys(ALLIANCE_SLUG) as (Alliance | "none")[]).find((a) => ALLIANCE_SLUG[a] === slug);
  return {
    kind: kind === "airline" || kind === "hotel" ? kind : alliance ? "airline" : "all",
    alliance: alliance ?? "all",
    mine: params.get("mine") === "1",
  };
}

function writeProgramFilters(f: ProgramFilters) {
  const sp = new URLSearchParams();
  if (f.kind !== "all") sp.set("kind", f.kind);
  if (f.alliance !== "all" && f.kind !== "hotel") sp.set("alliance", ALLIANCE_SLUG[f.alliance]);
  if (f.mine) sp.set("mine", "1");
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

/** Directory with filters in the URL (?kind=airline&alliance=oneworld&mine=1). Needs a <Suspense> boundary. */
export function ProgramDirectoryExplorer() {
  const params = useSearchParams();
  const filters = readProgramFilters(params);
  const wallet = useWalletReach();
  return <ProgramDirectory filters={filters} onChange={(patch) => writeProgramFilters({ ...filters, ...patch })} wallet={wallet} />;
}

const matches = (p: AwardProgram, f: ProgramFilters, w?: WalletReach) =>
  (f.kind === "all" || p.kind === f.kind) &&
  (f.alliance === "all" || (p.kind === "airline" && (f.alliance === "none" ? !p.alliance : p.alliance === f.alliance))) &&
  (!f.mine || Boolean(w?.reach.has(p.id)));

/** Filter bar + tiles, airlines then hotels. Without `onChange` it renders everything, inert (prerendered fallback). */
export function ProgramDirectory({
  filters = DEFAULT_PROGRAM_FILTERS,
  onChange,
  wallet,
}: {
  filters?: ProgramFilters;
  onChange?: (patch: Partial<ProgramFilters>) => void;
  wallet?: WalletReach;
}) {
  const personal = Boolean(wallet?.hydrated);
  const hasCards = (wallet?.points.cards.length ?? 0) > 0;
  const list = [...awardPrograms].sort((a, b) => a.name.localeCompare(b.name)).filter((p) => matches(p, filters, wallet));
  const sections = (["airline", "hotel"] as const)
    .map((kind) => ({ kind, title: kind === "airline" ? "Airline programs" : "Hotel programs", programs: list.filter((p) => p.kind === kind) }))
    .filter((s) => s.programs.length > 0);

  return (
    <div className="space-y-8">
      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <Segmented<ProgramFilters["kind"]>
          label="Program type"
          value={filters.kind}
          onChange={onChange && ((kind) => onChange({ kind, alliance: kind === "hotel" ? "all" : filters.alliance }))}
          options={[
            { value: "all", label: "All" },
            { value: "airline", label: "Airlines" },
            { value: "hotel", label: "Hotels" },
          ]}
        />
        <Segmented<ProgramFilters["alliance"]>
          label="Alliance"
          value={filters.alliance}
          onChange={onChange && ((alliance) => onChange({ alliance, kind: alliance === "all" ? filters.kind : "airline" }))}
          className="flex-wrap"
          options={[
            { value: "all", label: "Any alliance" },
            ...ALLIANCES.map((a) => ({ value: a, label: a, disabled: filters.kind === "hotel" })),
            { value: "none", label: "No alliance", disabled: filters.kind === "hotel" },
          ]}
        />
        <Switch
          checked={filters.mine}
          onChange={onChange && ((mine) => onChange({ mine }))}
          disabled={personal && !hasCards && !filters.mine}
          hint={personal && !hasCards ? "Add cards to your wallet first" : undefined}
        >
          Only programs my cards reach
        </Switch>
      </div>

      {sections.length === 0 ? (
        <div className="panel p-10 text-center text-ink-2">
          No programs match these filters.{" "}
          {onChange && (
            <button type="button" className="link" onClick={() => onChange(DEFAULT_PROGRAM_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.kind} aria-labelledby={`programs-${s.kind}`}>
            <h2 id={`programs-${s.kind}`} className="mb-4 text-lg font-semibold text-navy">
              {s.title} <span className="font-normal text-ink-3">· {s.programs.length}</span>
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {s.programs.map((p) => (
                <ProgramTile
                  key={p.id}
                  program={p}
                  reach={personal && hasCards ? (wallet!.reach.get(p.id) ?? null) : undefined}
                  mine={wallet?.mine}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
