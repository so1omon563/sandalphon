import { describe, expect, it, vi } from "vitest";

import type { SurfaceApplicationBoundary } from "../src/application.js";
import {
  Classic15MvpSurface,
  type Classic15MvpFrame,
} from "../src/classic15Mvp.js";
import type { SandalphonSnapshot } from "../src/domain/model.js";
import { toSnapshot, type OfferInvocation } from "../src/domain/offers.js";
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

function historicalSnapshot(): SandalphonSnapshot {
  let state = reduceCore(createCoreState(), {
    type: "connectionReady",
    connectionEpoch: 1,
  });
  for (const [id, name] of [
    ["thread-1", "First thread"],
    ["thread-2", "Second thread"],
    ["thread-3", "Third thread"],
  ] as const) {
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 1,
      session: createSession(id, name, "resumable", "historical"),
    });
  }
  return toSnapshot(
    reduceCore(state, { type: "selectSession", sessionId: "thread-1" }),
  );
}

class SurfaceApplication implements SurfaceApplicationBoundary {
  readonly listeners = new Set<(snapshot: SandalphonSnapshot) => void>();
  readonly invoke = vi.fn((invocation: OfferInvocation) => {
    void invocation;
    return Promise.resolve({
      status: "completed" as const,
      kind: "Inspect" as const,
    });
  });
  readonly selectSession = vi.fn((sessionId: string) => {
    this.emit({
      ...this.snapshot,
      revision: this.snapshot.revision + 1,
      selectedSessionId: sessionId,
    });
    return Promise.resolve();
  });
  reviewDetail:
    { requestId: string; text: string; inspection: "complete" } | undefined;

  constructor(public snapshot: SandalphonSnapshot) {}

