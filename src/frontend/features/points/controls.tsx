import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/format";

// Filter controls for the Points & Miles pages. Plain props (no hooks): with no handler they render inert, which is
// how the prerendered fallback shows them until the interactive version takes over.

/** One-of-many buttons (aria-pressed) in the site's segmented style. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange?: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full gap-1 rounded-md bg-canvas p-1 text-sm", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange?.(o.value)}
          className={cn(
            "rounded px-3 py-1.5 font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40",
            value === o.value ? "bg-white text-brand shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A chip that toggles (aria-pressed), e.g. a cabin filter. */
export function ToggleChip({
  pressed,
  onToggle,
  disabled,
  children,
  className,
}: {
  pressed: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "chip cursor-pointer px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45",
        pressed ? "border-brand bg-sky text-brand" : "hover:border-brand/50 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** On/off switch with a visible label, e.g. "Bookable with my cards". */
export function Switch({
  checked,
  onChange,
  disabled,
  children,
  hint,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      title={hint}
      onClick={() => onChange?.(!checked)}
      className="group inline-flex items-center gap-2.5 rounded-md py-1 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:text-ink-3"
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-[#c5cad1]",
          disabled && "opacity-60",
        )}
      >
        <span
          className={cn(
            "grid h-4 w-4 place-items-center rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        >
          {checked && <Check className="h-3 w-3 text-brand" strokeWidth={3} />}
        </span>
      </span>
      {children}
    </button>
  );
}

/** Labelled native select in the site's input style. */
export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange?: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
        {label}
      </label>
      <select
        id={id}
        className="input h-10 py-0 pr-8"
        value={value}
        onChange={(e) => onChange?.(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
