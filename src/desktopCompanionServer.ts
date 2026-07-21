import { chmod, lstat, mkdir, realpath, unlink } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { join } from "node:path";
import { TextDecoder } from "node:util";

import {
  DESKTOP_COMPANION_PROTOCOL_VERSION,
  handleDesktopCompanionRequest,
  parseDesktopCompanionRequest,
  type DesktopCompanionSupervisor,
} from "./desktopCompanion.js";

export const DESKTOP_COMPANION_SOCKET_NAME = "desktop-companion.sock";
export const DESKTOP_COMPANION_MAX_LINE_BYTES = 4096;
export const DESKTOP_COMPANION_MAX_SOCKET_PATH_BYTES = 103;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export interface DesktopCompanionServer {
  readonly socketPath: string;
  close(): Promise<void>;
}

export async function listenDesktopCompanion(
  runtimeDirectory: string,
  supervisor: DesktopCompanionSupervisor,
): Promise<DesktopCompanionServer> {
  const resolvedRuntimeDirectory =
    await ensureSecureRuntimeDirectory(runtimeDirectory);
  const socketPath = join(
    resolvedRuntimeDirectory,
    DESKTOP_COMPANION_SOCKET_NAME,
  );
  if (
    Buffer.byteLength(socketPath, "utf8") >
    DESKTOP_COMPANION_MAX_SOCKET_PATH_BYTES
  ) {
    throw new Error("socketPathTooLong");
  }
  await removeStaleOwnedSocket(socketPath);
  const server = createServer((socket) => serveConnection(socket, supervisor));
  server.maxConnections = 8;
  try {
    await listen(server, socketPath);
    await chmod(socketPath, 0o600);
  } catch (error) {
    server.close();
    throw error;
  }
  const socketIdentity = await lstat(socketPath);
  return {
    socketPath,
    close: async () => {
      await close(server);
      const current = await lstat(socketPath).catch(() => undefined);
      if (current?.isSocket() && current.ino === socketIdentity.ino) {
        await unlink(socketPath);
      }
    },
  };
}

export async function ensureSecureRuntimeDirectory(
  runtimeDirectory: string,
): Promise<string> {
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  const [resolved, status] = await Promise.all([
    realpath(runtimeDirectory),
    lstat(runtimeDirectory),
  ]);
  const expectedUid = process.getuid?.();
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    (expectedUid !== undefined && status.uid !== expectedUid) ||
    (status.mode & 0o077) !== 0
  ) {
    throw new Error("unsafeRuntimeDirectory");
  }
  return resolved;
}

async function removeStaleOwnedSocket(socketPath: string): Promise<void> {
  const before = await lstat(socketPath).catch(() => undefined);
  if (!before) return;
  if (!before.isSocket()) throw new Error("socketPathOccupied");
  if (await socketAcceptsConnections(socketPath)) {
    throw new Error("companionAlreadyRunning");
  }
  const after = await lstat(socketPath).catch(() => undefined);
  if (!after || !after.isSocket() || after.ino !== before.ino) {
    throw new Error("socketPathChanged");
  }
  await unlink(socketPath);
}

function socketAcceptsConnections(socketPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        resolve(false);
      } else {
        reject(error);
      }
    });
  });
}

function serveConnection(
  socket: Socket,
  supervisor: DesktopCompanionSupervisor,
): void {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    if (buffer.length + chunk.length > DESKTOP_COMPANION_MAX_LINE_BYTES + 1) {
      writeProtocolError(socket);
      return;
    }
    buffer = Buffer.concat([buffer, chunk]);
    const newline = buffer.indexOf(0x0a);
    if (newline < 0) return;
    if (
      newline === 0 ||
      newline > DESKTOP_COMPANION_MAX_LINE_BYTES ||
      newline !== buffer.length - 1
    ) {
      writeProtocolError(socket);
      return;
    }
    const line = buffer.subarray(0, newline);
    buffer = Buffer.alloc(0);
    void processLine(socket, supervisor, line);
  });
  socket.on("error", () => undefined);
}

async function processLine(
  socket: Socket,
  supervisor: DesktopCompanionSupervisor,
  line: Buffer,
): Promise<void> {
  if (line.length === 0 || line.length > DESKTOP_COMPANION_MAX_LINE_BYTES) {
    writeProtocolError(socket);
    return;
  }
  try {
    const request = parseDesktopCompanionRequest(
      JSON.parse(UTF8_DECODER.decode(line)) as unknown,
    );
    const response = await handleDesktopCompanionRequest(supervisor, request);
    socket.end(`${JSON.stringify(response)}\n`);
  } catch {
    writeProtocolError(socket);
  }
}

function writeProtocolError(socket: Socket): void {
  if (socket.destroyed) return;
  socket.end(
    `${JSON.stringify({
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "invalid",
      ok: false,
      error: "invalidRequest",
    })}\n`,
  );
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
