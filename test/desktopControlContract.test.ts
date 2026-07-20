import { describe, expect, it } from "vitest";

import {
  evaluateDesktopControl,
  issueDesktopTaskSelectionOffers,
  revokeDesktopControl,
  validateDesktopTaskSelection,
  type DesktopControlObservation,
  type DesktopControlPolicy,
} from "../src/desktopControlContract.js";

const policy: DesktopControlPolicy = {
  enabled: true,
  allowedVersions: [
    {
      application: "26.715.52143",
      engine: "150.0.7871.124",
      protocol: "1.3",
    },
  ],
};

const observation: DesktopControlObservation = {
  connected: true,
  endpointHost: "127.0.0.1",
  epoch: 4,
  revision: 9,
  version: policy.allowedVersions[0]!,
  capabilities: ["task.list", "task.select"],
  targets: [
    { id: "task-1", selected: true },
    { id: "task-2", selected: false },
  ],
};

describe("desktop control contract", () => {
  it("requires explicit enablement and an exact version tuple", () => {
    expect(
      evaluateDesktopControl({ ...policy, enabled: false }, observation),
    ).toMatchObject({ availability: "unavailable", reason: "disabled" });
    expect(
      evaluateDesktopControl(policy, {
        ...observation,
        version: { ...observation.version, engine: "150.0.7871.125" },
      }),
    ).toMatchObject({
      availability: "unavailable",
      reason: "unsupportedVersion",
    });
  });

  it("rejects non-loopback, disconnected, and incomplete bridges", () => {
    expect(
      evaluateDesktopControl(policy, {
        ...observation,
        endpointHost: "0.0.0.0",
      }),
    ).toMatchObject({
      availability: "unavailable",
      reason: "unsafeEndpoint",
    });
    expect(
      evaluateDesktopControl(policy, { ...observation, connected: false }),
    ).toMatchObject({
      availability: "unavailable",
      reason: "disconnected",
    });
    expect(
      evaluateDesktopControl(policy, {
        ...observation,
        capabilities: ["task.list"],
      }),
    ).toMatchObject({
      availability: "unavailable",
      reason: "missingCapability",
    });
  });

  it("rejects malformed task state", () => {
    for (const targets of [
      [],
      [
        { id: "task-1", selected: true },
        { id: "task-1", selected: false },
      ],
      [
        { id: "task-1", selected: true },
        { id: "task-2", selected: true },
      ],
    ]) {
      expect(
        evaluateDesktopControl(policy, { ...observation, targets }),
      ).toMatchObject({
        availability: "unavailable",
        reason: "invalidState",
        targets: [],
      });
    }
  });

  it("rejects malformed runtime target shapes without truthiness coercion", () => {
    for (const targets of [
      [null],
      [{ id: "task-1", selected: "false" }],
      [{ id: 1, selected: true }],
    ]) {
      expect(
        evaluateDesktopControl(policy, {
          ...observation,
          targets: targets as unknown as DesktopControlObservation["targets"],
        }),
      ).toMatchObject({
        availability: "unavailable",
        reason: "invalidState",
        targets: [],
      });
    }
  });

  it("issues only revision-bound offers for unselected tasks", () => {
    const state = evaluateDesktopControl(policy, observation);
    expect(state).toMatchObject({
      availability: "ready",
      selectedTargetId: "task-1",
    });
    expect(issueDesktopTaskSelectionOffers(state)).toEqual([
      {
        kind: "SelectDesktopTask",
        targetId: "task-2",
        offerToken: "desktop:4:9:task-2",
      },
    ]);
  });

  it("rejects an offer after task state changes", () => {
    const first = evaluateDesktopControl(policy, observation);
    const offer = issueDesktopTaskSelectionOffers(first)[0]!;
    const next = evaluateDesktopControl(policy, {
      ...observation,
      revision: 10,
      targets: [
        { id: "task-1", selected: false },
        { id: "task-2", selected: true },
      ],
    });
    expect(validateDesktopTaskSelection(next, offer)).toEqual({
      status: "rejected",
      reason: "staleOffer",
    });
  });

  it("accepts a current task-selection offer", () => {
    const state = evaluateDesktopControl(policy, observation);
    const offer = issueDesktopTaskSelectionOffers(state)[0]!;
    expect(validateDesktopTaskSelection(state, offer)).toEqual({
      status: "accepted",
      targetId: "task-2",
    });
  });

  it("revokes all task identifiers and offers on cleanup", () => {
    const state = evaluateDesktopControl(policy, observation);
    const revoked = revokeDesktopControl(state);
    expect(revoked).toEqual({
      availability: "unavailable",
      reason: "disconnected",
      epoch: 5,
      revision: 10,
      targets: [],
    });
    expect(issueDesktopTaskSelectionOffers(revoked)).toEqual([]);
  });
});
