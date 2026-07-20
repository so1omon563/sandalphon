import { Buffer } from "node:buffer";

import type { PrimaryState } from "./domain/model.js";
import type { KeyIcon } from "./keyIcons.js";
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
  return renderManagedKey(view);
}

export function renderManagedKey(view: {
  readonly label: string;
  readonly lines?: readonly string[];
  readonly enabled: boolean;
  readonly state: PrimaryState;
  readonly icon?: KeyIcon;
}): string {
  if (!view.label.trim() && !view.lines?.some((line) => line.trim())) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="18" fill="${LIMINAL_SIGNAL_COLORS.canvas}"/>
  <metadata>source=artwork/visual-language.json; license=MIT; role=blank</metadata>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
  const lines = view.lines
    ? view.lines.slice(0, 2)
    : splitLabel(compactLabel(view.label, 24));
  const icon = view.icon ?? "state";
  const accent = iconAccent(icon, view.state);
  const opacity =
    view.enabled || icon === "state" || icon === "session" ? 1 : 0.52;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="18" fill="${LIMINAL_SIGNAL_COLORS.canvas}"/>
  <rect x="8" y="8" width="128" height="128" rx="14" fill="${LIMINAL_SIGNAL_COLORS.surface}" opacity="${opacity}"/>
  <rect x="8" y="8" width="8" height="128" rx="4" fill="${accent}" opacity="${opacity}"/>
  ${icon === "state" ? stateGlyph(view.state, accent, opacity) : actionGlyph(icon, accent, opacity)}
  <text x="72" y="${lines.length === 1 ? 116 : 105}" fill="${LIMINAL_SIGNAL_COLORS.text}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle" opacity="${opacity}">${escapeXml(lines[0] ?? "")}</text>
  ${lines[1] ? `<text x="72" y="126" fill="${LIMINAL_SIGNAL_COLORS.text}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle" opacity="${opacity}">${escapeXml(lines[1])}</text>` : ""}
  <metadata>source=artwork/visual-language.json; license=MIT</metadata>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function iconAccent(icon: KeyIcon, state: PrimaryState): string {
  if (icon === "state" || icon === "session")
    return LIMINAL_SIGNAL_STATE_ACCENTS[state];
  if (icon === "attention") return LIMINAL_SIGNAL_STATE_ACCENTS.waiting;
  if (icon === "cancel" || icon === "reject")
    return LIMINAL_SIGNAL_STATE_ACCENTS.failed;
  if (icon === "approve" || icon === "apply")
    return LIMINAL_SIGNAL_STATE_ACCENTS.completed;
  return LIMINAL_SIGNAL_COLORS.focus;
}

function actionGlyph(
  icon: Exclude<KeyIcon, "state">,
  accent: string,
  opacity: number,
): string {
  const common = `fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"`;
  switch (icon) {
    case "session":
      return `<g ${common}><rect x="49" y="32" width="46" height="42" rx="5"/><path d="M58 44h28M58 55h22M58 66h16"/></g>`;
    case "resume":
      return `<g ${common}><path d="M58 34l30 19-30 19z"/></g>`;
    case "inspect":
      return `<g ${common}><circle cx="67" cy="49" r="17"/><path d="M80 62l15 15"/></g>`;
    case "details":
      return `<g ${common}><path d="M57 38h30M57 53h30M57 68h22"/></g>`;
    case "exit":
      return `<g ${common}><path d="M54 31h23v44H54M68 53h28M86 43l10 10-10 10"/></g>`;
    case "attention":
      return `<g ${common}><path d="M54 65h36l-6-9V45a12 12 0 0 0-24 0v11zM68 74h8"/></g>`;
    case "review":
      return `<g ${common}><path d="M47 53s10-17 25-17 25 17 25 17-10 17-25 17-25-17-25-17z"/><circle cx="72" cy="53" r="7"/></g>`;
    case "reasoning":
      return `<g ${common}><circle cx="54" cy="39" r="6"/><circle cx="90" cy="39" r="6"/><circle cx="72" cy="69" r="6"/><path d="M60 42l9 20M84 42l-9 20"/></g>`;
    case "retry":
      return `<g ${common}><path d="M91 44a22 22 0 1 0 1 20M91 44V29M91 44H76"/></g>`;
    case "cancel":
      return `<g ${common}><rect x="53" y="34" width="38" height="38" rx="4"/></g>`;
    case "back":
      return `<g ${common}><path d="M93 53H51M64 38L49 53l15 15"/></g>`;
    case "home":
      return `<g ${common}><path d="M49 52l23-20 23 20M56 48v25h32V48"/></g>`;
    case "previous":
      return `<g ${common}><path d="M82 34L63 53l19 19"/></g>`;
    case "next":
      return `<g ${common}><path d="M62 34l19 19-19 19"/></g>`;
    case "roster":
      return `<g ${common}><rect x="50" y="32" width="17" height="17" rx="2"/><rect x="77" y="32" width="17" height="17" rx="2"/><rect x="50" y="59" width="17" height="17" rx="2"/><rect x="77" y="59" width="17" height="17" rx="2"/></g>`;
    case "actions":
      return `<g ${common}><path d="M53 37h38M53 53h38M53 69h38"/><circle cx="47" cy="37" r="2"/><circle cx="47" cy="53" r="2"/><circle cx="47" cy="69" r="2"/></g>`;
    case "apply":
    case "approve":
      return `<g ${common}><path d="M49 53l14 15 31-34"/></g>`;
    case "reject":
      return `<g ${common}><path d="M55 36l34 34M89 36L55 70"/></g>`;
    case "offline":
      return `<g ${common}><circle cx="72" cy="53" r="22"/><path d="M57 68l30-30"/></g>`;
  }
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
