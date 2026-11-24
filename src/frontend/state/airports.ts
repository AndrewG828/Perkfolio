"use client";

import { useEffect, useSyncExternalStore } from "react";
import { decodeAirports, type AirportsFile, type WorldAirport } from "@/shared/lib/airports";

/**
 * The world airport list (public/data/airports.json, ~270 KB), fetched once per page load and only by the tools that
 * need it, so it never weighs down the main bundle.
 */

export interface AirportsState {
  status: "idle" | "loading" | "ready" | "error";
  airports: WorldAirport[] | null;
  byCode: Map<string, WorldAirport> | null;
}

const IDLE: AirportsState = { status: "idle", airports: null, byCode: null };
let state: AirportsState = IDLE;
const listeners = new Set<() => void>();

function set(next: AirportsState) {
  state = next;
  listeners.forEach((l) => l());
}

export function loadAirports() {
  if (state.status === "loading" || state.status === "ready") return;
  set({ ...state, status: "loading" });
  fetch("/data/airports.json")
    .then((res) => {
      if (!res.ok) throw new Error(`airports.json: ${res.status}`);
      return res.json() as Promise<AirportsFile>;
    })
    .then((file) => {
      const airports = decodeAirports(file);
      set({ status: "ready", airports, byCode: new Map(airports.map((a) => [a.code, a])) });
    })
    .catch(() => set({ status: "error", airports: null, byCode: null }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The airport list, loading it on first use. `status` is "error" if the file couldn't be fetched (call retry). */
export function useWorldAirports(): AirportsState & { retry: () => void } {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
  useEffect(() => {
    loadAirports();
  }, []);
  return { ...snapshot, retry: loadAirports };
}
