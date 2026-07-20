# Visual Language

Sandalphon's visual system is named **Liminal Signal**. It extends the original
bridge mark with a calm, dark surface and distinct state signals designed for
small Stream Deck displays.

The editable authority is
[`artwork/visual-language.json`](../artwork/visual-language.json). Run
`npm run assets:generate` after changing it and `npm run assets:check` to prove
that every committed SVG is current.

## Principles

1. State must remain legible at a glance and at physical-device distance.
2. Color reinforces meaning but never carries meaning alone.
3. Labels are short, literal, and stable across Classic 15 and Stream Deck +.
4. Consequential attention is explicit, not theatrical.
5. Every asset is inspectable, reproducible, and redistributable.

## Palette

| Role       | Value     | Use                                                   |
| ---------- | --------- | ----------------------------------------------------- |
| Canvas     | `#090D1C` | Device-edge background and maximum-depth field        |
| Surface    | `#172348` | Key and touch-strip content plane                     |
| Text       | `#F5FBFF` | Primary labels and essential information              |
| Muted text | `#C4CEE0` | Secondary context that still meets the contrast floor |
| Focus      | `#9A87FF` | Selection and local preview, never provider truth     |

All text and semantic accents meet at least 4.5:1 contrast against both dark
backgrounds. This is a conservative product constraint for small displays, not
a claim that Stream Deck hardware or plugin imagery is a WCAG-conforming web
interface.

## State Semantics

| State       | Accent    | Glyph                      | Exact label | Meaning                                   |
| ----------- | --------- | -------------------------- | ----------- | ----------------------------------------- |
| Idle        | `#8AA7FF` | Resting circle and horizon | Idle        | Available with no active run              |
| Working     | `#72E2F1` | Opposed flow arrows        | Working     | Agent work is active                      |
| Waiting     | `#FFD166` | Pause rails                | Waiting     | A person must review or respond           |
| Completed   | `#72E6A5` | Check                      | Complete    | Unacknowledged successful result          |
| Failed      | `#FF7B72` | Cross                      | Failed      | Unacknowledged failure                    |
| Unavailable | `#A7B0C0` | Blocked circle             | Offline     | Current authority or capability is absent |

Waiting is the only persistent attention treatment. Completed and failed stay
latched until the domain acknowledgement contract clears them. Focus violet
means local selection or preview and must never be substituted for one of these
provider-derived states.

## Typography and Labels

- Use the host system sans-serif stack. Sandalphon bundles no font files.
- Use sentence case, direct verbs for actions, and nouns or short adjectives
  for state.
- Key status labels use at most two lines and 12 characters per line.
- One Stream Deck + touch-strip quarter uses at most 18 characters for its
  title. Secondary detail must add context rather than repeat the title.
- Never shrink essential text below the declared token sizes to fit arbitrary
  content. Truncate nonessential context or move it into an inspection view.
- Do not place critical labels inside generated or generative imagery.

## Icon Grammar

- Construct icons on a simple geometric grid with round caps and joins.
- Prefer one recognizable contour and no more than two internal strokes.
- Keep a 12 px safe inset at the 144 × 144 key source size.
- Pair every semantic icon with an exact text label; text confirms meaning but
  is never the only way ordinary controls differ at a glance.
- Selected-session tiles use a dedicated Session glyph whose accent follows
  the six-state palette. Offline surfaces use the unavailable state glyph.
  Actions and navigation use distinct repository-authored glyphs for Resume,
  Inspect, Details, Exit, Attention, Review, Reasoning, Retry, Cancel, Back,
  Home, Previous, Next, Roster, Actions, Apply, Approve, Reject, and Offline.
- Positive decisions use the completed accent, destructive decisions use the
  failed accent, attention uses the waiting accent, and ordinary actions use
  focus violet. Shape remains the primary distinction.
- Use the bridge mark for Sandalphon identity, not as a generic state icon.
- Do not import an icon library merely for stylistic consistency. A new
  third-party source requires an explicit need and provenance review.

## Motion and Feedback

V0 ships no animated or looping status assets. Working, waiting, completion,
failure, and unavailable are distinguishable while static. Use Stream Deck's
transient OK or alert feedback only as acknowledgement of a local interaction;
the persistent frame remains authoritative. Repeated flashing, hue cycling,
and ambient pulsing are prohibited.

## Reference Surfaces

Classic 15 and Stream Deck + use the same palette, glyph, label, and state
meaning. Their compositions differ deliberately:

- Classic keys use a centered glyph, bottom label, and left semantic rail.
- Each Plus encoder quarter uses a left glyph, title and detail pair, and
  bottom semantic rail within the official 200 × 100 canvas.
- A full-width Plus strip may coordinate all four quarters only when the
  managed-profile ownership contract is satisfied.

The generated state and action SVGs are design-contract references for device
layouts. They do not claim physical rendering, latency, SDK wiring, or
user-title precedence has been validated on hardware.

## Asset and Provenance Policy

The repository contains only repository-authored artwork today. Source JSON
and SVG are MIT-licensed with the rest of Sandalphon. Generated files identify
their source and license in SVG metadata and are checked byte-for-byte in CI.

Generative imagery is not used for the identity, semantic icons, state assets,
or exact labels. Third-party artwork, typefaces, icon packs, and generated
visual material are rejected by default. If a concrete need arises, `ASSETS.md`
must record the author, source URL, exact license, modifications, generated
derivatives, and redistribution compatibility before the asset enters the
plugin package.

## External References

- [Elgato Stream Deck key images and titles](https://docs.elgato.com/streamdeck/sdk/guides/keys/)
- [Elgato Stream Deck dials and touch-strip layouts](https://docs.elgato.com/streamdeck/sdk/guides/dials/)
- [Elgato 200 × 100 touch-strip quarter layout](https://docs.elgato.com/streamdeck/sdk/references/touch-strip-layout/)
- [Elgato plugin image guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/)
- [WCAG 2.2 contrast criteria](https://www.w3.org/TR/WCAG22/#contrast-minimum)
