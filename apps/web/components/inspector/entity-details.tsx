import type { EntityDetailModel } from "@/lib/client/scenario-experience";
import { EvidenceFactList } from "@/components/learning/evidence-facts";
import { ProvenanceBadge } from "@/components/learning/provenance";

export function EntityDetails({ detail }: { detail: EntityDetailModel }) {
  return (
    <div className="grid gap-5 p-5" data-testid="inspector-entity-details">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-teal-800">
              Selected entity
            </p>
            <h3 className="mt-1 break-words text-xl font-black text-[#123047] [overflow-wrap:anywhere]">
              {detail.title}
            </h3>
          </div>
          <ProvenanceBadge provenance={detail.provenance} />
        </div>
        <p className="mt-3 break-words text-sm font-semibold leading-6 text-[#466778] [overflow-wrap:anywhere]">
          {detail.summary}
        </p>
      </section>

      {detail.facts.length > 0 ? (
        <section aria-labelledby="entity-evidence-heading">
          <h4
            id="entity-evidence-heading"
            className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-teal-800"
          >
            Evidence
          </h4>
          <EvidenceFactList facts={detail.facts} />
        </section>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-teal-700 bg-[#fffdf5] p-4 text-sm font-semibold text-[#466778]">
          Run the guided experiment to attach evidence to this entity.
        </p>
      )}

      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t-2 border-teal-700/25 pt-4 text-xs">
        <dt className="font-black uppercase tracking-[0.08em] text-teal-800">
          Stable ID
        </dt>
        <dd className="break-all font-mono font-semibold text-[#123047]">
          {detail.entityId}
        </dd>
      </dl>
    </div>
  );
}
