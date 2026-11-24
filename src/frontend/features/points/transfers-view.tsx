"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Calculator, Table2 } from "lucide-react";
import { isProgramId, type ProgramId } from "@/shared/data/points";
import { Segmented } from "./controls";
import { MilesPlanner } from "./miles-planner";
import { DEFAULT_TRANSFER_FILTERS, TransferChart, readTransferFilters, transferFilterParams, type TransferFilters } from "./transfer-chart";
import { useWalletReach, type WalletReach } from "./use-wallet-reach";

export interface TransfersState extends TransferFilters {
  /** The chart, or "I need miles" (the planner). */
  mode: "chart" | "miles";
  need: ProgramId | null;
  miles: number | null;
}

export const DEFAULT_TRANSFERS_STATE: TransfersState = { ...DEFAULT_TRANSFER_FILTERS, mode: "chart", need: null, miles: null };

export function readTransfersState(params: Pick<URLSearchParams, "get">): TransfersState {
  const need = params.get("need");
  const miles = Number(params.get("miles"));
  return {
    ...readTransferFilters(params),
    mode: params.get("mode") === "miles" ? "miles" : "chart",
    need: isProgramId(need) ? need : null,
    miles: Number.isFinite(miles) && miles > 0 ? Math.round(miles) : null,
  };
}

function writeTransfersState(s: TransfersState) {
  const sp = new URLSearchParams();
  if (s.mode === "miles") {
    sp.set("mode", "miles");
    if (s.need) sp.set("need", s.need);
    if (s.miles) sp.set("miles", String(s.miles));
  } else transferFilterParams(s, sp);
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

/** /points/transfers with its state in the URL (?mode=miles&need=…&miles=…, or the chart filters). Needs <Suspense>. */
export function TransfersExplorer() {
  const params = useSearchParams();
  const state = readTransfersState(params);
  const wallet = useWalletReach();
  // A link with values the page can't use (need=not-a-program, miles=-5) shows the defaults; drop them from the URL too.
  const query = params.toString();
  useEffect(() => {
    const sp = new URLSearchParams(query);
    const bad =
      (sp.has("need") && !state.need) ||
      (sp.has("miles") && !state.miles) ||
      (sp.has("mode") && sp.get("mode") !== state.mode) ||
      (sp.has("kind") && sp.get("kind") !== state.kind) ||
      (sp.has("currency") && !state.currency);
    if (bad) writeTransfersState(state);
    // `state` is derived from `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return <TransfersView state={state} onChange={(patch) => writeTransfersState({ ...state, ...patch })} wallet={wallet} />;
}

/** The chart or the "I need miles" planner. Without `onChange` it renders the chart, inert (the prerendered fallback). */
export function TransfersView({
  state = DEFAULT_TRANSFERS_STATE,
  onChange,
  wallet,
}: {
  state?: TransfersState;
  onChange?: (patch: Partial<TransfersState>) => void;
  wallet?: WalletReach;
}) {
  return (
    <div className="space-y-5">
      <Segmented<TransfersState["mode"]>
        label="View"
        value={state.mode}
        onChange={onChange && ((mode) => onChange({ mode }))}
        className="bg-white p-1 shadow-[var(--shadow-card)] ring-1 ring-line"
        options={[
          {
            value: "chart",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Table2 className="h-4 w-4" aria-hidden /> Transfer chart
              </span>
            ),
          },
          {
            value: "miles",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Calculator className="h-4 w-4" aria-hidden /> I need miles
              </span>
            ),
          },
        ]}
      />
      {state.mode === "miles" ? (
        <MilesPlanner need={state.need} miles={state.miles} onChange={onChange && ((patch) => onChange(patch))} wallet={wallet} />
      ) : (
        <TransferChart filters={state} onChange={onChange && ((patch) => onChange(patch))} wallet={wallet} />
      )}
    </div>
  );
}
