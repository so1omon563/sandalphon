import { describe, expect, it } from "vitest";

import {
  defaultMacosDesktopCompanionRuntimeDirectory,
  parseDesktopCompanionMainArguments,
} from "../src/desktopCompanionMain.js";

describe("desktop companion executable boundary", () => {
  it("uses one short uid-bound runtime path", () => {
    expect(defaultMacosDesktopCompanionRuntimeDirectory(501)).toBe(
      "/private/tmp/dev.so1omon.sandalphon-501",
    );
    expect(() => defaultMacosDesktopCompanionRuntimeDirectory(-1)).toThrow(
      "invalidUid",
    );
  });

  it("accepts only the exact serve invocation and runtime directory", () => {
    const uid = process.getuid?.();
    if (uid === undefined) return;
    const runtime = defaultMacosDesktopCompanionRuntimeDirectory(uid);
    expect(
      parseDesktopCompanionMainArguments([
        "serve",
        "--runtime-directory",
        runtime,
      ]),
    ).toEqual({ runtimeDirectory: runtime });
    for (const invalid of [
      [],
      ["serve"],
      ["start", "--runtime-directory", runtime],
      ["serve", "--runtime-directory", "/tmp/foreign"],
      ["serve", "--runtime-directory", runtime, "extra"],
    ]) {
      expect(() => parseDesktopCompanionMainArguments(invalid)).toThrow();
    }
  });
});
