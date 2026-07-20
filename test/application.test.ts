import { describe, expect, it, vi } from "vitest";

import { SandalphonApplication, decodeThreadList } from "../src/application.js";
import type {
  CodexConnection,
  CodexRuntime,
  CodexServerMessage,
} from "../src/codex/appServer.js";
import type { BinarySelection } from "../src/codex/configuration.js";
import type { RequestId } from "../src/codex/jsonRpc.js";
import type { DesktopControlObservation } from "../src/desktopControlContract.js";
import type {
  DesktopControlConnection,
  DesktopControlRuntime,
} from "../src/desktopControlRuntime.js";

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

const DESKTOP_OBSERVATION: DesktopControlObservation = {
  connected: true,
  endpointHost: "127.0.0.1",
  epoch: 4,
  revision: 9,
  version: {
    application: "26.715.52143",
    engine: "150.0.7871.124",
    protocol: "1.3",
  },
  capabilities: ["task.list", "task.select"],
  targets: [
    { id: "thread-1", selected: true },
    { id: "thread-2", selected: false },
    { id: "desktop-only", selected: false },
  ],
};

class FakeDesktopConnection implements DesktopControlConnection {
  readonly initialObservation = DESKTOP_OBSERVATION;
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly selectTask = vi.fn((targetId: string) =>
    Promise.resolve({
      ...DESKTOP_OBSERVATION,
      revision: DESKTOP_OBSERVATION.revision + 1,
      targets: DESKTOP_OBSERVATION.targets.map((target) => ({
        ...target,
        selected: target.id === targetId,
      })),
    }),
  );
  readonly #observationListeners = new Set<
    (observation: DesktopControlObservation) => void
  >();
  readonly #closeListeners = new Set<() => void>();

