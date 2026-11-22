"use client";

import { useEffect } from "react";

export const NEW_ORIGIN = "https://perkfolio-app.vercel.app";

function toBase64Url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Runs on the old address: carries the wallet saved there over to the new address. */
export function MoveHandoff() {
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem("perkfolio:wallet:v1");
    } catch {}
    const path = window.location.pathname === "/move" ? "/" : window.location.pathname;
    let hasCards = false;
    try {
      hasCards = Boolean(raw && JSON.parse(raw).cards?.length);
    } catch {}
    window.location.replace(hasCards ? `${NEW_ORIGIN}/import#w=${toBase64Url(raw!)}` : `${NEW_ORIGIN}${path}${window.location.search}`);
  }, []);
  return null;
}
