import { describe, expect, it } from "vitest";

import type { SurfaceView } from "../src/presentation.js";
import {
  STREAM_DECK_PLUS_ANCHORS,
  STREAM_DECK_PLUS_DETAIL_CELL_COUNT,
  STREAM_DECK_PLUS_DETAIL_LINE_LENGTH,
  STREAM_DECK_PLUS_ENCODER_COUNT,
  STREAM_DECK_PLUS_KEY_COUNT,
  STREAM_DECK_PLUS_MAX_DETAIL_PAGES,
  STREAM_DECK_PLUS_STRIP_HEIGHT,
  STREAM_DECK_PLUS_STRIP_QUARTER_WIDTH,
  STREAM_DECK_PLUS_TOUCH_CONTRACT,
  moveStreamDeckPlusChoice,
  paginateStreamDeckPlusDetail,
  streamDeckPlusLayout,
} from "../src/streamDeckPlus.js";

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

describe("Stream Deck + interaction contract", () => {
  it("fills eight keys and four encoder quarters for every managed view", () => {
    for (const view of views) {
      const layout = streamDeckPlusLayout(view);
      expect(layout.keys).toHaveLength(STREAM_DECK_PLUS_KEY_COUNT);
      expect(layout.encoders).toHaveLength(STREAM_DECK_PLUS_ENCODER_COUNT);
      expect(new Set(layout.keys.map(({ id }) => id)).size).toBe(
        STREAM_DECK_PLUS_KEY_COUNT,
      );
      expect(new Set(layout.encoders.map(({ id }) => id)).size).toBe(
        STREAM_DECK_PLUS_ENCODER_COUNT,
      );
      expect(layout.keys.at(0)).toMatchObject({ row: 0, column: 0 });
      expect(layout.keys.at(-1)).toMatchObject({ row: 1, column: 3 });
      expect(layout.encoders.map(({ column }) => column)).toEqual([0, 1, 2, 3]);
    }
    expect(STREAM_DECK_PLUS_STRIP_QUARTER_WIDTH).toBe(200);
    expect(STREAM_DECK_PLUS_STRIP_HEIGHT).toBe(100);
  });

  it("keeps selection, local escape, attention, and exit spatially stable", () => {
    for (const view of views) {
      const keys = streamDeckPlusLayout(view).keys;
      expect(keys[STREAM_DECK_PLUS_ANCHORS.selectedSession]?.role).toMatch(
        /selectedSession|primaryState/,
      );
      expect(
        keys[STREAM_DECK_PLUS_ANCHORS.attentionOrPositiveDecision]?.role,
      ).toMatch(/attention|approveDecision|recover/);
      expect(keys[STREAM_DECK_PLUS_ANCHORS.homeOrBack]?.role).toMatch(
        /home|back/,
      );
      expect(keys[STREAM_DECK_PLUS_ANCHORS.exit]?.role).toBe("exit");
    }
  });

  it("reserves separate request decision keys and the full strip for detail", () => {
    const request = streamDeckPlusLayout("request");
    expect(
      request.keys[STREAM_DECK_PLUS_ANCHORS.attentionOrPositiveDecision]?.role,
    ).toBe("approveDecision");
    expect(request.keys[STREAM_DECK_PLUS_ANCHORS.cancelDecision]?.role).toBe(
      "cancelDecision",
    );
    expect(request.keys[STREAM_DECK_PLUS_ANCHORS.rejectDecision]?.role).toBe(
      "rejectDecision",
    );
    expect(request.encoders.slice(0, 3).map(({ role }) => role)).toEqual([
      "detailSegment",
      "detailSegment",
      "detailSegment",
    ]);
    expect(request.encoders[3]).toMatchObject({
      role: "detailNavigator",
      rotation: "previewDetailPage",
      press: "firstUnreadDetail",
    });
  });

  it("uses dial lanes for roster, actions, choices, and detail", () => {
    expect(
      streamDeckPlusLayout("home").encoders.map(({ role }) => role),
    ).toEqual([
      "rosterView",
      "rosterPage",
      "sessionSelector",
      "attentionSelector",
    ]);
    expect(
      streamDeckPlusLayout("session").encoders.map(({ role }) => role),
    ).toEqual([
      "sessionSelector",
      "actionSelector",
      "choiceSelector",
      "detailNavigator",
    ]);
    expect(
      streamDeckPlusLayout("choice").encoders.map(({ role }) => role),
    ).toEqual(["empty", "empty", "choiceSelector", "empty"]);
  });

  it("keeps encoder press as a separate explicit commit", () => {
    const session = streamDeckPlusLayout("session").encoders;
    expect(session[0]).toMatchObject({
      rotation: "previewSession",
      press: "selectSession",
    });
    expect(session[1]).toMatchObject({
      rotation: "previewAction",
      press: "activateOfferEntry",
    });
    expect(session[2]).toMatchObject({
      rotation: "previewChoice",
      press: "commitChoice",
    });
  });

  it("previews ordered choices without wrapping or pressed rotation", () => {
    expect(moveStreamDeckPlusChoice(1, -1, 3, false)).toBe(0);
    expect(moveStreamDeckPlusChoice(1, 1, 3, false)).toBe(2);
    expect(moveStreamDeckPlusChoice(0, -1, 3, false)).toBe(0);
    expect(moveStreamDeckPlusChoice(2, 1, 3, false)).toBe(2);
    expect(moveStreamDeckPlusChoice(1, 5, 3, false)).toBe(2);
    expect(moveStreamDeckPlusChoice(1, 1, 3, true)).toBe(1);
    expect(moveStreamDeckPlusChoice(3, -1, 0, false)).toBe(0);
  });

  it("keeps touch local and declares hold and swipe unavailable", () => {
    expect(STREAM_DECK_PLUS_TOUCH_CONTRACT).toEqual({
      tap: "localContextOnly",
      hold: "unavailable",
      swipe: "unavailable",
    });
    expect(
      streamDeckPlusLayout("session").encoders.every(
        ({ touch }) => touch === "localContextOnly",
      ),
    ).toBe(true);
    expect(
      streamDeckPlusLayout("unavailable").encoders.every(
        ({ touch }) => touch === "none",
      ),
    ).toBe(true);
  });

  it("paginates complete detail across four strip quarters", () => {
    const text = Array.from({ length: 150 }, (_, index) =>
      String.fromCharCode(65 + (index % 26)),
    ).join("");
    const result = paginateStreamDeckPlusDetail(text);
    expect(result.available).toBe(true);
    if (!result.available) return;

    expect(result.pages).toHaveLength(2);
    expect(
      result.pages.every(
        ({ cells }) => cells.length === STREAM_DECK_PLUS_DETAIL_CELL_COUNT,
      ),
    ).toBe(true);
    expect(
      result.pages.every(({ cells }) =>
        cells.every(({ lines }) =>
          lines.every(
            (line) =>
              Array.from(graphemeSegmenter.segment(line)).length <=
              STREAM_DECK_PLUS_DETAIL_LINE_LENGTH,
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

  it("keeps a multi-code-point grapheme within one strip line", () => {
    const combinedGlyph = "👩‍💻";
    const firstLine = `${"x".repeat(17)}${combinedGlyph}`;
    const result = paginateStreamDeckPlusDetail(`${firstLine}y`);
    expect(result.available).toBe(true);
    if (!result.available) return;

    expect(result.pages[0]?.cells[0]?.lines).toEqual([firstLine, "y"]);
  });

  it("fails closed for unrenderable control and directional characters", () => {
    expect(paginateStreamDeckPlusDetail("line\nbreak")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateStreamDeckPlusDetail("safe\u202etext")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
    expect(paginateStreamDeckPlusDetail("safe\u200dtext")).toEqual({
      available: false,
      reason: "detailUnrenderable",
    });
  });

  it("fails closed when complete detail exceeds the strip bound", () => {
    const pageCapacity =
      STREAM_DECK_PLUS_DETAIL_CELL_COUNT *
      2 *
      STREAM_DECK_PLUS_DETAIL_LINE_LENGTH;
    const result = paginateStreamDeckPlusDetail(
      "x".repeat(pageCapacity * STREAM_DECK_PLUS_MAX_DETAIL_PAGES + 1),
    );
    expect(result).toEqual({
      available: false,
      reason: "detailTooLarge",
      requiredPages: STREAM_DECK_PLUS_MAX_DETAIL_PAGES + 1,
    });
  });

  it("renders empty inspectable detail as one complete blank strip page", () => {
    const result = paginateStreamDeckPlusDetail("");
    expect(result).toEqual({
      available: true,
      pages: [
        {
          index: 0,
          total: 1,
          cells: Array.from(
            { length: STREAM_DECK_PLUS_DETAIL_CELL_COUNT },
            () => ({ lines: [""] }),
          ),
        },
      ],
    });
  });
});
