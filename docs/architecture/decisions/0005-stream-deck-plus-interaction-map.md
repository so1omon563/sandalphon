# ADR 0005: Fix the Stream Deck + interaction map before live adapters

- Status: Accepted
- Date: 2026-07-19

## Context

Sandalphon recognizes the standard Stream Deck + capability profile but did
not yet define exact key placement, encoder rotation and press behavior,
touch-strip ownership, request review, or recovery presentation. The accepted
device and safety contracts require a native Plus design before live SDK
handlers can be evaluated without inventing behavior inside callbacks.

The official SDK exposes four encoder action contexts. Each owns one 200 by
100 touch-strip quarter and receives dial down, rotation, dial up, and touch
tap events. A touch event reports its quarter-relative position and whether it
was held. The SDK exposes no swipe event or touch-motion stream.

## Decision

Adopt the complete
[Stream Deck + interaction map](../../stream-deck-plus-interaction-map.md) and
its executable role contract in `src/streamDeckPlus.ts`.

- Keep selected session at `K0`, local Home/Back at `K4`, attention or positive
  authorization at `K3`, and profile Exit at `K7`.
- Reserve request `K5` for cancellation and `K6` for rejection. Approval uses
  `K3`; the three decisions never share a physical key.
- Use the four dial/strip lanes for roster, action, ordered-choice, attention,
  and detail navigation according to the current labeled view. Rotation
  previews, and a separate dial press applies the advertised local selection
  or choice.
- Coordinate all four owned quarters for request detail. Page visible,
  reversible grapheme content through four cells and fail complete inspection
  closed beyond twelve pages or when content cannot render faithfully.
- Limit touch tap to local context. Touch hold performs no v0 action, and swipe
  is explicitly unavailable because the official interface does not expose it.
- Keep touch and dial input unable to perform final high-consequence
  confirmation. Approval and interruption retain dedicated 800 ms key holds;
  reject, redirect, and retry retain separate key confirmation presses.

## Consequences

- SO1-173 can wire one exact managed Plus profile and test physical behavior
  without defining layout or safety policy inside SDK callbacks.
- Plus remains a first-class encoder-and-strip experience rather than a reduced
  Classic key grid.
- Pressed rotation is ignored in v0. It does not become a hidden secondary
  gesture or shortcut around review.
- Long or unrenderable request material intentionally requires another review
  surface; this is a safety boundary, not a rendering fallback.
- Touch legibility, dial direction, detents, reach, hold timing, and latency
  still require the real standard Stream Deck + validation in SO1-173.

## Rejected Alternatives

- Reusing the Classic 15 grid with missing cells.
- Filling keys or dials directly from action-offer array order.
- Using touch tap, touch hold, dial press, or pressed rotation as final
  consequential confirmation.
- Synthesizing swipe from unrelated tap positions or timing.
- Wrapping ordered choices at their endpoints.
- Truncating approval detail or treating a digest as complete inspection.
