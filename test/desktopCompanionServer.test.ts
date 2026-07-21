import { chmod, lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
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
  allowedVersions: [
    { application: "app", engine: "engine", protocol: "protocol" },
  ],
};

const observation: DesktopControlObservation = {
  connected: true,
  endpointHost: "127.0.0.1",
  epoch: 1,
  revision: 1,
  version: policy.allowedVersions[0]!,
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

describe("desktop companion local IPC", () => {
  it("creates a same-user-only socket and survives client disconnect", async () => {
    const runtime = await createRuntime();
    const supervisor = new DesktopCompanionSupervisor(
      new ServerDriver(),
      policy,
    );
    const server = await listenDesktopCompanion(runtime, supervisor);
    expect((await lstat(server.socketPath)).mode & 0o777).toBe(0o600);

    const first = await request(server.socketPath, {
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "start-1",
      method: "start",
    });
    expect(first).toMatchObject({
      ok: true,
      snapshot: { lifecycle: "ready" },
    });

    const second = await request(server.socketPath, {
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "status-2",
      method: "status",
    });
    expect(second).toMatchObject({
      ok: true,
      snapshot: { lifecycle: "ready" },
    });
    await server.close();
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
