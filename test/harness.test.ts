import { describe, expect, it } from "vitest";

import { SimulatedCodex, SimulatedSurface } from "../src/harness.js";
import type { SurfaceRuntime } from "../src/presentation.js";
import { completeApproval } from "./core-fixtures.js";

function plusRuntime(): SurfaceRuntime {
  return {
    runtimeDeviceId: "plus",
    connected: true,
    observedKeyGrid: [4, 2],
    encoderCount: 4,
    touchStrip: true,
    profile: "streamDeckPlus",
    scope: "managed",
    visibleControls: Array.from({ length: 4 }, (_, index) => ({
      id: `encoder-context-${index}`,
      controller: "encoder" as const,
      owned: true,
    })),
    local: { revision: 0, view: "actions", previewIndex: 0 },
  };
}

function readyHarness(): SimulatedCodex {
  const codex = new SimulatedCodex();
  codex.receive({ type: "connectionReady", connectionEpoch: 1 });
  codex.receive({
    type: "observeSession",
    connectionEpoch: 1,
    session: {
      id: "session-1",
      name: "Work",
      access: "owned",
      freshness: "current",
      run: {
        phase: "idle",
        steerability: "unknown",
        waitKinds: [],
        automaticRetry: false,
      },
      activity: "none",
      pendingRequests: [],
      attention: [],
      nextTurnSettings: {
        revision: 0,
        reasoningEffort: "medium",
        reasoningOptions: ["low", "medium", "high"],
      },
    },
  });
  codex.receive({ type: "selectSession", sessionId: "session-1" });
  return codex;
}

describe("deterministic harness", () => {
  it("simulates Codex state and suppresses duplicate dispatch", () => {
    const codex = readyHarness();
    const offer = codex.snapshot.sessions[0]?.actionOffers.find(
      ({ kind }) => kind === "ChangeNextTurnOptions",
    );
    const invocation = {
      invocationId: "invoke-1",
      offerToken: offer?.offerToken ?? "",
      optionId: "high",
    };
    expect(codex.invoke(invocation).status).toBe("accepted");
    expect(codex.invoke(invocation).status).toBe("accepted");
    expect(codex.dispatched).toEqual([invocation]);
    expect(
      codex.snapshot.sessions[0]?.actionOffers.find(
        ({ kind }) => kind === "ChangeNextTurnOptions",
      ),
    ).toMatchObject({ state: "disabled", reason: "alreadyResolving" });
    expect(codex.advance("missing", "pending")).toBeUndefined();
    expect(codex.advance("invoke-1", "pending")?.status).toBe("pending");
    expect(codex.advance("invoke-1", "completed")?.status).toBe("completed");
    expect(
      codex.snapshot.sessions[0]?.actionOffers.find(
        ({ kind }) => kind === "ChangeNextTurnOptions",
      )?.state,
    ).toBe("available");
  });

  it("invalidates old offers across reconnect until reconciliation", () => {
    const codex = readyHarness();
    const token = codex.snapshot.sessions[0]?.actionOffers.find(
      ({ kind }) => kind === "ChangeNextTurnOptions",
    )?.offerToken;
    codex.receive({ type: "disconnect" });
    codex.receive({ type: "connectionReady", connectionEpoch: 2 });
    expect(
      codex.invoke({
        invocationId: "old-offer",
        offerToken: token ?? "",
        optionId: "high",
      }),
    ).toEqual({ status: "rejected", reason: "staleOffer" });
    expect(codex.dispatched).toEqual([]);
  });

  it("marks a possibly written effect uncertain on disconnect", () => {
    const codex = readyHarness();
    const offer = codex.snapshot.sessions[0]?.actionOffers.find(
      ({ kind }) => kind === "ChangeNextTurnOptions",
    );
    codex.invoke({
      invocationId: "in-flight",
      offerToken: offer?.offerToken ?? "",
      optionId: "high",
    });
    codex.receive({ type: "disconnect" });
    expect(codex.result("in-flight")?.status).toBe("uncertain");
    expect(codex.snapshot.sessions[0]?.actionOffers).toContainEqual(
      expect.objectContaining({
        kind: "ChangeNextTurnOptions",
        state: "disabled",
        reason: "reconciling",
      }),
    );
  });

  it("rejects key-up when a provider update replaced the offer token", () => {
    const codex = readyHarness();
    codex.receive({
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      steerability: "steerable",
    });
    codex.receive({
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-1",
      request: completeApproval,
    });
    const surface = new SimulatedSurface({
      ...plusRuntime(),
      profile: "classic15",
      observedKeyGrid: [5, 3],
      encoderCount: 0,
      touchStrip: false,
    });
    const first = surface.render(codex.snapshot);
    const approve = first.keyViews.find(
      ({ actionKind }) => actionKind === "ApproveRequest",
    );
    surface.keyDown(approve?.id ?? "missing");
    codex.receive({
      type: "requestResolved",
      connectionEpoch: 1,
      sessionId: "session-1",
      requestId: "request-1",
    });
    surface.render(codex.snapshot);
    expect(surface.keyUp(approve?.id ?? "missing")).toBeUndefined();
  });

  it("rejects outdated frames and commits encoder choice only on press", () => {
    const codex = readyHarness();
    const surface = new SimulatedSurface(plusRuntime());
    const newest = surface.render(codex.snapshot);
    const older = { ...codex.snapshot, revision: codex.snapshot.revision - 1 };
    expect(surface.render(older)).toBe(newest);

    surface.rotate(1, 3);
    expect(surface.runtime.local.previewIndex).toBe(1);
    expect(surface.encoderPress("encoder-0")).toMatchObject({
      optionId: "medium",
    });
    expect(surface.encoderPress("missing")).toBeUndefined();
    expect(surface.frame).toBe(newest);
  });

  it("produces no token for missing or disabled key controls", () => {
    const surface = new SimulatedSurface(plusRuntime());
    surface.keyDown("missing");
    expect(surface.keyUp("missing")).toBeUndefined();
    expect(surface.frame).toBeUndefined();
  });
});
