import { execFile, spawn } from "node:child_process";
import {
  chmod,
  lstat,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import type {
  DesktopControlObservation,
  DesktopTaskTarget,
} from "./desktopControlContract.js";
import {
  MACOS_CODEX_APPLICATION_PATH,
  MACOS_CODEX_EXECUTABLE_PATH,
  MACOS_DESKTOP_CONTROL_CONTRACT_REVISION,
  controlledLaunchArguments,
  type MacosCodexApplicationIdentity,
  type MacosControlledLaunchRecord,
  type MacosControlledProcess,
  type MacosDesktopCompanionPlatform,
  type MacosDesktopCompatibilityReceipt,
} from "./macosDesktopCompanionDriver.js";

export const MACOS_CONTROL_RECORD_NAME = "controlled-launch.json";
export const MACOS_COMPATIBILITY_RECEIPT_NAME = "desktop-compatibility.json";
const TASK_ROW_SELECTOR =
  '[role="button"][data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-id]';
const MAX_DISCOVERY_BYTES = 256 * 1024;
const MAX_EVALUATION_BYTES = 64 * 1024;
const CONTROL_ID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const execFileAsync = promisify(execFile);

export class NodeMacosDesktopCompanionPlatform implements MacosDesktopCompanionPlatform {
  readonly #runtimeDirectory: string;
  readonly #stateDirectory: string;
  readonly #uid: number;

  constructor(runtimeDirectory: string, stateDirectory: string) {
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error("unsupportedPlatform");
    this.#runtimeDirectory = runtimeDirectory;
    this.#stateDirectory = stateDirectory;
    this.#uid = uid;
  }

  async readApplicationIdentity(
    signal: AbortSignal,
  ): Promise<MacosCodexApplicationIdentity> {
    await execFileAsync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", MACOS_CODEX_APPLICATION_PATH],
      { signal },
    );
    const infoPath = `${MACOS_CODEX_APPLICATION_PATH}/Contents/Info.plist`;
    const readPlist = async (key: string): Promise<string> => {
      const { stdout } = await execFileAsync(
        "/usr/libexec/PlistBuddy",
        ["-c", `Print :${key}`, infoPath],
        { encoding: "utf8", signal },
      );
      return stdout.trim();
    };
    const [, signature, applicationVersion, bundleVersion, bundleIdentifier] =
      await Promise.all([
        execFileAsync(
          "/usr/sbin/spctl",
          ["--assess", "--type", "execute", MACOS_CODEX_APPLICATION_PATH],
          { signal },
        ),
        execFileAsync(
          "/usr/bin/codesign",
          ["-dv", "--verbose=4", MACOS_CODEX_APPLICATION_PATH],
          { encoding: "utf8", signal },
        ),
        readPlist("CFBundleShortVersionString"),
        readPlist("CFBundleVersion"),
        readPlist("CFBundleIdentifier"),
      ]);
    return parseMacosCodexApplicationIdentity({
      applicationVersion,
      bundleVersion,
      bundleIdentifier,
      signature: signature.stderr,
    });
  }

  readCompatibilityReceipt(signal: AbortSignal): Promise<unknown> {
    return this.#readSecureJson(this.#receiptPath(), 4096, signal);
  }

  async writeCompatibilityReceipt(
    receipt: MacosDesktopCompatibilityReceipt,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#writeSecureJson(
      this.#receiptPath(),
      `.desktop-compatibility-${receipt.identity.cdHash}.tmp`,
      receipt,
      signal,
    );
  }

  async readLaunchRecord(signal: AbortSignal): Promise<unknown> {
    throwIfAborted(signal);
    const path = this.#recordPath();
    const status = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!status) return undefined;
    const expectedUid = process.getuid?.();
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      (expectedUid !== undefined && status.uid !== expectedUid) ||
      (status.mode & 0o777) !== 0o600 ||
      status.size > 4096
    ) {
      throw new Error("unsafeControlledRecord");
    }
    return JSON.parse(
      await readFile(path, { encoding: "utf8", signal }),
    ) as unknown;
  }

  async writeLaunchRecord(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    const path = this.#recordPath();
    const temporary = join(
      this.#runtimeDirectory,
      `.controlled-launch-${record.controlId}.tmp`,
    );
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await writeFile(temporary, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
      signal,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    await chmod(path, 0o600);
  }

  async deleteLaunchRecord(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const path = this.#recordPath();
    const status = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!status) return;
    const expectedUid = process.getuid?.();
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      (expectedUid !== undefined && status.uid !== expectedUid)
    ) {
      throw new Error("unsafeControlledRecord");
    }
    await unlink(path);
  }

  allocateLoopbackPort(signal: AbortSignal): Promise<number> {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      const server = createServer();
      const abort = (): void => {
        server.close(() => reject(new Error("operationAborted")));
      };
      signal.addEventListener("abort", abort, { once: true });
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close((error) => {
          signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else if (!address || typeof address === "string") {
            reject(new Error("loopbackPortUnavailable"));
          } else {
            resolve(address.port);
          }
        });
      });
    });
  }

  async launchControlled(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<MacosControlledProcess> {
    throwIfAborted(signal);
    const child = spawn(
      MACOS_CODEX_EXECUTABLE_PATH,
      controlledLaunchArguments(record),
      {
        detached: true,
        stdio: "ignore",
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    const pid = child.pid;
    if (!pid) throw new Error("controlledLaunchFailed");
    child.unref();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const matches = await this.findControlledProcesses(
        record.controlId,
        signal,
      );
      const match = matches.find((candidate) => candidate.pid === pid);
      if (match) return match;
      await delay(50, undefined, { signal });
    }
    throw new Error("controlledProcessUnavailable");
  }

  async findControlledProcesses(
    controlId: string | undefined,
    signal: AbortSignal,
  ): Promise<readonly MacosControlledProcess[]> {
    const { stdout } = await execFileAsync(
      "/bin/ps",
      ["-axo", "pid=,uid=,lstart=,command="],
      { encoding: "utf8", signal, env: processEnvironmentWithCLocale() },
    );
    return parseMacosCodexProcessList(stdout)
      .filter(({ uid, command }) => {
        if (uid !== this.#uid) return false;
        if (!command.startsWith(`${MACOS_CODEX_EXECUTABLE_PATH} `))
          return false;
        const marker = extractControlId(command);
        return controlId === undefined
          ? marker !== undefined
          : marker === controlId;
      })
      .map(({ pid, startedAt }) => ({ pid, startedAt }));
  }

  async listenerOwner(
    port: number,
    signal: AbortSignal,
  ): Promise<number | undefined> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        "/usr/sbin/lsof",
        ["-nP", "-a", `-iTCP@127.0.0.1:${port}`, "-sTCP:LISTEN", "-Fp"],
        { encoding: "utf8", signal },
      ));
    } catch (error) {
      if (isExitCode(error, 1)) return undefined;
      throw error;
    }
    return parseListenerOwner(stdout);
  }

  async observeDesktop(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<Omit<DesktopControlObservation, "epoch" | "revision">> {
    const origin = `http://127.0.0.1:${record.port}`;
    const [version, targets] = await Promise.all([
      fetchJson(`${origin}/json/version`, signal),
      fetchJson(`${origin}/json/list`, signal),
    ]);
    const discovery = decodeDebuggerPage({ version, targets }, record.port);
    const tasks = await evaluateDesktopTasks(discovery.debuggerUrl, signal);
    return {
      connected: true,
      endpointHost: "127.0.0.1",
      contractRevision: MACOS_DESKTOP_CONTROL_CONTRACT_REVISION,
      version: {
        application: record.identity.applicationVersion,
        engine: discovery.engine,
        protocol: discovery.protocol,
      },
      capabilities: ["task.list", "task.select"],
      targets: tasks,
    };
  }

  async selectDesktopTask(
    record: MacosControlledLaunchRecord,
    targetId: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!targetId || targetId.length > 256) throw new Error("invalidTargetId");
    const origin = `http://127.0.0.1:${record.port}`;
    const [version, targets] = await Promise.all([
      fetchJson(`${origin}/json/version`, signal),
      fetchJson(`${origin}/json/list`, signal),
    ]);
    const discovery = decodeDebuggerPage({ version, targets }, record.port);
    const clicked = await evaluateDesktopValue(
      discovery.debuggerUrl,
      taskSelectionExpression(targetId),
      signal,
    );
    if (clicked !== true) throw new Error("desktopSelectionFailed");
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const tasks = await evaluateDesktopTasks(discovery.debuggerUrl, signal);
      if (tasks.find((target) => target.selected)?.id === targetId) return;
      await delay(50, undefined, { signal });
    }
    throw new Error("desktopSelectionUnverified");
  }

  async terminateControlled(
    controlled: MacosControlledProcess,
    signal: AbortSignal,
  ): Promise<void> {
    const current = await inspectProcess(controlled.pid, signal);
    if (
      !current ||
      current.uid !== this.#uid ||
      current.startedAt !== controlled.startedAt ||
      !current.command.startsWith(`${MACOS_CODEX_EXECUTABLE_PATH} `) ||
      extractControlId(current.command) === undefined
    ) {
      throw new Error("controlledProcessChanged");
    }
    process.kill(controlled.pid, "SIGTERM");
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (!(await inspectProcess(controlled.pid, signal))) return;
      await delay(50, undefined, { signal });
    }
    throw new Error("controlledProcessStillRunning");
  }

  async stopNormal(signal: AbortSignal): Promise<void> {
    const normal = await this.#normalProcesses(signal);
    for (const candidate of normal) {
      const current = await inspectProcess(candidate.pid, signal);
      if (
        !current ||
        current.uid !== this.#uid ||
        current.startedAt !== candidate.startedAt ||
        !isNormalCommand(current.command)
      ) {
        throw new Error("normalProcessChanged");
      }
      process.kill(candidate.pid, "SIGTERM");
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if ((await this.normalProcessCount(signal)) === 0) return;
      await delay(50, undefined, { signal });
    }
    throw new Error("normalProcessStillRunning");
  }

  async launchNormal(signal: AbortSignal): Promise<void> {
    await execFileAsync("/usr/bin/open", [MACOS_CODEX_APPLICATION_PATH], {
      signal,
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if ((await this.normalProcessCount(signal)) === 1) return;
      await delay(50, undefined, { signal });
    }
    throw new Error("normalProcessUnavailable");
  }

  async normalProcessCount(signal: AbortSignal): Promise<number> {
    return (await this.#normalProcesses(signal)).length;
  }

  async #normalProcesses(
    signal: AbortSignal,
  ): Promise<readonly MacosControlledProcess[]> {
    const { stdout } = await execFileAsync(
      "/bin/ps",
      ["-axo", "pid=,uid=,lstart=,command="],
      { encoding: "utf8", signal, env: processEnvironmentWithCLocale() },
    );
    return parseMacosCodexProcessList(stdout)
      .filter(
        ({ uid, command }) => uid === this.#uid && isNormalCommand(command),
      )
      .map(({ pid, startedAt }) => ({ pid, startedAt }));
  }

  #recordPath(): string {
    return join(this.#runtimeDirectory, MACOS_CONTROL_RECORD_NAME);
  }

  #receiptPath(): string {
    return join(this.#stateDirectory, MACOS_COMPATIBILITY_RECEIPT_NAME);
  }

  async #readSecureJson(
    path: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<unknown> {
    throwIfAborted(signal);
    const status = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!status) return undefined;
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      status.uid !== this.#uid ||
      (status.mode & 0o777) !== 0o600 ||
      status.size > maxBytes
    ) {
      throw new Error("unsafeCompatibilityReceipt");
    }
    return JSON.parse(
      await readFile(path, { encoding: "utf8", signal }),
    ) as unknown;
  }

  async #writeSecureJson(
    path: string,
    temporaryName: string,
    value: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    const temporary = join(this.#stateDirectory, temporaryName);
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await writeFile(temporary, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
      signal,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    await chmod(path, 0o600);
  }
}

