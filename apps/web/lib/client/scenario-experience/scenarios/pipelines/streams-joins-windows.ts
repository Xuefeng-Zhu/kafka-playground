import {
  experienceDefinition,
  experimentEvidence,
} from "../../definition-helpers";
import { buildScenarioGraph, graphCountMetric } from "../../graphs";
import {
  createFrame,
  entityFocus,
  evidence,
  fact,
  narrative,
  recordFocus,
  row,
  table,
} from "../../helpers";
import type {
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioExperienceSnapshot,
  ScenarioStateFor,
  WindowJoinRecordModel,
} from "../../model";

export const streamsExperience = experienceDefinition(
  "streams-joins-windows",
  projectStreams,
);

type StreamsState = ScenarioStateFor<"streams-joins-windows">;
type StreamsJoin = StreamsState["joins"][number];
type StreamsInputRecord = StreamsState["inputs"][number];
type StreamsDefinition = ScenarioExperienceDefinition<"streams-joins-windows">;
type StreamsInput = ScenarioExperienceProjectionInput<"streams-joins-windows">;

function projectStreams(definition: StreamsDefinition, input: StreamsInput) {
  const { scenarioState } = input;
  const validJoins = scenarioState.joins.filter((join) =>
    isValidJoin(scenarioState, join),
  );
  const lateCount = scenarioState.lateRecords.length;
  const unmatchedCount = scenarioState.inputs.filter(
    (record) => record.status === "unmatched",
  ).length;
  const factSet = buildStreamsFacts(
    scenarioState,
    validJoins.length,
    unmatchedCount,
    lateCount,
  );
  const facts = factSet.all;
  const latestInput = scenarioState.inputs.at(-1);
  return createFrame(
    definition,
    buildStreamsGraph(input, validJoins.length),
    {
      kind: "window-join",
      title: "Key and window join evidence",
      summary: "Only validated equal-key, in-window pairs appear as outputs.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildStreamsInputTable(
        input.snapshot,
        scenarioState,
        definition.lesson.emptyCopy,
      ),
      sections: [
        {
          id: "window-boundaries",
          title: "Window boundaries",
          facts: [factSet.afterGrace],
          table: buildWindowBoundaryTable(scenarioState),
        },
      ],
      records: buildWindowJoinRecords(input.snapshot, scenarioState),
      outputs: buildJoinOutputTable(validJoins),
    },
    buildStreamsNarrative(definition, latestInput),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      [
        fact(
          "streams-before-output",
          "Joined outputs before",
          evidence(0, "simulated", "run-total"),
        ),
      ],
      latestInput
        ? [factSet.validJoins, factSet.unmatchedKeys, factSet.afterGrace]
        : [],
    ),
  );
}

function buildStreamsFacts(
  state: StreamsState,
  validJoinCount: number,
  unmatchedCount: number,
  lateCount: number,
) {
  const inputCount = fact(
    "streams-input-count",
    "Input records",
    evidence(state.inputs.length, "simulated", "run-total"),
  );
  const validJoins = fact(
    "streams-valid-joins",
    "Valid joined outputs",
    evidence(validJoinCount, "simulated", "run-total"),
    { emphasis: validJoinCount > 0 ? "positive" : "neutral" },
  );
  const unmatchedKeys = fact(
    "streams-unmatched",
    "Unmatched keys",
    evidence(unmatchedCount, "simulated", "run-total"),
  );
  const afterGrace = fact(
    "streams-late",
    "After grace",
    evidence(lateCount, "simulated", "run-total"),
    { emphasis: lateCount > 0 ? "warning" : "neutral" },
  );
  return {
    all: [inputCount, validJoins, unmatchedKeys, afterGrace],
    inputCount,
    validJoins,
    unmatchedKeys,
    afterGrace,
  };
}

function buildStreamsInputTable(
  snapshot: ScenarioExperienceSnapshot,
  state: StreamsState,
  emptyCopy: string,
) {
  return table(
    "streams-window-inputs",
    "Windowed join inputs",
    [
      { key: "record", label: "Record" },
      { key: "stream", label: "Stream" },
      { key: "key", label: "Key" },
      { key: "eventTime", label: "Event time" },
      { key: "arrival", label: "Arrival" },
      { key: "window", label: "Window" },
      { key: "status", label: "Status" },
    ],
    state.inputs.map((record) =>
      row(
        record.id,
        {
          record: evidence(record.recordId, record.provenance, "run-total"),
          stream: evidence(record.stream, record.provenance, "run-total"),
          key: evidence(record.key, record.provenance, "run-total"),
          eventTime: evidence(
            `${record.eventTimeMs} ms`,
            record.provenance,
            "run-total",
          ),
          arrival: evidence(
            `${record.arrivalTimeMs} ms`,
            record.provenance,
            "run-total",
          ),
          window: evidence(record.windowId, record.provenance, "current"),
          status: evidence(record.status, record.provenance, "current"),
        },
        streamsRecordFocus(snapshot, record),
        streamsRecordEmphasis(record),
      ),
    ),
    emptyCopy,
  );
}

function streamsRecordEmphasis(record: StreamsInputRecord) {
  if (record.status === "late") return "danger";
  if (record.status === "joined") return "positive";
  return record.status === "unmatched" ? "warning" : "neutral";
}

