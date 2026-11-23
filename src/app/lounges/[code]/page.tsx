import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";
import { airports } from "@/shared/data/lounges";
import { airportByCode, loungeCountByAirport } from "@/shared/lib/lounge-access";
import { AirportView } from "@/frontend/features/lounges/airport-view";

export function generateStaticParams() {
  return airports.filter((a) => loungeCountByAirport[a.code]).map((a) => ({ code: a.code }));
}

export async function generateMetadata({ params }: PageProps<"/lounges/[code]">): Promise<Metadata> {
  const { code } = await params;
  const a = airportByCode.get(code.toUpperCase());
  if (!a) return {};
  return {
    title: `${a.code} lounges`,
    description: `Terminal map of the ${loungeCountByAirport[a.code]} lounges at ${a.name}, and which ones your cards get you into.`,
  };
}

export default async function AirportPage({ params }: PageProps<"/lounges/[code]">) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const airport = airportByCode.get(code);
  if (!airport || !loungeCountByAirport[code]) notFound();

  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0" style={{ background: "radial-gradient(70% 140% at 90% 0%, #0a5fc2 0%, transparent 60%)" }} />
        <div className="container-page relative py-10 md:py-12">
          <Link href="/lounges" className="inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
            <ChevronLeft className="h-4 w-4" /> All airports
          </Link>
          <p className="mt-4 flex items-center gap-1 text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
            <MapPin className="h-3.5 w-3.5" /> {airport.city}, {airport.country}
          </p>
          <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight md:text-[44px]">
            {airport.code} lounges <span className="font-normal text-white/70">· {loungeCountByAirport[code]}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-lg text-white/80">{airport.name}</p>
        </div>
      </section>
      <Suspense fallback={<div className="container-page py-16"><div className="panel h-96 animate-pulse bg-canvas" /></div>}>
        <AirportView code={code} />
      </Suspense>
    </>
  );
}
