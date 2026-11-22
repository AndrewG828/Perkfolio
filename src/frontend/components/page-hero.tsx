import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70% 140% at 90% 0%, #0a5fc2 0%, transparent 60%)" }}
      />
      <div className="container-page relative py-12 md:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-semibold tracking-tight md:text-[44px]">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-lg text-white/80">{subtitle}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
