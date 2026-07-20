import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type VisualState = {
  accent: string;
  glyph: string;
  label: string;
};

type VisualLanguage = {
  schemaVersion: number;
  license: string;
  provenance: string;
  colors: {
    canvas: string;
    surface: string;
    text: string;
    mutedText: string;
    focus: string;
  };
  stateOrder: string[];
  states: Record<string, VisualState>;
  actionIconOrder: string[];
  actionIcons: Record<string, VisualState>;
  typography: {
    key: { maxCharactersPerLine: number; maxLines: number };
    touch: { maxCharacters: number };
  };
  geometry: {
    key: { width: number; height: number; safeInset: number };
    touchQuarter: { width: number; height: number; safeInset: number };
  };
  motion: {
    animatedAssets: boolean;
    looping: boolean;
    attentionTreatment: string;
  };
};

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const language = JSON.parse(
  readFileSync(`${repositoryRoot}/artwork/visual-language.json`, "utf8"),
) as VisualLanguage;
const primaryStates = [
  "unavailable",
  "waiting",
  "working",
  "failed",
  "completed",
  "idle",
];

describe("visual language", () => {
  it("covers every domain primary state exactly once", () => {
    expect(language.schemaVersion).toBe(1);
    expect([...language.stateOrder].sort()).toEqual([...primaryStates].sort());
    expect(Object.keys(language.states).sort()).toEqual(
      [...primaryStates].sort(),
    );
  });

  it("uses original MIT-licensed assets with unique non-color signals", () => {
    expect(language.license).toBe("MIT");
    expect(language.provenance).toBe("repository-authored");
    expect(
      new Set(Object.values(language.states).map(({ glyph }) => glyph)),
    ).toHaveLength(primaryStates.length);
    expect(
      new Set(Object.values(language.states).map(({ label }) => label)),
    ).toHaveLength(primaryStates.length);
  });

  it("defines bounded action iconography for at-a-glance controls", () => {
    expect(language.actionIconOrder).toHaveLength(20);
    expect(Object.keys(language.actionIcons)).toEqual(language.actionIconOrder);
    expect(
      new Set(Object.values(language.actionIcons).map(({ glyph }) => glyph)),
    ).toHaveLength(20);
    for (const { label } of Object.values(language.actionIcons)) {
      expect(label.length).toBeLessThanOrEqual(
        language.typography.key.maxCharactersPerLine,
      );
    }
  });

  it("meets conservative small-display contrast targets", () => {
    for (const background of [
      language.colors.canvas,
      language.colors.surface,
    ]) {
      expect(contrast(language.colors.text, background)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast(language.colors.mutedText, background),
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const state of Object.values(language.states)) {
      expect(
        contrast(state.accent, language.colors.canvas),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(state.accent, language.colors.surface),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sets bounded labels for the two reference surfaces", () => {
    expect(language.geometry.key).toMatchObject({ width: 144, height: 144 });
    expect(language.geometry.touchQuarter).toMatchObject({
      width: 200,
      height: 100,
    });
    expect(language.geometry.key.safeInset).toBeGreaterThanOrEqual(12);
    expect(language.geometry.touchQuarter.safeInset).toBeGreaterThanOrEqual(12);
    expect(language.typography.key.maxLines).toBeLessThanOrEqual(2);
    for (const { label } of Object.values(language.states)) {
      expect(label.length).toBeLessThanOrEqual(
        language.typography.key.maxCharactersPerLine,
      );
      expect(label.length).toBeLessThanOrEqual(
        language.typography.touch.maxCharacters,
      );
    }
  });

  it("keeps first-version attention static and non-looping", () => {
    expect(language.motion).toMatchObject({
      animatedAssets: false,
      looping: false,
      attentionTreatment: "static-accent-and-glyph",
    });
  });
});

function contrast(foreground: string, background: string): number {
  const bright = relativeLuminance(foreground);
  const dark = relativeLuminance(background);
  return (Math.max(bright, dark) + 0.05) / (Math.min(bright, dark) + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/u.exec(hex);
  if (!channels) throw new Error(`Invalid color: ${hex}`);
  const [red, green, blue] = channels.slice(1).map((value) => {
    const component = Number.parseInt(value ?? "", 16) / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}
