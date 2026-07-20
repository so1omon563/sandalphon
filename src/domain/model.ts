export type IntegrationPhase =
  "starting" | "ready" | "reconciling" | "unavailable";

export type IntegrationReason =
  | "missingBinary"
  | "unsupportedVersion"
  | "unauthenticated"
  | "protocolError"
  | "disconnected"
  | "ownershipConflict"
  | "other";

export type SessionAccess = "owned" | "resumable" | "external" | "unknown";
export type Freshness = "current" | "historical" | "reconciling" | "stale";
export type RunPhase = "idle" | "active" | "waiting";
export type Steerability = "steerable" | "review" | "compact" | "unknown";
export type WaitKind = "approval" | "userInput";
export type Activity =
  | "thinking"
  | "planning"
  | "communicating"
  | "runningCommand"
  | "changingFiles"
  | "usingTool"
  | "searchingWeb"
  | "reviewing"
  | "compacting"
  | "retrying"
  | "other"
  | "none";
export type ResultOutcome = "completed" | "failed" | "interrupted";
export type AttentionReason =
  | "approval"
  | "userInput"
  | "failure"
  | "completion"
  | "recovery"
  | "authentication";
export type RequestDecision = "accept" | "decline" | "cancel";
export type InspectionLevel = "none" | "target" | "complete";

export interface IntegrationState {
  readonly phase: IntegrationPhase;
  readonly reason?: IntegrationReason;
}

export interface RunState {
  readonly phase: RunPhase;
  readonly activeRunId?: string;
  readonly steerability: Steerability;
  readonly waitKinds: readonly WaitKind[];
  readonly automaticRetry: boolean;
}

export interface HumanRequest {
  readonly id: string;
  readonly runId: string;
  readonly kind: WaitKind;
  readonly inspection: InspectionLevel;
  readonly advertisedDecisions: readonly RequestDecision[];
}

export interface ResultLatch {
  readonly runId: string;
  readonly outcome: ResultOutcome;
  readonly acknowledged: boolean;
  readonly retryable: boolean;
}

export interface NextTurnSettings {
  readonly revision: number;
  readonly reasoningEffort: string;
  readonly reasoningOptions: readonly string[];
}

export interface SessionState {
  readonly id: string;
  readonly name: string;
  readonly access: SessionAccess;
  readonly freshness: Freshness;
  readonly run: RunState;
  readonly activity: Activity;
  readonly pendingRequests: readonly HumanRequest[];
  readonly resultLatch?: ResultLatch;
  readonly attention: readonly AttentionReason[];
  readonly nextTurnSettings: NextTurnSettings;
}

export interface CoreState {
  readonly revision: number;
  readonly connectionEpoch: number;
  readonly integration: IntegrationState;
  readonly selectedSessionId?: string;
  readonly sessions: readonly SessionState[];
}

export type ActionKind =
  | "ResumeSession"
  | "Inspect"
  | "ReviewChanges"
  | "CompactThread"
  | "AcknowledgeResult"
  | "ApproveRequest"
  | "RejectRequest"
  | "CancelRequest"
  | "CancelRun"
  | "RetryWork"
  | "ChangeNextTurnOptions";

export type DisabledReason =
  | "integrationUnavailable"
  | "reconciling"
  | "notOwned"
  | "historicalOnly"
  | "stale"
  | "noSelectedSession"
  | "noActiveRun"
  | "noPendingRequest"
  | "requestNotInspectable"
  | "decisionNotAdvertised"
  | "notAtTurnBoundary"
  | "busy"
  | "alreadyResolving"
  | "unsupported";

export type ConfirmationType =
  "release" | "choiceCommit" | "reviewPress" | "reviewHold";

export interface SafetyPlan {
  readonly confirmation: ConfirmationType;
  readonly inspection: InspectionLevel;
}

export interface ActionOffer {
  readonly kind: ActionKind;
  readonly state: "available" | "disabled";
  readonly reason?: DisabledReason;
  readonly offerToken?: string;
  readonly optionIds?: readonly string[];
  readonly safety: SafetyPlan;
}

export type PrimaryState =
  "unavailable" | "waiting" | "working" | "failed" | "completed" | "idle";

export interface SessionSnapshot extends SessionState {
  readonly primaryState: PrimaryState;
  readonly actionOffers: readonly ActionOffer[];
  readonly selectionToken?: string;
}

export interface SandalphonSnapshot {
  readonly revision: number;
  readonly connectionEpoch: number;
  readonly integration: IntegrationState;
  readonly selectedSessionId?: string;
  readonly sessions: readonly SessionSnapshot[];
}
