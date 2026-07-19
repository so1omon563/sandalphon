import type { SurfaceView } from "./presentation.js";

export const CLASSIC15_COLUMNS = 5;
export const CLASSIC15_ROWS = 3;
export const CLASSIC15_KEY_COUNT = CLASSIC15_COLUMNS * CLASSIC15_ROWS;

export const CLASSIC15_ANCHORS = {
  selectedSession: 0,
  cancelDecision: 5,
  rejectDecision: 7,
  attentionOrPositiveDecision: 9,
  homeOrBack: 10,
  previousOrDecrement: 11,
  positionOrValue: 12,
  nextOrIncrement: 13,
  exit: 14,
} as const;

export const CLASSIC15_DETAIL_CELL_COUNT = 6;
export const CLASSIC15_DETAIL_LINES_PER_CELL = 2;
export const CLASSIC15_DETAIL_LINE_LENGTH = 12;
export const CLASSIC15_MAX_DETAIL_PAGES = 12;

export type Classic15Role =
  | "selectedSession"
  | "rosterSession"
  | "attention"
  | "inspect"
  | "startOrResume"
  | "review"
  | "reasoning"
  | "fork"
  | "moreActions"
  | "retry"
  | "cancelRun"
  | "actionSlot"
  | "choiceContext"
  | "choiceOption"
  | "applyChoice"
  | "detailSegment"
  | "cancelDecision"
  | "rejectDecision"
  | "approveDecision"
  | "primaryState"
  | "unavailableReason"
  | "recoveryDetail"
  | "recover"
  | "home"
  | "back"
  | "previousPage"
  | "rosterPage"
  | "nextPage"
  | "previousSession"
  | "sessionPosition"
  | "nextSession"
  | "actionPage"
  | "decrement"
  | "choiceValue"
  | "increment"
  | "detailPage"
  | "unavailableContext"
  | "exit"
  | "empty";

export interface Classic15Cell {
  readonly id: string;
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly role: Classic15Role;
}

export interface Classic15DetailCell {
  readonly lines: readonly string[];
}

export interface Classic15DetailPage {
  readonly index: number;
  readonly total: number;
  readonly cells: readonly Classic15DetailCell[];
}

export type Classic15DetailPagination =
  | {
      readonly available: true;
      readonly pages: readonly Classic15DetailPage[];
    }
  | {
      readonly available: false;
      readonly reason: "detailTooLarge";
      readonly requiredPages: number;
    };

const VIEW_ROLES = {
  home: [
    "selectedSession",
    "rosterSession",
    "rosterSession",
    "rosterSession",
    "rosterSession",
    "rosterSession",
    "rosterSession",
    "rosterSession",
    "rosterSession",
    "attention",
    "home",
    "previousPage",
    "rosterPage",
    "nextPage",
    "exit",
  ],
  session: [
    "selectedSession",
    "inspect",
    "startOrResume",
    "review",
    "reasoning",
    "fork",
    "moreActions",
    "retry",
    "cancelRun",
    "attention",
    "back",
    "previousSession",
    "sessionPosition",
    "nextSession",
    "exit",
  ],
  actions: [
    "selectedSession",
    "actionSlot",
    "actionSlot",
    "actionSlot",
    "actionSlot",
    "actionSlot",
    "actionSlot",
    "actionSlot",
    "actionSlot",
    "attention",
    "back",
    "previousPage",
    "actionPage",
    "nextPage",
    "exit",
  ],
  choice: [
    "selectedSession",
    "choiceContext",
    "choiceOption",
    "choiceOption",
    "choiceOption",
    "choiceOption",
    "choiceOption",
    "choiceOption",
    "applyChoice",
    "attention",
    "back",
    "decrement",
    "choiceValue",
    "increment",
    "exit",
  ],
  request: [
    "selectedSession",
    "detailSegment",
    "detailSegment",
    "detailSegment",
    "detailSegment",
    "cancelDecision",
    "detailSegment",
    "rejectDecision",
    "detailSegment",
    "approveDecision",
    "back",
    "previousPage",
    "detailPage",
    "nextPage",
    "exit",
  ],
  unavailable: [
    "primaryState",
    "unavailableReason",
    "recoveryDetail",
    "recoveryDetail",
    "recoveryDetail",
    "empty",
    "empty",
    "empty",
    "empty",
    "recover",
    "home",
    "empty",
    "unavailableContext",
    "empty",
    "exit",
  ],
} as const satisfies Record<SurfaceView, readonly Classic15Role[]>;

export function classic15Layout(view: SurfaceView): readonly Classic15Cell[] {
  return VIEW_ROLES[view].map((role, index) => ({
    id: `key-${index}`,
    index,
    row: Math.floor(index / CLASSIC15_COLUMNS),
    column: index % CLASSIC15_COLUMNS,
    role,
  }));
}

export function paginateClassic15Detail(
  text: string,
): Classic15DetailPagination {
  const characters = Array.from(text);
  const lines =
    characters.length === 0
      ? [""]
      : chunks(characters, CLASSIC15_DETAIL_LINE_LENGTH).map((line) =>
          line.join(""),
        );
  const detailCells = chunks(lines, CLASSIC15_DETAIL_LINES_PER_CELL).map(
    (cellLines) => ({ lines: cellLines }),
  );
  const requiredPages = Math.ceil(
    detailCells.length / CLASSIC15_DETAIL_CELL_COUNT,
  );

  if (requiredPages > CLASSIC15_MAX_DETAIL_PAGES) {
    return {
      available: false,
      reason: "detailTooLarge",
      requiredPages,
    };
  }

  const pages = chunks(detailCells, CLASSIC15_DETAIL_CELL_COUNT).map(
    (pageCells, index, allPages) => ({
      index,
      total: allPages.length,
      cells: [
        ...pageCells,
        ...Array.from(
          { length: CLASSIC15_DETAIL_CELL_COUNT - pageCells.length },
          (): Classic15DetailCell => ({ lines: [""] }),
        ),
      ],
    }),
  );

  return { available: true, pages };
}

export function moveClassic15Choice(
  previewIndex: number,
  direction: -1 | 1,
  optionCount: number,
): number {
  if (optionCount <= 0) return 0;
  const current = Math.min(Math.max(previewIndex, 0), optionCount - 1);
  return Math.min(Math.max(current + direction, 0), optionCount - 1);
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
