import { segmentRenderableDetail } from "./detailText.js";
import type { SurfaceView } from "./presentation.js";

export const STREAM_DECK_PLUS_COLUMNS = 4;
export const STREAM_DECK_PLUS_ROWS = 2;
export const STREAM_DECK_PLUS_KEY_COUNT =
  STREAM_DECK_PLUS_COLUMNS * STREAM_DECK_PLUS_ROWS;
export const STREAM_DECK_PLUS_ENCODER_COUNT = 4;
export const STREAM_DECK_PLUS_STRIP_QUARTER_WIDTH = 200;
export const STREAM_DECK_PLUS_STRIP_HEIGHT = 100;

export const STREAM_DECK_PLUS_ANCHORS = {
  selectedSession: 0,
  attentionOrPositiveDecision: 3,
  homeOrBack: 4,
  cancelDecision: 5,
  rejectDecision: 6,
  exit: 7,
} as const;

export const STREAM_DECK_PLUS_DETAIL_CELL_COUNT = 4;
export const STREAM_DECK_PLUS_DETAIL_LINES_PER_CELL = 2;
export const STREAM_DECK_PLUS_DETAIL_LINE_LENGTH = 18;
export const STREAM_DECK_PLUS_MAX_DETAIL_PAGES = 12;

export const STREAM_DECK_PLUS_TOUCH_CONTRACT = {
  tap: "localContextOnly",
  hold: "unavailable",
  swipe: "unavailable",
} as const;

export type StreamDeckPlusKeyRole =
  | "selectedSession"
  | "primaryState"
  | "inspect"
  | "runAction"
  | "attention"
  | "home"
  | "back"
  | "review"
  | "actions"
  | "actionContext"
  | "selectedAction"
  | "choiceContext"
  | "choiceValue"
  | "requestTarget"
  | "reviewState"
  | "approveDecision"
  | "cancelDecision"
  | "rejectDecision"
  | "unavailableReason"
  | "recoveryDetail"
  | "recover"
  | "exit"
  | "empty";

export type StreamDeckPlusEncoderRole =
  | "rosterView"
  | "rosterPage"
  | "sessionSelector"
  | "attentionSelector"
  | "actionSelector"
  | "actionPage"
  | "choiceSelector"
  | "detailSegment"
  | "detailNavigator"
  | "recoverySegment"
  | "empty";

export type StreamDeckPlusRotation =
  | "none"
  | "previewRosterView"
  | "previewRosterPage"
  | "previewSession"
  | "previewAttention"
  | "previewAction"
  | "previewActionPage"
  | "previewChoice"
  | "previewDetailPage";

export type StreamDeckPlusPress =
  | "none"
  | "applyRosterView"
  | "applyRosterPage"
  | "selectSession"
  | "selectAttention"
  | "activateOfferEntry"
  | "applyActionPage"
  | "commitChoice"
  | "firstUnreadDetail";

export interface StreamDeckPlusKeyCell {
  readonly id: string;
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly role: StreamDeckPlusKeyRole;
}

export interface StreamDeckPlusEncoderCell {
  readonly id: string;
  readonly index: number;
  readonly column: number;
  readonly role: StreamDeckPlusEncoderRole;
  readonly rotation: StreamDeckPlusRotation;
  readonly press: StreamDeckPlusPress;
  readonly touch: "localContextOnly" | "none";
}

export interface StreamDeckPlusLayout {
  readonly keys: readonly StreamDeckPlusKeyCell[];
  readonly encoders: readonly StreamDeckPlusEncoderCell[];
}

export interface StreamDeckPlusDetailCell {
  readonly lines: readonly string[];
}

export interface StreamDeckPlusDetailPage {
  readonly index: number;
  readonly total: number;
  readonly cells: readonly StreamDeckPlusDetailCell[];
}

export type StreamDeckPlusDetailPagination =
  | {
      readonly available: true;
      readonly pages: readonly StreamDeckPlusDetailPage[];
    }
  | {
      readonly available: false;
      readonly reason: "detailTooLarge";
      readonly requiredPages: number;
    }
  | {
      readonly available: false;
      readonly reason: "detailUnrenderable";
    };

const KEY_VIEW_ROLES = {
  home: [
    "selectedSession",
    "inspect",
    "runAction",
    "attention",
    "home",
    "review",
    "actions",
    "exit",
  ],
  session: [
    "selectedSession",
    "inspect",
    "runAction",
    "attention",
    "back",
    "review",
    "actions",
    "exit",
  ],
  actions: [
    "selectedSession",
    "inspect",
    "runAction",
    "attention",
    "back",
    "actionContext",
    "selectedAction",
    "exit",
  ],
  choice: [
    "selectedSession",
    "choiceContext",
    "choiceValue",
    "attention",
    "back",
    "empty",
    "empty",
    "exit",
  ],
  request: [
    "selectedSession",
    "requestTarget",
    "reviewState",
    "approveDecision",
    "back",
    "cancelDecision",
    "rejectDecision",
    "exit",
  ],
  unavailable: [
    "primaryState",
    "unavailableReason",
    "recoveryDetail",
    "recover",
    "home",
    "empty",
    "empty",
    "exit",
  ],
} as const satisfies Record<SurfaceView, readonly StreamDeckPlusKeyRole[]>;