export interface ParsedMacosProcess {
  readonly pid: number;
  readonly uid: number;
  readonly startedAt: string;
  readonly command: string;
}

export function parseMacosProcessList(
  value: string,
): readonly ParsedMacosProcess[] {
  const processes: ParsedMacosProcess[] = [];
  for (const line of value.split("\n")) {
    if (!line.trim()) continue;
    const match =
      /^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/u.exec(
        line,
      );
    if (!match) throw new Error("invalidProcessObservation");
    const pid = Number.parseInt(match[1]!, 10);
    const uid = Number.parseInt(match[2]!, 10);
    if (
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      !Number.isSafeInteger(uid) ||
      uid < 0
    ) {
      throw new Error("invalidProcessObservation");
    }
    processes.push({
      pid,
      uid,
      startedAt: match[3]!,
      command: match[4]!,
    });
  }
  return processes;
}

export function parseMacosCodexProcessList(
  value: string,
): readonly ParsedMacosProcess[] {
  return value
    .split("\n")
    .filter((line) => line.includes(MACOS_CODEX_EXECUTABLE_PATH))
    .flatMap((line) => parseMacosProcessList(line));
}

export function parseListenerOwner(value: string): number | undefined {
  const pids = value
    .split("\n")
    .filter((line) => /^p\d+$/u.test(line))
    .map((line) => Number.parseInt(line.slice(1), 10));
  const unique = [...new Set(pids)];
  if (unique.length === 0) return undefined;
  if (
    unique.length !== 1 ||
    !Number.isSafeInteger(unique[0]) ||
    unique[0]! <= 0
  ) {
    throw new Error("ambiguousListenerOwner");
  }
  return unique[0];
}

