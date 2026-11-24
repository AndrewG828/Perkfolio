"use client";

import { programGroups } from "@/shared/data/strategy/programs";
import { cn } from "@/shared/lib/format";

/** A select of bank currencies and loyalty programs, grouped by kind. */
export function ProgramSelect({
  value,
  onChange,
  label,
  placeholder = "Choose a program",
  exclude,
  required,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  placeholder?: string;
  /** Ids to leave out (e.g. programs that already have a balance). */
  exclude?: Set<string>;
  required?: boolean;
  className?: string;
}) {
  return (
    <select className={cn("input", className)} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} required={required}>
      <option value="">{placeholder}</option>
      {programGroups.map((g) => (
        <optgroup key={g.kind} label={g.label}>
          {g.programs
            .filter((p) => !exclude?.has(p.id) || p.id === value)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
