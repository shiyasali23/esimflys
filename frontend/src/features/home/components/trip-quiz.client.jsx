"use client";
import { useState } from "react";
import Link from "next/link";
import quiz from "@/content/quiz.json";
import { cn } from "@/lib/cn";

const DATA_BY_NEED = {
  Light: "3–5 GB",
  Medium: "10 GB",
  Heavy: "20 GB",
  Unlimited: "an Unlimited daily plan",
};

function recommend(answers) {
  const data = DATA_BY_NEED[answers.needs] || "10 GB";
  const duration = answers.duration || "your trip";
  return `Based on your answers, we suggest around ${data} for ${duration.toLowerCase()}. Pick your destination to see matching plans.`;
}

export function TripQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const s = quiz.steps[step];
  const isLast = step === quiz.steps.length - 1;

  if (done) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-14 md:py-20">
        <div className="rounded-card border border-border bg-card p-6 text-center sm:p-8 md:p-10">
          <p className="text-label-caps uppercase text-cta-text">Your recommendation</p>
          <p className="mx-auto mt-4 max-w-2xl text-lg">{recommend(answers)}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={quiz.cta.href}
              className="inline-flex min-h-11 items-center rounded-full bg-cta px-6 text-sm font-semibold text-cta-foreground transition hover:brightness-110"
            >
              Browse destinations
            </Link>
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setStep(0);
                setAnswers({});
              }}
              className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Start over
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-6 py-14 md:py-20">
      {/* Left-aligned below `sm`, for the same two reasons as the "What is an eSIM"
          block: four lines of centred copy on a phone gives every line a different
          starting edge, and every other section heading on this page is left-aligned
          there. Centred again from `sm`, where the copy is two or three lines. */}
      <div className="text-left sm:text-center">
        <h2 className="font-display text-[26px] font-bold uppercase leading-[1.1] sm:text-3xl md:text-4xl">
          {quiz.intro.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground sm:mt-4">
          {quiz.intro.subtitle}
        </p>
      </div>
      <div className="mt-8 rounded-card border border-border bg-card p-5 sm:p-6 md:mt-10 md:p-8">
        <p className="text-label-caps uppercase text-cta-text">
          Step {step + 1} of {quiz.steps.length}
        </p>
        <h3 className="mt-2 font-display text-2xl font-semibold">{s.question}</h3>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {s.options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setAnswers((a) => ({ ...a, [s.key]: o.label }))}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                answers[s.key] === o.label
                  ? "border-cta bg-cta/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="font-semibold">{o.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{o.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((n) => Math.max(0, n - 1))}
            disabled={step === 0}
            className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-muted-foreground disabled:opacity-40"
          >
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={() => setDone(true)}
              disabled={!answers[s.key]}
              className="inline-flex min-h-11 items-center rounded-full bg-cta px-6 text-sm font-semibold text-cta-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              See my recommendation
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((n) => Math.min(quiz.steps.length - 1, n + 1))}
              disabled={!answers[s.key]}
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary-container disabled:opacity-40"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
