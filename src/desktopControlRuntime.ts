import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import type {
  DesktopControlObservation,
  DesktopControlVersion,
  DesktopTaskTarget,
} from "./desktopControlContract.js";

export const PROVEN_DESKTOP_CONTROL_VERSION: DesktopControlVersion = {
  application: "26.715.52143",
  engine: "150.0.7871.124",
  protocol: "1.3",
};

const APPLICATION_BINARY = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
const APPLICATION_BUNDLE = "/Applications/ChatGPT.app";
const APPLICATION_PLIST = "/Applications/ChatGPT.app/Contents/Info.plist";
const APPLICATION_BUNDLE_ID = "com.openai.codex";
const ACTIVE_PORT_FILE = join(
  homedir(),
  "Library",
  "Application Support",
  "Codex",
  "DevToolsActivePort",
);
const TASK_ROW_SELECTOR =
  '[role="button"][data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-id]';
const execFileAsync = promisify(execFile);

export type DesktopControlLifecycleReason =
  | "restartRequired"
  | "unsupportedVersion"
  | "launchFailed"
  | "endpointUnavailable"
  | "endpointRejected"
  | "versionRejected"
  | "targetSetRejected"
  | "targetRejected"
  | "targetTypeRejected"
  | "targetOriginRejected"
  | "targetRouteRejected"
  | "debuggerUrlRejected"
  | "listenerRejected"
  | "processRejected"
  | "rendererTimeout"
  | "capabilityUnavailable"
  | "invalidTaskState"
  | "connectionFailed"
  | "cleanupFailed";

export interface DesktopControlConnection {
  readonly initialObservation: DesktopControlObservation;
  onObservation(
    listener: (observation: DesktopControlObservation) => void,
  ): () => void;
  onClose(listener: () => void): () => void;
  selectTask(targetId: string): Promise<DesktopControlObservation>;
  close(): Promise<void>;
}

export interface DesktopControlRuntime {
  connect(): Promise<DesktopControlConnection>;
}

interface DesktopEndpoint {
  readonly port: number;
  readonly processId: number;
  readonly debuggerUrl: string;
  readonly version: DesktopControlVersion;
}

export interface DesktopControlHost {
  installedApplicationVersion(): Promise<string>;
  applicationRunning(): Promise<boolean>;
  launchControlled(): Promise<number>;
  discover(requireFreshAfter?: number): Promise<DesktopEndpoint>;
  openSession(debuggerUrl: string): Promise<DesktopProtocolSession>;
  restoreLaunched(processId: number): Promise<void>;
  restoreNormal(processId: number, port: number): Promise<void>;
}

export interface DesktopProtocolSession {
  evaluate(expression: string, timeoutMs?: number): Promise<unknown>;
  onClose(listener: () => void): () => void;
  close(): void;
}

export interface DesktopControlTiming {
  readonly endpointAttempts: number;
  readonly endpointDelayMs: number;
  readonly initialAttempts: number;
  readonly initialDelayMs: number;
  readonly initialEvaluationTimeoutMs: number;
}

const DEFAULT_DESKTOP_CONTROL_TIMING: DesktopControlTiming = {
  endpointAttempts: 100,
  endpointDelayMs: 100,
  initialAttempts: 10,
  initialDelayMs: 250,
  initialEvaluationTimeoutMs: 2000,
};

export class LocalDesktopControlRuntime implements DesktopControlRuntime {
  readonly #host: DesktopControlHost;
  readonly #timing: DesktopControlTiming;
  #epoch = 0;

  constructor(
    host: DesktopControlHost = new MacDesktopControlHost(),
    timing: DesktopControlTiming = DEFAULT_DESKTOP_CONTROL_TIMING,
  ) {
    this.#host = host;
    this.#timing = timing;
  }

