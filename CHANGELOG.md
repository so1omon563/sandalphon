# Changelog

All notable changes to Sandalphon are recorded here.

## Unreleased

### Changed

- Simplified managed Classic 15 and Stream Deck + frames with true blank
  unused controls, contextual action visibility, a four-alternative Classic
  roster page, and a single primary Plus session lane.
- Added distinct repository-authored action and navigation glyphs so labels
  confirm rather than solely communicate each control's meaning.
- Made managed Exit dispatch immediately on key-down and documented the
  Stream Deck restart case where the official prior-profile API cannot return
  to a user-defined profile.

### Added

- Independent Sandalphon repository and package identity.
- Node.js 24 TypeScript Stream Deck plugin foundation.
- Minimal Foundation Status action and original visual assets.
- Formatting, linting, type checking, tests, coverage, build, official
  validation, and package dry-run gates.
- CI, opt-in semantic version tagging, contribution, design, security,
  licensing, and architecture-decision conventions.
- Deterministic agent state, action-offer, confirmation, capability-frame, and
  simulated-adapter contracts with fail-closed stale-input and recovery tests.
- Original Liminal Signal palette, state glyphs, label and motion constraints,
  deterministic Classic and Plus SVG references, contrast tests, and explicit
  asset provenance policy.
- Exact Classic 15 stable anchors, roster and contextual pages, key-based
  ordered choices, bounded consequential review, recovery feedback, and
  deterministic layout acceptance fixtures.
- Exact Stream Deck + key anchors, contextual encoder lanes, separate dial
  preview and press commit, coordinated touch-strip review, conservative touch
  behavior, recovery feedback, and deterministic acceptance fixtures.
- Live Codex 0.144.1 app-server discovery, authentication reuse, historical
  thread selection, explicit resume, activity, approval, interruption, and
  next-turn reasoning integration.
- Managed Stream Deck + profile with eight dynamic keys, four coordinated dial
  actions, original Liminal Signal rendering, and physical-device validation.
- Managed Classic 15 profile with 15 dynamic keys, device-aware profile entry,
  live roster, session, action, choice, request-review, and exit behavior.
- Bounded 16 MiB raw UTF-8 JSON-RPC line handling for long `thread/resume`
  history pages, while malformed and oversized local-process traffic still
  fails closed.
- Evidence-backed first-public-release gates for support, physical validation,
  installation lifecycle, security and privacy, documentation, licensing, and
  artifact provenance, plus a release-candidate evidence command.
