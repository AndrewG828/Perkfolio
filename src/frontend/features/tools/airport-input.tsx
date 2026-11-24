"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { PlaneLanding, PlaneTakeoff, CircleDot } from "lucide-react";
import { fold, metroNamesFor, searchAirports, type WorldAirport } from "@/shared/lib/airports";
import { cn } from "@/shared/lib/format";

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

/** "GB" → "United Kingdom" (falls back to the code). */
export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

const ICONS = { origin: PlaneTakeoff, stop: CircleDot, destination: PlaneLanding };

/**
 * Airport type-ahead (ARIA combobox): type a code, city or airport name; arrow keys move through matches, Enter picks,
 * Escape closes. Leaving the field with an exact code typed picks that airport.
 */
export function AirportInput({
  label,
  kind,
  value,
  onChange,
  airports,
  loading,
  trailing,
  placeholder = "Code, city or airport",
  focusOnMount = false,
}: {
  label: string;
  kind: keyof typeof ICONS;
  value: WorldAirport | null;
  onChange: (airport: WorldAirport | null) => void;
  airports: WorldAirport[] | null;
  loading?: boolean;
  /** Extra control at the end of the row (e.g. remove stop). */
  trailing?: ReactNode;
  placeholder?: string;
  /** Take the keyboard focus when it appears (a stop just added). */
  focusOnMount?: boolean;
}) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const Icon = ICONS[kind];

  const matches = useMemo(() => (editing && airports ? searchAirports(airports, text, 8) : []), [editing, airports, text]);
  // Airports found through a metro area ("Milan") show it first, so Malpensa doesn't read as a stray "Ferno".
  const metro = useMemo(() => (editing ? metroNamesFor(text) : new Map<string, string>()), [editing, text]);
  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);
  const open = editing && matches.length > 0;
  const shown = editing ? text : value ? `${value.code} · ${value.city || value.name}` : "";

  const pick = (a: WorldAirport) => {
    onChange(a);
    setEditing(false);
    setText("");
  };
  const finish = () => {
    if (!editing) return;
    const typed = text.trim().toUpperCase();
    const exact = airports?.find((a) => a.code === typed);
    if (exact) pick(exact);
    else {
      if (!text.trim()) onChange(null);
      setEditing(false);
      setText("");
    }
  };

  return (
    <div ref={rootRef} className="relative scroll-mt-24">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            id={inputId}
            className="input h-11 pl-9 text-base sm:text-sm"
            value={shown}
            placeholder={loading ? "Loading airports…" : placeholder}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
            aria-describedby={value ? `${id}-detail` : undefined}
            onFocus={(e) => {
              e.currentTarget.select();
              // On phones, bring the field up near the top so its list of matches isn't hidden behind the keyboard.
              if (window.matchMedia("(max-width: 1023px)").matches) rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
            onChange={(e) => {
              setText(e.target.value);
              setEditing(true);
              setActive(0);
            }}
            onBlur={finish}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!editing) {
                  setEditing(true);
                  setText(value?.code ?? "");
                  setActive(0);
                  return;
                }
                if (!matches.length) return;
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive((i) => (i + step + matches.length) % matches.length);
              } else if (e.key === "Enter") {
                if (open) {
                  e.preventDefault();
                  pick(matches[Math.min(active, matches.length - 1)]);
                }
              } else if (e.key === "Escape") {
                if (editing) {
                  e.preventDefault();
                  setEditing(false);
                  setText("");
                }
              }
            }}
          />
        </div>
        {trailing}
      </div>
      {value && !editing && (
        <p id={`${id}-detail`} className="mt-1 truncate text-xs text-ink-3">
          {value.name}
          {value.country ? `, ${countryName(value.country)}` : ""}
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} airports`}
        className={cn(
          "absolute inset-x-0 top-full z-30 mt-1 max-h-[min(20rem,45dvh)] overflow-y-auto rounded-md border border-line bg-white py-1 shadow-[var(--shadow-lift)]",
          !open && "hidden",
        )}
      >
        {matches.map((a, i) => (
          <li
            key={a.code}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(a);
            }}
            onMouseMove={() => setActive(i)}
            className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm", i === active && "bg-sky")}
          >
            <span className="w-10 shrink-0 font-semibold text-navy">{a.code}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">{metro.get(a.code) ?? (a.city || a.name)}</span>
              <span className="block truncate text-xs text-ink-3">
                {metro.has(a.code) && a.city && fold(a.city) !== fold(metro.get(a.code)!) ? `${a.city} · ` : ""}
                {a.name} · {a.country}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
