import { describe, expect, it } from "vitest";

import { hasAnnotatedTag, parseTagRefs } from "../scripts/release-evidence.mjs";

describe("release evidence", () => {
  it("distinguishes annotated tags from lightweight tags", () => {
    const tags = parseTagRefs("v0.1.0\tcommit\nv0.2.0\ttag\n");

    expect(tags).toEqual([
      { name: "v0.1.0", objectType: "commit" },
      { name: "v0.2.0", objectType: "tag" },
    ]);
    expect(hasAnnotatedTag(tags, "v0.1.0")).toBe(false);
    expect(hasAnnotatedTag(tags, "v0.2.0")).toBe(true);
  });
});