  async connect(): Promise<DesktopControlConnection> {
    const version = await this.#host.installedApplicationVersion();
    if (version !== PROVEN_DESKTOP_CONTROL_VERSION.application) {
      throw new Error("unsupportedVersion");
    }

    let endpoint: DesktopEndpoint;
    try {
      endpoint = await this.#host.discover();
    } catch (error) {
      if (error instanceof Error && error.message === "unsupportedVersion") {
        throw error;
      }
      if (await this.#host.applicationRunning()) {
        throw new Error("restartRequired", { cause: error });
      }
      const launchedAt = Date.now();
      const processId = await this.#host.launchControlled();
      try {
        endpoint = await waitForEndpoint(this.#host, launchedAt, this.#timing);
      } catch (error) {
        await this.#host.restoreLaunched(processId);
        throw error;
      }
    }

    if (!sameVersion(endpoint.version, PROVEN_DESKTOP_CONTROL_VERSION)) {
      await cleanupEndpoint(this.#host, endpoint);
      throw new Error("unsupportedVersion");
    }
    try {
      const session = await this.#host.openSession(endpoint.debuggerUrl);
      this.#epoch += 1;
      return await LiveDesktopControlConnection.create(
        this.#host,
        endpoint,
        session,
        this.#epoch,
        this.#timing,
      );
    } catch (error) {
      await cleanupEndpoint(this.#host, endpoint);
      throw startupConnectionError(error);
    }
  }
}

class LiveDesktopControlConnection implements DesktopControlConnection {
  readonly #host: DesktopControlHost;
  readonly #endpoint: DesktopEndpoint;
  readonly #session: DesktopProtocolSession;
  readonly #observationListeners = new Set<
    (observation: DesktopControlObservation) => void
  >();
  readonly #closeListeners = new Set<() => void>();
  readonly initialObservation: DesktopControlObservation;
  readonly #epoch: number;
  #revision: number;
  #targets: readonly DesktopTaskTarget[];
  #transportClosed = false;
  #cleanupStarted = false;
  #poll: ReturnType<typeof setInterval> | undefined;

  private constructor(
    host: DesktopControlHost,
    endpoint: DesktopEndpoint,
    session: DesktopProtocolSession,
    initialObservation: DesktopControlObservation,
  ) {
    this.#host = host;
    this.#endpoint = endpoint;
    this.#session = session;
    this.initialObservation = initialObservation;
    this.#epoch = initialObservation.epoch;
    this.#revision = initialObservation.revision;
    this.#targets = initialObservation.targets;
    session.onClose(() => this.#didClose());
    this.#poll = setInterval(() => void this.#refresh(), 1000);
    this.#poll.unref();
  }

  static async create(
    host: DesktopControlHost,
    endpoint: DesktopEndpoint,
    session: DesktopProtocolSession,
    epoch: number,
    timing: DesktopControlTiming,
  ): Promise<LiveDesktopControlConnection> {
    const initial = observationFor(
      endpoint,
      epoch,
      1,
      await waitForInitialDesktopTargets(session, timing),
    );
    return new LiveDesktopControlConnection(host, endpoint, session, initial);
  }

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

  async selectTask(targetId: string): Promise<DesktopControlObservation> {
    if (this.#transportClosed) throw new Error("connectionFailed");
    const targets = decodeDesktopTargets(
      await this.#session.evaluate(selectTaskExpression(targetId)),
    );
    if (!targets.some(({ id, selected }) => id === targetId && selected)) {
      throw new Error("connectionFailed");
    }
    return this.#publish(targets, false);
  }

  async close(): Promise<void> {
    if (this.#cleanupStarted) return;
    this.#cleanupStarted = true;
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = undefined;
    if (!this.#transportClosed) this.#session.close();
    this.#transportClosed = true;
    await this.#host.restoreNormal(
      this.#endpoint.processId,
      this.#endpoint.port,
    );
  }

  async #refresh(): Promise<void> {
    if (this.#transportClosed) return;
    try {
      const targets = await readDesktopTargets(this.#session);
      if (!sameTargets(targets, this.#targets)) {
        this.#publish(targets);
      }
    } catch {
      this.#didClose();
    }
  }

  #publish(
    targets: readonly DesktopTaskTarget[],
    notify = true,
  ): DesktopControlObservation {
    this.#revision += 1;
    this.#targets = targets;
    const observation = observationFor(
      this.#endpoint,
      this.#epoch,
      this.#revision,
      targets,
    );
    if (notify) {
      for (const listener of this.#observationListeners) listener(observation);
    }
    return observation;
  }

  #didClose(): void {
    if (this.#transportClosed) return;
    this.#transportClosed = true;
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = undefined;
    for (const listener of this.#closeListeners) listener();
  }
}

export class MacDesktopControlHost implements DesktopControlHost {
  async installedApplicationVersion(): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        "/usr/libexec/PlistBuddy",
        ["-c", "Print :CFBundleShortVersionString", APPLICATION_PLIST],
        { encoding: "utf8", timeout: 5000 },
      );
      return stdout.trim();
    } catch {
      throw new Error("unsupportedVersion");
    }
  }

  async applicationRunning(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        "/usr/bin/pgrep",
        ["-f", `^${APPLICATION_BINARY}( |$)`],
        { encoding: "utf8", timeout: 5000 },
      );
      return stdout.trim().length > 0;
    } catch (error) {
      if (asExitCode(error) === 1) return false;
      throw new Error("connectionFailed", { cause: error });
    }
  }

  async launchControlled(): Promise<number> {
    try {
      await execFileAsync("/usr/bin/open", controlledLaunchArguments(), {
        timeout: 5000,
      });
      return await waitForControlledProcess();
    } catch {
      throw new Error("launchFailed");
    }
  }

  async discover(requireFreshAfter?: number): Promise<DesktopEndpoint> {
    let portText: string;
    let metadata: Awaited<ReturnType<typeof stat>>;
    try {
      [portText, metadata] = await Promise.all([
        readFile(ACTIVE_PORT_FILE, "utf8"),
        stat(ACTIVE_PORT_FILE),
      ]);
    } catch {
      throw new Error("endpointUnavailable");
    }
    if (
      requireFreshAfter !== undefined &&
      metadata.mtimeMs < requireFreshAfter - 1000
    ) {
      throw new Error("endpointUnavailable");
    }
    const [portLine] = portText.split(/\r?\n/u);
    const port = Number.parseInt(portLine ?? "", 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error("endpointRejected");
    }
    const origin = `http://127.0.0.1:${port}`;
    let versionValue: unknown;
    let targetsValue: unknown;
    try {
      [versionValue, targetsValue] = await Promise.all([
        fetchJson(`${origin}/json/version`),
        fetchJson(`${origin}/json/list`),
      ]);
    } catch {
      throw new Error("endpointUnavailable");
    }
    let listenerOwners: readonly number[];
    try {
      listenerOwners = await listenerProcessIds(port);
    } catch {
      throw new Error("listenerRejected");
    }
    const versionRecord = asRecord(versionValue);
    if (!Array.isArray(targetsValue) || targetsValue.length !== 1) {
      throw new Error("targetSetRejected");
    }
    const targets = targetsValue;
    const browser = versionRecord?.Browser;
    const protocol = versionRecord?.["Protocol-Version"];
    if (
      typeof browser !== "string" ||
      !browser.startsWith("Chrome/") ||
      typeof protocol !== "string"
    ) {
      throw new Error("versionRejected");
    }
    const debuggerUrl = decodeDesktopPageDebuggerUrl(targets[0], port);
    const controlledProcessIds: number[] = [];
    for (const processId of listenerOwners) {
      try {
        await verifyControlledProcess(processId, port);
        controlledProcessIds.push(processId);
      } catch {
        // Chromium helpers may share the listener but cannot own authority.
      }
    }
    if (controlledProcessIds.length !== 1) {
      throw new Error("processRejected");
    }
    const [processId] = controlledProcessIds;
    if (!processId) throw new Error("processRejected");
    return {
      port,
      processId,
      debuggerUrl,
      version: {
        application: PROVEN_DESKTOP_CONTROL_VERSION.application,
        engine: browser.slice("Chrome/".length),
        protocol,
      },
    };
  }

  async openSession(debuggerUrl: string): Promise<DesktopProtocolSession> {
    return WebSocketDesktopProtocolSession.connect(debuggerUrl);
  }

  async restoreLaunched(processId: number): Promise<void> {
    try {
      await verifyControlledProcess(processId, 0);
      process.kill(processId, "SIGTERM");
      await waitForProcessExit(processId);
      await execFileAsync("/usr/bin/open", ["-b", APPLICATION_BUNDLE_ID], {
        timeout: 5000,
      });
    } catch {
      throw new Error("cleanupFailed");
    }
  }

  async restoreNormal(processId: number, port: number): Promise<void> {
    try {
      let listeningProcessId: number | undefined;
      try {
        const processIds = await listenerProcessIds(port);
        listeningProcessId = processIds.includes(processId)
          ? processId
          : undefined;
      } catch {
        await execFileAsync("/usr/bin/open", ["-b", APPLICATION_BUNDLE_ID], {
          timeout: 5000,
        });
        await waitForListenerToClose(port);
        return;
      }
      if (listeningProcessId !== processId) throw new Error("cleanupFailed");
      await verifyControlledProcess(processId, port);
      process.kill(processId, "SIGTERM");
      await waitForProcessExit(processId);
      await execFileAsync("/usr/bin/open", ["-b", APPLICATION_BUNDLE_ID], {
        timeout: 5000,
      });
      await waitForListenerToClose(port);
    } catch {
      throw new Error("cleanupFailed");
    }
  }
}

export function controlledLaunchArguments(): readonly string[] {
  return [
    "-na",
    APPLICATION_BUNDLE,
    "--args",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
  ];
}

class WebSocketDesktopProtocolSession implements DesktopProtocolSession {
  readonly #socket: WebSocket;
  readonly #pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  readonly #closeListeners = new Set<() => void>();
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => this.#receive(event.data));
    socket.addEventListener("close", () => {
      this.#failPending();
      for (const listener of this.#closeListeners) listener();
    });
  }

  static async connect(url: string): Promise<WebSocketDesktopProtocolSession> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("connectionFailed")),
        { once: true },
      );
    });
    return new WebSocketDesktopProtocolSession(socket);
  }

  evaluate(expression: string, timeoutMs = 12_000): Promise<unknown> {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("evaluationTimeout"));
      }, timeoutMs);
      timer.unref();
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  }

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  close(): void {
    this.#socket.close();
  }

  #receive(value: unknown): void {
    let message: Record<string, unknown> | undefined;
    try {
      message = asRecord(JSON.parse(String(value)));
    } catch {
      this.#failPending();
      this.#socket.close();
      return;
    }
    const id = typeof message?.id === "number" ? message.id : undefined;
    if (id === undefined) return;
    const pending = this.#pending.get(id);
    if (!pending) return;
    this.#pending.delete(id);
    const result = asRecord(message?.result);
    if (!result || result.exceptionDetails) {
      pending.reject(new Error("connectionFailed"));
      return;
    }
    pending.resolve(asRecord(result.result)?.value);
  }

  #failPending(): void {
    for (const pending of this.#pending.values()) {
      pending.reject(new Error("connectionFailed"));
    }
    this.#pending.clear();
  }
}

