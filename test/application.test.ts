import { describe, expect, it, vi } from "vitest";

import { SandalphonApplication, decodeThreadList } from "../src/application.js";
import type {
  CodexConnection,
  CodexRuntime,
  CodexServerMessage,
} from "../src/codex/appServer.js";
import type { BinarySelection } from "../src/codex/configuration.js";
import type { RequestId } from "../src/codex/jsonRpc.js";

const THREADS = {
  data: [
    {
      id: "thread-1",
      preview: "private prompt not used for presentation",
      name: "Sandalphon work",
      cwd: "/work/sandalphon",
      updatedAt: 10,
      recencyAt: 11,
      status: { type: "notLoaded" },
    },
    {
      id: "thread-2",
      preview: "another private prompt",
      name: null,
      cwd: "/work/other",
      updatedAt: 9,
      recencyAt: null,
      status: { type: "idle" },
    },
  ],
  nextCursor: null,
};

class MemorySettings {
  readonly write = vi.fn((settings: object) => {
    this.value = settings;
    return Promise.resolve();
  });

  constructor(public value: unknown = {}) {}

  read(): Promise<unknown> {
    return Promise.resolve(this.value);
  }
}

class FakeConnection implements CodexConnection {
  readonly requests: { method: string; params: unknown }[] = [];
  readonly responses: { id: RequestId; result: unknown }[] = [];
  readonly #messageListeners = new Set<(message: CodexServerMessage) => void>();
  readonly #closeListeners = new Set<() => void>();
  readonly results = new Map<string, unknown>([["thread/list", THREADS]]);

