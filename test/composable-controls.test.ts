import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
  DeviceType: { StreamDeckPlus: 7 },
}));

import type { SurfaceApplicationBoundary } from "../src/application.js";
import { ComposableControls } from "../src/composableControls.js";
import type { SandalphonSnapshot } from "../src/domain/model.js";

describe("ComposableControls", () => {
  it("renders distinct status, Resume, attention, and session-dial roles", async () => {
    const harness = applicationHarness(readySnapshot());
    const controls = new ComposableControls(harness.application);
    const status = keyAction("status");
    const resume = keyAction("resume");
    const attention = keyAction("attention");
    const dial = dialAction("sessions");

    controls.registerStatus(status.action);
    controls.registerResume(resume.action);
    controls.registerAttention(attention.action);
    controls.registerSessionDial(dial.action);

    await vi.waitFor(() => expect(status.setImage).toHaveBeenCalled());
    expect(lastSvg(status.setImage)).toContain("Alpha");
    expect(lastSvg(status.setImage)).toContain('width="46" height="42"');
    expect(lastSvg(status.setImage)).not.toContain("M57 68l30-30");
    expect(lastSvg(resume.setImage)).toContain("Resume");
    expect(lastSvg(attention.setImage)).toContain("Attention");
    expect(dial.setFeedbackLayout).toHaveBeenCalledWith(
      "layouts/plus-quarter.json",
    );
    expect(dial.setFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ heading: "Sessions" }),
    );
  });

  it("dispatches only the unchanged current Resume offer", async () => {
    const harness = applicationHarness(readySnapshot());
    const controls = new ComposableControls(harness.application);
    const resume = keyAction("resume");
    controls.registerResume(resume.action);

    controls.resumeDown(resume.action);
    await controls.resumeUp(resume.action);
    expect(harness.invoke).toHaveBeenCalledWith({
      invocationId: "composable-resume:1",
      offerToken: "resume-alpha",
    });

    controls.resumeDown(resume.action);
    harness.emit({ ...readySnapshot(), revision: 2 });
    await controls.resumeUp(resume.action);
    expect(harness.invoke).toHaveBeenCalledTimes(1);

    const unsafe = keyAction("unsafe");
    controls.registerResume(unsafe.action);
    harness.emit(snapshotWithoutResume());
    controls.resumeDown(unsafe.action);
    await controls.resumeUp(unsafe.action);
    expect(harness.invoke).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(unsafe.setImage).toHaveBeenCalled());
    expect(lastSvg(unsafe.setImage)).toContain("role=blank");
  });

  it("selects attention without deciding it and rejects stale presses", async () => {
    const harness = applicationHarness(readySnapshot());
    const controls = new ComposableControls(harness.application);
    const attention = keyAction("attention");
    controls.registerAttention(attention.action);

    controls.attentionDown(attention.action);
    await controls.attentionUp(attention.action);
    expect(harness.selectSession).toHaveBeenCalledWith("beta");
    expect(harness.invoke).not.toHaveBeenCalled();

    controls.attentionDown(attention.action);
    harness.emit({ ...readySnapshot(), revision: 2 });
    await controls.attentionUp(attention.action);
    expect(harness.selectSession).toHaveBeenCalledTimes(1);

    harness.emit(snapshotWithoutAttention());
    controls.attentionDown(attention.action);
    await controls.attentionUp(attention.action);
    expect(harness.selectSession).toHaveBeenCalledTimes(1);
  });

  it("previews sessions locally and selects only on dial press", async () => {
    const harness = applicationHarness(readySnapshot());
    const controls = new ComposableControls(harness.application);
    const dial = dialAction("sessions");
    controls.registerSessionDial(dial.action);

    controls.rotateSessionDial(dial.action, 1, false);
    await vi.waitFor(() => {
      const calls = JSON.stringify(dial.setFeedback.mock.calls);
      expect(calls).toContain('"heading":"Preview"');
      expect(calls).toContain("Beta session");
    });
    expect(harness.selectSession).not.toHaveBeenCalled();

    controls.rotateSessionDial(dial.action, -1, true);
    await controls.pressSessionDial(dial.action);
    expect(harness.selectSession).toHaveBeenCalledWith("beta");

    const unsupported = dialAction("unsupported", 0);
    controls.registerSessionDial(unsupported.action);
    controls.rotateSessionDial(unsupported.action, 1, false);
    await controls.pressSessionDial(unsupported.action);
    expect(unsupported.setFeedbackLayout).not.toHaveBeenCalled();
  });

  it("clears local input state when an action disappears", async () => {
    const harness = applicationHarness(readySnapshot());
    const controls = new ComposableControls(harness.application);
    const resume = keyAction("resume");
    const attention = keyAction("attention");
    controls.registerResume(resume.action);
    controls.registerAttention(attention.action);
    controls.resumeDown(resume.action);
    controls.attentionDown(attention.action);

    controls.unregister("resume");
    controls.unregister("attention");
    await controls.resumeUp(resume.action);
    await controls.attentionUp(attention.action);

    expect(harness.invoke).not.toHaveBeenCalled();
    expect(harness.selectSession).not.toHaveBeenCalled();
  });
});

