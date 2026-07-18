import { describe, expect, it } from "vitest";

import { FOUNDATION_VIEW } from "../src/foundation.js";

describe("foundation view", () => {
  it("identifies the bootstrap as ready without claiming agent integration", () => {
    expect(FOUNDATION_VIEW).toEqual({
      title: "Foundation\nReady",
      logMessage: "Sandalphon plugin foundation is ready.",
    });
  });

  it("is immutable", () => {
    expect(Object.isFrozen(FOUNDATION_VIEW)).toBe(true);
  });
});
