import {
  reduceCore,
  createCoreState,
  createSession,
} from "../src/domain/reducer.js";
import type { CoreState, HumanRequest } from "../src/domain/model.js";

export const completeApproval: HumanRequest = {
  id: "request-1",
  runId: "run-1",
  kind: "approval",
  inspection: "complete",
  advertisedDecisions: ["accept", "decline", "cancel"],
};

export function readyState(sessionId = "session-1"): CoreState {
  let state = reduceCore(createCoreState(), {
    type: "connectionReady",
    connectionEpoch: 1,
  });
  state = reduceCore(state, {
    type: "observeSession",
    connectionEpoch: 1,
    session: createSession(sessionId, "Project work"),
  });
  return reduceCore(state, { type: "selectSession", sessionId });
}

export function activeState(sessionId = "session-1"): CoreState {
  return reduceCore(readyState(sessionId), {
    type: "runStarted",
    connectionEpoch: 1,
    sessionId,
    runId: "run-1",
    steerability: "steerable",
  });
}

export function waitingState(
  request: HumanRequest = completeApproval,
): CoreState {
  return reduceCore(activeState(), {
    type: "requestOpened",
    connectionEpoch: 1,
    sessionId: "session-1",
    request,
  });
}
