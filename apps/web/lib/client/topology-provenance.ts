import type { RunSnapshot } from "@kplay/contracts";
import type { Provenance } from "./scenario-experience/model";

export type RuntimeTopologyProvenance = Extract<
  Provenance,
  "observed" | "simulated"
>;

export function topologyProvenance(
  snapshot: Pick<RunSnapshot, "mode">,
): RuntimeTopologyProvenance {
  return snapshot.mode === "demo" ? "simulated" : "observed";
}

export function topologyProvenanceLabel(provenance: RuntimeTopologyProvenance) {
  return provenance === "simulated" ? "Simulated" : "Observed";
}