export function decodeDesktopTargets(
  value: unknown,
): readonly DesktopTaskTarget[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new Error("invalidTaskState");
  }
  const ids = new Set<string>();
  let selectedCount = 0;
  const targets = value.map((candidate) => {
    const record = asRecord(candidate);
    const id = record?.id;
    const selected = record?.selected;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > 256 ||
      ids.has(id) ||
      typeof selected !== "boolean"
    ) {
      throw new Error("invalidTaskState");
    }
    ids.add(id);
    if (selected) selectedCount += 1;
    return { id, selected };
  });
  if (selectedCount !== 1) throw new Error("invalidTaskState");
  return targets;
}

export function decodeDesktopPageDebuggerUrl(
  value: unknown,
  port: number,
): string {
  const target = asRecord(value);
  if (target?.type !== "page") throw new Error("targetTypeRejected");
  if (typeof target.url !== "string") {
    throw new Error("targetOriginRejected");
  }
  let pageUrl: URL;
  try {
    pageUrl = new URL(target.url);
  } catch {
    throw new Error("targetOriginRejected");
  }
  if (pageUrl.protocol !== "app:" || pageUrl.hostname !== "-") {
    throw new Error("targetOriginRejected");
  }
  if (
    (pageUrl.pathname !== "" && pageUrl.pathname !== "/") ||
    pageUrl.search !== "" ||
    pageUrl.hash !== ""
  ) {
    throw new Error("targetRouteRejected");
  }
  let debuggerUrl: URL;
  try {
    debuggerUrl = new URL(String(target.webSocketDebuggerUrl));
  } catch {
    throw new Error("debuggerUrlRejected");
  }
  if (
    debuggerUrl.protocol !== "ws:" ||
    debuggerUrl.hostname !== "127.0.0.1" ||
    debuggerUrl.port !== String(port)
  ) {
    throw new Error("debuggerUrlRejected");
  }
  return debuggerUrl.href;
}

