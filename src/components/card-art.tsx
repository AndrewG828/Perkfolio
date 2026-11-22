import type { Card } from "@/data/types";
import { cn } from "@/lib/format";

/** A stylized, original rendering of a card (no issuer artwork) using the card's color palette. */
export function CardArt({
  card,
  size = "md",
  className,
}: {
  card: Pick<Card, "name" | "issuer" | "network" | "art">;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const light = card.art.text === "light";
  const metal = card.art.finish === "metal";
  const width = { xs: "w-16", sm: "w-28", md: "w-full max-w-[320px]", lg: "w-full max-w-[420px]" }[size];
  const tiny = size === "xs" || size === "sm";
  const shortName = card.name.replace(/^(The |American Express |Chase |Capital One |Citi )/i, "").replace(/ Card$/i, "");

  return (
    <div
      role="img"
      aria-label={`${card.name} card`}
      className={cn(
        "relative aspect-[1.586] overflow-hidden rounded-[6%/9.5%] shadow-[0_10px_30px_-10px_rgba(0,23,90,0.45)] ring-1 ring-black/10",
        width,
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${card.art.from} 0%, ${card.art.to} 100%)` }}
    >
      {/* sheen */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: metal
            ? "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.28) 45%, rgba(255,255,255,0) 60%), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)"
            : "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.22), transparent 55%)",
        }}
      />
      {/* subtle pattern */}
      <svg className="pointer-events-none absolute -right-[10%] -bottom-[30%] h-[110%] opacity-[0.12]" viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r="98" fill="none" stroke={light ? "#fff" : "#000"} strokeWidth="1.5" />
        <circle cx="100" cy="100" r="70" fill="none" stroke={light ? "#fff" : "#000"} strokeWidth="1.5" />
        <circle cx="100" cy="100" r="42" fill="none" stroke={light ? "#fff" : "#000"} strokeWidth="1.5" />
      </svg>
      {!tiny || size === "sm" ? (
        <div className={cn("absolute inset-0 flex flex-col justify-between", tiny ? "p-2" : "p-[7%]", light ? "text-white" : "text-[#1b1d20]")}>
          <div className="flex items-start justify-between">
            <span className={cn("font-semibold tracking-wide uppercase opacity-90", tiny ? "text-[6px]" : "text-[11px]")}>{card.issuer}</span>
          </div>
          {/* EMV chip */}
          <div
            className={cn("rounded-[3px]", tiny ? "h-[14%] w-[13%]" : "h-[17%] w-[14%]")}
            style={{ background: "linear-gradient(135deg,#e9d8a6,#b9975b 50%,#e9d8a6)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
          />
          <div className="flex items-end justify-between gap-2">
            <span className={cn("leading-tight font-semibold", tiny ? "text-[7px]" : "text-sm")}>{shortName}</span>
            <span className={cn("font-bold italic opacity-90", tiny ? "text-[6px]" : "text-xs")}>{card.network.toUpperCase()}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
