import { describe, expect, it } from "vitest";

import { toSnapshot } from "../src/domain/offers.js";
import {
  createCoreState,
  createSession,
  reduceCore,
} from "../src/domain/reducer.js";
import {
  activeState,
  completeApproval,
  readyState,
  waitingState,
} from "./core-fixtures.js";

describe("domain reducer", () => {
  it("initializes, observes, updates, and selects known sessions", () => {
    const initial = createCoreState();
    expect(initial).toEqual({
      revision: 0,
      connectionEpoch: 0,
      integration: { phase: "starting" },
      sessions: [],
    });

    const missingSelection = reduceCore(initial, {
      type: "selectSession",
      sessionId: "missing",
    });
    expect(missingSelection).toBe(initial);

    let state = reduceCore(initial, {
      type: "observeSession",
      connectionEpoch: 0,
      session: createSession("session-1", "First"),
    });
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 0,
      session: createSession("session-1", "Renamed"),
    });
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 0,
      session: createSession("session-2", "Other"),
    });
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 0,
      session: createSession("session-1", "Final"),
    });
    state = reduceCore(state, {
      type: "selectSession",
      sessionId: "session-1",
    });
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions[0]?.name).toBe("Final");
    expect(state.selectedSessionId).toBe("session-1");

    state = reduceCore(state, {
      type: "markStale",
      connectionEpoch: 0,
      sessionId: "session-1",
    });
    expect(state.sessions[0]?.freshness).toBe("stale");
    expect(state.sessions[1]?.freshness).toBe("current");
  });

  it("ignores stale epochs and events for unknown sessions", () => {
    const state = readyState();
    expect(
      reduceCore(state, {
        type: "activityChanged",
        connectionEpoch: 0,
        sessionId: "session-1",
        activity: "planning",
      }),
    ).toBe(state);
    expect(
      reduceCore(state, {
        type: "markStale",
        connectionEpoch: 1,
        sessionId: "missing",
      }),
    ).toBe(state);
  });

  it("changes only an advertised next-turn reasoning option at a turn boundary", () => {
    const state = readyState();
    const changed = reduceCore(state, {
      type: "nextTurnReasoningChanged",
      connectionEpoch: 1,
      sessionId: "session-1",
      reasoningEffort: "high",
    });
    expect(changed.sessions[0]?.nextTurnSettings).toMatchObject({
      revision: 1,
      reasoningEffort: "high",
    });
    expect(
      reduceCore(changed, {
        type: "nextTurnReasoningChanged",
        connectionEpoch: 1,
        sessionId: "session-1",
        reasoningEffort: "unsupported",
      }),
    ).toBe(changed);
    const active = activeState();
    expect(
      reduceCore(active, {
        type: "nextTurnReasoningChanged",
        connectionEpoch: 1,
        sessionId: "session-1",
        reasoningEffort: "high",
      }),
    ).toBe(active);
  });

  it("tracks activity, waits, and exact request resolution", () => {
    let state = activeState();
    state = reduceCore(state, {
      type: "activityChanged",
      connectionEpoch: 1,
      sessionId: "session-1",
      activity: "changingFiles",
    });
    state = reduceCore(state, {
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-1",
      request: completeApproval,
    });
    state = reduceCore(state, {
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-1",
      request: completeApproval,
    });
    state = reduceCore(state, {
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-1",
      request: {
        id: "request-2",
        runId: "run-1",
        kind: "userInput",
        inspection: "none",
        advertisedDecisions: [],
      },
    });
    expect(state.sessions[0]?.run).toMatchObject({
      phase: "waiting",
      waitKinds: ["approval", "userInput"],
    });
    expect(state.sessions[0]?.attention).toEqual(["approval", "userInput"]);

    state = reduceCore(state, {
      type: "requestResolved",
      connectionEpoch: 1,
      sessionId: "session-1",
      requestId: "request-1",
    });
    expect(state.sessions[0]?.run.phase).toBe("waiting");
    expect(state.sessions[0]?.attention).toEqual(["userInput"]);
    state = reduceCore(state, {
      type: "requestResolved",
      connectionEpoch: 1,
      sessionId: "session-1",
      requestId: "request-2",
    });
    expect(state.sessions[0]?.run.phase).toBe("active");
    expect(state.sessions[0]?.attention).toEqual([]);
  });

  it("keeps automatic retry working and latches authoritative completion", () => {
    let state = reduceCore(activeState(), {
      type: "automaticRetry",
      connectionEpoch: 1,
      sessionId: "session-1",
    });
    expect(toSnapshot(state).sessions[0]?.primaryState).toBe("working");
    expect(state.sessions[0]?.activity).toBe("retrying");

    state = reduceCore(state, {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "completed",
      retryable: false,
    });
    expect(toSnapshot(state).sessions[0]?.primaryState).toBe("completed");
    expect(state.sessions[0]?.attention).toEqual(["completion"]);

    const selected = reduceCore(state, {
      type: "selectSession",
      sessionId: "session-1",
    });
    expect(selected.sessions[0]?.resultLatch?.acknowledged).toBe(false);

    const inspected = reduceCore(selected, {
      type: "inspectResult",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
    });
    expect(toSnapshot(inspected).sessions[0]?.primaryState).toBe("idle");
    expect(inspected.sessions[0]?.attention).toEqual([]);
  });

  it("does not clear a newer result with an older acknowledgement", () => {
    let state = reduceCore(activeState(), {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "failed",
      retryable: true,
    });
    state = reduceCore(state, {
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-2",
      steerability: "review",
    });
    state = reduceCore(state, {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-2",
      outcome: "failed",
      retryable: false,
    });
    const unchanged = reduceCore(state, {
      type: "acknowledgeResult",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
    });
    expect(unchanged).toBe(state);
    expect(unchanged.sessions[0]?.resultLatch?.runId).toBe("run-2");
  });

  it("rejects mismatched terminal events and records interruption without attention", () => {
    const active = activeState();
    expect(
      reduceCore(active, {
        type: "runCompleted",
        connectionEpoch: 1,
        sessionId: "session-1",
        runId: "older-run",
        outcome: "failed",
        retryable: true,
      }),
    ).toBe(active);

    const interrupted = reduceCore(active, {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "interrupted",
      retryable: false,
    });
    expect(interrupted.sessions[0]?.resultLatch?.acknowledged).toBe(true);
    expect(interrupted.sessions[0]?.attention).toEqual([]);
  });

  it("clears wait attention on terminal failure while preserving recovery", () => {
    let state = waitingState();
    state = {
      ...state,
      sessions: state.sessions.map((session) => ({
        ...session,
        attention: [...session.attention, "recovery"],
      })),
    };
    state = reduceCore(state, {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "failed",
      retryable: true,
    });
    expect(state.sessions[0]?.attention).toEqual(["recovery", "failure"]);

    state = reduceCore(state, {
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-2",
      steerability: "steerable",
    });
    expect(state.sessions[0]?.attention).toEqual(["recovery"]);
  });

  it("fails closed on disconnect, stale state, and unavailable integration", () => {
    const waiting = waitingState();
    const disconnected = reduceCore(waiting, { type: "disconnect" });
    expect(disconnected.integration).toEqual({
      phase: "reconciling",
      reason: "disconnected",
    });
    expect(disconnected.sessions[0]?.freshness).toBe("reconciling");
    expect(disconnected.sessions[0]?.resultLatch).toBeUndefined();
    expect(disconnected.sessions[0]?.attention).toContain("recovery");
    expect(toSnapshot(disconnected).sessions[0]?.primaryState).toBe(
      "unavailable",
    );

    const stale = reduceCore(readyState(), {
      type: "markStale",
      connectionEpoch: 1,
      sessionId: "session-1",
    });
    expect(toSnapshot(stale).sessions[0]?.primaryState).toBe("unavailable");

    const unavailable = reduceCore(readyState(), {
      type: "connectionUnavailable",
      reason: "unauthenticated",
    });
    expect(unavailable.integration).toEqual({
      phase: "unavailable",
      reason: "unauthenticated",
    });
  });

  it("requires authoritative observation after a new connection epoch", () => {
    const prior = readyState();
    const reconnected = reduceCore(prior, {
      type: "connectionReady",
      connectionEpoch: 2,
    });
    expect(reconnected.sessions[0]?.freshness).toBe("reconciling");
    expect(toSnapshot(reconnected).sessions[0]?.primaryState).toBe(
      "unavailable",
    );

    const reconciled = reduceCore(reconnected, {
      type: "observeSession",
      connectionEpoch: 2,
      session: createSession("session-1", "Project work"),
    });
    expect(reconciled.sessions[0]?.freshness).toBe("current");
    expect(toSnapshot(reconciled).sessions[0]?.primaryState).toBe("idle");

    expect(
      reduceCore(reconciled, {
        type: "connectionReady",
        connectionEpoch: 1,
      }),
    ).toBe(reconciled);
    expect(
      reduceCore(reconciled, {
        type: "connectionReady",
        connectionEpoch: 2,
      }),
    ).toBe(reconciled);
  });

  it("ignores request resolution after the request is no longer pending", () => {
    let state = waitingState();
    state = reduceCore(state, {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "completed",
      retryable: false,
    });
    const completed = state;
    state = reduceCore(state, {
      type: "requestResolved",
      connectionEpoch: 1,
      sessionId: "session-1",
      requestId: "request-1",
    });
    expect(state).toBe(completed);
    expect(state.sessions[0]?.run.phase).toBe("idle");
  });
});
