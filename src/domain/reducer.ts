import type {
  Activity,
  AttentionReason,
  CoreState,
  Freshness,
  HumanRequest,
  IntegrationReason,
  ResultOutcome,
  SessionState,
} from "./model.js";

const idleRun = Object.freeze({
  phase: "idle" as const,
  steerability: "unknown" as const,
  waitKinds: Object.freeze([]),
  automaticRetry: false,
});

export type CoreEvent =
  | { readonly type: "connectionReady"; readonly connectionEpoch: number }
  | {
      readonly type: "connectionUnavailable";
      readonly reason: IntegrationReason;
    }
  | { readonly type: "disconnect" }
  | { readonly type: "observeSession"; readonly session: SessionState }
  | { readonly type: "selectSession"; readonly sessionId: string }
  | ProviderSessionEvent;

type ProviderSessionEvent =
  | {
      readonly type: "runStarted";
      readonly connectionEpoch: number;
      readonly sessionId: string;
      readonly runId: string;
      readonly steerability: "steerable" | "review" | "compact" | "unknown";
    }
  | {
      readonly type: "activityChanged";
      readonly connectionEpoch: number;
      readonly sessionId: string;
      readonly activity: Activity;
    }
  | {
      readonly type: "requestOpened";
      readonly connectionEpoch: number;
      readonly sessionId: string;
      readonly request: HumanRequest;
    }
  | {
      readonly type: "requestResolved";
      readonly connectionEpoch: number;
      readonly sessionId: string;
      readonly requestId: string;
    }
  | {
      readonly type: "automaticRetry";
      readonly connectionEpoch: number;
      readonly sessionId: string;
    }
  | {
      readonly type: "runCompleted";
      readonly connectionEpoch: number;
      readonly sessionId: string;
      readonly runId: string;
      readonly outcome: ResultOutcome;
      readonly retryable: boolean;
    }
  | {
      readonly type: "inspectResult" | "acknowledgeResult";
      readonly connectionEpoch: number;
      readonly sessionId: string;
      readonly runId: string;
    }
  | {
      readonly type: "markStale";
      readonly connectionEpoch: number;
      readonly sessionId: string;
    };

export function createCoreState(): CoreState {
  return {
    revision: 0,
    connectionEpoch: 0,
    integration: { phase: "starting" },
    sessions: [],
  };
}

export function createSession(
  id: string,
  name: string,
  access: SessionState["access"] = "owned",
  freshness: Freshness = "current",
): SessionState {
  return {
    id,
    name,
    access,
    freshness,
    run: idleRun,
    activity: "none",
    pendingRequests: [],
    attention: [],
    nextTurnSettings: {
      revision: 0,
      reasoningEffort: "medium",
      reasoningOptions: ["low", "medium", "high"],
    },
  };
}

export function reduceCore(state: CoreState, event: CoreEvent): CoreState {
  if ("connectionEpoch" in event && event.type !== "connectionReady") {
    if (event.connectionEpoch !== state.connectionEpoch) return state;
  }

  switch (event.type) {
    case "connectionReady":
      return revise(state, {
        ...state,
        connectionEpoch: event.connectionEpoch,
        integration: { phase: "ready" },
        sessions: state.sessions.map((session) => ({
          ...session,
          freshness: "reconciling" as const,
        })),
      });
    case "connectionUnavailable":
      return revise(state, {
        ...state,
        integration: { phase: "unavailable", reason: event.reason },
      });
    case "disconnect":
      return revise(state, {
        ...state,
        integration: { phase: "reconciling", reason: "disconnected" },
        sessions: state.sessions.map((session) => ({
          ...session,
          freshness: "reconciling" as const,
          attention: addAttention(session.attention, "recovery"),
        })),
      });
    case "observeSession": {
      const exists = state.sessions.some(({ id }) => id === event.session.id);
      return revise(state, {
        ...state,
        sessions: exists
          ? state.sessions.map((session) =>
              session.id === event.session.id ? event.session : session,
            )
          : [...state.sessions, event.session],
      });
    }
    case "selectSession":
      if (!state.sessions.some(({ id }) => id === event.sessionId))
        return state;
      return revise(state, { ...state, selectedSessionId: event.sessionId });
    default:
      return reduceSessionEvent(state, event);
  }
}