  request<T>(method: string, params: unknown): Promise<T> {
    this.requests.push({ method, params });
    const result = this.results.get(method);
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result as T);
  }

  notify(): void {}

  respond(id: RequestId, result: unknown): void {
    this.responses.push({ id, result });
  }

  onMessage(listener: (message: CodexServerMessage) => void): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  emit(message: CodexServerMessage): void {
    for (const listener of this.#messageListeners) listener(message);
  }

  close(): void {
    for (const listener of this.#closeListeners) listener();
  }
}

class FakeRuntime implements CodexRuntime {
  readonly connection = new FakeConnection();
  selection: BinarySelection = {
    status: "ready",
    path: "/opt/homebrew/bin/codex",
    version: "0.144.1",
  };
  connectError?: Error;

  selectBinary(): Promise<BinarySelection> {
    return Promise.resolve(this.selection);
  }

  connect(): Promise<CodexConnection> {
    return this.connectError
      ? Promise.reject(this.connectError)
      : Promise.resolve(this.connection);
  }
}

function availableOffer(
  application: SandalphonApplication,
  kind: string,
): string {
  const session = application.snapshot.sessions.find(
    ({ id }) => id === application.snapshot.selectedSessionId,
  );
  const offer = session?.actionOffers.find(
    (candidate) => candidate.kind === kind && candidate.state === "available",
  );
  if (!offer?.offerToken) throw new Error(`Missing offer: ${kind}`);
  return offer.offerToken;
}

async function startedApplication(): Promise<{
  application: SandalphonApplication;
  connection: FakeConnection;
  settings: MemorySettings;
}> {
  const runtime = new FakeRuntime();
  const settings = new MemorySettings();
  const application = new SandalphonApplication(settings, runtime);
  await application.start();
  return { application, connection: runtime.connection, settings };
}

describe("Sandalphon application", () => {
  it("loads historical threads without claiming live ownership", async () => {
    const { application, settings } = await startedApplication();
    expect(application.snapshot.integration.phase).toBe("ready");
    expect(application.snapshot.selectedSessionId).toBe("thread-1");
    expect(application.snapshot.sessions).toMatchObject([
      {
        id: "thread-1",
        name: "Sandalphon work",
        access: "resumable",
        freshness: "historical",
      },
      {
        id: "thread-2",
        name: "other",
        access: "resumable",
        freshness: "historical",
      },
    ]);
    expect(settings.write).toHaveBeenCalledWith({
      schemaVersion: 1,
      codexBinaryPath: "/opt/homebrew/bin/codex",
    });

    await application.selectSession("thread-2");
    expect(application.snapshot.selectedSessionId).toBe("thread-2");
    expect(settings.value).toMatchObject({ selectedThreadId: "thread-2" });
    await application.selectSession("missing");
    expect(application.snapshot.selectedSessionId).toBe("thread-2");
  });

  it("resumes a thread explicitly before exposing owned live actions", async () => {
    const { application, connection } = await startedApplication();
    connection.results.set("thread/resume", { thread: THREADS.data[0] });
    const result = await application.invoke({
      invocationId: "resume-1",
      offerToken: availableOffer(application, "ResumeSession"),
    });
    expect(result.status).toBe("completed");
    expect(connection.requests).toContainEqual({
      method: "thread/resume",
      params: { threadId: "thread-1" },
    });
    expect(application.snapshot.sessions[0]).toMatchObject({
      access: "owned",
      freshness: "current",
      primaryState: "idle",
    });

    const stale = await application.invoke({
      invocationId: "resume-stale",
      offerToken: "old-offer",
    });
    expect(stale).toMatchObject({ status: "rejected", reason: "staleOffer" });
  });

  it("projects approval requests and resolves an exact consequential decision", async () => {
    const { application, connection } = await startedApplication();
    connection.results.set("thread/resume", {});
    await application.invoke({
      invocationId: "resume-1",
      offerToken: availableOffer(application, "ResumeSession"),
    });
    connection.emit({
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", status: "inProgress" },
      },
    });
    connection.emit({
      id: "approval-1",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        command: "make check",
        cwd: "/work/sandalphon",
        reason: "Run the project gate",
      },
    });
    expect(application.snapshot.sessions[0]?.primaryState).toBe("waiting");
    expect(application.reviewDetail).toMatchObject({
      requestId: "provider:approval-1",
      inspection: "complete",
    });
    expect(application.reviewDetail?.text).toContain("make check");

    const pending = await application.invoke({
      invocationId: "approve-1",
      offerToken: availableOffer(application, "ApproveRequest"),
    });
    expect(pending.status).toBe("pending");
    expect(connection.responses).toEqual([
      { id: "approval-1", result: { decision: "accept" } },
    ]);
    connection.emit({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: "approval-1" },
    });
    connection.emit({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", status: "completed" },
      },
    });
    expect(application.reviewDetail).toBeUndefined();
    expect(application.snapshot.sessions[0]?.primaryState).toBe("completed");
  });

  it("maps live activity, automatic retry, reasoning choice, and interruption", async () => {
    const { application, connection } = await startedApplication();
    connection.results.set("thread/resume", {});
    connection.results.set("turn/interrupt", {});
    await application.invoke({
      invocationId: "resume-1",
      offerToken: availableOffer(application, "ResumeSession"),
    });
    const reasoning = application.snapshot.sessions[0]?.actionOffers.find(
      ({ kind }) => kind === "ChangeNextTurnOptions",
    );
    await application.invoke({
      invocationId: "reasoning-1",
      offerToken: reasoning?.offerToken ?? "",
      optionId: "high",
    });
    expect(
      application.snapshot.sessions[0]?.nextTurnSettings.reasoningEffort,
    ).toBe("high");

    connection.emit({
      method: "turn/started",
      params: { threadId: "thread-1", turn: { id: "turn-2" } },
    });
    connection.emit({
      method: "item/started",
      params: {
        threadId: "thread-1",
        item: { id: "item-2", type: "fileChange" },
      },
    });
    expect(application.snapshot.sessions[0]?.activity).toBe("changingFiles");
    connection.emit({
      method: "error",
      params: { threadId: "thread-1", turnId: "turn-2", willRetry: true },
    });
    expect(application.snapshot.sessions[0]?.activity).toBe("retrying");

    const cancel = await application.invoke({
      invocationId: "cancel-1",
      offerToken: availableOffer(application, "CancelRun"),
    });
    expect(cancel.status).toBe("pending");
    connection.emit({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-2", status: "interrupted" },
      },
    });
    expect(application.snapshot.sessions[0]?.primaryState).toBe("idle");
  });

  it("fails closed for settings, binary, auth, protocol, and disconnect errors", async () => {
    const futureRuntime = new FakeRuntime();
    const futureSettings = new MemorySettings({ schemaVersion: 2 });
    const future = new SandalphonApplication(futureSettings, futureRuntime);
    await future.start();
    expect(future.snapshot.integration).toEqual({
      phase: "unavailable",
      reason: "other",
    });
    expect(futureSettings.write).not.toHaveBeenCalled();

    const missingRuntime = new FakeRuntime();
    missingRuntime.selection = {
      status: "unavailable",
      reason: "missingBinary",
    };
    const missing = new SandalphonApplication(
      new MemorySettings(),
      missingRuntime,
    );
    await missing.start();
    expect(missing.snapshot.integration.reason).toBe("missingBinary");

    const authRuntime = new FakeRuntime();
    authRuntime.connectError = new Error("codexUnauthenticated");
    const auth = new SandalphonApplication(new MemorySettings(), authRuntime);
    await auth.start();
    expect(auth.snapshot.integration.reason).toBe("unauthenticated");

    const protocolRuntime = new FakeRuntime();
    protocolRuntime.connection.results.set("thread/list", { data: "bad" });
    const protocol = new SandalphonApplication(
      new MemorySettings(),
      protocolRuntime,
    );
    await protocol.start();
    expect(protocol.snapshot.integration.reason).toBe("protocolError");

    const active = await startedApplication();
    active.connection.close();
    expect(active.application.snapshot.integration).toEqual({
      phase: "reconciling",
      reason: "disconnected",
    });
  });
});

describe("Codex thread decoding", () => {
  it("accepts bounded known thread statuses", () => {
    expect(
      decodeThreadList({
        data: [
          ...THREADS.data,
          {
            ...THREADS.data[0],
            id: "active",
            status: { type: "active", activeFlags: ["waitingOnApproval"] },
          },
          {
            ...THREADS.data[0],
            id: "failed",
            status: { type: "systemError" },
          },
        ],
        nextCursor: "cursor",
      }).data,
    ).toHaveLength(4);
  });

  it("rejects malformed provider values", () => {
    const invalid = [
      undefined,
      { data: [], nextCursor: 1 },
      { data: [{}], nextCursor: null },
      {
        data: [{ ...THREADS.data[0], status: { type: "future" } }],
        nextCursor: null,
      },
      {
        data: [
          {
            ...THREADS.data[0],
            status: { type: "active", activeFlags: ["future"] },
          },
        ],
        nextCursor: null,
      },
    ];
    for (const value of invalid) {
      expect(() => decodeThreadList(value)).toThrow("invalidThreadList");
    }
  });
});
