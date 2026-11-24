import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { START_TOOL, TOOL_GROUPS, TOOLS, type Tool } from "./catalog";

/** The /tools page body: a Start here prompt, then every tool grouped by what it helps with. */
export function ToolsIndex() {
  const Start = START_TOOL.icon;
  return (
    <div className="bg-canvas">
      <div className="container-page space-y-12 py-10 md:py-12">
        <Link
          href={START_TOOL.href}
          className="group relative flex flex-col gap-5 overflow-hidden rounded-lg bg-brand p-6 text-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:p-8"
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(60% 120% at 100% 0%, #0a5fc2 0%, transparent 70%)" }}
            aria-hidden
          />
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15">
            <Start className="h-7 w-7" aria-hidden />
          </span>
          <span className="relative flex-1">
            <span className="block text-xs font-semibold tracking-[0.18em] text-white/75 uppercase">Not sure where to begin?</span>
            <span className="mt-1 block text-2xl font-semibold">Start here</span>
            <span className="mt-1 block max-w-xl text-white/85">{START_TOOL.blurb}</span>
          </span>
          <span className="btn-light relative shrink-0 self-start sm:self-center">
            Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>

        {TOOL_GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`tools-${g.id}`}>
            <div className="mb-5 max-w-2xl">
              <h2 id={`tools-${g.id}`} className="text-2xl font-semibold tracking-tight text-navy">
                {g.title}
              </h2>
              <p className="mt-1 text-ink-2">{g.blurb}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.filter((t) => t.group === g.id).map((t) => (
                <li key={t.href} className="flex">
                  <ToolTile tool={t} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ToolTile({ tool, cta = "Open" }: { tool: Tool; cta?: string }) {
  const Icon = tool.icon;
  return (
    <Link href={tool.href} className="panel group flex w-full gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky text-brand">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-navy group-hover:text-brand">{tool.title}</span>
          {tool.isNew && <span className="rounded-full bg-sky px-2 py-0.5 text-[11px] font-semibold text-brand">New</span>}
        </span>
        <span className="mt-1 text-sm leading-relaxed text-ink-2">{tool.blurb}</span>
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-brand">
          {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
