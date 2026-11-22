import Link from "next/link";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Perkfolio home">
      <span className={inverted ? "grid h-9 w-9 place-items-center rounded-[4px] bg-white text-navy" : "grid h-9 w-9 place-items-center rounded-[4px] bg-brand text-white"}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
          <path d="M7 14.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className={inverted ? "text-lg font-bold tracking-tight text-white" : "text-lg font-bold tracking-tight text-navy"}>
        Perkfolio
      </span>
    </Link>
  );
}
