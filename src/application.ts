import { basename } from "node:path";

import {
  type CodexConnection,
  type CodexRuntime,
  type CodexServerMessage,
  type CodexThreadList,
  type CodexThreadSummary,
  LocalCodexRuntime,
} from "./codex/appServer.js";
import {
  parseSettings,
  SANDALPHON_SETTINGS_SCHEMA_VERSION,
  type SandalphonSettings,
} from "./codex/configuration.js";
import type { RequestId } from "./codex/jsonRpc.js";
import {
  advanceInvocation,
  createInvocationLedger,
  dispatchOffer,
  markClaimedEffectsUncertain,
  toSnapshot,
  type IntentResult,
  type InvocationLedger,
  type OfferInvocation,
} from "./domain/offers.js";
import {
  createCoreState,
  createSession,
  reduceCore,
} from "./domain/reducer.js";
import type {
  Activity,
  CoreState,
  InspectionLevel,
  SandalphonSnapshot,
} from "./domain/model.js";
import { paginateStreamDeckPlusDetail } from "./streamDeckPlus.js";

export interface SettingsStore {
  read(): Promise<unknown>;
  write(settings: SandalphonSettings): Promise<void>;
}

export interface ReviewDetail {
  readonly requestId: string;
  readonly text: string;
  readonly inspection: InspectionLevel;
}

export interface SurfaceApplicationBoundary {
  readonly snapshot: SandalphonSnapshot;
  readonly reviewDetail: ReviewDetail | undefined;
  onSnapshot(listener: (snapshot: SandalphonSnapshot) => void): () => void;
  selectSession(sessionId: string): Promise<void>;
  invoke(invocation: OfferInvocation): Promise<IntentResult>;
}

interface PendingProviderRequest {
  readonly rpcId: RequestId;
  readonly requestId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly text: string;
}

