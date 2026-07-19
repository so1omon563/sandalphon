# ADR 0004: Fix the Classic 15 interaction map before live adapters

- Status: Accepted
- Date: 2026-07-18

## Context

Sandalphon's deterministic core recognizes a 15-key Classic surface but did
not yet define exact coordinates, roster density, page navigation,
key-adapted ordered choices, request decisions, or recovery presentation. The
accepted device and safety contracts require those decisions before live SDK
handlers can be evaluated without spatial ambiguity.

## Decision

Adopt the complete
[Classic 15 interaction map](../../classic-15-interaction-map.md) and its
executable role contract in `src/classic15.ts`.

- Keep selected session at `K0`, local Home/Back at `K10`, position/value at
  `K12`, and profile Exit at `K14`.
- Reserve `K5` for interruption, `K7` for rejection, and `K9` for attention or
  one-shot approval in request review.
- Show one selected session plus eight roster candidates per page; attention
  never changes selection automatically.
- Adapt ordered choices through explicit option keys and the
  Lower/value/Higher trio, with a separate Apply key and no wraparound.
- Page exact request detail through six cells. Fail complete inspection closed
  beyond 12 pages instead of truncating decision-critical content.
- Keep composable actions self-contained and unable to perform final
  high-consequence confirmation.

## Consequences

- SO1-172 can wire one exact managed profile and test physical behavior without
  inventing layout or safety rules inside SDK callbacks.
- Classic remains a key-native first-class experience rather than a simulated
  Stream Deck +.
- Long or unrenderable approval material intentionally requires another review
  surface; this is a safety boundary, not a layout defect.
- The 12-page review bound, label legibility, one-handed reach, hold duration,
  and latency still require real Classic hardware validation.

## Rejected Alternatives

- Filling keys directly from action-offer array order.
- Automatically moving selection to whichever session needs attention.
- Wrapping paired-key choices as if they were a rotary encoder.
- Reusing Back as Cancel or allowing one press to enter and confirm review.
- Truncating approval material or treating a digest as complete inspection.
- Adding hidden double-tap, generic long-press, touch, swipe, or virtual-dial
  behavior to the Classic profile.
