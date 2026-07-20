import { describe, expect, it } from "vitest";

import {
  isDesktopBundledCodex,
  parseSettings,
  selectCodexBinary,
} from "../src/codex/configuration.js";

describe("Codex configuration", () => {
  it("uses a versioned empty configuration without overwriting newer data", () => {
    expect(parseSettings({})).toEqual({
      status: "missing",
      settings: { schemaVersion: 2 },
    });
    expect(parseSettings(null)).toEqual({
      status: "missing",
      settings: { schemaVersion: 2 },
    });
    expect(parseSettings({ schemaVersion: 3, future: true })).toEqual({
      status: "future",
      reason: "newerSettings",
    });
  });

  it("accepts only the current settings shape", () => {
    expect(
      parseSettings({
        schemaVersion: 2,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
        desktopControl: { enabled: true },
      }),
    ).toEqual({
      status: "ready",
      settings: {
        schemaVersion: 2,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
        desktopControl: { enabled: true },
      },
    });
    expect(
      parseSettings({
        schemaVersion: 1,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
      }),
    ).toEqual({
      status: "migrated",
      settings: {
        schemaVersion: 2,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
      },
    });
    expect(parseSettings([])).toMatchObject({ status: "invalid" });
    expect(parseSettings({ schemaVersion: 0 })).toMatchObject({
      status: "invalid",
    });
    expect(
      parseSettings({ schemaVersion: 2, codexBinaryPath: "" }),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseSettings({ schemaVersion: 2, selectedThreadId: 1 }),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseSettings({ schemaVersion: 2, desktopControl: { enabled: "yes" } }),
    ).toMatchObject({ status: "invalid" });
  });

  it("selects only the supported ordinary CLI", () => {
    expect(
      selectCodexBinary([
        {
          path: "/Applications/ChatGPT.app/Contents/Resources/codex",
          version: "0.144.1",
          executable: true,
        },
        {
          path: "/opt/homebrew/bin/codex",
          version: "0.144.1",
          executable: true,
        },
      ]),
    ).toEqual({
      status: "ready",
      path: "/opt/homebrew/bin/codex",
      version: "0.144.1",
    });
    expect(
      selectCodexBinary([
        {
          path: "/opt/homebrew/bin/codex",
          version: "0.145.0",
          executable: true,
        },
      ]),
    ).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
    expect(
      selectCodexBinary([
        { path: "/opt/homebrew/bin/codex", executable: false },
      ]),
    ).toEqual({ status: "unavailable", reason: "missingBinary" });
    expect(isDesktopBundledCodex("/ordinary/codex")).toBe(false);
  });
});