export class SandalphonApplication {
  readonly #runtime: CodexRuntime;
  readonly #settingsStore: SettingsStore;
  readonly #listeners = new Set<(snapshot: SandalphonSnapshot) => void>();
  readonly #providerRequests = new Map<RequestId, PendingProviderRequest>();
  readonly #resolvingRequests = new Map<RequestId, string>();
  readonly #interruptions = new Map<string, string>();
  #settings: SandalphonSettings = {
    schemaVersion: SANDALPHON_SETTINGS_SCHEMA_VERSION,
  };
  #state: CoreState = createCoreState();
  #ledger: InvocationLedger = createInvocationLedger();
  #connection: CodexConnection | undefined;

  constructor(
    settingsStore: SettingsStore,
    runtime: CodexRuntime = new LocalCodexRuntime(),
  ) {
    this.#settingsStore = settingsStore;
    this.#runtime = runtime;
  }

  get snapshot(): SandalphonSnapshot {
    return toSnapshot(this.#state, this.#ledger.claimedEffects);
  }

  get reviewDetail(): ReviewDetail | undefined {
    const session = this.#state.sessions.find(
      ({ id }) => id === this.#state.selectedSessionId,
    );
    const request = session?.pendingRequests[0];
    if (!request) return undefined;
    const provider = [...this.#providerRequests.values()].find(
      ({ requestId }) => requestId === request.id,
    );
    return provider
      ? {
          requestId: provider.requestId,
          text: provider.text,
          inspection: request.inspection,
        }
      : undefined;
  }

  onSnapshot(listener: (snapshot: SandalphonSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    const parsed = parseSettings(await this.#settingsStore.read());
    if (parsed.status === "future" || parsed.status === "invalid") {
      this.#unavailable("other");
      return;
    }
    this.#settings = parsed.settings;
    const selection = await this.#runtime.selectBinary(
      this.#settings.codexBinaryPath,
    );
    if (selection.status === "unavailable") {
      this.#unavailable(selection.reason);
      return;
    }
    if (this.#settings.codexBinaryPath !== selection.path) {
      await this.#persist({
        ...this.#settings,
        codexBinaryPath: selection.path,
      });
    }

    try {
      const connection = await this.#runtime.connect(selection.path);
      this.#connection = connection;
      connection.onMessage((message) => this.#receive(message));
      connection.onClose(() => this.#disconnect());
      const connectionEpoch = this.#state.connectionEpoch + 1;
      this.#state = reduceCore(this.#state, {
        type: "connectionReady",
        connectionEpoch,
      });
      const response = await connection.request<unknown>("thread/list", {
        limit: 50,
        sortKey: "updated_at",
        sortDirection: "desc",
        archived: false,
        useStateDbOnly: true,
      });
      const threads = decodeThreadList(response);
      for (const thread of threads.data) this.#observeHistorical(thread);
      const selected =
        threads.data.find(({ id }) => id === this.#settings.selectedThreadId) ??
        threads.data[0];
      if (selected) {
        this.#state = reduceCore(this.#state, {
          type: "selectSession",
          sessionId: selected.id,
        });
      }
      this.#emit();
    } catch (error) {
      this.#connection?.close();
      this.#connection = undefined;
      this.#unavailable(
        error instanceof Error && error.message === "codexUnauthenticated"
          ? "unauthenticated"
          : "protocolError",
      );
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    const next = reduceCore(this.#state, { type: "selectSession", sessionId });
    if (next === this.#state) return;
    this.#state = next;
    await this.#persist({ ...this.#settings, selectedThreadId: sessionId });
    this.#emit();
  }

  async invoke(invocation: OfferInvocation): Promise<IntentResult> {
    const decision = dispatchOffer(this.#state, this.#ledger, invocation);
    this.#ledger = decision.ledger;
    this.#emit();
    if (!decision.shouldDispatch || !decision.result.kind) {
      return decision.result;
    }
    try {
      await this.#dispatch(invocation, decision.result.kind);
      const current = this.#ledger.invocationResults[invocation.invocationId];
      return current ?? decision.result;
    } catch {
      this.#ledger = advanceInvocation(
        this.#ledger,
        invocation.invocationId,
        "failed",
      );
      this.#emit();
      return (
        this.#ledger.invocationResults[invocation.invocationId] ?? {
          status: "failed",
        }
      );
    }
  }

  close(): void {
    this.#connection?.close();
    this.#connection = undefined;
  }

  async #dispatch(
    invocation: OfferInvocation,
    kind: NonNullable<IntentResult["kind"]>,
  ): Promise<void> {
    const connection = this.#connection;
    const selected = this.#state.sessions.find(
      ({ id }) => id === this.#state.selectedSessionId,
    );
    if (!connection || !selected) throw new Error("integrationUnavailable");

    if (kind === "ResumeSession") {
      await connection.request("thread/resume", { threadId: selected.id });
      const owned = {
        ...selected,
        access: "owned" as const,
        freshness: "current" as const,
      };
      this.#state = reduceCore(this.#state, {
        type: "observeSession",
        connectionEpoch: this.#state.connectionEpoch,
        session: owned,
      });
      this.#complete(invocation.invocationId);
      return;
    }

    if (kind === "Inspect" || kind === "AcknowledgeResult") {
      if (selected.resultLatch) {
        this.#state = reduceCore(this.#state, {
          type: kind === "Inspect" ? "inspectResult" : "acknowledgeResult",
          connectionEpoch: this.#state.connectionEpoch,
          sessionId: selected.id,
          runId: selected.resultLatch.runId,
        });
      }
      this.#complete(invocation.invocationId);
      return;
    }

    if (kind === "ChangeNextTurnOptions" && invocation.optionId) {
      this.#state = reduceCore(this.#state, {
        type: "nextTurnReasoningChanged",
        connectionEpoch: this.#state.connectionEpoch,
        sessionId: selected.id,
        reasoningEffort: invocation.optionId,
      });
      this.#complete(invocation.invocationId);
      return;
    }

    if (kind === "CancelRun" && selected.run.activeRunId) {
      await connection.request("turn/interrupt", {
        threadId: selected.id,
        turnId: selected.run.activeRunId,
      });
      this.#interruptions.set(
        selected.run.activeRunId,
        invocation.invocationId,
      );
      this.#pending(invocation.invocationId);
      return;
    }

    if (
      kind === "ApproveRequest" ||
      kind === "RejectRequest" ||
      kind === "CancelRequest"
    ) {
      const current = selected.pendingRequests[0];
      const provider = [...this.#providerRequests.values()].find(
        ({ requestId }) => requestId === current?.id,
      );
      if (!provider) throw new Error("requestUnavailable");
      connection.respond(provider.rpcId, {
        decision:
          kind === "ApproveRequest"
            ? "accept"
            : kind === "RejectRequest"
              ? "decline"
              : "cancel",
      });
      this.#resolvingRequests.set(provider.rpcId, invocation.invocationId);
      this.#pending(invocation.invocationId);
      return;
    }

    throw new Error("unsupportedAction");
  }

  #receive(message: CodexServerMessage): void {
    const params = asRecord(message.params);
    if (!params) return;
    if (message.method === "turn/started") {
      const threadId = stringField(params, "threadId");
      const turn = asRecord(params.turn);
      const turnId = turn && stringField(turn, "id");
      if (threadId && turnId) {
        this.#state = reduceCore(this.#state, {
          type: "runStarted",
          connectionEpoch: this.#state.connectionEpoch,
          sessionId: threadId,
          runId: turnId,
          steerability: "steerable",
        });
      }
    } else if (message.method === "turn/completed") {
      this.#receiveTurnCompleted(params);
    } else if (message.method === "item/started") {
      this.#receiveItemStarted(params);
    } else if (
      message.method === "item/commandExecution/requestApproval" ||
      message.method === "item/fileChange/requestApproval"
    ) {
      this.#receiveApproval(message, params);
    } else if (message.method === "serverRequest/resolved") {
      this.#receiveRequestResolved(params);
    } else if (message.method === "error") {
      const threadId = stringField(params, "threadId");
      if (threadId && params.willRetry === true) {
        this.#state = reduceCore(this.#state, {
          type: "automaticRetry",
          connectionEpoch: this.#state.connectionEpoch,
          sessionId: threadId,
        });
      }
    }
    this.#emit();
  }

  #receiveTurnCompleted(params: Record<string, unknown>): void {
    const threadId = stringField(params, "threadId");
    const turn = asRecord(params.turn);
    const turnId = turn && stringField(turn, "id");
    const status = turn && stringField(turn, "status");
    if (!threadId || !turnId || !status) return;
    const outcome =
      status === "completed"
        ? "completed"
        : status === "interrupted"
          ? "interrupted"
          : "failed";
    this.#state = reduceCore(this.#state, {
      type: "runCompleted",
      connectionEpoch: this.#state.connectionEpoch,
      sessionId: threadId,
      runId: turnId,
      outcome,
      retryable: false,
    });
    const invocationId = this.#interruptions.get(turnId);
    if (invocationId) {
      this.#complete(invocationId);
      this.#interruptions.delete(turnId);
    }
  }

  #receiveItemStarted(params: Record<string, unknown>): void {
    const threadId = stringField(params, "threadId");
    const item = asRecord(params.item);
    const itemType = item && stringField(item, "type");
    if (!threadId || !itemType) return;
    this.#state = reduceCore(this.#state, {
      type: "activityChanged",
      connectionEpoch: this.#state.connectionEpoch,
      sessionId: threadId,
      activity: activityForItem(itemType),
    });
  }

  #receiveApproval(
    message: CodexServerMessage,
    params: Record<string, unknown>,
  ): void {
    if (message.id === undefined) return;
    const threadId = stringField(params, "threadId");
    const turnId = stringField(params, "turnId");
    const itemId = stringField(params, "itemId");
    if (!threadId || !turnId || !itemId) return;
    const text = approvalDetail(message.method, params);
    const pagination = paginateStreamDeckPlusDetail(text);
    const inspection: InspectionLevel = pagination.available
      ? "complete"
      : "target";
    const requestId = `provider:${String(message.id)}`;
    this.#providerRequests.set(message.id, {
      rpcId: message.id,
      requestId,
      threadId,
      turnId,
      text,
    });
    this.#state = reduceCore(this.#state, {
      type: "requestOpened",
      connectionEpoch: this.#state.connectionEpoch,
      sessionId: threadId,
      request: {
        id: requestId,
        runId: turnId,
        kind: "approval",
        inspection,
        advertisedDecisions: ["accept", "decline", "cancel"],
      },
    });
  }

  #receiveRequestResolved(params: Record<string, unknown>): void {
    const threadId = stringField(params, "threadId");
    const rpcId = requestIdField(params, "requestId");
    if (!threadId || rpcId === undefined) return;
    const request = this.#providerRequests.get(rpcId);
    if (!request) return;
    this.#state = reduceCore(this.#state, {
      type: "requestResolved",
      connectionEpoch: this.#state.connectionEpoch,
      sessionId: threadId,
      requestId: request.requestId,
    });
    const invocationId = this.#resolvingRequests.get(rpcId);
    if (invocationId) this.#complete(invocationId);
    this.#resolvingRequests.delete(rpcId);
    this.#providerRequests.delete(rpcId);
  }

  #observeHistorical(thread: CodexThreadSummary): void {
    this.#state = reduceCore(this.#state, {
      type: "observeSession",
      connectionEpoch: this.#state.connectionEpoch,
      session: createSession(
        thread.id,
        safeThreadName(thread),
        "resumable",
        "historical",
      ),
    });
  }

  #pending(invocationId: string): void {
    this.#ledger = advanceInvocation(this.#ledger, invocationId, "pending");
    this.#emit();
  }

  #complete(invocationId: string): void {
    this.#ledger = advanceInvocation(this.#ledger, invocationId, "completed");
    this.#emit();
  }

  #disconnect(): void {
    if (!this.#connection) return;
    this.#connection = undefined;
    this.#ledger = markClaimedEffectsUncertain(this.#ledger);
    this.#state = reduceCore(this.#state, { type: "disconnect" });
    this.#emit();
  }

  #unavailable(
    reason:
      | "missingBinary"
      | "unsupportedVersion"
      | "unauthenticated"
      | "protocolError"
      | "other",
  ): void {
    this.#state = reduceCore(this.#state, {
      type: "connectionUnavailable",
      reason,
    });
    this.#emit();
  }

  async #persist(settings: SandalphonSettings): Promise<void> {
    this.#settings = settings;
    await this.#settingsStore.write(settings);
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }
}

