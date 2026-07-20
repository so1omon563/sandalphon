import { describe, expect, it, vi } from "vitest";

import type { PlusApplicationBoundary, PlusMvpFrame } from "../src/plusMvp.js";
import { compactLabel, PlusMvpSurface } from "../src/plusMvp.js";
import { toSnapshot, type OfferInvocation } from "../src/domain/offers.js";
import {
  createCoreState,
  createSession,
  reduceCore,
} from "../src/domain/reducer.js";
import type { SandalphonSnapshot } from "../src/domain/model.js";
import { readyState, waitingState } from "./core-fixtures.js";

function historicalSnapshot(): SandalphonSnapshot {
  let state = reduceCore(createCoreState(), {
    type: "connectionReady",
    connectionEpoch: 1,
  });
  state = reduceCore(state, {
    type: "observeSession",
    connectionEpoch: 1,
    session: createSession(
      "thread-1",
      "First thread",
      "resumable",
      "historical",
    ),
  });
  state = reduceCore(state, {
    type: "observeSession",
    connectionEpoch: 1,
    session: createSession(
      "thread-2",
      "Second thread",
      "resumable",
      "historical",
    ),
  });
  state = reduceCore(state, {
    type: "selectSession",
    sessionId: "thread-1",
  });
  return toSnapshot(state);
}

class SurfaceApplication implements PlusApplicationBoundary {
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
  surface: PlusMvpSurface,
  index: number,
  now = 100,
): Promise<void> {
  surface.keyDown(index, now);
  await surface.keyUp(index, now + 50);
}