export function taskListExpression(): string {
  return `(() => Array.from(document.querySelectorAll(${JSON.stringify(TASK_ROW_SELECTOR)})).map((row) => ({ id: row.getAttribute("data-app-action-sidebar-thread-id"), selected: row.getAttribute("aria-current") === "page" })))()`;
}

export function capabilityExpression(): string {
  return `(() => { const rows = Array.from(document.querySelectorAll(${JSON.stringify(TASK_ROW_SELECTOR)})); return rows.length > 0 && rows.every((row) => typeof row.click === "function"); })()`;
}

export function selectTaskExpression(targetId: string): string {
  return `(async () => { const selector = ${JSON.stringify(TASK_ROW_SELECTOR)}; const rows = () => Array.from(document.querySelectorAll(selector)); const id = (row) => row?.getAttribute("data-app-action-sidebar-thread-id"); const selected = () => id(rows().find((row) => row.getAttribute("aria-current") === "page")); const target = rows().find((row) => id(row) === ${JSON.stringify(targetId)}); if (!target) return []; target.click(); const deadline = performance.now() + 5000; while (performance.now() < deadline) { if (selected() === ${JSON.stringify(targetId)}) return rows().map((row) => ({ id: id(row), selected: row.getAttribute("aria-current") === "page" })); await new Promise((resolve) => setTimeout(resolve, 50)); } return []; })()`;
}