function buildJoinOutputTable(validJoins: readonly StreamsJoin[]) {
  return table(
    "streams-join-outputs",
    "Validated joined outputs",
    [
      { key: "join", label: "Join" },
      { key: "key", label: "Matching key" },
      { key: "order", label: "Order" },
      { key: "payment", label: "Payment" },
      { key: "window", label: "Window" },
    ],
    validJoins.map((join) =>
      row(
        join.id,
        {
          join: evidence(join.joinId, join.provenance, "run-total"),
          key: evidence(join.key, join.provenance, "run-total"),
          order: evidence(join.orderRecordId, join.provenance, "run-total"),
          payment: evidence(join.paymentRecordId, join.provenance, "run-total"),
          window: evidence(join.windowId, join.provenance, "run-total"),
        },
        entityFocus(join.id, "window-state-store"),
        "positive",
      ),
    ),
    "No equal-key records have joined inside a valid window yet.",
  );
}

function buildWindowBoundaryTable(state: StreamsState) {
  return table(
    "streams-window-boundaries",
    "Event-time window and grace boundaries",
    [
      { key: "window", label: "Window" },
      { key: "start", label: "Start" },
      { key: "end", label: "End" },
      { key: "grace", label: "Grace ends" },
      { key: "status", label: "Status" },
    ],
    state.windows.map((window) =>
      row(
        window.id,
        {
          window: evidence(window.windowId, window.provenance, "run-total"),
          start: evidence(
            `${window.startMs} ms`,
            window.provenance,
            "run-total",
          ),
          end: evidence(`${window.endMs} ms`, window.provenance, "run-total"),
          grace: evidence(
            `${window.graceEndMs} ms`,
            window.provenance,
            "run-total",
          ),
          status: evidence(
            window.closed ? "Closed" : "Open",
            window.provenance,
            "current",
          ),
        },
        entityFocus(window.id, "window-state-store"),
      ),
    ),
    "A window appears with the first keyed input.",
  );
}

function buildStreamsGraph(input: StreamsInput, validJoinCount: number) {
  return buildScenarioGraph("streams-joins-windows", input.snapshot, {
    active: input.scenarioState.inputs.length > 0,
    inactiveEdgeIds:
      validJoinCount === 0
        ? new Set(["window-topic", "topic-group"])
        : undefined,
    metrics: {
      "orders-stream": graphCountMetric(
        input.scenarioState.inputs.filter(
          (record) => record.stream === "orders",
        ).length,
        "simulated",
        "run-total",
      ),
      "payments-stream": graphCountMetric(
        input.scenarioState.inputs.filter(
          (record) => record.stream === "payments",
        ).length,
        "simulated",
        "run-total",
      ),
      "window-state-store": graphCountMetric(
        validJoinCount,
        "simulated",
        "run-total",
      ),
    },
  });
}

function buildStreamsNarrative(
  definition: StreamsDefinition,
  latestInput: StreamsInputRecord | undefined,
) {
  if (!latestInput) {
    return narrative(
      "No windowed input has been recorded yet.",
      "Joined output requires equal keys and a valid event-time window.",
      definition.lesson.emptyCopy,
      "simulated",
    );
  }
  return narrative(
    `${latestInput.recordId} is ${latestInput.status} for key ${latestInput.key} in ${latestInput.windowId}.`,
    latestInput.status === "joined"
      ? "A record from the other stream has the same key, window, and a valid arrival before grace closed."
      : latestInput.status === "late"
        ? "Its arrival crossed the grace boundary, so it cannot create joined output."
        : "No eligible record on the other stream matches both key and window yet.",
    latestInput.status === "buffered"
      ? "Produce the matching other-side record before grace closes."
      : "Compare the joined output count with unmatched and late inputs.",
    latestInput.provenance,
  );
}

function buildWindowJoinRecords(
  snapshot: ScenarioExperienceSnapshot,
  state: StreamsState,
): WindowJoinRecordModel[] {
  return state.inputs.map((record) => ({
    id: record.id,
    key: record.key,
    side: record.stream === "orders" ? "left" : "right",
    eventTimeMs: record.eventTimeMs,
    windowId: record.windowId,
    outcome: record.status === "buffered" ? "waiting" : record.status,
    provenance: record.provenance,
    focus: streamsRecordFocus(snapshot, record),
  }));
}

function streamsRecordFocus(
  snapshot: ScenarioExperienceSnapshot,
  record: StreamsInputRecord,
) {
  return recordFocus(
    snapshot,
    record.recordId,
    undefined,
    undefined,
    record.stream === "orders" ? "orders-stream" : "payments-stream",
  );
}

function isValidJoin(state: StreamsState, join: StreamsJoin) {
  const order = state.inputs.find(
    (record) =>
      record.recordId === join.orderRecordId && record.stream === "orders",
  );
  const payment = state.inputs.find(
    (record) =>
      record.recordId === join.paymentRecordId && record.stream === "payments",
  );
  const window = state.windows.find(
    (candidate) => candidate.windowId === join.windowId,
  );
  if (!order || !payment || !window) return false;
  if (
    order.key !== payment.key ||
    join.key !== order.key ||
    order.windowId !== join.windowId ||
    payment.windowId !== join.windowId
  ) {
    return false;
  }
  const inEventWindow = [order, payment].every(
    (record) =>
      record.eventTimeMs >= window.startMs &&
      record.eventTimeMs <= window.endMs,
  );
  const beforeGrace = [order, payment].every(
    (record) => record.arrivalTimeMs <= window.graceEndMs,
  );
  const notLate =
    !state.lateRecords.includes(order.recordId) &&
    !state.lateRecords.includes(payment.recordId);
  return inEventWindow && beforeGrace && notLate;
}
