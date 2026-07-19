# ADR 0003: Original Visual Language and Asset Policy

- Status: Accepted
- Date: 2026-07-18

## Context

Sandalphon needs one legible visual contract across 144 × 144 key sources and
the four 200 × 100 Stream Deck + touch-strip quarters. Its state system must be
calm, accessible at small scale, redistributable, and independent of every
external product's artwork and visual expression.

## Decision

Adopt the repository-authored **Liminal Signal** system:

- retain the existing deep navy, cyan, violet, white, and bridge-mark identity;
- add a tested semantic accent, unique geometric glyph, and exact label for
  each domain primary state;
- require at least 4.5:1 contrast for text and semantic accents on both dark
  backgrounds;
- use the host system sans-serif stack and bounded sentence-case labels;
- ship no looping or animated status assets in v0;
- generate committed SVG references deterministically from one versioned JSON
  authority and reject stale outputs in the canonical gate;
- keep all current visual material repository-authored and MIT-licensed.

## Consequences

Classic 15 and Stream Deck + can use different compositions without changing
state meaning. Color is never the only signal. Later device-layout work may
compose these tokens and assets but may not weaken label, contrast, motion,
ownership, or provenance rules.

The generated references prove composition and export reproducibility, not
physical-device behavior. Hardware validation remains part of the device MVPs.

## Rejected Alternatives

- Copying or adapting another product's colors, icons, animation, or layout.
- Bundling a font or third-party icon set without a concrete product need.
- Using generative imagery for semantic controls or exact labels.
- Encoding state only through hue.
- Adding a runtime theme engine before a second user-selectable theme exists.
