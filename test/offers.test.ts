import { describe, expect, it } from "vitest";

import {
  advanceInvocation,
  createInvocationLedger,
  dispatchOffer,
  markClaimedEffectsUncertain,
  releaseEffect,
  toSnapshot,
} from "../src/domain/offers.js";
import {
  createCoreState,
  createSession,
  reduceCore,
} from "../src/domain/reducer.js";
import { activeState, readyState, waitingState } from "./core-fixtures.js";

function offer(state: ReturnType<typeof readyState>, kind: string) {
  return toSnapshot(state).sessions[0]?.actionOffers.find(
    (candidate) => candidate.kind === kind,
  );
}

describe("action offers", () => {
  it("fails consequential offers closed unless state is ready, owned, and current", () => {
    let state = reduceCore(createCoreState(), {
      type: "observeSession",
      connectionEpoch: 0,
      session: createSession("session-1", "Work"),
    });
    state = reduceCore(state, {
      type: "selectSession",
      sessionId: "session-1",
    });
    expect(offer(state, "CancelRun")).toMatchObject({
      state: "disabled",
      reason: "integrationUnavailable",
    });

    let external = reduceCore(
      reduceCore(createCoreState(), {
        type: "connectionReady",
        connectionEpoch: 1,
      }),
      {
        type: "observeSession",
        connectionEpoch: 1,
        session: createSession("external", "Desktop", "external", "historical"),
      },
    );
    external = reduceCore(external, {
      type: "selectSession",
      sessionId: "external",
    });
    expect(offer(external, "ApproveRequest")).toMatchObject({
      state: "disabled",
      reason: "notOwned",
    });
    expect(offer(external, "ResumeSession")).toMatchObject({
      state: "disabled",
      reason: "historicalOnly",
    });
  });

  it("offers resume only for known historical resumable sessions", () => {
    const starting = reduceCore(createCoreState(), {
      type: "observeSession",
      connectionEpoch: 0,
      session: createSession("session-1", "Prior", "resumable", "historical"),
    });
    expect(offer(starting, "ResumeSession")).toMatchObject({
      state: "disabled",
      reason: "integrationUnavailable",
    });

    let state = reduceCore(createCoreState(), {
      type: "connectionReady",
      connectionEpoch: 1,
    });
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 1,
      session: createSession("session-1", "Prior", "resumable", "historical"),
    });
    expect(offer(state, "ResumeSession")).toMatchObject({ state: "available" });
  });

  it("offers official work only for the selected owned idle thread", () => {
    const ready = readyState();
    expect(offer(ready, "ReviewChanges")).toMatchObject({
      state: "available",
      safety: { confirmation: "release", inspection: "target" },
    });
    expect(offer(ready, "CompactThread")).toMatchObject({
      state: "available",
      safety: { confirmation: "release", inspection: "target" },
    });
    expect(offer(activeState(), "ReviewChanges")).toMatchObject({
      state: "disabled",
      reason: "busy",
    });
    expect(offer(activeState(), "CompactThread")).toMatchObject({
      state: "disabled",
      reason: "busy",
    });

    const first = dispatchOffer(ready, createInvocationLedger(), {
      invocationId: "review-1",
      offerToken: offer(ready, "ReviewChanges")?.offerToken ?? "",
    });
    expect(
      toSnapshot(
        ready,
        first.ledger.claimedEffects,
      ).sessions[0]?.actionOffers.find(({ kind }) => kind === "CompactThread"),
    ).toMatchObject({ state: "disabled", reason: "alreadyResolving" });
  });

  it("keeps request decisions distinct and applies inspection and advertised-decision rules", () => {
    const state = waitingState();
    expect(offer(state, "ApproveRequest")).toMatchObject({
      state: "available",
      safety: { confirmation: "reviewHold", inspection: "complete" },
    });
    expect(offer(state, "RejectRequest")).toMatchObject({
      state: "available",
      safety: { confirmation: "reviewPress", inspection: "target" },
    });
    expect(offer(state, "CancelRequest")).toMatchObject({
      state: "available",
      safety: { confirmation: "reviewHold", inspection: "target" },
    });

    const partial = waitingState({
      id: "request-1",
      runId: "run-1",
      kind: "approval",
      inspection: "target",
      advertisedDecisions: ["decline"],
    });
    expect(offer(partial, "ApproveRequest")).toMatchObject({
      state: "disabled",
      reason: "requestNotInspectable",
    });
    expect(offer(partial, "RejectRequest")).toMatchObject({
      state: "available",
    });
    expect(offer(partial, "CancelRequest")).toMatchObject({
      state: "disabled",
      reason: "decisionNotAdvertised",
    });
  });

  it("does not turn unrenderable input requests into approval actions", () => {
    const state = waitingState({
      id: "input-1",
      runId: "run-1",
      kind: "userInput",
      inspection: "none",
      advertisedDecisions: [],
    });
    expect(offer(state, "ApproveRequest")).toMatchObject({
      state: "disabled",
      reason: "unsupported",
    });
  });

  it("requires the selected session and exact active run identity", () => {
    let state = readyState();
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 1,
      session: createSession("session-2", "Other"),
    });
    expect(
      toSnapshot(state)
        .sessions.find(({ id }) => id === "session-2")
        ?.actionOffers.find(({ kind }) => kind === "ChangeNextTurnOptions"),
    ).toMatchObject({ state: "disabled", reason: "noSelectedSession" });

    const ignored = reduceCore(state, {
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-1",
      request: {
        id: "orphan-request",
        runId: "run-1",
        kind: "approval",
        inspection: "complete",
        advertisedDecisions: ["accept"],
      },
    });
    expect(ignored).toBe(state);
    expect(offer(ignored, "ApproveRequest")).toMatchObject({
      state: "disabled",
      reason: "noPendingRequest",
    });
    expect(offer(ignored, "CancelRun")).toMatchObject({
      state: "disabled",
      reason: "noActiveRun",
    });

    let newerRun = reduceCore(activeState(), {
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-2",
      steerability: "steerable",
    });
    const beforeRequest = newerRun;
    newerRun = reduceCore(newerRun, {
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-1",
      request: {
        id: "stale-request",
        runId: "run-1",
        kind: "approval",
        inspection: "complete",
        advertisedDecisions: ["accept"],
      },
    });
    expect(newerRun).toBe(beforeRequest);
    expect(newerRun.sessions[0]?.pendingRequests).toEqual([]);

    const malformed = {
      ...activeState(),
      sessions: activeState().sessions.map((session) => ({
        ...session,
        run: { ...session.run, phase: "waiting" as const },
        pendingRequests: [
          {
            id: "stale-request",
            runId: "older-run",
            kind: "approval" as const,
            inspection: "complete" as const,
            advertisedDecisions: ["accept" as const],
          },
        ],
      })),
    };
    expect(offer(malformed, "ApproveRequest")).toMatchObject({
      state: "disabled",
      reason: "noActiveRun",
    });
  });

  it("dispatches once per invocation and effect key", () => {
    const state = waitingState();
    const token = offer(state, "ApproveRequest")?.offerToken;
    expect(token).toBeTruthy();
    let ledger = createInvocationLedger();
    const first = dispatchOffer(state, ledger, {
      invocationId: "invoke-1",
      offerToken: token ?? "",
    });
    expect(first).toMatchObject({
      shouldDispatch: true,
      result: { status: "accepted", kind: "ApproveRequest" },
    });
    ledger = first.ledger;
    expect(offer(state, "ApproveRequest")?.state).toBe("available");
    expect(
      toSnapshot(state, ledger.claimedEffects).sessions[0]?.actionOffers.filter(
        ({ kind }) =>
          kind === "ApproveRequest" ||
          kind === "RejectRequest" ||
          kind === "CancelRequest",
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "ApproveRequest",
        state: "disabled",
        reason: "alreadyResolving",
      }),
      expect.objectContaining({
        kind: "RejectRequest",
        state: "disabled",
        reason: "alreadyResolving",
      }),
      expect.objectContaining({
        kind: "CancelRequest",
        state: "disabled",
        reason: "alreadyResolving",
      }),
    ]);
    expect(
      dispatchOffer(state, ledger, {
        invocationId: "invoke-1",
        offerToken: token ?? "",
      }).shouldDispatch,
    ).toBe(false);
    const racing = dispatchOffer(state, ledger, {
      invocationId: "invoke-2",
      offerToken: offer(state, "RejectRequest")?.offerToken ?? "",
    });
    expect(racing.result).toEqual({
      status: "rejected",
      reason: "alreadyResolving",
    });

    const effectKey = first.result.effectKey ?? "";
    const released = releaseEffect(ledger, effectKey);
    expect(released.claimedEffects).toEqual([]);
    expect(
      dispatchOffer(state, released, {
        invocationId: "invoke-3",
        offerToken: token ?? "",
      }).shouldDispatch,
    ).toBe(true);
  });

  it("tracks pending, uncertain, and authoritative intent outcomes", () => {
    const state = waitingState();
    const accepted = dispatchOffer(state, createInvocationLedger(), {
      invocationId: "invoke-1",
      offerToken: offer(state, "ApproveRequest")?.offerToken ?? "",
    }).ledger;
    expect(advanceInvocation(accepted, "missing", "pending")).toBe(accepted);

    const pending = advanceInvocation(accepted, "invoke-1", "pending");
    expect(pending.invocationResults["invoke-1"]?.status).toBe("pending");
    expect(pending.claimedEffects).toHaveLength(1);
    const uncertain = advanceInvocation(pending, "invoke-1", "uncertain");
    expect(uncertain.invocationResults["invoke-1"]?.status).toBe("uncertain");
    expect(uncertain.claimedEffects).toHaveLength(1);
    const completed = advanceInvocation(uncertain, "invoke-1", "completed");
    expect(completed.invocationResults["invoke-1"]?.status).toBe("completed");
    expect(completed.claimedEffects).toEqual([]);
    expect(advanceInvocation(completed, "invoke-1", "pending")).toBe(completed);

    const failed = advanceInvocation(pending, "invoke-1", "failed");
    expect(failed.invocationResults["invoke-1"]?.status).toBe("failed");
    expect(failed.claimedEffects).toEqual([]);
    expect(advanceInvocation(failed, "invoke-1", "uncertain")).toBe(failed);

    const withRejection = dispatchOffer(state, accepted, {
      invocationId: "bad",
      offerToken: "stale",
    });
    const disconnected = markClaimedEffectsUncertain(withRejection.ledger);
    expect(disconnected.invocationResults["invoke-1"]?.status).toBe(
      "uncertain",
    );
    expect(disconnected.invocationResults["bad"]?.status).toBe("rejected");
  });

  it("rejects stale tokens and invalid or missing choices locally", () => {
    const state = readyState();
    const choice = offer(state, "ChangeNextTurnOptions");
    expect(choice?.state).toBe("available");
    expect(
      dispatchOffer(state, createInvocationLedger(), {
        invocationId: "missing-choice",
        offerToken: choice?.offerToken ?? "",
      }).result,
    ).toEqual({ status: "rejected", reason: "invalidOption" });
    expect(
      dispatchOffer(state, createInvocationLedger(), {
        invocationId: "bad-choice",
        offerToken: choice?.offerToken ?? "",
        optionId: "maximum",
      }).result,
    ).toEqual({ status: "rejected", reason: "invalidOption" });
    expect(
      dispatchOffer(state, createInvocationLedger(), {
        invocationId: "good-choice",
        offerToken: choice?.offerToken ?? "",
        optionId: "high",
      }).shouldDispatch,
    ).toBe(true);

    const revised = reduceCore(state, {
      type: "activityChanged",
      connectionEpoch: 1,
      sessionId: "session-1",
      activity: "other",
    });
    expect(
      dispatchOffer(revised, createInvocationLedger(), {
        invocationId: "stale",
        offerToken: choice?.offerToken ?? "",
        optionId: "high",
      }).result,
    ).toEqual({ status: "rejected", reason: "staleOffer" });
  });

  it("derives cancel, retry, acknowledgement, and turn-boundary settings", () => {
    expect(offer(activeState(), "CancelRun")?.state).toBe("available");
    expect(offer(activeState(), "ChangeNextTurnOptions")).toMatchObject({
      state: "disabled",
      reason: "notAtTurnBoundary",
    });

    let failed = reduceCore(activeState(), {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "failed",
      retryable: true,
    });
    expect(offer(failed, "RetryWork")?.state).toBe("available");
    expect(offer(failed, "AcknowledgeResult")?.state).toBe("available");
    failed = reduceCore(failed, {
      type: "acknowledgeResult",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
    });
    expect(offer(failed, "RetryWork")?.state).toBe("available");
    expect(offer(failed, "AcknowledgeResult")?.state).toBe("disabled");

    failed = reduceCore(failed, {
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-2",
      steerability: "steerable",
    });
    expect(offer(failed, "RetryWork")?.state).toBe("disabled");
  });
});
