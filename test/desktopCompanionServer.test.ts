import { chmod, lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_COMPANION_PROTOCOL_VERSION,
  DesktopCompanionSupervisor,
  type DesktopCompanionDriver,
} from "../src/desktopCompanion.js";
import {
  DESKTOP_COMPANION_MAX_LINE_BYTES,
  DESKTOP_COMPANION_MAX_SOCKET_PATH_BYTES,
  ensureSecureRuntimeDirectory,
  listenDesktopCompanion,
} from "../src/desktopCompanionServer.js";
import type {
  DesktopControlObservation,
  DesktopControlPolicy,
} from "../src/desktopControlContract.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

const policy: DesktopControlPolicy = {
  enabled: true,
  allowedContractRevisions: [1],
};

const observation: DesktopControlObservation = {
  connected: true,
  endpointHost: "127.0.0.1",
  epoch: 1,
  revision: 1,
  contractRevision: 1,
  version: { application: "app", engine: "engine", protocol: "protocol" },
  capabilities: ["task.list", "task.select"],
  targets: [{ id: "opaque", selected: true }],
};

class ServerDriver implements DesktopCompanionDriver {
  startControlled(): Promise<DesktopControlObservation> {
    return Promise.resolve(observation);
  }
  reconcileControlled(): Promise<{ readonly kind: "normal" }> {
    return Promise.resolve({ kind: "normal" });
  }
  cleanupControlled(): Promise<void> {
    return Promise.resolve();
  }
}

class BlockingServerDriver implements DesktopCompanionDriver {
  cleanupCount = 0;
  startCount = 0;
  readonly started: Promise<void>;
  #markStarted!: () => void;
  #releaseStart!: (observation: DesktopControlObservation) => void;

  constructor() {
    this.started = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
  }

  startControlled(): Promise<DesktopControlObservation> {
    this.startCount += 1;
    this.#markStarted();
    return new Promise((resolve) => {
      this.#releaseStart = resolve;
    });
  }

  reconcileControlled(): Promise<{ readonly kind: "normal" }> {
    return Promise.resolve({ kind: "normal" });
  }

  cleanupControlled(): Promise<void> {
    this.cleanupCount += 1;
    return Promise.resolve();
  }

  releaseStart(): void {
    this.#releaseStart(observation);
  }
}

