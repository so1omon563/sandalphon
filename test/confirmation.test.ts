import { describe, expect, it } from "vitest";

import {
  createConfirmationState,
  reduceConfirmation,
  type ConfirmationState,
} from "../src/domain/confirmation.js";

function review(
  confirmation: "reviewPress" | "reviewHold" = "reviewHold",
): ConfirmationState {
  return reduceConfirmation(createConfirmationState(), {
    type: "beginReview",
    offerToken: "offer-1",
    frameRevision: 7,
    confirmation,
    requiredInspection: confirmation === "reviewHold" ? "complete" : "target",
  }).state;
}

function armed(
  confirmation: "reviewPress" | "reviewHold" = "reviewHold",
): ConfirmationState {
  return reduceConfirmation(review(confirmation), {
    type: "inspected",
    level: "complete",
    now: 1_000,
  }).state;
}

describe("confirmation reducer", () => {
  it("requires a separate review and sufficient inspection", () => {
    const started = review();
    expect(started.phase).toBe("reviewing");
    expect(
      reduceConfirmation(started, {
        type: "inspected",
        level: "target",
        now: 1_000,
      }).state,
    ).toBe(started);
    expect(armed().phase).toBe("armed");

    expect(
      reduceConfirmation(createConfirmationState(), {
        type: "beginReview",
        offerToken: "offer-1",
        frameRevision: 1,
        confirmation: "release",
        requiredInspection: "none",
      }).state,
    ).toEqual({ phase: "idle" });
  });

  it("dispatches reviewPress on a later valid confirm press", () => {
    const result = reduceConfirmation(armed("reviewPress"), {
      type: "confirmDown",
      offerToken: "offer-1",
      frameRevision: 7,
      now: 1_001,
    });
    expect(result).toMatchObject({
      dispatch: true,
      state: { phase: "dispatched" },
    });
  });

  it("aborts at 799 ms and dispatches exactly once at 800 ms", () => {
    let result = reduceConfirmation(armed(), {
      type: "confirmDown",
      offerToken: "offer-1",
      frameRevision: 7,
      now: 2_000,
    });
    expect(result.state.phase).toBe("holding");
    result = reduceConfirmation(result.state, {
      type: "timeAdvanced",
      now: 2_799,
    });
    expect(result).toMatchObject({
      dispatch: false,
      state: { phase: "holding" },
    });
    result = reduceConfirmation(result.state, {
      type: "confirmUp",
      now: 2_799,
    });
    expect(result).toMatchObject({
      dispatch: false,
      state: { phase: "armed" },
    });

    result = reduceConfirmation(armed(), {
      type: "confirmDown",
      offerToken: "offer-1",
      frameRevision: 7,
      now: 3_000,
    });
    result = reduceConfirmation(result.state, {
      type: "timeAdvanced",
      now: 3_800,
    });
    expect(result).toMatchObject({
      dispatch: true,
      state: { phase: "dispatched" },
    });
    expect(
      reduceConfirmation(result.state, { type: "confirmUp", now: 3_801 })
        .dispatch,
    ).toBe(false);
  });

  it("can dispatch on release at the threshold", () => {
    const holding = reduceConfirmation(armed(), {
      type: "confirmDown",
      offerToken: "offer-1",
      frameRevision: 7,
      now: 4_000,
    }).state;
    expect(
      reduceConfirmation(holding, { type: "confirmUp", now: 4_800 }),
    ).toMatchObject({ dispatch: true, state: { phase: "dispatched" } });
  });

  it("expires or invalidates without a provider side effect", () => {
    expect(
      reduceConfirmation(armed(), { type: "timeAdvanced", now: 11_001 }),
    ).toEqual({ state: { phase: "idle" }, dispatch: false });
    expect(
      reduceConfirmation(armed(), {
        type: "confirmDown",
        offerToken: "stale",
        frameRevision: 7,
        now: 1_001,
      }),
    ).toEqual({ state: { phase: "idle" }, dispatch: false });
    expect(
      reduceConfirmation(armed(), {
        type: "confirmDown",
        offerToken: "offer-1",
        frameRevision: 8,
        now: 1_001,
      }),
    ).toEqual({ state: { phase: "idle" }, dispatch: false });
    expect(reduceConfirmation(armed(), { type: "invalidate" })).toEqual({
      state: { phase: "idle" },
      dispatch: false,
    });
  });

  it("ignores unrelated events outside their valid phase", () => {
    const idle = createConfirmationState();
    expect(
      reduceConfirmation(idle, { type: "confirmUp", now: 1_000 }).state,
    ).toBe(idle);
    expect(
      reduceConfirmation(idle, { type: "timeAdvanced", now: 1_000 }).state,
    ).toBe(idle);
    expect(
      reduceConfirmation(review(), {
        type: "confirmDown",
        offerToken: "offer-1",
        frameRevision: 7,
        now: 1_000,
      }).state,
    ).toEqual({ phase: "idle" });
  });
});