export function decodeDebuggerPage(
  discovery: { readonly version: unknown; readonly targets: unknown },
  port: number,
): {
  readonly debuggerUrl: string;
  readonly engine: string;
  readonly protocol: "1.3";
} {
  if (
    !discovery.version ||
    typeof discovery.version !== "object" ||
    !Array.isArray(discovery.targets) ||
    discovery.targets.length !== 1
  ) {
    throw new Error("invalidDesktopDiscovery");
  }
  const version = discovery.version as Record<string, unknown>;
  const browser =
    typeof version.Browser === "string"
      ? /^Chrome\/(\d+(?:\.\d+){3})$/u.exec(version.Browser)
      : null;
  if (!browser || version["Protocol-Version"] !== "1.3") {
    throw new Error("unsupportedDesktopVersion");
  }
  const target = discovery.targets[0] as Record<string, unknown> | undefined;
  if (
    !target ||
    target.type !== "page" ||
    target.url !== "app://-" ||
    typeof target.webSocketDebuggerUrl !== "string"
  ) {
    throw new Error("invalidDesktopDiscovery");
  }
  const url = new URL(target.webSocketDebuggerUrl);
  if (
    url.protocol !== "ws:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== String(port)
  ) {
    throw new Error("unsafeDesktopEndpoint");
  }
  return {
    debuggerUrl: url.href,
    engine: browser[1]!,
    protocol: "1.3",
  };
}