  onObservation(
    listener: (observation: DesktopControlObservation) => void,
  ): () => void {
    this.#observationListeners.add(listener);
    return () => this.#observationListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  disconnect(): void {
    for (const listener of this.#closeListeners) listener();
  }
}

class FakeDesktopRuntime implements DesktopControlRuntime {
  readonly connection = new FakeDesktopConnection();
  readonly connect = vi.fn(() => Promise.resolve(this.connection));
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
      schemaVersion: 2,
      codexBinaryPath: "/opt/homebrew/bin/codex",
    });

    await application.selectSession("thread-2");
    expect(application.snapshot.selectedSessionId).toBe("thread-2");
    expect(settings.value).toMatchObject({ selectedThreadId: "thread-2" });
    await application.selectSession("missing");
    expect(application.snapshot.selectedSessionId).toBe("thread-2");
  });

  it("merges desktop authority and rejects stale task selection", async () => {
    const desktop = new FakeDesktopRuntime();
    const settings = new MemorySettings({
      schemaVersion: 2,
      desktopControl: { enabled: true },
    });
    const application = new SandalphonApplication(
      settings,
      new FakeRuntime(),
      desktop,
    );
    await application.start();

    expect(application.desktopControlStatus).toEqual({
      phase: "ready",
      taskCount: 3,
    });
    expect(application.snapshot.selectedSessionId).toBe("thread-1");
    expect(application.snapshot.sessions).toMatchObject([
      { id: "thread-1", access: "external", primaryState: "idle" },
      { id: "thread-2", access: "external", primaryState: "idle" },
      {
        id: "desktop-only",
        name: "Desktop task 3",
        access: "external",
        primaryState: "idle",
      },
    ]);
    expect(application.snapshot.sessions[0]?.actionOffers).toEqual([]);

    await application.selectSession("thread-2", "desktop:4:8:thread-2");
    expect(desktop.connection.selectTask).not.toHaveBeenCalled();
    const token = application.snapshot.sessions.find(
      ({ id }) => id === "thread-2",
    )?.selectionToken;
    await application.selectSession("thread-2", token);
    expect(desktop.connection.selectTask).toHaveBeenCalledWith("thread-2");
    expect(application.snapshot.selectedSessionId).toBe("thread-2");
  });

  it("revokes desktop-only identities and restores historical state on loss", async () => {
    const desktop = new FakeDesktopRuntime();
    const application = new SandalphonApplication(
      new MemorySettings({
        schemaVersion: 2,
        desktopControl: { enabled: true },
      }),
      new FakeRuntime(),
      desktop,
    );
    await application.start();
    desktop.connection.disconnect();
    expect(application.desktopControlStatus).toEqual({
      phase: "unavailable",
      reason: "connectionFailed",
    });
    expect(
      application.snapshot.sessions.some(({ id }) => id === "desktop-only"),
    ).toBe(false);
    expect(application.snapshot.sessions[0]).toMatchObject({
      id: "thread-1",
      access: "resumable",
      freshness: "historical",
    });
    expect(desktop.connection.close).toHaveBeenCalledTimes(1);
  });

  it("persists explicit disablement only after restoring normal Codex", async () => {
    const desktop = new FakeDesktopRuntime();
    const settings = new MemorySettings({
      schemaVersion: 2,
      desktopControl: { enabled: true },
    });
    const application = new SandalphonApplication(
      settings,
      new FakeRuntime(),
      desktop,
    );
    await application.start();
    desktop.connection.close.mockImplementationOnce(() => {
      expect(settings.value).toMatchObject({
        desktopControl: { enabled: true },
      });
      return Promise.resolve();
    });
    await application.setDesktopControlEnabled(false);
    expect(settings.value).toMatchObject({
      desktopControl: { enabled: false },
    });
    expect(desktop.connection.close).toHaveBeenCalledTimes(1);
    expect(application.desktopControlStatus).toEqual({ phase: "disabled" });
  });

  it("retains opt-in recovery state when listener cleanup fails", async () => {
    const desktop = new FakeDesktopRuntime();
    desktop.connection.close.mockRejectedValueOnce(new Error("cleanupFailed"));
    const settings = new MemorySettings({
      schemaVersion: 2,
      desktopControl: { enabled: true },
    });
    const application = new SandalphonApplication(
      settings,
      new FakeRuntime(),
      desktop,
    );
    await application.start();
    await application.setDesktopControlEnabled(false);
    expect(settings.value).toMatchObject({ desktopControl: { enabled: true } });
    expect(application.desktopControlStatus).toEqual({
      phase: "unavailable",
      reason: "cleanupFailed",
    });
  });

  it.each([
    "connectionFailed",
    "rendererTimeout",
    "capabilityUnavailable",
    "invalidTaskState",
  ] as const)(
    "clears opt-in after cleaned-up desktop startup failure %s",
    async (reason) => {
      const desktop = new FakeDesktopRuntime();
      desktop.connect.mockRejectedValueOnce(new Error(reason));
      const settings = new MemorySettings({
        schemaVersion: 2,
        desktopControl: { enabled: true },
      });
      const application = new SandalphonApplication(
        settings,
        new FakeRuntime(),
        desktop,
      );

      await application.start();

      expect(settings.value).toMatchObject({
        desktopControl: { enabled: false },
      });
      expect(application.desktopControlEnabled).toBe(false);
      expect(application.desktopControlStatus).toEqual({
        phase: "unavailable",
        reason,
      });
    },
  );

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

  it("starts official review and compaction work and follows terminal turns", async () => {
    const { application, connection } = await startedApplication();
    connection.results.set("thread/resume", {});
    await application.invoke({
      invocationId: "resume-1",
      offerToken: availableOffer(application, "ResumeSession"),
    });

    const reviewToken = availableOffer(application, "ReviewChanges");
    connection.results.set("review/start", {
      turn: { id: "review-turn" },
      reviewThreadId: "thread-1",
    });
    expect(
      await application.invoke({
        invocationId: "review-1",
        offerToken: reviewToken,
      }),
    ).toMatchObject({ status: "pending", kind: "ReviewChanges" });
    expect(connection.requests).toContainEqual({
      method: "review/start",
      params: {
        threadId: "thread-1",
        target: { type: "uncommittedChanges" },
        delivery: "inline",
      },
    });
    connection.emit({
      method: "turn/started",
      params: { threadId: "thread-1", turn: { id: "review-turn" } },
    });
    connection.emit({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "review-turn", status: "completed" },
      },
    });
    expect(
      await application.invoke({
        invocationId: "review-1",
        offerToken: reviewToken,
      }),
    ).toMatchObject({ status: "completed", kind: "ReviewChanges" });

    const compactToken = availableOffer(application, "CompactThread");
    connection.results.set("thread/compact/start", {});
    expect(
      await application.invoke({
        invocationId: "compact-1",
        offerToken: compactToken,
      }),
    ).toMatchObject({ status: "pending", kind: "CompactThread" });
    expect(connection.requests).toContainEqual({
      method: "thread/compact/start",
      params: { threadId: "thread-1" },
    });
    connection.emit({
      method: "turn/started",
      params: { threadId: "thread-1", turn: { id: "compact-turn" } },
    });
    connection.emit({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "compact-turn", status: "failed" },
      },
    });
    expect(
      await application.invoke({
        invocationId: "compact-1",
        offerToken: compactToken,
      }),
    ).toMatchObject({ status: "failed", kind: "CompactThread" });
  });

  it("releases official work authority when the provider rejects the request", async () => {
    const { application, connection } = await startedApplication();
    connection.results.set("thread/resume", {});
    await application.invoke({
      invocationId: "resume-1",
      offerToken: availableOffer(application, "ResumeSession"),
    });
    connection.results.set("review/start", new Error("review unavailable"));
    expect(
      await application.invoke({
        invocationId: "review-failed",
        offerToken: availableOffer(application, "ReviewChanges"),
      }),
    ).toMatchObject({ status: "failed", kind: "ReviewChanges" });
    expect(availableOffer(application, "CompactThread")).toBeTruthy();
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
    const futureSettings = new MemorySettings({ schemaVersion: 3 });
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