export function decodeThreadList(value: unknown): CodexThreadList {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.data))
    throw new Error("invalidThreadList");
  const data = record.data.map(decodeThread);
  const nextCursor = record.nextCursor;
  if (nextCursor !== null && typeof nextCursor !== "string") {
    throw new Error("invalidThreadList");
  }
  return { data, nextCursor };
}

function decodeThread(value: unknown): CodexThreadSummary {
  const record = asRecord(value);
  const status = record && asRecord(record.status);
  const statusType = status && stringField(status, "type");
  if (
    !record ||
    !status ||
    !statusType ||
    !["notLoaded", "idle", "systemError", "active"].includes(statusType)
  ) {
    throw new Error("invalidThreadList");
  }
  const id = stringField(record, "id");
  const preview = stringField(record, "preview");
  const cwd = stringField(record, "cwd");
  const updatedAt = numberField(record, "updatedAt");
  const name = record.name;
  const recencyAt = record.recencyAt;
  if (
    !id ||
    preview === undefined ||
    !cwd ||
    updatedAt === undefined ||
    (name !== null && typeof name !== "string") ||
    (recencyAt !== null && typeof recencyAt !== "number")
  ) {
    throw new Error("invalidThreadList");
  }
  if (statusType === "active") {
    const activeFlags = status.activeFlags;
    if (
      !Array.isArray(activeFlags) ||
      !activeFlags.every(
        (flag) => flag === "waitingOnApproval" || flag === "waitingOnUserInput",
      )
    ) {
      throw new Error("invalidThreadList");
    }
    return {
      id,
      preview,
      name,
      cwd,
      updatedAt,
      recencyAt,
      status: { type: "active", activeFlags },
    };
  }
  if (
    statusType === "notLoaded" ||
    statusType === "idle" ||
    statusType === "systemError"
  ) {
    return {
      id,
      preview,
      name,
      cwd,
      updatedAt,
      recencyAt,
      status: { type: statusType },
    };
  }
  throw new Error("invalidThreadList");
}

