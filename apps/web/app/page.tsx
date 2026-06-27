import Link from "next/link";
import { ArrowRight, CircleDot } from "lucide-react";
import { PRIMARY_SCENARIO, SCENARIOS } from "@kplay/scenario-engine";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--kplay-bg)] px-6 py-8 text-[var(--kplay-text)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex items-center justify-between border-b-[3px] border-teal-700 pb-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#123047]">
              Kafka Visual Playground
            </h1>
            <p className="mt-1 text-sm text-[#466778]">
              A scenario-driven workspace for seeing partitions, offsets,
              rebalances, and commits.
            </p>
          </div>
          <Link
            href="/scenarios/partitioning"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-teal-700 bg-teal-700 px-4 py-2 text-sm font-extrabold text-white shadow-[4px_4px_0_rgba(15,118,110,0.18)] transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-sky-200"
          >
            Open playground <ArrowRight size={16} aria-hidden />
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <Link
            href="/scenarios/partitioning"
            className="group rounded-2xl border-[3px] border-teal-700 bg-teal-100 p-6 shadow-[7px_7px_0_rgba(15,118,110,0.14)] transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-teal-700">
                  <CircleDot size={14} aria-hidden /> Available now
                </div>
                <h2 className="text-xl font-extrabold text-[#123047]">
                  {PRIMARY_SCENARIO.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#31566a]">
                  {PRIMARY_SCENARIO.description}
                </p>
              </div>
              <ArrowRight
                className="text-teal-700 transition group-hover:translate-x-1"
                aria-hidden
              />
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-[#31566a] md:grid-cols-2">
              {PRIMARY_SCENARIO.learningObjectives.map((objective) => (
                <li
                  key={objective}
                  className="rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-3 font-semibold"
                >
                  {objective}
                </li>
              ))}
            </ul>
          </Link>

          <div className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-6 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
            <h2 className="text-base font-extrabold text-[#123047]">
              Runtime modes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#31566a]">
              <p>
                Demo mode is deterministic and runs locally. Remote Kafka mode
                lets you configure brokers and SASL credentials in the browser,
                then displays partitions, offsets, assignments, and commits
                observed from Kafka.
              </p>
              <p className="rounded-2xl border-2 border-emerald-500 bg-emerald-100 p-3 font-semibold text-emerald-800">
                Demo mode - Kafka behavior is simulated.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {SCENARIOS.filter(
            (scenario) => scenario.id !== PRIMARY_SCENARIO.id,
          ).map((scenario) => (
            <Link
              key={scenario.id}
              href={`/scenarios/${scenario.id}`}
              className="group rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-4 text-[#466778] shadow-[7px_7px_0_rgba(15,118,110,0.14)] transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200"
            >
              <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-teal-700">
                <CircleDot size={14} aria-hidden /> Available now
              </div>
              <h3 className="font-extrabold text-[#123047]">
                {scenario.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-[#31566a]">
                {scenario.description}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-teal-800">
                Open scenario{" "}
                <ArrowRight
                  className="transition group-hover:translate-x-1"
                  size={14}
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
