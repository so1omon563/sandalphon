import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LIMINAL_SIGNAL_COLORS,
  LIMINAL_SIGNAL_STATE_ACCENTS,
  renderPlusKey,
} from "../src/plusVisual.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const tokens = JSON.parse(
  readFileSync(`${repositoryRoot}/artwork/visual-language.json`, "utf8"),
) as {
  colors: typeof LIMINAL_SIGNAL_COLORS;
  states: Record<string, { accent: string }>;
};

describe("Stream Deck + live visuals", () => {
  it("stays aligned with the authoritative Liminal Signal tokens", () => {
    expect(LIMINAL_SIGNAL_COLORS).toEqual(tokens.colors);
    expect(LIMINAL_SIGNAL_STATE_ACCENTS).toEqual({
      idle: tokens.states.idle?.accent,
      working: tokens.states.working?.accent,
      waiting: tokens.states.waiting?.accent,
      completed: tokens.states.completed?.accent,
      failed: tokens.states.failed?.accent,
      unavailable: tokens.states.unavailable?.accent,
    });
  });

  it("renders bounded, escaped, state-distinct key SVG", () => {
    const completed = renderPlusKey({
      index: 0,
      label: "Approve & continue",
      enabled: true,
      state: "completed",
    });
    expect(completed).toMatch(/^data:image\/svg\+xml;base64,/);
    const completedSvg = decodeSvg(completed);
    expect(completedSvg).toContain("#72E6A5");
    expect(completedSvg).toContain("Approve &amp;");
    expect(completedSvg).toContain("continue");
    expect(completedSvg).toContain("source=artwork/visual-language.json");

    const disabled = renderPlusKey({
      index: 1,
      label: "Unavailable",
      enabled: false,
      state: "unavailable",
    });
    const disabledSvg = decodeSvg(disabled);
    expect(disabledSvg).toContain('opacity="0.52"');
    expect(disabledSvg).toContain("#A7B0C0");
  });
});

function decodeSvg(dataUrl: string): string {
  return Buffer.from(dataUrl.split(",", 2)[1] ?? "", "base64").toString();
}
