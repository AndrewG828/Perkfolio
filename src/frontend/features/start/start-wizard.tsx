"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Armchair, Check, CircleCheck, Coins, CreditCard, LayoutGrid, PlaneTakeoff, RotateCcw, Scale, type LucideIcon } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import {
  START_FLOWS,
  activeQuestions,
  answersFrom,
  feeCheck,
  flowById,
  flowHref,
  isAnswered,
  nextQuestion,
  startValues,
  suggestCards,
  type Answers,
  type FlowId,
  type StartContext,
  type StartFlow,
} from "@/shared/lib/start-flows";
import { shortCardName } from "@/shared/lib/card-name";
import { cn, usd } from "@/shared/lib/format";
import { CardArt } from "@/frontend/components/card-art";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { toolFor } from "@/frontend/features/tools/catalog";

const FLOW_ICONS: Record<FlowId, LucideIcon> = {
  points: Coins,
  card: CreditCard,
  fee: Scale,
  trip: PlaneTakeoff,
  airport: Armchair,
};

/** Many short answers (airports, cities) sit two or three to a row, even on phones; longer ones get a row each. */
function optionGrid(options: { label: string }[]) {
  if (options.length > 6 && options.every((o) => o.label.length <= 16)) return "grid-cols-2 sm:grid-cols-3";
  return options.length > 4 ? "sm:grid-cols-2" : "";
}

/** Every step is a URL (/start?flow=trip&from=JFK), pushed onto history so Back works. */
const go = (href: string) => window.history.pushState(null, "", href);