const ENCODER_VIEW_ROLES = {
  home: ["rosterView", "rosterPage", "sessionSelector", "attentionSelector"],
  session: [
    "sessionSelector",
    "actionSelector",
    "choiceSelector",
    "detailNavigator",
  ],
  actions: [
    "sessionSelector",
    "actionSelector",
    "actionPage",
    "attentionSelector",
  ],
  choice: ["empty", "empty", "choiceSelector", "empty"],
  request: [
    "detailSegment",
    "detailSegment",
    "detailSegment",
    "detailNavigator",
  ],
  unavailable: [
    "recoverySegment",
    "recoverySegment",
    "recoverySegment",
    "recoverySegment",
  ],
} as const satisfies Record<SurfaceView, readonly StreamDeckPlusEncoderRole[]>;

const ENCODER_BEHAVIORS = {
  rosterView: behavior(
    "previewRosterView",
    "applyRosterView",
    "localContextOnly",
  ),
  rosterPage: behavior(
    "previewRosterPage",
    "applyRosterPage",
    "localContextOnly",
  ),
  sessionSelector: behavior(
    "previewSession",
    "selectSession",
    "localContextOnly",
  ),
  attentionSelector: behavior(
    "previewAttention",
    "selectAttention",
    "localContextOnly",
  ),
  actionSelector: behavior(
    "previewAction",
    "activateOfferEntry",
    "localContextOnly",
  ),
  actionPage: behavior(
    "previewActionPage",
    "applyActionPage",
    "localContextOnly",
  ),
  choiceSelector: behavior("previewChoice", "commitChoice", "localContextOnly"),
  detailSegment: behavior("none", "none", "localContextOnly"),
  detailNavigator: behavior(
    "previewDetailPage",
    "firstUnreadDetail",
    "localContextOnly",
  ),
  recoverySegment: behavior("none", "none", "none"),
  empty: behavior("none", "none", "none"),
} as const satisfies Record<
  StreamDeckPlusEncoderRole,
  {
    readonly rotation: StreamDeckPlusRotation;
    readonly press: StreamDeckPlusPress;
    readonly touch: "localContextOnly" | "none";
  }
>;

export function streamDeckPlusLayout(view: SurfaceView): StreamDeckPlusLayout {
  return {
    keys: KEY_VIEW_ROLES[view].map((role, index) => ({
      id: `key-${index}`,
      index,
      row: Math.floor(index / STREAM_DECK_PLUS_COLUMNS),
      column: index % STREAM_DECK_PLUS_COLUMNS,
      role,
    })),
    encoders: ENCODER_VIEW_ROLES[view].map((role, index) => ({
      id: `encoder-${index}`,
      index,
      column: index,
      role,
      ...ENCODER_BEHAVIORS[role],
    })),
  };
}

export function paginateStreamDeckPlusDetail(
  text: string,
): StreamDeckPlusDetailPagination {
  const graphemes = segmentRenderableDetail(text);
  if (!graphemes) {
    return { available: false, reason: "detailUnrenderable" };
  }

  const lines =
    graphemes.length === 0
      ? [""]
      : chunks(graphemes, STREAM_DECK_PLUS_DETAIL_LINE_LENGTH).map((line) =>
          line.join(""),
        );
  const detailCells = chunks(lines, STREAM_DECK_PLUS_DETAIL_LINES_PER_CELL).map(
    (cellLines) => ({ lines: cellLines }),
  );
  const requiredPages = Math.ceil(
    detailCells.length / STREAM_DECK_PLUS_DETAIL_CELL_COUNT,
  );

  if (requiredPages > STREAM_DECK_PLUS_MAX_DETAIL_PAGES) {
    return {
      available: false,
      reason: "detailTooLarge",
      requiredPages,
    };
  }

  const pages = chunks(detailCells, STREAM_DECK_PLUS_DETAIL_CELL_COUNT).map(
    (pageCells, index, allPages) => ({
      index,
      total: allPages.length,
      cells: [
        ...pageCells,
        ...Array.from(
          { length: STREAM_DECK_PLUS_DETAIL_CELL_COUNT - pageCells.length },
          (): StreamDeckPlusDetailCell => ({ lines: [""] }),
        ),
      ],
    }),
  );

  return { available: true, pages };
}

export function moveStreamDeckPlusChoice(
  previewIndex: number,
  ticks: number,
  optionCount: number,
  pressed: boolean,
): number {
  if (pressed || optionCount <= 0 || ticks === 0) {
    return optionCount <= 0 ? 0 : clamp(previewIndex, 0, optionCount - 1);
  }
  const current = clamp(previewIndex, 0, optionCount - 1);
  return clamp(current + ticks, 0, optionCount - 1);
}

function behavior(
  rotation: StreamDeckPlusRotation,
  press: StreamDeckPlusPress,
  touch: "localContextOnly" | "none",
) {
  return { rotation, press, touch } as const;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
