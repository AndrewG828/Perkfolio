"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { linkLabel, sourceLabels, splitUrls, visitorSources } from "@/shared/lib/travel-format";
import { cn } from "@/shared/lib/format";

/** A link that opens in a new tab, marked as such for screen readers. */
export function ExternalA({ href, children, className, title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  if (href.startsWith("/")) {
    return (
      <a href={href} className={cn("link", className)} title={title}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={cn("link inline-flex items-center gap-1", className)}>
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * Source links by host name ("travel.state.gov", ...). Several pages on one site are named by page ("Chase ·
 * Boundless", "Chase · Bold"), pages whose address says little by an explicit name ("GOV.UK · Home Office fees, Oct
 * 2026"), and datasets by what they are, so each link says where it goes. Files a visitor can't use link the page they
 * belong to (GOV.UK's visa checker for its source files). With `max`, the first few show and the rest wait behind a
 * "+N more" button.
 */
export function SourceLinks({ sources, className, max }: { sources: string[]; className?: string; max?: number }) {
  const [all, setAll] = useState(false);
  const unique = visitorSources(sources);
  if (unique.length === 0) return null;
  const folded = !all && max !== undefined && unique.length > max + 1;
  const shown = folded ? unique.slice(0, max) : unique;
  const labels = sourceLabels(unique);
  return (
    <span className={cn("inline-flex flex-wrap gap-x-2 gap-y-1", className)}>
      {shown.map((s, i) => (
        <ExternalA key={s} href={s} className="font-medium" title={s}>
          {labels[i]}
        </ExternalA>
      ))}
      {folded && (
        <button type="button" onClick={() => setAll(true)} className="font-medium text-brand hover:underline">
          +{unique.length - shown.length} more<span className="sr-only"> sources</span>
        </button>
      )}
    </span>
  );
}

/** Prose with any web addresses in it turned into links named for their page. */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitUrls(text).map((part, i) =>
        part.url ? (
          <ExternalA key={i} href={part.url} title={part.url} className="font-medium">
            {linkLabel(part.url)}
          </ExternalA>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