function applicationHarness(initial: SandalphonSnapshot) {
  let snapshot = initial;
  let listener: ((value: SandalphonSnapshot) => void) | undefined;
  const selectSession = vi.fn().mockResolvedValue(undefined);
  const invoke = vi.fn().mockResolvedValue({ status: "completed" });
  const application = {
    get snapshot() {
      return snapshot;
    },
    reviewDetail: undefined,
    onSnapshot: vi.fn((next: (value: SandalphonSnapshot) => void) => {
      listener = next;
      next(snapshot);
      return () => undefined;
    }),
    selectSession,
    invoke,
  } as SurfaceApplicationBoundary;
  return {
    application,
    invoke,
    selectSession,
    emit(next: SandalphonSnapshot) {
      snapshot = next;
      listener?.(next);
    },
  };
}

function readySnapshot(): SandalphonSnapshot {
  return {
    revision: 1,
    connectionEpoch: 1,
    integration: { phase: "ready" },
    selectedSessionId: "alpha",
    sessions: [
      session(
        "alpha",
        "Alpha session",
        "idle",
        [],
        [
          {
            kind: "ResumeSession",
            state: "available",
            offerToken: "resume-alpha",
            safety: { confirmation: "release", inspection: "none" },
          },
        ],
      ),
      session("beta", "Beta session", "waiting", ["approval"], []),
    ],
  };
}

function snapshotWithoutResume(): SandalphonSnapshot {
  const snapshot = readySnapshot();
  return {
    ...snapshot,
    revision: 3,
    sessions: [
      session(
        "alpha",
        "Alpha session",
        "waiting",
        ["approval"],
        [
          {
            kind: "ApproveRequest",
            state: "available",
            offerToken: "approve-alpha",
            safety: { confirmation: "reviewHold", inspection: "complete" },
          },
        ],
      ),
      snapshot.sessions[1]!,
    ],
  };
}

function snapshotWithoutAttention(): SandalphonSnapshot {
  const snapshot = readySnapshot();
  return {
    ...snapshot,
    revision: 4,
    sessions: snapshot.sessions.map((item) => ({ ...item, attention: [] })),
  };
}

function session(
  id: string,
  name: string,
  primaryState: "idle" | "waiting",
  attention: readonly "approval"[],
  actionOffers: SandalphonSnapshot["sessions"][number]["actionOffers"],
): SandalphonSnapshot["sessions"][number] {
  return {
    id,
    name,
    access: "resumable",
    freshness: "historical",
    run: {
      phase: "idle",
      steerability: "unknown",
      waitKinds: [],
      automaticRetry: false,
    },
    activity: "none",
    pendingRequests: [],
    attention,
    nextTurnSettings: {
      revision: 0,
      reasoningEffort: "medium",
      reasoningOptions: ["medium", "high"],
    },
    primaryState,
    actionOffers,
  };
}

function keyAction(id: string) {
  const setImage = vi.fn().mockResolvedValue(undefined);
  return {
    action: {
      id,
      setImage,
      setTitle: vi.fn().mockResolvedValue(undefined),
      showAlert: vi.fn().mockResolvedValue(undefined),
    } as never,
    setImage,
  };
}

function dialAction(id: string, type = 7) {
  const setFeedback = vi.fn().mockResolvedValue(undefined);
  const setFeedbackLayout = vi.fn().mockResolvedValue(undefined);
  return {
    action: {
      id,
      device: { id: "plus", type, size: { columns: 4, rows: 2 } },
      coordinates: { column: 0, row: 0 },
      setFeedback,
      setFeedbackLayout,
      setTriggerDescription: vi.fn().mockResolvedValue(undefined),
      showAlert: vi.fn().mockResolvedValue(undefined),
    } as never,
    setFeedback,
    setFeedbackLayout,
  };
}

function lastSvg(setImage: ReturnType<typeof vi.fn>): string {
  const encoded =
    String(setImage.mock.calls.at(-1)?.[0]).split(",", 2)[1] ?? "";
  return Buffer.from(encoded, "base64").toString("utf8");
}