describe("desktop companion local IPC", () => {
  it("creates a same-user-only socket and survives client disconnect", async () => {
    const runtime = await createRuntime();
    const supervisor = new DesktopCompanionSupervisor(
      new ServerDriver(),
      policy,
    );
    const server = await listenDesktopCompanion(runtime, supervisor);
    expect((await lstat(server.socketPath)).mode & 0o777).toBe(0o600);

    const recovery = await request(server.socketPath, {
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "recover-1",
      method: "recover",
    });
    expect(recovery).toMatchObject({
      ok: true,
      snapshot: { lifecycle: "stopped" },
    });

    const first = await request(server.socketPath, {
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "start-2",
      method: "start",
    });
    expect(first).toMatchObject({
      ok: true,
      snapshot: { lifecycle: "ready" },
    });

    const second = await request(server.socketPath, {
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "status-3",
      method: "status",
    });
    expect(second).toMatchObject({
      ok: true,
      snapshot: { lifecycle: "ready" },
    });
    await server.close();
    await expect(lstat(server.socketPath)).rejects.toThrow();
  });

  it("executes only the first request sent across socket data events", async () => {
    const runtime = await createRuntime();
    const driver = new BlockingServerDriver();
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    const server = await listenDesktopCompanion(runtime, supervisor);
    let requestSocket!: Socket;
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = createConnection(server.socketPath);
      requestSocket = socket;
      let body = "";
      socket.setEncoding("utf8");
      socket.once("connect", () => {
        socket.write(
          `${JSON.stringify({
            protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
            requestId: "start-only",
            method: "start",
          })}\n`,
        );
      });
      socket.on("data", (chunk: string) => {
        body += chunk;
      });
      socket.once("end", () => {
        resolve(JSON.parse(body.trim()) as Record<string, unknown>);
      });
      socket.once("error", reject);
    });
    await driver.started;
    requestSocket.write(
      `${JSON.stringify({
        protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
        requestId: "stop-ignored",
        method: "stop",
      })}\n`,
    );

    driver.releaseStart();
    expect(await response).toMatchObject({
      requestId: "start-only",
      snapshot: { lifecycle: "ready" },
    });
    expect(driver.startCount).toBe(1);
    expect(driver.cleanupCount).toBe(0);
    await server.close();
  });

  it("closes idle partial-request sockets during shutdown", async () => {
    const runtime = await createRuntime();
    const server = await listenDesktopCompanion(
      runtime,
      new DesktopCompanionSupervisor(new ServerDriver(), policy),
    );
    const socket = createConnection(server.socketPath);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => {
        socket.write('{"protocolVersion":1');
        resolve();
      });
      socket.once("error", reject);
    });
    const disconnected = new Promise<void>((resolve) =>
      socket.once("close", () => resolve()),
    );

    await server.close();

    await disconnected;
    expect(socket.destroyed).toBe(true);
    await expect(lstat(server.socketPath)).rejects.toThrow();
  });

  it("rejects unsafe runtime directories and occupied socket paths", async () => {
    const runtime = await createRuntime();
    await chmod(runtime, 0o755);
    await expect(ensureSecureRuntimeDirectory(runtime)).rejects.toThrow(
      "unsafeRuntimeDirectory",
    );
    await chmod(runtime, 0o700);
    await writeFile(join(runtime, "desktop-companion.sock"), "occupied");
    await expect(
      listenDesktopCompanion(
        runtime,
        new DesktopCompanionSupervisor(new ServerDriver(), policy),
      ),
    ).rejects.toThrow("socketPathOccupied");

    const longRuntime = join(
      runtime,
      "x".repeat(DESKTOP_COMPANION_MAX_SOCKET_PATH_BYTES),
    );
    await expect(
      listenDesktopCompanion(
        longRuntime,
        new DesktopCompanionSupervisor(new ServerDriver(), policy),
      ),
    ).rejects.toThrow("socketPathTooLong");
  });

  it("bounds and closes malformed request streams", async () => {
    const runtime = await createRuntime();
    const server = await listenDesktopCompanion(
      runtime,
      new DesktopCompanionSupervisor(new ServerDriver(), policy),
    );
    const response = await requestRaw(
      server.socketPath,
      `${"x".repeat(DESKTOP_COMPANION_MAX_LINE_BYTES + 1)}\n`,
    );
    expect(response).toMatchObject({
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "invalid",
      ok: false,
      error: "invalidRequest",
    });
    const invalidUtf8 = await requestRaw(
      server.socketPath,
      Buffer.from([0xc3, 0x28, 0x0a]),
    );
    expect(invalidUtf8).toMatchObject({
      requestId: "invalid",
      ok: false,
      error: "invalidRequest",
    });
    await server.close();
  });
});

async function createRuntime(): Promise<string> {
  const root = await mkdtemp("/private/tmp/sandalphon-companion-test-");
  roots.push(root);
  await chmod(root, 0o700);
  return root;
}

function request(
  socketPath: string,
  value: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return requestRaw(socketPath, `${JSON.stringify(value)}\n`);
}

function requestRaw(
  socketPath: string,
  value: string | Buffer,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(value));
    socket.on("data", (chunk: string) => {
      response += chunk;
      const newline = response.indexOf("\n");
      if (newline >= 0) {
        socket.destroy();
        resolve(
          JSON.parse(response.slice(0, newline)) as Record<string, unknown>,
        );
      }
    });
    socket.once("error", reject);
  });
}
