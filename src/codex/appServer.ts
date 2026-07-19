import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { promisify, TextDecoder } from "node:util";

import {
  selectCodexBinary,
  type BinaryCandidate,
  type BinarySelection,
} from "./configuration.js";
import {
  JsonRpcPeer,
  MAX_APP_SERVER_LINE_LENGTH,
  type RequestId,
} from "./jsonRpc.js";

const execFileAsync = promisify(execFile);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export interface CodexThreadSummary {
  readonly id: string;
  readonly preview: string;
  readonly name: string | null;
  readonly cwd: string;
  readonly updatedAt: number;
  readonly recencyAt: number | null;
  readonly status:
    | { readonly type: "notLoaded" | "idle" | "systemError" }
    | {
        readonly type: "active";
        readonly activeFlags: readonly (
          "waitingOnApproval" | "waitingOnUserInput"
        )[];
      };
}

export interface CodexThreadList {
  readonly data: readonly CodexThreadSummary[];
  readonly nextCursor: string | null;
}

export interface CodexResumeResult {
  readonly thread: CodexThreadSummary;
  readonly reasoningEffort: string | null;
}

export interface CodexServerMessage {
  readonly id?: RequestId;
  readonly method: string;
  readonly params?: unknown;
}

export interface CodexConnection {
  request<T>(method: string, params: unknown): Promise<T>;
  notify(method: string): void;
  respond(id: RequestId, result: unknown): void;
  onMessage(listener: (message: CodexServerMessage) => void): () => void;
  onClose(listener: () => void): () => void;
  close(): void;
}

export interface CodexRuntime {
  selectBinary(configuredPath?: string): Promise<BinarySelection>;
  connect(binaryPath: string): Promise<CodexConnection>;
}

export class LocalCodexRuntime implements CodexRuntime {
  async selectBinary(configuredPath?: string): Promise<BinarySelection> {
    const paths = configuredPath
      ? [configuredPath]
      : discoverCandidatePaths(process.env.PATH);
    const candidates = await Promise.all(paths.map(probeBinary));
    return selectCodexBinary(candidates);
  }

  async connect(binaryPath: string): Promise<CodexConnection> {
    if (!isAbsolute(binaryPath)) throw new Error("codexBinaryMustBeAbsolute");
    const { spawn } = await import("node:child_process");
    const child = spawn(binaryPath, ["app-server"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const listeners = new Set<(message: CodexServerMessage) => void>();
    const closeListeners = new Set<() => void>();
    let closed = false;
    const peer = new JsonRpcPeer(
      (line) => child.stdin.write(line),
      (message) => {
        if (typeof message.method !== "string") return;
        const serverMessage = {
          ...(message.id !== undefined ? { id: message.id } : {}),
          method: message.method,
          ...(message.params !== undefined ? { params: message.params } : {}),
        };
        for (const listener of listeners) listener(serverMessage);
      },
    );
    const close = (error: Error) => {
      if (closed) return;
      closed = true;
      peer.close(error);
      for (const listener of closeListeners) listener();
    };
    let pendingBytes: Buffer = Buffer.alloc(0);
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        const decoded = decodeAppServerChunk(pendingBytes, chunk);
        pendingBytes = decoded.pending;
        for (const line of decoded.lines) {
          peer.receive(line);
          if (peer.closed) {
            throw new Error("appServerProtocolError");
          }
        }
      } catch (error) {
        close(
          error instanceof Error ? error : new Error("appServerProtocolError"),
        );
        child.kill();
      }
    });
    child.once("error", () => close(new Error("appServerUnavailable")));
    child.once("exit", () => close(new Error("appServerDisconnected")));

    const connection: CodexConnection = {
      request: <T>(method: string, params: unknown) =>
        peer.request<T>(method, params),
      notify: (method) => peer.notify(method),
      respond: (id, result) => peer.respond(id, result),
      onMessage: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onClose: (listener) => {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
      close: () => {
        close(new Error("appServerClosed"));
        child.kill();
      },
    };

    return initializeCodexConnection(connection);
  }
}

export interface DecodedAppServerChunk {
  readonly pending: Buffer;
  readonly lines: readonly string[];
}

export function decodeAppServerChunk(
  pending: Buffer,
  chunk: Buffer,
): DecodedAppServerChunk {
  const bytes = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
  const lines: string[] = [];
  let start = 0;
  let newline = bytes.indexOf(0x0a, start);
  while (newline >= 0) {
    const line = bytes.subarray(start, newline);
    if (line.length > MAX_APP_SERVER_LINE_LENGTH) {
      throw new Error("appServerLineTooLarge");
    }
    if (line.length > 0) {
      let decoded: string;
      try {
        decoded = UTF8_DECODER.decode(line);
      } catch {
        throw new Error("appServerInvalidMessage");
      }
      if (decoded.trim().length > 0) lines.push(decoded);
    }
    start = newline + 1;
    newline = bytes.indexOf(0x0a, start);
  }
  const remainder = bytes.subarray(start);
  if (remainder.length > MAX_APP_SERVER_LINE_LENGTH) {
    throw new Error("appServerLineTooLarge");
  }
  return { pending: Buffer.from(remainder), lines };
}

export async function initializeCodexConnection(
  connection: CodexConnection,
): Promise<CodexConnection> {
  try {
    await initialize(connection);
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function discoverCandidatePaths(
  pathValue: string | undefined,
): string[] {
  const pathCandidates = (pathValue ?? "")
    .split(delimiter)
    .filter((entry) => entry.length > 0)
    .map((entry) => join(entry, "codex"));
  return [
    ...new Set([
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      ...pathCandidates,
    ]),
  ];
}

async function probeBinary(path: string): Promise<BinaryCandidate> {
  if (!isAbsolute(path)) return { path, executable: false };
  try {
    await access(path, constants.X_OK);
    const { stdout } = await execFileAsync(path, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 4_096,
    });
    const match = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+)\s*$/.exec(stdout);
    return match?.[1]
      ? { path, version: match[1], executable: true }
      : { path, executable: false };
  } catch {
    return { path, executable: false };
  }
}

async function initialize(connection: CodexConnection): Promise<void> {
  await connection.request("initialize", {
    clientInfo: {
      name: "sandalphon",
      title: "Sandalphon",
      version: "0.0.1",
    },
    capabilities: {
      experimentalApi: false,
      requestAttestation: false,
      optOutNotificationMethods: [],
    },
  });
  connection.notify("initialized");
  const account = await connection.request<{
    readonly account: unknown;
    readonly requiresOpenaiAuth: boolean;
  }>("account/read", { refreshToken: false });
  if (account.requiresOpenaiAuth && account.account === null) {
    throw new Error("codexUnauthenticated");
  }
}