async function waitForControlledProcess(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const processIds = await applicationProcessIds();
    const controlledProcessIds: number[] = [];
    for (const processId of processIds) {
      try {
        await verifyControlledProcess(processId, 0);
        controlledProcessIds.push(processId);
      } catch {
        // A normal Codex process is not an accepted controlled launch.
      }
    }
    if (controlledProcessIds.length === 1 && controlledProcessIds[0]) {
      return controlledProcessIds[0];
    }
    if (controlledProcessIds.length > 1) throw new Error("launchFailed");
    await delay(100);
  }
  throw new Error("launchFailed");
}

async function applicationProcessIds(): Promise<readonly number[]> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/pgrep",
      ["-f", `^${APPLICATION_BINARY}( |$)`],
      { encoding: "utf8", timeout: 5000 },
    );
    return stdout
      .split(/\r?\n/u)
      .filter((line) => /^\d+$/u.test(line))
      .map((line) => Number.parseInt(line, 10));
  } catch (error) {
    if (asExitCode(error) === 1) return [];
    throw new Error("launchFailed", { cause: error });
  }
}

async function waitForEndpoint(
  host: DesktopControlHost,
  launchedAt: number,
  timing: DesktopControlTiming,
): Promise<DesktopEndpoint> {
  let lastError: unknown;
  for (let attempt = 0; attempt < timing.endpointAttempts; attempt += 1) {
    try {
      return await host.discover(launchedAt);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < timing.endpointAttempts) {
        await delay(timing.endpointDelayMs);
      }
    }
  }
  const message = errorMessage(lastError);
  throw new Error(
    message === "endpointUnavailable" ||
      message === "endpointRejected" ||
      message === "versionRejected" ||
      message === "targetSetRejected" ||
      message === "targetRejected" ||
      message === "targetTypeRejected" ||
      message === "targetOriginRejected" ||
      message === "targetRouteRejected" ||
      message === "debuggerUrlRejected" ||
      message === "listenerRejected" ||
      message === "processRejected"
      ? message
      : "launchFailed",
    { cause: lastError },
  );
}