export function parseMacosCodexApplicationIdentity(value: {
  readonly applicationVersion: string;
  readonly bundleVersion: string;
  readonly bundleIdentifier: string;
  readonly signature: string;
}): MacosCodexApplicationIdentity {
  const fields = new Map(
    value.signature
      .split("\n")
      .map((line) => line.split("=", 2))
      .filter((parts): parts is [string, string] => parts.length === 2),
  );
  const teamIdentifier = fields.get("TeamIdentifier");
  const cdHash = fields.get("CDHash");
  if (
    !/^[0-9.]{1,32}$/u.test(value.applicationVersion) ||
    !/^[0-9]{1,16}$/u.test(value.bundleVersion) ||
    value.bundleIdentifier !== "com.openai.codex" ||
    fields.get("Identifier") !== "com.openai.codex" ||
    teamIdentifier !== "2DC432GLL2" ||
    !cdHash ||
    !/^[0-9a-f]{40}$/u.test(cdHash)
  ) {
    throw new Error("untrustedCodexApplication");
  }
  return {
    applicationVersion: value.applicationVersion,
    bundleVersion: value.bundleVersion,
    bundleIdentifier: "com.openai.codex",
    teamIdentifier: "2DC432GLL2",
    cdHash,
  };
}

export function decodeDesktopTaskTargets(
  value: unknown,
): readonly DesktopTaskTarget[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new Error("invalidDesktopTasks");
  }
  const ids = new Set<string>();
  let selected = 0;
  const targets = value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("invalidDesktopTasks");
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      record.id.length > 256 ||
      ids.has(record.id) ||
      typeof record.selected !== "boolean"
    ) {
      throw new Error("invalidDesktopTasks");
    }
    ids.add(record.id);
    if (record.selected) selected += 1;
    return { id: record.id, selected: record.selected };
  });
  if (selected !== 1) throw new Error("invalidDesktopTasks");
  return targets;
}

export function taskListExpression(): string {
  return `(() => Array.from(document.querySelectorAll(${JSON.stringify(TASK_ROW_SELECTOR)})).map((row) => ({
    id: row.getAttribute("data-app-action-sidebar-thread-id"),
    selected: row.getAttribute("aria-current") === "page",
  })))()`;
}

export function taskSelectionExpression(targetId: string): string {
  return `(() => {
    const row = Array.from(document.querySelectorAll(${JSON.stringify(TASK_ROW_SELECTOR)}))
      .find((candidate) => candidate.getAttribute("data-app-action-sidebar-thread-id") === ${JSON.stringify(targetId)});
    if (!(row instanceof HTMLElement)) return false;
    row.click();
    return true;
  })()`;
}

