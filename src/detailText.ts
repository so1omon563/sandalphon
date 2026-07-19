const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});
const CONTROL_OR_FORMAT_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const EMOJI_ZWJ_SEQUENCE =
  /^\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\ufe0f)*(?:\u200d\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\ufe0f)*)+$/u;

export function segmentRenderableDetail(
  text: string,
): readonly string[] | undefined {
  const graphemes = Array.from(
    GRAPHEME_SEGMENTER.segment(text),
    ({ segment }) => segment,
  );
  return graphemes.every(isRenderableGrapheme) ? graphemes : undefined;
}

function isRenderableGrapheme(grapheme: string): boolean {
  if (!CONTROL_OR_FORMAT_CHARACTER.test(grapheme)) return true;
  return EMOJI_ZWJ_SEQUENCE.test(grapheme);
}
