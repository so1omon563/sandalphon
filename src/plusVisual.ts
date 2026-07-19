import { Buffer } from "node:buffer";

import type { PrimaryState } from "./domain/model.js";
import type { PlusKeyView } from "./plusMvp.js";
import { compactLabel } from "./plusMvp.js";

export const LIMINAL_SIGNAL_COLORS = {
  canvas: "#090D1C",
  surface: "#172348",
  text: "#F5FBFF",
  mutedText: "#C4CEE0",
  focus: "#9A87FF",
} as const;

export const LIMINAL_SIGNAL_STATE_ACCENTS: Record<PrimaryState, string> = {
  idle: "#8AA7FF",
  working: "#72E2F1",
  waiting: "#FFD166",
  completed: "#72E6A5",
  failed: "#FF7B72",
  unavailable: "#A7B0C0",
};

export function renderPlusKey(view: PlusKeyView): string {
  const label = compactLabel(view.label, 24);
  const lines = splitLabel(label);
  const accent = LIMINAL_SIGNAL_STATE_ACCENTS[view.state];
  const opacity = view.enabled ? 1 : 0.52;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="18" fill="${LIMINAL_SIGNAL_COLORS.canvas}"/>
  <rect x="8" y="8" width="128" height="128" rx="14" fill="${LIMINAL_SIGNAL_COLORS.surface}" opacity="${opacity}"/>
  <rect x="8" y="8" width="8" height="128" rx="4" fill="${accent}" opacity="${opacity}"/>
  ${stateGlyph(view.state, accent, opacity)}
  <text x="72" y="${lines.length === 1 ? 116 : 105}" fill="${LIMINAL_SIGNAL_COLORS.text}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle" opacity="${opacity}">${escapeXml(lines[0] ?? "")}</text>
  ${lines[1] ? `<text x="72" y="126" fill="${LIMINAL_SIGNAL_COLORS.text}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle" opacity="${opacity}">${escapeXml(lines[1])}</text>` : ""}
  <metadata>source=artwork/visual-language.json; license=MIT</metadata>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function splitLabel(label: string): readonly string[] {
  if (label.length <= 12) return [label];
  const words = label.split(" ");
  if (words.length > 1) {
    let first = "";
    let second = "";
    for (const word of words) {
      const target = first.length + word.length + (first ? 1 : 0) <= 12;
      if (target) first = `${first}${first ? " " : ""}${word}`;
      else if (second.length + word.length + (second ? 1 : 0) <= 12) {
        second = `${second}${second ? " " : ""}${word}`;
      }
    }
    if (first && second) return [first, second];
  }
  return [label.slice(0, 12), label.slice(12, 24)];
}

function stateGlyph(
  state: PrimaryState,
  accent: string,
  opacity: number,
): string {
  const common = `fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"`;
  switch (state) {
    case "idle":
      return `<g ${common}><circle cx="72" cy="53" r="18"/><path d="M63 53h18"/></g>`;
    case "working":
      return `<g ${common}><path d="M48 43h32l-9-9M96 63H64l9 9"/></g>`;
    case "waiting":
      return `<g ${common}><path d="M62 34v38M82 34v38"/></g>`;
    case "completed":
      return `<g ${common}><path d="M49 53l14 15 31-34"/></g>`;
    case "failed":
      return `<g ${common}><path d="M55 36l34 34M89 36L55 70"/></g>`;
    case "unavailable":
      return `<g ${common}><circle cx="72" cy="53" r="22"/><path d="M57 68l30-30"/></g>`;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