async function readDesktopTargets(
  session: DesktopProtocolSession,
  timeoutMs?: number,
): Promise<readonly DesktopTaskTarget[]> {
  const capable = await session.evaluate(capabilityExpression(), timeoutMs);
  if (capable !== true) throw new Error("capabilityPending");
  const targets = await session.evaluate(taskListExpression(), timeoutMs);
  if (Array.isArray(targets) && targets.length === 0) {
    throw new Error("capabilityPending");
  }
  return decodeDesktopTargets(targets);
}

async function waitForInitialDesktopTargets(
  session: DesktopProtocolSession,
  timing: DesktopControlTiming,
): Promise<readonly DesktopTaskTarget[]> {
  let lastPendingReason = "capabilityUnavailable";
  for (let attempt = 0; attempt < timing.initialAttempts; attempt += 1) {
    try {
      return await readDesktopTargets(
        session,
        timing.initialEvaluationTimeoutMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message !== "evaluationTimeout" && message !== "capabilityPending") {
        throw error;
      }
      lastPendingReason =
        message === "evaluationTimeout"
          ? "rendererTimeout"
          : "capabilityUnavailable";
      if (attempt + 1 < timing.initialAttempts) {
        await delay(timing.initialDelayMs);
      }
    }
  }
  throw new Error(lastPendingReason);
}

function startupConnectionError(error: unknown): Error {
  const message = errorMessage(error);
  return new Error(
    message === "rendererTimeout" ||
      message === "capabilityUnavailable" ||
      message === "invalidTaskState"
      ? message
      : "connectionFailed",
    { cause: error },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

async function cleanupEndpoint(
  host: DesktopControlHost,
  endpoint: DesktopEndpoint,
): Promise<void> {
  try {
    await host.restoreNormal(endpoint.processId, endpoint.port);
  } catch {
    throw new Error("cleanupFailed");
  }
}

function observationFor(
  endpoint: DesktopEndpoint,
  epoch: number,
  revision: number,
  targets: readonly DesktopTaskTarget[],
): DesktopControlObservation {
  return {
    connected: true,
    endpointHost: "127.0.0.1",
    epoch,
    revision,
    version: endpoint.version,
    capabilities: ["task.list", "task.select"],
    targets,
  };
}

function sameVersion(
  left: DesktopControlVersion,
  right: DesktopControlVersion,
): boolean {
  return (
    left.application === right.application &&
    left.engine === right.engine &&
    left.protocol === right.protocol
  );
}

function sameTargets(
  left: readonly DesktopTaskTarget[],
  right: readonly DesktopTaskTarget[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (target, index) =>
        target.id === right[index]?.id &&
        target.selected === right[index]?.selected,
    )
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("connectionFailed");
  return response.json();
}

async function listenerProcessIds(port: number): Promise<readonly number[]> {
  const { stdout } = await execFileAsync(
    "/usr/sbin/lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"],
    { encoding: "utf8", timeout: 5000 },
  );
  return decodeListenerProcessIds(stdout);
}

export function decodeListenerProcessIds(value: string): readonly number[] {
  const processIds = new Set(
    value
      .split(/\r?\n/u)
      .filter((line) => /^p\d+$/u.test(line))
      .map((line) => Number.parseInt(line.slice(1), 10)),
  );
  if (processIds.size === 0) throw new Error("listenerRejected");
  return [...processIds];
}

async function verifyControlledProcess(
  processId: number,
  port: number,
): Promise<void> {
  const { stdout } = await execFileAsync(
    "/bin/ps",
    ["-p", String(processId), "-o", "command="],
    { encoding: "utf8", timeout: 5000 },
  );
  const command = stdout.trim();
  if (
    !command.startsWith(APPLICATION_BINARY) ||
    !command.includes("--remote-debugging-address=127.0.0.1") ||
    !(
      command.includes("--remote-debugging-port=0") ||
      command.includes(`--remote-debugging-port=${port}`)
    )
  ) {
    throw new Error("connectionFailed");
  }
}

async function waitForProcessExit(processId: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      process.kill(processId, 0);
    } catch {
      return;
    }
    await delay(50);
  }
  throw new Error("cleanupFailed");
}

async function waitForListenerToClose(port: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await listenerProcessIds(port);
    } catch {
      return;
    }
    await delay(50);
  }
  throw new Error("cleanupFailed");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asExitCode(error: unknown): number | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number"
    ? error.code
    : undefined;
}