function safeThreadName(thread: CodexThreadSummary): string {
  const candidate = thread.name?.trim();
  return candidate && candidate.length > 0 ? candidate : basename(thread.cwd);
}

function approvalDetail(
  method: string,
  params: Record<string, unknown>,
): string {
  if (method === "item/commandExecution/requestApproval") {
    return [
      "Command",
      stringField(params, "command") ?? "Unavailable",
      "Working directory",
      stringField(params, "cwd") ?? "Unavailable",
      "Reason",
      stringField(params, "reason") ?? "None provided",
    ].join(" · ");
  }
  return [
    "File changes",
    stringField(params, "reason") ?? "No reason provided",
    "Requested write root",
    stringField(params, "grantRoot") ?? "Current workspace",
  ].join(" · ");
}

function activityForItem(itemType: string): Activity {
  switch (itemType) {
    case "commandExecution":
      return "runningCommand";
    case "fileChange":
      return "changingFiles";
    case "mcpToolCall":
    case "dynamicToolCall":
      return "usingTool";
    case "webSearch":
      return "searchingWeb";
    case "agentMessage":
      return "communicating";
    case "plan":
      return "planning";
    case "reasoning":
      return "thinking";
    case "contextCompaction":
      return "compacting";
    default:
      return "other";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  return typeof record[key] === "number" ? record[key] : undefined;
}

function requestIdField(
  record: Record<string, unknown>,
  key: string,
): RequestId | undefined {
  const value = record[key];
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}
