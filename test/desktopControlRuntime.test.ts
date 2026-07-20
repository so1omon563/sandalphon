import { describe, expect, it, vi } from "vitest";

import {
  capabilityExpression,
  controlledLaunchArguments,
  decodeDesktopTargets,
  decodeListenerProcessIds,
  LocalDesktopControlRuntime,
  PROVEN_DESKTOP_CONTROL_VERSION,
  selectTaskExpression,
  taskListExpression,
  type DesktopControlHost,
  type DesktopProtocolSession,
} from "../src/desktopControlRuntime.js";

class FakeProtocolSession implements DesktopProtocolSession {
  capable = true;
  timeoutsRemaining = 0;
  readonly evaluate = vi.fn((expression: string): Promise<unknown> => {
    if (this.timeoutsRemaining > 0) {
      this.timeoutsRemaining -= 1;
      return Promise.reject(new Error("evaluationTimeout"));
    }
    if (expression.includes("rows.every")) {
      return Promise.resolve(this.capable);
    }
    if (expression.includes('"task-2"')) {
      return Promise.resolve([
        { id: "task-1", selected: false },
        { id: "task-2", selected: true },
      ]);
    }
    return Promise.resolve([
      { id: "task-1", selected: true },
      { id: "task-2", selected: false },
    ]);
  });
  readonly close = vi.fn();
  readonly #closeListeners = new Set<() => void>();

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  disconnect(): void {
    for (const listener of this.#closeListeners) listener();
  }
}

class FakeDesktopHost implements DesktopControlHost {
  version = PROVEN_DESKTOP_CONTROL_VERSION.application;
  running = false;
  discoveryAvailable = true;
  discoveryError: string | undefined;
  endpointVersion = PROVEN_DESKTOP_CONTROL_VERSION;
  readonly session = new FakeProtocolSession();
  readonly launchControlled = vi.fn(() => {
    this.discoveryAvailable = true;
    return Promise.resolve(42);
  });
  readonly restoreNormal = vi.fn().mockResolvedValue(undefined);
  readonly restoreLaunched = vi.fn().mockResolvedValue(undefined);

  installedApplicationVersion(): Promise<string> {
    return Promise.resolve(this.version);
  }

  applicationRunning(): Promise<boolean> {
    return Promise.resolve(this.running);
  }

  discover(): Promise<{
    port: number;
    processId: number;
    debuggerUrl: string;
    version: typeof PROVEN_DESKTOP_CONTROL_VERSION;
  }> {
    if (this.discoveryError) {
      return Promise.reject(new Error(this.discoveryError));
    }
    return this.discoveryAvailable
      ? Promise.resolve({
          port: 49152,
          processId: 42,
          debuggerUrl: "ws://127.0.0.1:49152/devtools/page/one",
          version: this.endpointVersion,
        })
      : Promise.reject(new Error("connectionFailed"));
  }