/** The "Start here" wizard: pick a goal, answer a few one-tap questions, land on the right tools. */
export function StartWizard() {
  const params = useSearchParams();
  const wallet = useWallet();
  const hydrated = useHydrated();
  const { cpp } = useStrategyPrefs();
  const ctx: StartContext = hydrated ? { wallet: wallet.cards, own: cpp } : { wallet: [] };
  const flow = flowById(params.get("flow"));
  const answers = flow ? answersFrom(flow, params) : {};
  const question = flow ? nextQuestion(flow, answers, ctx) : null;
  const stepKey = `${flow?.id ?? ""}:${question?.id ?? "done"}`;

  // Move focus to the new step's heading after a tap, so keyboard and screen-reader users follow along.
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStep = useRef(stepKey);
  useEffect(() => {
    if (lastStep.current !== stepKey) heading.current?.focus();
    lastStep.current = stepKey;
  }, [stepKey]);

  if (!flow) return <FlowPicker headingRef={heading} />;

  const asked = activeQuestions(flow, answers);
  const answered = asked.filter((q) => isAnswered(q, answers, ctx));
  const step = question ? answered.length + 1 : asked.length;
  // Back undoes the last answer (or leaves the flow), whether or not this page was opened from a shared link.
  const backHref = () => {
    const last = answered[answered.length - 1];
    if (!last) return "/start";
    const rest = { ...answers };
    delete rest[last.id];
    return flowHref(flow.id, rest);
  };
  const Icon = FLOW_ICONS[flow.id];

  return (
    <div className="bg-canvas">
      <div className="container-page max-w-3xl py-8 md:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => go(backHref())} className="btn-ghost -ml-3 px-3 py-2">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
          <button type="button" onClick={() => go("/start")} className="btn-ghost -mr-3 px-3 py-2 text-ink-2">
            <RotateCcw className="h-4 w-4" aria-hidden /> Start over
          </button>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky text-brand">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{flow.title}</p>
            <p className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-3">
              {question ? (
                `Question ${step} of ${asked.length}`
              ) : (
                <>
                  <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden /> All set
                </>
              )}
            </p>
          </div>
          <div
            className="h-1 bg-brand transition-[width] duration-300"
            style={{ width: `${(question ? (step - 1) / asked.length : 1) * 100}%` }}
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={0}
            aria-valuemax={asked.length}
            aria-valuenow={question ? step - 1 : asked.length}
          />

          <div className="p-5 sm:p-8">
            {question ? (
              <>
                <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-navy outline-none">
                  {question.prompt}
                </h2>
                {question.help && <p className="mt-2 text-ink-2">{question.help}</p>}
                <ul className={cn("mt-6 grid gap-2.5", optionGrid(question.options(ctx)))}>
                  {question.options(ctx).map((o) => {
                    const chosen = answers[question.id] === o.value;
                    return (
                      <li key={o.value}>
                        <button
                          type="button"
                          onClick={() => go(flowHref(flow.id, { ...answers, [question.id]: o.value }))}
                          aria-pressed={chosen}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-md border bg-white px-4 py-3.5 text-left transition-colors hover:border-brand hover:bg-sky focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                            chosen ? "border-brand bg-sky" : "border-line",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-ink">{o.label}</span>
                            {o.hint && <span className="block text-xs text-ink-3">{o.hint}</span>}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {answered.length > 0 && <AnswerTrail flow={flow} answers={answers} ctx={ctx} />}
              </>
            ) : (
              <Results flow={flow} answers={answers} ctx={ctx} headingRef={heading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowPicker({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="bg-canvas">
      <div className="container-page py-8 md:py-12">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-navy outline-none">
          What brings you here?
        </h2>
        <p className="mt-1 text-ink-2">Pick one, then two to four quick taps.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {START_FLOWS.map((f) => {
            const Icon = FLOW_ICONS[f.id];
            return (
              <li key={f.id} className="flex">
                <button
                  type="button"
                  onClick={() => go(flowHref(f.id, {}))}
                  className="panel group flex w-full flex-col gap-3 p-6 text-left transition-shadow hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-sky text-brand">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="text-lg leading-snug font-semibold text-navy group-hover:text-brand">{f.title}</span>
                  <span className="text-sm leading-relaxed text-ink-2">{f.blurb}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-brand">
                    Let&apos;s go <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
          <li className="flex">
            <Link
              href="/tools"
              className="group flex w-full flex-col gap-3 rounded-lg border border-dashed border-[#b9c6d6] p-6 text-left transition-colors hover:border-brand hover:bg-white"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-brand">
                <LayoutGrid className="h-6 w-6" aria-hidden />
              </span>
              <span className="text-lg leading-snug font-semibold text-navy group-hover:text-brand">I know what I need</span>
              <span className="text-sm leading-relaxed text-ink-2">Skip the questions and pick from every tool.</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-brand">
                All tools <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** The answers so far, as chips, each one tap away from changing it. */
function AnswerTrail({ flow, answers, ctx }: { flow: StartFlow; answers: Answers; ctx: StartContext }) {
  const asked = activeQuestions(flow, answers).filter((q) => isAnswered(q, answers, ctx));
  if (asked.length === 0) return null;
  return (
    <div className="mt-8 border-t border-line pt-5">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Your answers</p>
      <ul className="flex flex-wrap gap-2">
        {asked.map((q, i) => {
          const value = answers[q.id] ?? "";
          const option = q.options(ctx).find((o) => o.value === value);
          const label = option
            ? option.hint && /^[A-Z]{3}$/.test(option.hint)
              ? `${option.label} · ${option.hint}`
              : option.label
            : getCard(value)
              ? shortCardName(getCard(value)!.name)
              : value;
          // Changing an answer drops the ones after it.
          const keep = Object.fromEntries(asked.slice(0, i).map((x) => [x.id, answers[x.id]]));
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => go(flowHref(flow.id, keep))}
                className="chip cursor-pointer gap-1.5 hover:border-brand hover:text-brand"
                aria-label={`Change answer: ${q.prompt} ${label}`}
              >
                <Check className="h-3 w-3 text-success" aria-hidden /> {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Results({
  flow,
  answers,
  ctx,
  headingRef,
}: {
  flow: StartFlow;
  answers: Answers;
  ctx: StartContext;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const results = flow.results(answers, ctx);
  const fee = flow.id === "fee" ? feeCheck(answers.card, answers.usage) : null;
  const picks = flow.id === "card" ? suggestCards(answers.spend, answers.fee, answers.travel, startValues(ctx)).map(getCard).filter((c): c is Card => Boolean(c)) : [];
  return (
    <>
      <p className="eyebrow">Your plan</p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight text-navy outline-none">
        Here&apos;s where to go next
      </h2>

      {fee && (
        <div className={cn("mt-5 flex items-center gap-4 rounded-md border p-4", fee.net >= 0 ? "border-success/30 bg-success/5" : "border-warn/30 bg-[#fdf4ea]")}>
          <CardArt card={fee.card} size="sm" className="hidden shrink-0 sm:block" />
          <div>
            <p className="text-sm font-semibold text-ink">
              {fee.net >= 0
                ? `Credits alone cover the ${usd(fee.fee)} fee, with ${usd(fee.net)} to spare.`
                : `Credits you'd use come to about ${usd(fee.credits)}, ${usd(-fee.net)} short of the ${usd(fee.fee)} fee.`}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              That&apos;s before the points you earn. The calculator adds those for your spending.
            </p>
          </div>
        </div>
      )}

      {picks.length > 0 && (
        <ul className="mt-5 grid grid-cols-3 gap-3" aria-label="Cards to compare">
          {picks.map((c) => (
            <li key={c.id} className="min-w-0 text-center">
              <Link href={`/cards/${c.id}`} className="group block">
                <CardArt card={c} size="sm" className="mx-auto w-full max-w-[140px] transition-transform group-hover:-translate-y-0.5" />
                <span className="mt-2 block truncate text-xs font-semibold text-ink group-hover:text-brand">{shortCardName(c.name)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-6 space-y-3">
        {results.map((r, i) => {
          const tool = toolFor(r.href);
          const Icon = tool?.icon ?? CreditCard;
          return (
            <li key={r.href}>
              <Link
                href={r.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md border bg-white p-3.5 transition-colors hover:border-brand hover:bg-sky sm:gap-4 sm:p-4",
                  i === 0 ? "border-brand" : "border-line",
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand group-hover:bg-white sm:h-11 sm:w-11">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-navy">{r.title}</span>
                  <span className="block text-sm text-ink-2">{r.body}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <AnswerTrail flow={flow} answers={answers} ctx={ctx} />
    </>
  );
}
