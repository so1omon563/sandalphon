import { describe, expect, it } from "vitest";

import { toSnapshot } from "../src/domain/offers.js";
import {
  present,
  recognizeProfile,
  rotatePreview,
  type SurfaceRuntime,
} from "../src/presentation.js";
import { readyState, waitingState } from "./core-fixtures.js";

function classicRuntime(
  scope: "managed" | "composable" = "managed",
): SurfaceRuntime {
  return {
    runtimeDeviceId: "classic",
    connected: true,
    observedKeyGrid: [5, 3],
    encoderCount: 0,
    touchStrip: false,
    profile: "classic15",
    scope,
    visibleControls: [
      { id: "owned", controller: "keypad", owned: true },
      { id: "foreign", controller: "keypad", owned: false },
    ],
    local: { revision: 0, view: "home", previewIndex: 0 },
  };
}

function plusRuntime(ownedEncoders = 4): SurfaceRuntime {
  return {
    runtimeDeviceId: "plus",
    connected: true,
    observedKeyGrid: [4, 2],
    encoderCount: 4,
    touchStrip: true,
    profile: "streamDeckPlus",
    scope: "managed",
    visibleControls: [
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `visible-key-${index}`,
        controller: "keypad" as const,
        owned: true,
      })),
      ...Array.from({ length: ownedEncoders }, (_, index) => ({
        id: `visible-encoder-${index}`,
        controller: "encoder" as const,
        owned: true,
      })),
    ],
    local: { revision: 0, view: "actions", previewIndex: 0 },
  };
}

describe("presentation", () => {
  it("recognizes only the two accepted capability signatures", () => {
    expect(recognizeProfile(classicRuntime())).toBe("classic15");
    expect(recognizeProfile(plusRuntime())).toBe("streamDeckPlus");
    expect(
      recognizeProfile({
        observedKeyGrid: [3, 2],
        encoderCount: 0,
        touchStrip: false,
      }),
    ).toBeUndefined();
  });

  it("renders complete managed frames for Classic and Plus", () => {
    const snapshot = toSnapshot(readyState());
    const classic = present(snapshot, classicRuntime());
    expect(classic.keyViews).toHaveLength(15);
    expect(classic.encoderViews).toHaveLength(0);
    expect(classic.keyViews[0]).toMatchObject({
      role: "status",
      label: "idle",
    });
    expect(classic.keyViews.some(({ role }) => role === "choice")).toBe(true);

    const plus = present(snapshot, plusRuntime());
    expect(plus.keyViews).toHaveLength(8);
    expect(plus.encoderViews).toHaveLength(4);
    expect(plus.encoderViews[0]).toMatchObject({
      role: "choice",
      enabled: true,
      actionKind: "ChangeNextTurnOptions",
    });
    expect(plus.fullStripCoordinated).toBe(true);
  });

  it("renders only owned composable controls and never coordinates their strip", () => {
    const runtime = {
      ...classicRuntime("composable"),
      visibleControls: [
        { id: "owned", controller: "keypad" as const, owned: true },
        { id: "foreign", controller: "keypad" as const, owned: false },
      ],
    };
    const frame = present(toSnapshot(readyState()), runtime);
    expect(frame.keyViews.map(({ id }) => id)).toEqual(["owned"]);
    expect(frame.fullStripCoordinated).toBe(false);
  });

  it("keeps consequential confirmation unavailable in composable scope", () => {
    const runtime = {
      ...classicRuntime("composable"),
      visibleControls: Array.from({ length: 6 }, (_, index) => ({
        id: `owned-${index}`,
        controller: "keypad" as const,
        owned: true,
      })),
    };
    const frame = present(toSnapshot(waitingState()), runtime);
    const approve = frame.keyViews.find(
      ({ actionKind }) => actionKind === "ApproveRequest",
    );
    expect(approve).toMatchObject({
      enabled: false,
      unavailableReason: "managedSurfaceRequired",
    });
    expect(approve?.offerToken).toBeUndefined();
  });

  it("fails visibly for disconnect, mismatch, and partial Plus ownership", () => {
    const snapshot = toSnapshot(readyState());
    const disconnected = present(snapshot, {
      ...classicRuntime(),
      connected: false,
    });
    expect(disconnected.surfaceView).toBe("unavailable");
    expect(disconnected.unavailableReasons).toEqual(["deviceDisconnected"]);
    expect(
      present(snapshot, { ...plusRuntime(), connected: false })
        .fullStripCoordinated,
    ).toBe(false);

    const mismatch = present(snapshot, {
      ...classicRuntime(),
      observedKeyGrid: [4, 2],
    });
    expect(mismatch.unavailableReasons).toEqual(["profileMismatch"]);
    expect(
      mismatch.keyViews
        .filter(({ actionKind }) => actionKind)
        .every(
          ({ enabled, offerToken, unavailableReason }) =>
            !enabled &&
            offerToken === undefined &&
            unavailableReason === "surfaceUnavailable",
        ),
    ).toBe(true);
    expect(present(snapshot, plusRuntime(3)).fullStripCoordinated).toBe(false);
  });

  it("renders a truthful unavailable frame without a selected session", () => {
    const current = toSnapshot(readyState());
    const snapshot = {
      revision: current.revision,
      connectionEpoch: current.connectionEpoch,
      integration: current.integration,
      sessions: current.sessions,
    };
    const frame = present(snapshot, classicRuntime());
    expect(frame.keyViews[0]).toMatchObject({
      role: "status",
      label: "unavailable",
    });
  });

  it("renders a choice offer without optional choices conservatively", () => {
    const current = toSnapshot(readyState());
    const sessions = current.sessions.map((session) => ({
      ...session,
      actionOffers: session.actionOffers.map((candidate) =>
        candidate.kind === "ChangeNextTurnOptions"
          ? {
              kind: candidate.kind,
              state: candidate.state,
              safety: candidate.safety,
              ...(candidate.offerToken
                ? { offerToken: candidate.offerToken }
                : {}),
            }
          : candidate,
      ),
    }));
    const frame = present({ ...current, sessions }, plusRuntime());
    expect(frame.encoderViews[0]?.optionIds).toBeUndefined();
  });

  it("previews Plus choices without committing and wraps in both directions", () => {
    const plus = plusRuntime();
    expect(rotatePreview(plus, 1, 3).local.previewIndex).toBe(1);
    expect(rotatePreview(plus, -1, 3).local.previewIndex).toBe(2);
    expect(rotatePreview(plus, 0, 3)).toBe(plus);
    expect(rotatePreview(plus, 1, 0)).toBe(plus);
    const classic = classicRuntime();
    expect(rotatePreview(classic, 1, 3)).toBe(classic);
  });
});
