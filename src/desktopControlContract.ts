export const REQUIRED_DESKTOP_CONTROL_CAPABILITIES = [
  "task.list",
  "task.select",
] as const;

export type DesktopControlCapability =
  (typeof REQUIRED_DESKTOP_CONTROL_CAPABILITIES)[number];

export interface DesktopControlVersion {
  readonly application: string;
  readonly engine: string;
  readonly protocol: string;
}

export interface DesktopControlPolicy {
  readonly enabled: boolean;
  readonly allowedVersions: readonly DesktopControlVersion[];
}

export interface DesktopTaskTarget {
  readonly id: string;
  readonly selected: boolean;
}

export interface DesktopControlObservation {
  readonly connected: boolean;
  readonly endpointHost: string;
  readonly epoch: number;
  readonly revision: number;
  readonly version: DesktopControlVersion;
  readonly capabilities: readonly string[];
  readonly targets: readonly DesktopTaskTarget[];
}

export type DesktopControlUnavailableReason =
  | "disabled"
  | "disconnected"
  | "unsafeEndpoint"
  | "unsupportedVersion"
  | "missingCapability"
  | "invalidState";

export type DesktopControlState =
  | {
      readonly availability: "unavailable";
      readonly reason: DesktopControlUnavailableReason;
      readonly epoch: number;
      readonly revision: number;
      readonly targets: readonly [];
    }
  | {
      readonly availability: "ready";
      readonly epoch: number;
      readonly revision: number;
      readonly targets: readonly DesktopTaskTarget[];
      readonly selectedTargetId: string;
    };

export interface DesktopTaskSelectionOffer {
  readonly kind: "SelectDesktopTask";
  readonly targetId: string;
  readonly offerToken: string;
}

export interface DesktopTaskSelectionInvocation {
  readonly targetId: string;
  readonly offerToken: string;
}

export type DesktopTaskSelectionDecision =
  | { readonly status: "accepted"; readonly targetId: string }
  | { readonly status: "rejected"; readonly reason: "staleOffer" };

export function evaluateDesktopControl(
  policy: DesktopControlPolicy,
  observation: DesktopControlObservation,
): DesktopControlState {
  if (!policy.enabled) return unavailable(observation, "disabled");
  if (!observation.connected) return unavailable(observation, "disconnected");
  if (observation.endpointHost !== "127.0.0.1") {
    return unavailable(observation, "unsafeEndpoint");
  }
  if (!isAllowedVersion(policy, observation.version)) {
    return unavailable(observation, "unsupportedVersion");
  }
  if (
    !REQUIRED_DESKTOP_CONTROL_CAPABILITIES.every((capability) =>
      observation.capabilities.includes(capability),
    )
  ) {
    return unavailable(observation, "missingCapability");
  }
  if (!hasValidTargets(observation.targets)) {
    return unavailable(observation, "invalidState");
  }

  const selectedTarget = observation.targets.find((target) => target.selected);
  if (!selectedTarget) return unavailable(observation, "invalidState");

  return {
    availability: "ready",
    epoch: observation.epoch,
    revision: observation.revision,
    targets: observation.targets.map((target) => ({ ...target })),
    selectedTargetId: selectedTarget.id,
  };
}

export function issueDesktopTaskSelectionOffers(
  state: DesktopControlState,
): readonly DesktopTaskSelectionOffer[] {
  if (state.availability !== "ready") return [];
  return state.targets
    .filter((target) => !target.selected)
    .map((target) => ({
      kind: "SelectDesktopTask",
      targetId: target.id,
      offerToken: desktopOfferToken(state, target.id),
    }));
}

export function validateDesktopTaskSelection(
  state: DesktopControlState,
  invocation: DesktopTaskSelectionInvocation,
): DesktopTaskSelectionDecision {
  const offer = issueDesktopTaskSelectionOffers(state).find(
    (candidate) =>
      candidate.targetId === invocation.targetId &&
      candidate.offerToken === invocation.offerToken,
  );
  return offer
    ? { status: "accepted", targetId: offer.targetId }
    : { status: "rejected", reason: "staleOffer" };
}

export function revokeDesktopControl(
  state: DesktopControlState,
): DesktopControlState {
  return {
    availability: "unavailable",
    reason: "disconnected",
    epoch: state.epoch + 1,
    revision: state.revision + 1,
    targets: [],
  };
}

function unavailable(
  observation: DesktopControlObservation,
  reason: DesktopControlUnavailableReason,
): DesktopControlState {
  return {
    availability: "unavailable",
    reason,
    epoch: observation.epoch,
    revision: observation.revision,
    targets: [],
  };
}

function isAllowedVersion(
  policy: DesktopControlPolicy,
  version: DesktopControlVersion,
): boolean {
  return policy.allowedVersions.some(
    (allowed) =>
      allowed.application === version.application &&
      allowed.engine === version.engine &&
      allowed.protocol === version.protocol,
  );
}

function hasValidTargets(targets: readonly DesktopTaskTarget[]): boolean {
  if (targets.length === 0 || targets.length > 32) return false;
  const ids = new Set<string>();
  let selectedCount = 0;
  for (const target of targets) {
    if (
      !target ||
      typeof target !== "object" ||
      typeof target.id !== "string" ||
      typeof target.selected !== "boolean" ||
      target.id.length === 0 ||
      target.id.length > 256 ||
      ids.has(target.id)
    ) {
      return false;
    }
    ids.add(target.id);
    if (target.selected) selectedCount += 1;
  }
  return selectedCount === 1;
}

function desktopOfferToken(
  state: Extract<DesktopControlState, { availability: "ready" }>,
  targetId: string,
): string {
  return `desktop:${state.epoch}:${state.revision}:${targetId}`;
}
