import type { ConfirmationType, InspectionLevel } from "./model.js";

interface ReviewContext {
  readonly offerToken: string;
  readonly frameRevision: number;
  readonly confirmation: "reviewPress" | "reviewHold";
  readonly requiredInspection: InspectionLevel;
}

export type ConfirmationState =
  | { readonly phase: "idle" }
  | (ReviewContext & {
      readonly phase: "reviewing";
      readonly inspection: "none";
    })
  | (ReviewContext & {
      readonly phase: "armed";
      readonly inspection: InspectionLevel;
      readonly expiresAt: number;
    })
  | (ReviewContext & {
      readonly phase: "holding";
      readonly inspection: InspectionLevel;
      readonly expiresAt: number;
      readonly holdStartedAt: number;
    })
  | (ReviewContext & {
      readonly phase: "dispatched";
      readonly inspection: InspectionLevel;
      readonly expiresAt: number;
      readonly holdStartedAt?: number;
    });

export type ConfirmationEvent =
  | {
      readonly type: "beginReview";
      readonly offerToken: string;
      readonly frameRevision: number;
      readonly confirmation: ConfirmationType;
      readonly requiredInspection: InspectionLevel;
    }
  | {
      readonly type: "inspected";
      readonly level: InspectionLevel;
      readonly now: number;
    }
  | {
      readonly type: "confirmDown";
      readonly offerToken: string;
      readonly frameRevision: number;
      readonly now: number;
    }
  | { readonly type: "timeAdvanced"; readonly now: number }
  | { readonly type: "confirmUp"; readonly now: number }
  | { readonly type: "invalidate" };

export interface ConfirmationTransition {
  readonly state: ConfirmationState;
  readonly dispatch: boolean;
}

export function createConfirmationState(): ConfirmationState {
  return { phase: "idle" };
}

export function reduceConfirmation(
  state: ConfirmationState,
  event: ConfirmationEvent,
): ConfirmationTransition {
  if (event.type === "invalidate") {
    return transition(createConfirmationState());
  }
  if (event.type === "beginReview") {
    if (
      event.confirmation !== "reviewPress" &&
      event.confirmation !== "reviewHold"
    ) {
      return transition(createConfirmationState());
    }
    return transition({
      phase: "reviewing",
      offerToken: event.offerToken,
      frameRevision: event.frameRevision,
      confirmation: event.confirmation,
      requiredInspection: event.requiredInspection,
      inspection: "none",
    });
  }
  if (event.type === "inspected") {
    if (
      state.phase !== "reviewing" ||
      !satisfies(event.level, state.requiredInspection)
    ) {
      return transition(state);
    }
    return transition({
      ...state,
      phase: "armed",
      inspection: event.level,
      expiresAt: event.now + 10_000,
    });
  }
  if (event.type === "confirmDown") {
    if (
      state.phase !== "armed" ||
      event.offerToken !== state.offerToken ||
      event.frameRevision !== state.frameRevision ||
      event.now > state.expiresAt
    ) {
      return transition(createConfirmationState());
    }
    if (state.confirmation === "reviewPress") {
      return transition({ ...state, phase: "dispatched" }, true);
    }
    return transition({ ...state, phase: "holding", holdStartedAt: event.now });
  }
  if (event.type === "timeAdvanced") {
    if (state.phase === "armed" && event.now > state.expiresAt) {
      return transition(createConfirmationState());
    }
    if (state.phase === "holding" && event.now - state.holdStartedAt >= 800) {
      return transition({ ...state, phase: "dispatched" }, true);
    }
    return transition(state);
  }
  if (state.phase !== "holding") return transition(state);
  if (event.now - state.holdStartedAt >= 800) {
    return transition({ ...state, phase: "dispatched" }, true);
  }
  const { holdStartedAt: _holdStartedAt, ...armed } = state;
  void _holdStartedAt;
  return transition({
    ...armed,
    phase: "armed",
  });
}

function satisfies(
  actual: InspectionLevel,
  required: InspectionLevel,
): boolean {
  const rank = { none: 0, target: 1, complete: 2 };
  return rank[actual] >= rank[required];
}

function transition(
  state: ConfirmationState,
  dispatch = false,
): ConfirmationTransition {
  return { state, dispatch };
}
