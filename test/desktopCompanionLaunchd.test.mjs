import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout } from "node:timers";
import { describe, expect, it } from "vitest";

import {
  DESKTOP_COMPANION_LAUNCH_AGENT_LABEL,
  companionPaths,
  parseManagementArguments,
  renderLaunchAgentPlist,
  requestCompanion,
  summarizeSnapshot,
} from "../scripts/manage-desktop-companion.mjs";

describe("desktop companion launchd management", () => {
  it("renders one owner-only, always-supervised Aqua LaunchAgent", () => {
    const plist = renderLaunchAgentPlist({
      nodePath: "/opt/node/bin/node",
      companionPath: "/Users/example/A & B/desktop-companion.mjs",
      runtimeDirectory: "/private/tmp/dev.so1omon.sandalphon-501",
    });
    expect(plist).toContain(
      `<string>${DESKTOP_COMPANION_LAUNCH_AGENT_LABEL}</string>`,
    );
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<integer>63</integer>");
    expect(plist).toContain("<string>Aqua</string>");
    expect(plist).toContain(
      "<string>/Users/example/A &amp; B/desktop-companion.mjs</string>",
    );
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
  });

  it("rejects relative or control-bearing launch paths", () => {
    for (const invalid of ["relative", "/tmp/bad\npath", ""]) {
      expect(() =>
        renderLaunchAgentPlist({
          nodePath: invalid,
          companionPath: "/absolute/companion.mjs",
          runtimeDirectory: "/private/tmp/runtime",
        }),
      ).toThrow("invalidLaunchAgentPath");
    }
  });

  it("derives stable current-user paths without the long macOS TMPDIR", () => {
    expect(companionPaths({ home: "/Users/example", uid: 501 })).toMatchObject({
      runtimeDirectory: "/private/tmp/dev.so1omon.sandalphon-501",
      socketPath:
        "/private/tmp/dev.so1omon.sandalphon-501/desktop-companion.sock",
      launchAgent:
        "/Users/example/Library/LaunchAgents/dev.so1omon.sandalphon.desktop-companion.plist",
    });
  });

  it("accepts only the bounded management commands", () => {
    for (const command of [
      "install",
      "uninstall",
      "status",
      "start",
      "stop",
      "recover",
    ]) {
      expect(parseManagementArguments([command])).toBe(command);
    }
    expect(() => parseManagementArguments([])).toThrow("invalidArguments");
    expect(() => parseManagementArguments(["start", "extra"])).toThrow(
      "invalidArguments",
    );
  });

  it("summarizes lifecycle state without exposing task identifiers", () => {
    const summary = summarizeSnapshot({
      lifecycle: "ready",
      sequence: 4,
      desktop: {
        availability: "ready",
        targets: [
          { id: "private-one", selected: true },
          { id: "private-two", selected: false },
        ],
      },
    });
    expect(summary).toEqual({
      lifecycle: "ready",
      sequence: 4,
      desktop: { availability: "ready", taskCount: 2 },
    });
    expect(JSON.stringify(summary)).not.toContain("private-one");
  });

  it("keeps the one-request connection open for an asynchronous response", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sandalphon-manager-"));
    const socketPath = join(directory, "companion.sock");
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString("utf8"));
        setTimeout(() => {
          socket.end(
            `${JSON.stringify({
              protocolVersion: 1,
              requestId: request.requestId,
              ok: true,
              snapshot: {
                lifecycle: "stopped",
                sequence: 1,
                desktop: {
                  availability: "unavailable",
                  reason: "disconnected",
                  targets: [],
                },
              },
            })}\n`,
          );
        }, 5);
      });
    });
    try {
      server.listen(socketPath);
      await once(server, "listening");
      await expect(
        requestCompanion(socketPath, "status"),
      ).resolves.toMatchObject({
        lifecycle: "stopped",
        sequence: 1,
      });
    } finally {
      server.close();
      await once(server, "close");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