  onSnapshot(listener: (snapshot: SandalphonSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  emit(snapshot: SandalphonSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

async function releaseKey(
  surface: Classic15MvpSurface,
  index: number,
  now = 100,
): Promise<void> {
  surface.keyDown(index, now);
  await surface.keyUp(index, now + 50);
}

describe("Stream Deck Classic 15 MVP surface", () => {
  it("keeps the accepted home anchors and uses explicit roster selection", async () => {
    const application = new SurfaceApplication(historicalSnapshot());
    const surface = new Classic15MvpSurface(application);

    expect(surface.frame).toMatchObject({ view: "home" });
    expect(surface.frame.keys[0]).toMatchObject({
      label: "First thread",
      enabled: true,
      icon: "session",
    });
    expect(surface.frame.keys.slice(10, 15)).toMatchObject([
      { label: "" },
      { label: "" },
      { label: "Priority", enabled: true },
      { label: "" },
      { label: "Exit", enabled: true },
    ]);
    expect(
      surface.frame.keys
        .filter(({ label }) => label.length > 0)
        .map(({ index }) => index),
    ).toEqual([0, 1, 2, 12, 14]);

    await releaseKey(surface, 1);
    expect(application.selectSession).toHaveBeenCalledWith("thread-2");
    expect(surface.frame.keys[0]?.label).toBe("Second thread");
    surface.dispose();
  });

  it("limits the home roster to four alternatives and reveals paging only when needed", () => {
    let state = reduceCore(createCoreState(), {
      type: "connectionReady",
      connectionEpoch: 1,
    });
    for (let index = 0; index < 7; index += 1) {
      state = reduceCore(state, {
        type: "observeSession",
        connectionEpoch: 1,
        session: createSession(`thread-${index}`, `Thread ${index}`),
      });
    }
    state = reduceCore(state, {
      type: "selectSession",
      sessionId: "thread-0",
    });
    const surface = new Classic15MvpSurface(
      new SurfaceApplication(toSnapshot(state)),
    );

    expect(surface.frame.keys.slice(1, 9).map(({ label }) => label)).toEqual([
      "Thread 1",
      "Thread 2",
      "Thread 3",
      "Thread 4",
      "",
      "",
      "",
      "",
    ]);
    expect(surface.frame.keys[11]?.label).toBe("");
    expect(surface.frame.keys[12]?.label).toBe("Priority 1/2");
    expect(surface.frame.keys[13]).toMatchObject({
      label: "Next",
      enabled: true,
    });
  });

  it("opens the selected request without stealing selection", async () => {
    let state = waitingState();
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 1,
      session: createSession("session-2", "Selected request"),
    });
    state = reduceCore(state, {
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "session-2",
      runId: "run-2",
      steerability: "steerable",
    });
    state = reduceCore(state, {
      type: "requestOpened",
      connectionEpoch: 1,
      sessionId: "session-2",
      request: {
        ...completeApproval,
        id: "request-2",
        runId: "run-2",
      },
    });
    state = reduceCore(state, {
      type: "selectSession",
      sessionId: "session-2",
    });
    const application = new SurfaceApplication(toSnapshot(state));
    application.reviewDetail = {
      requestId: "request-2",
      text: "Review selected request",
      inspection: "complete",
    };
    const surface = new Classic15MvpSurface(application);

    await releaseKey(surface, 9);

    expect(application.selectSession).not.toHaveBeenCalled();
    expect(application.snapshot.selectedSessionId).toBe("session-2");
    expect(surface.frame.view).toBe("request");
  });

  it("opens an attention-only roster and renders each candidate state", async () => {
    let state = readyState("selected");
    state = reduceCore(state, {
      type: "observeSession",
      connectionEpoch: 1,
      session: createSession("failed", "Failed work"),
    });
    state = reduceCore(state, {
      type: "runStarted",
      connectionEpoch: 1,
      sessionId: "failed",
      runId: "failed-run",
      steerability: "steerable",
    });
    state = reduceCore(state, {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "failed",
      runId: "failed-run",
      outcome: "failed",
      retryable: false,
    });
    const application = new SurfaceApplication(toSnapshot(state));
    const surface = new Classic15MvpSurface(application);

    expect(surface.frame.keys[1]).toMatchObject({
      label: "Failed work",
      state: "failed",
    });
    await releaseKey(surface, 9);

    expect(application.selectSession).not.toHaveBeenCalled();
    expect(surface.frame.keys[12]?.label).toBe("Attention");
    expect(surface.frame.keys[1]).toMatchObject({
      label: "Failed work",
      state: "failed",
    });
    await releaseKey(surface, 1, 200);
    expect(application.selectSession).toHaveBeenCalledWith("failed");
  });

  it("invalidates a captured release when application state changes", async () => {
    const application = new SurfaceApplication(historicalSnapshot());
    const surface = new Classic15MvpSurface(application);
    await releaseKey(surface, 0);
    surface.keyDown(2, 200);
    application.emit({
      ...application.snapshot,
      revision: application.snapshot.revision + 1,
    });
    await surface.keyUp(2, 250);
    expect(application.invoke).not.toHaveBeenCalled();

    await releaseKey(surface, 2, 300);
    const invocation = application.invoke.mock.calls[0]?.[0];
    expect(invocation?.invocationId).toBe("classic15:1");
    expect(invocation?.offerToken).toMatch(/^offer:/);
  });

  it("previews and applies an advertised reasoning choice without wrapping", async () => {
    const application = new SurfaceApplication(toSnapshot(readyState()));
    const surface = new Classic15MvpSurface(application);
    await releaseKey(surface, 0);
    await releaseKey(surface, 4, 200);
    expect(surface.frame.view).toBe("choice");
    expect(surface.frame.keys[12]?.label).toBe("medium");

    await releaseKey(surface, 13, 300);
    expect(surface.frame.keys[12]?.label).toBe("high");
    expect(surface.frame.keys[13]?.enabled).toBe(false);
    await releaseKey(surface, 13, 400);
    expect(surface.frame.keys[12]?.label).toBe("high");

    await releaseKey(surface, 8, 500);
    expect(application.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: "high" }),
    );
    expect(surface.frame.view).toBe("session");
  });

  it("shows result detail before a separate acknowledgement", async () => {
    const completed = reduceCore(activeState(), {
      type: "runCompleted",
      connectionEpoch: 1,
      sessionId: "session-1",
      runId: "run-1",
      outcome: "completed",
      retryable: false,
    });
    const application = new SurfaceApplication(toSnapshot(completed));
    const surface = new Classic15MvpSurface(application);
    await releaseKey(surface, 0);

    await releaseKey(surface, 1, 200);
    expect(application.invoke).not.toHaveBeenCalled();
    expect(surface.frame.view).toBe("request");
    expect(surface.frame.keys[9]).toMatchObject({
      label: "Acknowledge",
      enabled: true,
    });

    await releaseKey(surface, 9, 300);
    expect(application.invoke.mock.calls[0]?.[0].offerToken).toMatch(/^offer:/);
  });

  it("requires every detail page and a fresh 800 ms approval hold", async () => {
    const application = new SurfaceApplication(toSnapshot(waitingState()));
    application.reviewDetail = {
      requestId: "request-1",
      text: "A".repeat(160),
      inspection: "complete",
    };
    const surface = new Classic15MvpSurface(application);
    await releaseKey(surface, 0);
    await releaseKey(surface, 3, 200);
    expect(surface.frame.view).toBe("request");
    expect(surface.frame.keys[12]?.label).toBe("Page 1/2");
    expect(surface.frame.keys[9]?.label).toBe("Approve");

    surface.keyDown(9, 300);
    await surface.timeAdvanced(1_100);
    expect(application.invoke).not.toHaveBeenCalled();

    await releaseKey(surface, 13, 1_200);
    expect(surface.frame.keys[12]?.label).toBe("Page 2/2");
    expect(surface.frame.keys[9]?.label).toBe("Hold approve");
    surface.keyDown(9, 1_300);
    await surface.timeAdvanced(2_099);
    expect(application.invoke).not.toHaveBeenCalled();
    await surface.timeAdvanced(2_100);
    expect(application.invoke.mock.calls[0]?.[0].offerToken).toMatch(/^offer:/);
    expect(surface.frame.view).toBe("home");
  });

  it("arms reject on one press and confirms on a separate press", async () => {
    const application = new SurfaceApplication(toSnapshot(waitingState()));
    application.reviewDetail = {
      requestId: "request-1",
      text: "Command make check",
      inspection: "complete",
    };
    const surface = new Classic15MvpSurface(application);
    await releaseKey(surface, 0);
    await releaseKey(surface, 3, 200);

    surface.keyDown(7, 300);
    await surface.keyUp(7, 310);
    expect(application.invoke).not.toHaveBeenCalled();
    expect(surface.frame.keys[7]?.label).toBe("Confirm reject");
    surface.keyDown(7, 320);
    await Promise.resolve();
    expect(application.invoke).toHaveBeenCalledOnce();
  });

  it("always exposes local Exit when integration is unavailable", async () => {
    const state = reduceCore(createCoreState(), {
      type: "connectionUnavailable",
      reason: "unauthenticated",
    });
    const surface = new Classic15MvpSurface(
      new SurfaceApplication(toSnapshot(state)),
    );
    const frames: Classic15MvpFrame[] = [];
    surface.onFrame((frame) => frames.push(frame));
    expect(frames[0]).toMatchObject({ view: "unavailable" });
    expect(frames[0]?.keys[1]?.label).toBe("unauthenticated");
    const exit = vi.fn();
    surface.onExit(exit);
    surface.keyDown(14, 100);
    expect(exit).toHaveBeenCalledOnce();
    await surface.keyUp(14, 110);
    expect(exit).toHaveBeenCalledOnce();
  });
});