describe("Stream Deck + MVP surface", () => {
  it("renders historical threads without claiming a live state", () => {
    const application = new SurfaceApplication(historicalSnapshot());
    const surface = new PlusMvpSurface(application);
    expect(surface.frame.view).toBe("home");
    expect(surface.frame.keys.slice(0, 3)).toMatchObject([
      { label: "First thread", state: "unavailable", icon: "session" },
      { label: "" },
      { label: "Resume", enabled: true },
    ]);
    expect(surface.frame.encoders[2]).toMatchObject({
      title: "Sessions",
      detail: "First thread · 1/2",
      press: "",
    });
    expect(surface.frame.encoders[0]).toMatchObject({ title: "", detail: "" });
    expect(surface.frame.encoders[1]).toMatchObject({ title: "", detail: "" });
    expect(surface.frame.encoders[3]).toMatchObject({ title: "", detail: "" });
    surface.dispose();
  });

  it("previews and explicitly selects a session with the third encoder", async () => {
    const application = new SurfaceApplication(historicalSnapshot());
    const surface = new PlusMvpSurface(application);
    surface.rotateEncoder(2, 1, false, 100);
    expect(surface.frame.encoders[2]).toMatchObject({
      title: "Preview session",
      detail: "Second thread · 2/2",
      press: "Select",
    });
    await surface.pressEncoder(2, 120);
    expect(application.selectSession).toHaveBeenCalledWith("thread-2");
    expect(surface.frame.encoders[2]).toMatchObject({
      title: "Sessions",
      detail: "Second thread · 2/2",
      press: "",
    });
    surface.rotateEncoder(2, 1, true, 130);
    expect(surface.frame.encoders[2]?.detail).toBe("Second thread · 2/2");

    surface.touchEncoder(2, true);
    expect(surface.frame.view).toBe("home");
    surface.touchEncoder(2, false);
    expect(surface.frame.view).toBe("home");
  });

  it("invokes a release-level primary action only on a matching key release", async () => {
    const application = new SurfaceApplication(historicalSnapshot());
    const surface = new PlusMvpSurface(application);
    surface.keyDown(2, 100);
    application.emit({
      ...application.snapshot,
      revision: application.snapshot.revision + 1,
    });
    await surface.keyUp(2, 150);
    expect(application.invoke).not.toHaveBeenCalled();

    await releaseKey(surface, 2, 200);
    expect(
      application.invoke.mock.calls[0]?.[0].offerToken.startsWith("offer:"),
    ).toBe(true);
  });

  it("previews and commits an advertised reasoning option with a dial press", async () => {
    const application = new SurfaceApplication(toSnapshot(readyState()));
    const surface = new PlusMvpSurface(application);
    await releaseKey(surface, 6);
    expect(surface.frame.view).toBe("session");
    expect(surface.frame.encoders[1]).toMatchObject({
      title: "",
      detail: "",
      rotate: "",
      press: "",
    });
    surface.rotateEncoder(2, 1, false, 200);
    expect(surface.frame.encoders[2]).toMatchObject({
      title: "Preview reasoning",
      detail: "high",
    });
    await surface.pressEncoder(2, 220);
    expect(application.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: "high" }),
    );
  });

  it("requires a new 800 ms approval hold after complete visible review", async () => {
    const application = new SurfaceApplication(toSnapshot(waitingState()));
    application.reviewDetail = {
      requestId: "request-1",
      text: "Command · make check · Working directory · /work/sandalphon",
      inspection: "complete",
    };
    const surface = new PlusMvpSurface(application);
    await releaseKey(surface, 3, 100);
    expect(surface.frame.view).toBe("request");
    expect(surface.frame.keys[3]?.label).toBe("Hold approve");

    surface.keyDown(3, 200);
    await surface.timeAdvanced(999);
    expect(application.invoke).not.toHaveBeenCalled();
    await surface.timeAdvanced(1_000);
    expect(
      application.invoke.mock.calls[0]?.[0].offerToken.startsWith("offer:"),
    ).toBe(true);
    expect(surface.frame.view).toBe("home");
  });

  it("arms reject on one frame and confirms it on a separate press", async () => {
    const application = new SurfaceApplication(toSnapshot(waitingState()));
    application.reviewDetail = {
      requestId: "request-1",
      text: "Command · make check",
      inspection: "complete",
    };
    const surface = new PlusMvpSurface(application);
    await releaseKey(surface, 3, 100);
    surface.keyDown(6, 200);
    await surface.keyUp(6, 210);
    expect(application.invoke).not.toHaveBeenCalled();
    expect(surface.frame.keys[6]?.label).toBe("Confirm reject");
    surface.keyDown(6, 220);
    await Promise.resolve();
    expect(application.invoke).toHaveBeenCalled();
  });

  it("renders bounded unavailable feedback and emits Exit locally", async () => {
    const state = reduceCore(createCoreState(), {
      type: "connectionUnavailable",
      reason: "unsupportedVersion",
    });
    const application = new SurfaceApplication(toSnapshot(state));
    const surface = new PlusMvpSurface(application);
    expect(surface.frame.view).toBe("unavailable");
    expect(surface.frame.encoders.slice(0, 2)).toMatchObject([
      { title: "Offline", detail: "unsupportedVersion" },
      { title: "", detail: "" },
    ]);
    const exit = vi.fn();
    surface.onExit(exit);
    surface.keyDown(7, 100);
    expect(exit).toHaveBeenCalledOnce();
    await surface.keyUp(7, 110);
    expect(exit).toHaveBeenCalledOnce();
  });

  it("keeps home quiet and reveals only contextual controls", () => {
    const surface = new PlusMvpSurface(
      new SurfaceApplication(historicalSnapshot()),
    );

    expect(
      surface.frame.keys
        .filter(({ label }) => label.length > 0)
        .map(({ index }) => index),
    ).toEqual([0, 2, 7]);
    expect(
      surface.frame.encoders
        .filter(({ title, detail }) => title || detail)
        .map(({ index }) => index),
    ).toEqual([2]);
  });

  it("reveals Details only when it contains secondary context", async () => {
    const historical = new PlusMvpSurface(
      new SurfaceApplication(historicalSnapshot()),
    );
    expect(historical.frame.keys[6]?.label).toBe("");

    const ready = new PlusMvpSurface(
      new SurfaceApplication(toSnapshot(readyState())),
    );
    expect(ready.frame.keys[6]).toMatchObject({
      label: "Details",
      enabled: true,
    });
    await releaseKey(ready, 6);
    expect(ready.frame.view).toBe("session");
    expect(ready.frame.encoders[1]).toMatchObject({ title: "", detail: "" });
    expect(ready.frame.encoders[2]?.title).toBe("Reasoning");
  });

  it("publishes new frames and sanitizes unsafe provider labels", () => {
    const application = new SurfaceApplication(historicalSnapshot());
    const surface = new PlusMvpSurface(application);
    const frames: PlusMvpFrame[] = [];
    const unsubscribe = surface.onFrame((frame) => frames.push(frame));
    surface.rotateEncoder(2, 1, false, 100);
    expect(frames).toHaveLength(2);
    unsubscribe();
    surface.dispose();
    expect(compactLabel("A very long thread name", 6)).toBe("A very");
    expect(compactLabel("bad\nlabel", 12)).toBe("Codex thread");
    expect(compactLabel("", 12)).toBe("Codex thread");
  });
});
