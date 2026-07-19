import { describe, expect, it } from "vitest";

import {
  CLASSIC15_ANCHORS,
  CLASSIC15_DETAIL_CELL_COUNT,
  CLASSIC15_DETAIL_LINE_LENGTH,
  CLASSIC15_KEY_COUNT,
  CLASSIC15_MAX_DETAIL_PAGES,
  classic15Layout,
  moveClassic15Choice,
  paginateClassic15Detail,
} from "../src/classic15.js";
import type { SurfaceView } from "../src/presentation.js";

const views: readonly SurfaceView[] = [
  "home",
  "session",
  "actions",
  "choice",
  "request",
  "unavailable",
];

const graphemeSegmenter = new Intl.Segmenter("en", {
  granularity: "grapheme",
});

describe("Classic 15 interaction contract", () => {
  it("fills one row-major 5 by 3 frame for every managed view", () => {
    for (const view of views) {
      const layout = classic15Layout(view);
      expect(layout).toHaveLength(CLASSIC15_KEY_COUNT);
      expect(new Set(layout.map(({ id }) => id)).size).toBe(
        CLASSIC15_KEY_COUNT,
      );
      expect(layout.at(0)).toMatchObject({ row: 0, column: 0 });
      expect(layout.at(-1)).toMatchObject({ row: 2, column: 4 });
    }
  });

  it("keeps selection, local escape, and profile exit spatially stable", () => {
    for (const view of views) {
      const layout = classic15Layout(view);
      expect(layout[CLASSIC15_ANCHORS.selectedSession]?.role).toMatch(
        /selectedSession|primaryState/,
      );
      expect(layout[CLASSIC15_ANCHORS.homeOrBack]?.role).toMatch(/home|back/);
      expect(layout[CLASSIC15_ANCHORS.exit]?.role).toBe("exit");
    }
  });

  it("reserves fixed request decision positions", () => {
    const request = classic15Layout("request");
    expect(request[CLASSIC15_ANCHORS.cancelDecision]?.role).toBe(
      "cancelDecision",
    );
    expect(request[CLASSIC15_ANCHORS.rejectDecision]?.role).toBe(
      "rejectDecision",
    );
    expect(request[CLASSIC15_ANCHORS.attentionOrPositiveDecision]?.role).toBe(
      "approveDecision",
    );
    expect(request.filter(({ role }) => role === "detailSegment")).toHaveLength(
      CLASSIC15_DETAIL_CELL_COUNT,
    );
  });

  it("uses eight roster cells without moving the selected session or attention", () => {
    const home = classic15Layout("home");
    expect(home.filter(({ role }) => role === "rosterSession")).toHaveLength(8);
    expect(home[CLASSIC15_ANCHORS.selectedSession]?.role).toBe(
      "selectedSession",
    );
    expect(home[CLASSIC15_ANCHORS.attentionOrPositiveDecision]?.role).toBe(
      "attention",
    );
  });

  it("keeps primary session intents and choice controls in their accepted positions", () => {
    const session = classic15Layout("session");
    expect(session[1]?.role).toBe("inspect");
    expect(session[2]?.role).toBe("startOrResume");
    expect(session[3]?.role).toBe("review");
    expect(session[4]?.role).toBe("reasoning");
    expect(session[7]?.role).toBe("retry");
    expect(session[8]?.role).toBe("cancelRun");

    const choice = classic15Layout("choice");
    expect(choice[8]?.role).toBe("applyChoice");
    expect(choice[CLASSIC15_ANCHORS.previousOrDecrement]?.role).toBe(
      "decrement",
    );
    expect(choice[CLASSIC15_ANCHORS.positionOrValue]?.role).toBe("choiceValue");
    expect(choice[CLASSIC15_ANCHORS.nextOrIncrement]?.role).toBe("increment");
  });

  it("paginates inspectable detail without omission inside the device bound", () => {
    const text = Array.from({ length: 150 }, (_, index) =>
      String.fromCharCode(65 + (index % 26)),
    ).join("");
    const result = paginateClassic15Detail(text);
    expect(result.available).toBe(true);
    if (!result.available) return;

    expect(result.pages).toHaveLength(2);
    expect(result.pages.every(({ cells }) => cells.length === 6)).toBe(true);
    expect(
      result.pages.every(({ cells }) =>
        cells.every(({ lines }) =>
          lines.every(
            (line) =>
              Array.from(graphemeSegmenter.segment(line)).length <=
              CLASSIC15_DETAIL_LINE_LENGTH,
          ),
        ),
      ),
    ).toBe(true);
    expect(
      result.pages
        .flatMap(({ cells }) => cells)
        .flatMap(({ lines }) => lines)
        .join(""),
    ).toBe(text);
  });

  it("keeps a multi-code-point grapheme within one rendered line", () => {
    const combinedGlyph = "👩‍💻";
    const firstLine = `${"x".repeat(11)}${combinedGlyph}`;
    const result = paginateClassic15Detail(`${firstLine}y`);
    expect(result.available).toBe(true);
    if (!result.available) return;

    expect(result.pages[0]?.cells[0]?.lines).toEqual([firstLine, "y"]);
  });

  it("fails closed for unescaped control and directional characters", () => {
    expect(paginateClassic15Detail("line\nbreak")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateClassic15Detail("safe\u202etext")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateClassic15Detail("safe\u200dtext")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateClassic15Detail("\ufe0f")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateClassic15Detail("\ud800")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateClassic15Detail("❤️").available).toBe(true);
    expect(paginateClassic15Detail("1️").available).toBe(true);
    expect(paginateClassic15Detail("A️")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
  });

  it("fails closed when complete detail exceeds the bounded review surface", () => {
    const pageCapacity = 6 * 2 * CLASSIC15_DETAIL_LINE_LENGTH;
    const result = paginateClassic15Detail(
      "x".repeat(pageCapacity * CLASSIC15_MAX_DETAIL_PAGES + 1),
    );
    expect(result).toEqual({
      available: false,
      reason: "detailTooLarge",
      requiredPages: CLASSIC15_MAX_DETAIL_PAGES + 1,
    });
  });

  it("renders empty inspectable detail as one complete blank page", () => {
    const result = paginateClassic15Detail("");
    expect(result).toEqual({
      available: true,
      pages: [
        {
          index: 0,
          total: 1,
          cells: Array.from({ length: 6 }, () => ({ lines: [""] })),
        },
      ],
    });
  });

  it("previews ordered choices with paired keys and never wraps", () => {
    expect(moveClassic15Choice(1, -1, 3)).toBe(0);
    expect(moveClassic15Choice(1, 1, 3)).toBe(2);
    expect(moveClassic15Choice(0, -1, 3)).toBe(0);
    expect(moveClassic15Choice(2, 1, 3)).toBe(2);
    expect(moveClassic15Choice(3, -1, 0)).toBe(0);
  });
});
