import { describe, expect, it } from "vitest";

import {
  isDesktopBundledCodex,
  isSupportedCodexVersion,
  parseSettings,
  selectCodexBinary,
} from "../src/codex/configuration.js";

describe("Codex configuration", () => {
  it("uses a versioned empty configuration without overwriting newer data", () => {
    expect(parseSettings({})).toEqual({
      status: "missing",
      settings: { schemaVersion: 3 },
    });
    expect(parseSettings(null)).toEqual({
      status: "missing",
      settings: { schemaVersion: 3 },
    });
    expect(parseSettings({ schemaVersion: 4, future: true })).toEqual({
      status: "future",
      reason: "newerSettings",
    });
  });

  it("accepts only the current settings shape", () => {
    expect(
      parseSettings({
        schemaVersion: 3,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
      }),
    ).toEqual({
      status: "ready",
      settings: {
        schemaVersion: 3,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
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
        schemaVersion: 3,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
      },
    });
    expect(
      parseSettings({
        schemaVersion: 2,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
        desktopControl: { enabled: true },
      }),
    ).toEqual({
      status: "migrated",
      settings: {
        schemaVersion: 3,
        codexBinaryPath: "/opt/homebrew/bin/codex",
        selectedThreadId: "thread-1",
      },
    });
    expect(parseSettings([])).toMatchObject({ status: "invalid" });
    expect(parseSettings({ schemaVersion: 0 })).toMatchObject({
      status: "invalid",
    });
    expect(
      parseSettings({ schemaVersion: 3, codexBinaryPath: "" }),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseSettings({ schemaVersion: 3, selectedThreadId: 1 }),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseSettings({ schemaVersion: 2, desktopControl: { enabled: "yes" } }),
    ).toMatchObject({ status: "invalid" });
  });

  it("selects a compatible ordinary CLI", () => {
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
    ).toEqual({
      status: "ready",
      path: "/opt/homebrew/bin/codex",
      version: "0.145.0",
    });
    expect(
      selectCodexBinary([
        {
          path: "/opt/homebrew/bin/codex",
          version: "0.144.0",
          executable: true,
        },
      ]),
    ).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
    expect(
      selectCodexBinary([
        {
          path: "/opt/homebrew/bin/codex",
          version: "1.0.0",
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

  it("accepts compatible pre-1.0 updates without accepting malformed versions", () => {
    expect(isSupportedCodexVersion("0.144.1")).toBe(true);
    expect(isSupportedCodexVersion("0.144.2")).toBe(true);
    expect(isSupportedCodexVersion("0.145.0")).toBe(true);
    expect(isSupportedCodexVersion("0.144.0")).toBe(false);
    expect(isSupportedCodexVersion("1.0.0")).toBe(false);
    expect(isSupportedCodexVersion("0.145")).toBe(false);
    expect(isSupportedCodexVersion("0.145.0-beta.1")).toBe(false);
  });
});
