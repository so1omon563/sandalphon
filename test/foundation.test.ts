import { describe, expect, it } from "vitest";

import { FOUNDATION_VIEW } from "../src/foundation.js";

describe("foundation view", () => {
  it("identifies the bootstrap as ready without claiming agent integration", () => {
    expect(FOUNDATION_VIEW).toEqual({
      title: "Enter\nSandalphon",
      logMessage: "Sandalphon is ready to open its managed profile.",
    });
  });

  it("is immutable", () => {
    expect(Object.isFrozen(FOUNDATION_VIEW)).toBe(true);
  });
});