async function inspectProcess(
  pid: number,
  signal: AbortSignal,
): Promise<ParsedMacosProcess | undefined> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "/bin/ps",
      ["-p", String(pid), "-o", "pid=,uid=,lstart=,command="],
      { encoding: "utf8", signal, env: processEnvironmentWithCLocale() },
    ));
  } catch (error) {
    if (isExitCode(error, 1)) return undefined;
    throw error;
  }
  const processes = parseMacosProcessList(stdout);
  if (processes.length > 1) throw new Error("ambiguousProcessObservation");
  return processes[0];
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("desktopDiscoveryFailed");
  const contentLength = Number(response.headers.get("content-length"));
  if (
    (Number.isFinite(contentLength) && contentLength > MAX_DISCOVERY_BYTES) ||
    !response.body
  ) {
    throw new Error("desktopDiscoveryFailed");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_DISCOVERY_BYTES) {
    throw new Error("desktopDiscoveryFailed");
  }
  return JSON.parse(body) as unknown;
}

async function evaluateDesktopTasks(
  debuggerUrl: string,
  signal: AbortSignal,
): Promise<readonly DesktopTaskTarget[]> {
  return decodeDesktopTaskTargets(
    await evaluateDesktopValue(debuggerUrl, taskListExpression(), signal),
  );
}

async function evaluateDesktopValue(
  debuggerUrl: string,
  expression: string,
  signal: AbortSignal,
): Promise<unknown> {
  throwIfAborted(signal);
  const socket = new WebSocket(debuggerUrl);
  const abort = (): void => socket.close();
  signal.addEventListener("abort", abort, { once: true });
  try {
    let rejectConnect!: (error: Error) => void;
    const connectAbort = (): void =>
      rejectConnect(new Error("operationAborted"));
    signal.addEventListener("abort", connectAbort, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        rejectConnect = reject;
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener(
          "error",
          () => reject(new Error("desktopConnectFailed")),
          { once: true },
        );
      });
    } finally {
      signal.removeEventListener("abort", connectAbort);
    }
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
      }),
    );
    let rejectEvaluation!: (error: Error) => void;
    const evaluationAbort = (): void =>
      rejectEvaluation(new Error("operationAborted"));
    signal.addEventListener("abort", evaluationAbort, { once: true });
    let value: unknown;
    try {
      value = await new Promise<unknown>((resolve, reject) => {
        rejectEvaluation = reject;
        const onClose = (): void => {
          cleanup();
          reject(new Error("desktopDisconnected"));
        };
        const onMessage = (event: MessageEvent): void => {
          try {
            if (
              typeof event.data !== "string" ||
              Buffer.byteLength(event.data, "utf8") > MAX_EVALUATION_BYTES
            ) {
              throw new Error("desktopProtocolFailed");
            }
            const message = JSON.parse(event.data) as Record<string, unknown>;
            if (message.id !== 1) return;
            cleanup();
            const result = message.result as
              | { result?: { value?: unknown }; exceptionDetails?: unknown }
              | undefined;
            if (!result || result.exceptionDetails) {
              reject(new Error("desktopEvaluationFailed"));
            } else {
              resolve(result.result?.value);
            }
          } catch {
            cleanup();
            reject(new Error("desktopProtocolFailed"));
          }
        };
        const cleanup = (): void => {
          socket.removeEventListener("close", onClose);
          socket.removeEventListener("message", onMessage);
        };
        socket.addEventListener("close", onClose);
        socket.addEventListener("message", onMessage);
      });
    } finally {
      signal.removeEventListener("abort", evaluationAbort);
    }
    return value;
  } finally {
    signal.removeEventListener("abort", abort);
    socket.close();
  }
}

function extractControlId(command: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)--sandalphon-control-id=(${CONTROL_ID_PATTERN})(?:\\s|$)`,
    "u",
  ).exec(command);
  return match?.[1];
}

function isNormalCommand(command: string): boolean {
  return command === MACOS_CODEX_EXECUTABLE_PATH;
}

function isExitCode(error: unknown, code: number): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as NodeJS.ErrnoException & { code?: number }).code === code
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}

function processEnvironmentWithCLocale(): NodeJS.ProcessEnv {
  return { ...process.env, LC_ALL: "C" };
}