function reduceSessionEvent(
  state: CoreState,
  event: ProviderSessionEvent,
): CoreState {
  const session = state.sessions.find(({ id }) => id === event.sessionId);
  if (!session) return state;

  let next = session;
  switch (event.type) {
    case "runStarted":
      next = {
        ...session,
        run: {
          phase: "active",
          activeRunId: event.runId,
          steerability: event.steerability,
          waitKinds: [],
          automaticRetry: false,
        },
        activity: "thinking",
        pendingRequests: [],
        attention: session.attention.filter(
          (reason) => reason !== "failure" && reason !== "completion",
        ),
        ...(session.resultLatch
          ? { resultLatch: { ...session.resultLatch, acknowledged: true } }
          : {}),
      };
      break;
    case "activityChanged":
      next = { ...session, activity: event.activity };
      break;
    case "requestOpened": {
      const pendingRequests = [
        ...session.pendingRequests.filter(({ id }) => id !== event.request.id),
        event.request,
      ];
      next = {
        ...session,
        run: {
          ...session.run,
          phase: "waiting",
          waitKinds: unique(pendingRequests.map(({ kind }) => kind)),
        },
        pendingRequests,
        attention: addAttention(session.attention, event.request.kind),
      };
      break;
    }
    case "requestResolved": {
      const pendingRequests = session.pendingRequests.filter(
        ({ id }) => id !== event.requestId,
      );
      const waitKinds = unique(pendingRequests.map(({ kind }) => kind));
      next = {
        ...session,
        run: {
          ...session.run,
          phase: pendingRequests.length > 0 ? "waiting" : "active",
          waitKinds,
        },
        pendingRequests,
        attention: session.attention.filter(
          (reason) =>
            !(
              (reason === "approval" && !waitKinds.includes("approval")) ||
              (reason === "userInput" && !waitKinds.includes("userInput"))
            ),
        ),
      };
      break;
    }
    case "automaticRetry":
      next = {
        ...session,
        activity: "retrying",
        run: { ...session.run, phase: "active", automaticRetry: true },
      };
      break;
    case "runCompleted": {
      if (session.run.activeRunId !== event.runId) return state;
      const attention = session.attention.filter(
        (reason) => reason !== "approval" && reason !== "userInput",
      );
      next = {
        ...session,
        run: idleRun,
        activity: "none",
        pendingRequests: [],
        resultLatch: {
          runId: event.runId,
          outcome: event.outcome,
          acknowledged: event.outcome === "interrupted",
          retryable: event.retryable,
        },
        attention:
          event.outcome === "failed"
            ? addAttention(attention, "failure")
            : event.outcome === "completed"
              ? addAttention(attention, "completion")
              : attention,
      };
      break;
    }
    case "inspectResult":
    case "acknowledgeResult":
      if (!session.resultLatch || session.resultLatch.runId !== event.runId) {
        return state;
      }
      next = {
        ...session,
        resultLatch: { ...session.resultLatch, acknowledged: true },
        attention: session.attention.filter(
          (reason) => reason !== "failure" && reason !== "completion",
        ),
      };
      break;
    case "markStale":
      next = { ...session, freshness: "stale" };
      break;
  }

  return revise(state, {
    ...state,
    sessions: state.sessions.map((candidate) =>
      candidate.id === next.id ? next : candidate,
    ),
  });
}

function revise(state: CoreState, next: CoreState): CoreState {
  return { ...next, revision: state.revision + 1 };
}

function addAttention(
  current: readonly AttentionReason[],
  reason: AttentionReason,
): readonly AttentionReason[] {
  return current.includes(reason) ? current : [...current, reason];
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
