import { describe, expect, it } from "vitest";

import { discoverCandidatePaths } from "../src/codex/appServer.js";

describe("Codex app-server runtime", () => {
  it("discovers deterministic absolute ordinary CLI candidates", () => {
    expect(discoverCandidatePaths("/custom/bin:/opt/homebrew/bin")).toEqual([
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "/custom/bin/codex",
    ]);
    expect(discoverCandidatePaths(undefined)).toEqual([
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
    ]);
  });
});
