import type {
  ActionKind,
  ActionOffer,
  CoreState,
  DisabledReason,
  HumanRequest,
  InspectionLevel,
  PrimaryState,
  SafetyPlan,
  SandalphonSnapshot,
  SessionState,
} from "./model.js";

interface OfferCandidate {
  readonly kind: ActionKind;
  readonly reason?: DisabledReason;
  readonly target: string;
  readonly effectKey: string;
  readonly optionIds?: readonly string[];
  readonly safety: SafetyPlan;
}

export interface OfferInvocation {
  readonly invocationId: string;
  readonly offerToken: string;
  readonly optionId?: string;
}

export interface IntentResult {
  readonly status:
    "rejected" | "accepted" | "pending" | "completed" | "failed" | "uncertain";
  readonly reason?: "staleOffer" | "invalidOption" | "alreadyResolving";
  readonly kind?: ActionKind;
  readonly effectKey?: string;
}

export interface InvocationLedger {
  readonly invocationResults: Readonly<Record<string, IntentResult>>;
  readonly claimedEffects: readonly string[];
}

export interface DispatchDecision {
  readonly ledger: InvocationLedger;
  readonly result: IntentResult;
  readonly shouldDispatch: boolean;
}

export function createInvocationLedger(): InvocationLedger {
  return { invocationResults: {}, claimedEffects: [] };
}

export function toSnapshot(
  state: CoreState,
  claimedEffects: readonly string[] = [],
): SandalphonSnapshot {
  const sessions = state.sessions.map((session) => ({
    ...session,
    primaryState: derivePrimaryState(state, session),
    actionOffers: issueOffers(state, session).map(({ candidate, token }) =>
      publicOffer(
        candidate,
        token,
        claimedEffects.includes(candidate.effectKey),
      ),
    ),
  }));

  return {
    revision: state.revision,
    connectionEpoch: state.connectionEpoch,
    integration: state.integration,
    ...(state.selectedSessionId
      ? { selectedSessionId: state.selectedSessionId }
      : {}),
    sessions,
  };
}

export function derivePrimaryState(
  state: CoreState,
  session: SessionState,
): PrimaryState {
  if (
    state.integration.phase !== "ready" ||
    session.access !== "owned" ||
    session.freshness !== "current"
  ) {
    return "unavailable";
  }
  if (session.pendingRequests.length > 0) return "waiting";
  if (session.run.phase !== "idle") return "working";
  if (
    session.resultLatch?.outcome === "failed" &&
    !session.resultLatch.acknowledged
  ) {
    return "failed";
  }
  if (
    session.resultLatch?.outcome === "completed" &&
    !session.resultLatch.acknowledged
  ) {
    return "completed";
  }
  return "idle";
}

export function dispatchOffer(
  state: CoreState,
  ledger: InvocationLedger,
  invocation: OfferInvocation,
): DispatchDecision {
  const previous = ledger.invocationResults[invocation.invocationId];
  if (previous) {
    return { ledger, result: previous, shouldDispatch: false };
  }

  const issued = state.sessions
    .flatMap((session) => issueOffers(state, session))
    .find(({ token }) => token === invocation.offerToken);
  if (!issued || issued.candidate.reason) {
    return reject(ledger, invocation.invocationId, "staleOffer");
  }
  if (
    (issued.candidate.optionIds && !invocation.optionId) ||
    (invocation.optionId &&
      !issued.candidate.optionIds?.includes(invocation.optionId))
  ) {
    return reject(ledger, invocation.invocationId, "invalidOption");
  }
  if (ledger.claimedEffects.includes(issued.candidate.effectKey)) {
    return reject(ledger, invocation.invocationId, "alreadyResolving");
  }

  const result: IntentResult = {
    status: "accepted",
    kind: issued.candidate.kind,
    effectKey: issued.candidate.effectKey,
  };
  return {
    ledger: {
      invocationResults: {
        ...ledger.invocationResults,
        [invocation.invocationId]: result,
      },
      claimedEffects: [...ledger.claimedEffects, issued.candidate.effectKey],
    },
    result,
    shouldDispatch: true,
  };
}

