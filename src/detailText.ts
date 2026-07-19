const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});
const UNRENDERABLE_CHARACTER =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const EMOJI_PRESENTATION_SEQUENCE =
  /^\p{Extended_Pictographic}(?:\ufe0f)?(?:\p{Emoji_Modifier})?$/u;
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
  if (!UNRENDERABLE_CHARACTER.test(grapheme)) return true;
  return (
    EMOJI_PRESENTATION_SEQUENCE.test(grapheme) ||
    EMOJI_ZWJ_SEQUENCE.test(grapheme)
  );
}
