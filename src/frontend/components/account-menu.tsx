"use client";

import { useState } from "react";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { requestSync, useAccount } from "@/frontend/state/account";
import { signInWithGoogle, signOutAction } from "@/backend/auth/actions";

/** Deletes the account and its cloud wallet, then signs out. The copy in this browser is kept. */
async function deleteAccount(): Promise<string | null> {
  const ok = window.confirm(
    "Delete your Perkfolio account and the wallet saved to it? Your other devices will stop syncing. " +
      "The wallet in this browser stays (use Reset in the tracker to clear it).",
  );
  if (!ok) return null;
  const res = await fetch("/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: "delete my account" }),
  });
  if (!res.ok) return "Couldn't delete your account. Try again in a moment.";
  try {
    window.localStorage.removeItem("perkfolio:sync:v2");
  } catch {}
  await signOutAction();
  return null;
}

/** Sign-in button / account chip in the header. Renders nothing until accounts are configured. */
export function AccountMenu() {
  const account = useAccount();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  if (account.status !== "ready" || !account.enabled) return null;

  if (!account.user) {
    return (
      <form action={signInWithGoogle}>
        <button className="btn-secondary px-3 sm:px-4" title="Sign in with Google to sync your wallet across devices">
          <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Sign in</span>
        </button>
      </form>
    );
  }

  const u = account.user;
  const initial = (u.name ?? u.email ?? "?").trim().charAt(0).toUpperCase();
  const syncIcon =
    account.syncState === "error" ? (
      <CloudOff className="h-3.5 w-3.5 text-danger" />
    ) : account.syncState === "syncing" ? (
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-ink-3" />
    ) : (
      <Cloud className="h-3.5 w-3.5 text-success" />
    );
  const syncText = !account.sync
    ? "Cloud sync isn't set up yet"
    : account.syncState === "error"
      ? `Couldn't sync — saved in this browser for now. ${account.syncError ?? ""}`
      : account.syncState === "syncing"
        ? "Syncing…"
        : `Synced to your account${account.lastSyncedAt ? ` · ${new Date(account.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full p-0.5 hover:bg-sky" aria-label="Account menu">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-sm font-semibold text-white">{initial}</span>
        {account.sync && syncIcon}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-line bg-white p-4 shadow-[var(--shadow-lift)]">
        <p className="truncate font-semibold text-ink">{u.name ?? "Signed in"}</p>
        {u.email && <p className="truncate text-sm text-ink-3">{u.email}</p>}
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          {syncIcon} {syncText}
        </p>
        {account.sync && (
          <button className="btn-ghost mt-2 w-full justify-start px-2 text-sm" onClick={() => requestSync()}>
            <RefreshCw className="h-4 w-4" /> Sync now
          </button>
        )}
        <form action={signOutAction} className="mt-2 border-t border-line pt-3">
          <button className="btn-ghost w-full justify-start px-2">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
        {account.sync && (
          <button
            className="btn-ghost mt-1 w-full justify-start px-2 text-sm text-danger"
            onClick={async () => setDeleteError(await deleteAccount())}
          >
            <Trash2 className="h-4 w-4" /> Delete account
          </button>
        )}
        {deleteError && <p className="mt-1 text-sm text-danger">{deleteError}</p>}
      </div>
    </details>
  );
}
