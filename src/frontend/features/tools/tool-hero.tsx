import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/** PageHero for a single tool, with a way back to the tools index. */
export function ToolHero({
  eyebrow,
  title,
  subtitle,
  back = { href: "/tools", label: "All tools" },
  compact = false,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  back?: { href: string; label: string } | null;
  /** Less height, for pages where the content below is the point (e.g. the Start here wizard). */
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <div className="absolute inset-0" style={{ background: "radial-gradient(70% 140% at 90% 0%, #0a5fc2 0%, transparent 60%)" }} />
      <div className={`container-page relative ${compact ? "py-8 md:py-10" : "py-10 md:py-14"}`}>
        {back && (
          <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
            <ChevronLeft className="h-4 w-4" /> {back.label}
          </Link>
        )}
        <p className={`${back ? "mt-4" : ""} text-xs font-semibold tracking-[0.18em] text-white/70 uppercase`}>{eyebrow}</p>
        <h1 className={`mt-3 max-w-3xl leading-tight font-semibold tracking-tight ${compact ? "text-3xl md:text-4xl" : "text-3xl md:text-[44px]"}`}>
          {title}
        </h1>
        {subtitle && <p className={`max-w-2xl text-white/80 ${compact ? "mt-3 text-base md:text-lg" : "mt-4 text-lg"}`}>{subtitle}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Suspense fallback for a tool page body: a sidebar and a main column of pulsing panels. */
export function ToolSkeleton({ sidebar = true }: { sidebar?: boolean }) {
  return (
    <div className="bg-canvas">
      <div className={`container-page grid gap-6 py-10 ${sidebar ? "lg:grid-cols-[360px_1fr]" : ""}`}>
        {sidebar && <div className="panel h-80 animate-pulse bg-white" />}
        <div className="space-y-6">
          <div className="panel h-28 animate-pulse bg-white" />
          <div className="panel h-72 animate-pulse bg-white" />
        </div>
      </div>
    </div>
  );
}