export function releaseEffect(
  ledger: InvocationLedger,
  effectKey: string,
): InvocationLedger {
  return {
    ...ledger,
    claimedEffects: ledger.claimedEffects.filter((key) => key !== effectKey),
  };
}

export function advanceInvocation(
  ledger: InvocationLedger,
  invocationId: string,
  status: "pending" | "completed" | "failed" | "uncertain",
): InvocationLedger {
  const current = ledger.invocationResults[invocationId];
  if (!current?.effectKey) return ledger;
  if (current.status === "completed" || current.status === "failed") {
    return ledger;
  }
  const result: IntentResult = { ...current, status };
  const terminal = status === "completed" || status === "failed";
  return {
    invocationResults: {
      ...ledger.invocationResults,
      [invocationId]: result,
    },
    claimedEffects: terminal
      ? ledger.claimedEffects.filter((key) => key !== current.effectKey)
      : ledger.claimedEffects,
  };
}

export function markClaimedEffectsUncertain(
  ledger: InvocationLedger,
): InvocationLedger {
  return {
    ...ledger,
    invocationResults: Object.fromEntries(
      Object.entries(ledger.invocationResults).map(([invocationId, result]) => [
        invocationId,
        result.effectKey && ledger.claimedEffects.includes(result.effectKey)
          ? { ...result, status: "uncertain" as const }
          : result,
      ]),
    ),
  };
}

function issueOffers(
  state: CoreState,
  session: SessionState,
): readonly { readonly candidate: OfferCandidate; readonly token: string }[] {
  const candidates = candidatesFor(state, session);
  return candidates.map((candidate, index) => ({
    candidate,
    token: `offer:${state.connectionEpoch}:${state.revision}:${session.id}:${index}`,
  }));
}

function candidatesFor(
  state: CoreState,
  session: SessionState,
): readonly OfferCandidate[] {
  const baseReason = liveReason(state, session);
  const request = session.pendingRequests[0];
  const result = session.resultLatch;
  const runId = session.run.activeRunId ?? "none";
  const requestId = request?.id ?? "none";
  const resultId = result?.runId ?? "none";
  const settingTarget = `${session.id}:${session.nextTurnSettings.revision}`;

  return [
    candidate(
      "ResumeSession",
      session.id,
      `${state.connectionEpoch}:${session.id}:resume`,
      { confirmation: "release", inspection: "target" },
      session.access === "resumable" && session.freshness === "historical"
        ? state.integration.phase === "ready"
          ? undefined
          : "integrationUnavailable"
        : "historicalOnly",
    ),
    candidate(
      "Inspect",
      requestId !== "none" ? requestId : resultId,
      `${session.id}:inspect`,
      { confirmation: "release", inspection: "target" },
      request || result ? undefined : "unsupported",
    ),
    candidate(
      "AcknowledgeResult",
      resultId,
      `${resultId}:acknowledge`,
      { confirmation: "release", inspection: "target" },
      result && !result.acknowledged ? undefined : "unsupported",
    ),
    requestDecisionCandidate(
      state,
      session,
      request,
      "ApproveRequest",
      "accept",
      "complete",
      "reviewHold",
      baseReason,
    ),
    requestDecisionCandidate(
      state,
      session,
      request,
      "RejectRequest",
      "decline",
      "target",
      "reviewPress",
      baseReason,
    ),
    requestDecisionCandidate(
      state,
      session,
      request,
      "CancelRequest",
      "cancel",
      "target",
      "reviewHold",
      baseReason,
    ),
    candidate(
      "CancelRun",
      runId,
      `${state.connectionEpoch}:${runId}:cancel`,
      { confirmation: "reviewHold", inspection: "target" },
      baseReason ?? (session.run.activeRunId ? undefined : "noActiveRun"),
    ),
    candidate(
      "RetryWork",
      resultId,
      `${resultId}:retry`,
      { confirmation: "reviewPress", inspection: "complete" },
      baseReason ??
        (result?.outcome === "failed" &&
        result.retryable &&
        !session.run.automaticRetry &&
        session.run.phase === "idle"
          ? undefined
          : "unsupported"),
    ),
    candidate(
      "ChangeNextTurnOptions",
      settingTarget,
      `${settingTarget}:reasoning`,
      { confirmation: "choiceCommit", inspection: "complete" },
      baseReason ??
        (session.run.phase === "idle" ? undefined : "notAtTurnBoundary"),
      session.nextTurnSettings.reasoningOptions,
    ),
  ];
}

