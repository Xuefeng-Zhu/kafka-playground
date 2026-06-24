import Link from "next/link";
import { ArrowRight, CircleDot, Lock } from "lucide-react";
import { PRIMARY_SCENARIO, FUTURE_SCENARIOS } from "@kplay/scenario-engine";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#080b10] px-6 py-8 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Kafka Visual Playground</h1>
            <p className="mt-1 text-sm text-slate-400">
              A scenario-driven workspace for seeing partitions, offsets, rebalances, and commits.
            </p>
          </div>
          <Link
            href="/scenarios/partitioning"
            className="inline-flex items-center gap-2 rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            Open playground <ArrowRight size={16} aria-hidden />
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <Link
            href="/scenarios/partitioning"
            className="group rounded-lg border border-sky-500/40 bg-[#0e131b] p-6 transition hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                  <CircleDot size={14} aria-hidden /> Available now
                </div>
                <h2 className="text-xl font-semibold">{PRIMARY_SCENARIO.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  {PRIMARY_SCENARIO.description}
                </p>
              </div>
              <ArrowRight className="text-sky-300 transition group-hover:translate-x-1" aria-hidden />
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              {PRIMARY_SCENARIO.learningObjectives.map((objective) => (
                <li key={objective} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                  {objective}
                </li>
              ))}
            </ul>
          </Link>

          <div className="rounded-lg border border-slate-800 bg-[#0e131b] p-6">
            <h2 className="text-base font-semibold">Runtime modes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>
                Demo mode is deterministic and runs locally. Aiven mode uses SASL/TLS and only displays
                partitions, offsets, assignments, and commits observed from Kafka.
              </p>
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100">
                Demo mode - Kafka behavior is simulated.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {FUTURE_SCENARIOS.map((scenario) => (
            <div
              key={scenario.id}
              className="rounded-lg border border-slate-800 bg-[#0e131b] p-4 text-slate-500"
              aria-disabled="true"
            >
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em]">
                <Lock size={14} aria-hidden /> Coming soon
              </div>
              <h3 className="font-semibold text-slate-300">{scenario.title}</h3>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
