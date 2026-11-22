"use client";

import { useSyncExternalStore } from "react";

export const MAX_COMPARE = 4;
const KEY = "perkfolio:compare:v1";
const EMPTY: string[] = [];

let ids: string[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    ids = JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]");
  } catch {
    ids = EMPTY;
  }
}

function set(next: string[]) {
  ids = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
  listeners.forEach((l) => l());
}

export function useCompare() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      load();
      return ids;
    },
    () => EMPTY,
  );
}

export const compareActions = {
  toggle(id: string) {
    load();
    if (ids.includes(id)) set(ids.filter((x) => x !== id));
    else if (ids.length < MAX_COMPARE) set([...ids, id]);
  },
  setAll(next: string[]) {
    load();
    set(next.slice(0, MAX_COMPARE));
  },
  clear() {
    set([]);
  },
};