  openSession(): Promise<DesktopProtocolSession> {
    return Promise.resolve(this.session);
  }
}

describe("desktop control runtime", () => {
  it("uses the accepted macOS proof launcher with random loopback arguments", () => {
    expect(controlledLaunchArguments()).toEqual([
      "-na",
      "/Applications/ChatGPT.app",
      "--args",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
    ]);
  });

  it("fails before discovery on an unsupported installed application", async () => {
    const host = new FakeDesktopHost();
    host.version = "26.715.52144";
    await expect(
      new LocalDesktopControlRuntime(host).connect(),
    ).rejects.toThrow("unsupportedVersion");
    expect(host.launchControlled).not.toHaveBeenCalled();
  });

  it("requires a normal running Codex process to be quit before launch", async () => {
    const host = new FakeDesktopHost();
    host.discoveryAvailable = false;
    host.running = true;
    await expect(
      new LocalDesktopControlRuntime(host).connect(),
    ).rejects.toThrow("restartRequired");
    expect(host.launchControlled).not.toHaveBeenCalled();
  });

  it("restores normal Codex when the discovered engine tuple drifts", async () => {
    const host = new FakeDesktopHost();
    host.endpointVersion = {
      ...PROVEN_DESKTOP_CONTROL_VERSION,
      engine: "150.0.7871.125",
    };
    await expect(
      new LocalDesktopControlRuntime(host).connect(),
    ).rejects.toThrow("unsupportedVersion");
    expect(host.restoreNormal).toHaveBeenCalledWith(42, 49152);
  });

  it("restores normal Codex when live task-selection capability is absent", async () => {
    const host = new FakeDesktopHost();
    host.session.capable = false;
    await expect(
      new LocalDesktopControlRuntime(host, {
        endpointAttempts: 1,
        endpointDelayMs: 0,
        initialAttempts: 2,
        initialDelayMs: 0,
        initialEvaluationTimeoutMs: 1,
      }).connect(),
    ).rejects.toThrow("capabilityUnavailable");
    expect(host.restoreNormal).toHaveBeenCalledWith(42, 49152);
  });

  it("launches only after opt-in, selects one opaque target, and restores normal", async () => {
    const host = new FakeDesktopHost();
    host.discoveryAvailable = false;
    const runtime = new LocalDesktopControlRuntime(host);
    const connection = await runtime.connect();
    expect(host.launchControlled).toHaveBeenCalledTimes(1);
    expect(connection.initialObservation).toMatchObject({
      endpointHost: "127.0.0.1",
      epoch: 1,
      revision: 1,
      capabilities: ["task.list", "task.select"],
      targets: [
        { id: "task-1", selected: true },
        { id: "task-2", selected: false },
      ],
    });

    await expect(connection.selectTask("task-2")).resolves.toMatchObject({
      revision: 2,
      targets: [
        { id: "task-1", selected: false },
        { id: "task-2", selected: true },
      ],
    });
    await connection.close();
    expect(host.restoreNormal).toHaveBeenCalledWith(42, 49152);
  });

  it("waits for a newly launched renderer to answer capability probes", async () => {
    const host = new FakeDesktopHost();
    host.session.timeoutsRemaining = 2;

    const connection = await new LocalDesktopControlRuntime(host, {
      endpointAttempts: 1,
      endpointDelayMs: 0,
      initialAttempts: 3,
      initialDelayMs: 0,
      initialEvaluationTimeoutMs: 1,
    }).connect();

    expect(connection.initialObservation.targets).toHaveLength(2);
    expect(host.session.evaluate).toHaveBeenCalledTimes(4);
    await connection.close();
  });

  it("keeps renderer expressions bounded to list and exact selection", () => {
    expect(capabilityExpression()).toContain("typeof row.click");
    expect(taskListExpression()).toContain(TASK_ATTRIBUTE);
    const expression = selectTaskExpression('task-2";throw new Error()');
    expect(expression).toContain(JSON.stringify('task-2";throw new Error()'));
    expect(expression).not.toContain("innerHTML");
    expect(() =>
      decodeDesktopTargets([
        { id: "duplicate", selected: true },
        { id: "duplicate", selected: false },
      ]),
    ).toThrow("invalidTaskState");
  });

  it("deduplicates listener rows while retaining distinct process owners", () => {
    expect(decodeListenerProcessIds("p42\nf10\np42\nf11\np84\nf12\n")).toEqual([
      42, 84,
    ]);
    expect(() => decodeListenerProcessIds("f10\n")).toThrow("listenerRejected");
  });

  it("reports bounded renderer timeout without exposing renderer content", async () => {
    const host = new FakeDesktopHost();
    host.session.timeoutsRemaining = 2;

    await expect(
      new LocalDesktopControlRuntime(host, {
        endpointAttempts: 1,
        endpointDelayMs: 0,
        initialAttempts: 2,
        initialDelayMs: 0,
        initialEvaluationTimeoutMs: 1,
      }).connect(),
    ).rejects.toThrow("rendererTimeout");
    expect(host.restoreNormal).toHaveBeenCalledWith(42, 49152);
  });

  it("retains the exact content-free endpoint rejection after bounded discovery", async () => {
    const host = new FakeDesktopHost();
    host.discoveryAvailable = false;
    host.discoveryError = "processRejected";

    await expect(
      new LocalDesktopControlRuntime(host, {
        endpointAttempts: 2,
        endpointDelayMs: 0,
        initialAttempts: 1,
        initialDelayMs: 0,
        initialEvaluationTimeoutMs: 1,
      }).connect(),
    ).rejects.toThrow("processRejected");
    expect(host.restoreLaunched).toHaveBeenCalledWith(42);
  });
});

const TASK_ATTRIBUTE = "data-app-action-sidebar-thread-id";