function requestDecisionCandidate(
  state: CoreState,
  session: SessionState,
  request: HumanRequest | undefined,
  kind: "ApproveRequest" | "RejectRequest" | "CancelRequest",
  decision: "accept" | "decline" | "cancel",
  inspection: InspectionLevel,
  confirmation: "reviewPress" | "reviewHold",
  baseReason: DisabledReason | undefined,
): OfferCandidate {
  let reason = baseReason;
  if (!reason && !request) reason = "noPendingRequest";
  if (!reason && request) {
    if (session.run.activeRunId !== request.runId) reason = "noActiveRun";
    if (request.kind !== "approval") reason = "unsupported";
    if (!reason && !inspectionSatisfies(request.inspection, inspection)) {
      reason = "requestNotInspectable";
    }
    if (!reason && !request.advertisedDecisions.includes(decision)) {
      reason = "decisionNotAdvertised";
    }
  }
  const requestId = request?.id ?? "none";
  return candidate(
    kind,
    requestId,
    `${state.connectionEpoch}:${requestId}:decision`,
    { confirmation, inspection },
    reason,
  );
}

function liveReason(
  state: CoreState,
  session: SessionState,
): DisabledReason | undefined {
  if (state.integration.phase === "reconciling") return "reconciling";
  if (state.integration.phase !== "ready") return "integrationUnavailable";
  if (state.selectedSessionId !== session.id) return "noSelectedSession";
  if (session.access !== "owned") return "notOwned";
  if (session.freshness !== "current") return "stale";
  return undefined;
}

function inspectionSatisfies(
  actual: InspectionLevel,
  required: InspectionLevel,
): boolean {
  const rank = { none: 0, target: 1, complete: 2 };
  return rank[actual] >= rank[required];
}

function candidate(
  kind: ActionKind,
  target: string,
  effectKey: string,
  safety: SafetyPlan,
  reason?: DisabledReason,
  optionIds?: readonly string[],
): OfferCandidate {
  return {
    kind,
    target,
    effectKey,
    safety,
    ...(reason ? { reason } : {}),
    ...(optionIds ? { optionIds } : {}),
  };
}

function publicOffer(
  candidate: OfferCandidate,
  token: string,
  effectClaimed: boolean,
): ActionOffer {
  const reason =
    candidate.reason ?? (effectClaimed ? "alreadyResolving" : undefined);
  return {
    kind: candidate.kind,
    state: reason ? "disabled" : "available",
    ...(reason ? { reason } : { offerToken: token }),
    ...(candidate.optionIds ? { optionIds: candidate.optionIds } : {}),
    safety: candidate.safety,
  };
}

function reject(
  ledger: InvocationLedger,
  invocationId: string,
  reason: "staleOffer" | "invalidOption" | "alreadyResolving",
): DispatchDecision {
  const result: IntentResult = { status: "rejected", reason };
  return {
    ledger: {
      ...ledger,
      invocationResults: {
        ...ledger.invocationResults,
        [invocationId]: result,
      },
    },
    result,
    shouldDispatch: false,
  };
}
