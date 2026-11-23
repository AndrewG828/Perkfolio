"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Wallet, X } from "lucide-react";
import { Logo } from "./logo";
import { AccountMenu } from "./account-menu";
import { useWallet } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";

const NAV = [
  { href: "/lounges", label: "Lounge Finder" },
  { href: "/tracker", label: "Benefits Tracker" },
  { href: "/cards", label: "Explore Cards" },
  { href: "/compare", label: "Compare" },
  { href: "/best-card", label: "Which Card?" },
  { href: "/calculator", label: "Value Calculator" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const wallet = useWallet();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="hidden bg-navy text-[12px] text-white/80 md:block">
        <div className="container-page flex h-8 items-center justify-between">
          <span>Independent card research · Terms verified November 2026</span>
          <span className="flex gap-5">
            <Link href="/about" className="hover:text-white">About our data</Link>
            <Link href="/tracker" className="hover:text-white">My Wallet</Link>
          </span>
        </div>
      </div>
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Logo />
        <nav className="hidden h-full items-stretch gap-1 lg:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center px-3 text-[15px] font-medium transition-colors",
                  active ? "text-brand" : "text-ink hover:text-brand",
                )}
              >
                {item.label}
                <span className={cn("absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-brand transition-opacity", active ? "opacity-100" : "opacity-0")} />
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <AccountMenu />
          <Link href="/tracker" className="btn-primary hidden sm:inline-flex">
            <Wallet className="h-4 w-4" />
            My Wallet
            {wallet.cards.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 text-xs">{wallet.cards.length}</span>
            )}
          </Link>
          <button
            className="grid h-10 w-10 place-items-center rounded text-navy hover:bg-sky lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-white lg:hidden" aria-label="Mobile">
          <div className="container-page flex flex-col py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn("rounded px-2 py-3 text-base font-medium", pathname.startsWith(item.href) ? "text-brand" : "text-ink")}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
