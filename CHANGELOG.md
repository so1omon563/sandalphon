# Changelog

All notable changes to Sandalphon are recorded here.

## Unreleased

### Changed

- Routed property-inspector consent through its registered Stream Deck context
  so checkbox and retry requests reach the plugin.
- Added bounded renderer-readiness retries and automatic opt-out after a clean
  failed startup so desktop control cannot induce repeated restart attempts,
  with content-free failure categories for bounded physical diagnosis.
- Verify authority against exactly one matching Codex main process even when
  Chromium helper processes also report the same debugging listener.
- Reframed bundled managed profiles as optional reference and consequential-
  review surfaces instead of restart-safe daily-driver profiles, and renamed
  the catalog entry accordingly.
- Simplified managed Classic 15 and Stream Deck + frames with true blank
  unused controls, contextual action visibility, a four-alternative Classic
  roster page, and a single primary Plus session lane.
- Added distinct repository-authored action and navigation glyphs so labels
  confirm rather than solely communicate each control's meaning.
- Replaced the selected-session unavailable glyph with a dedicated session
  identity glyph whose accent still reflects the session's actual state.
- Made blank contextual controls render true black so they do not appear
  faintly active beside genuinely unused keys.
- Made composable Attention cycle through every attention session in roster
  order instead of alternating between only the first two.
- Removed the unreachable Classic Actions catalog; every implemented action
  remains contextual on Session, with result acknowledgement after inspection.
- Made managed Exit dispatch immediately on key-down and documented the
  Stream Deck restart case where the official prior-profile API cannot return
  to a user-defined profile.

### Added

- Explicit property-inspector consent and exact-version lifecycle ownership for
  optional Codex desktop task selection, including random loopback launch,
  controlled-process verification, fail-closed cleanup, and normal Codex
  relaunch.
- Shared revision-bound desktop task selection across Classic 15 keys, Stream
  Deck + dials, and composable controls without device-specific transport
  logic or fallback to the app-server plane.
- Official `review/start` and `thread/compact/start` controls for idle owned
  sessions, with terminal-turn tracking and mutually exclusive work startup on
  both managed device layouts.
- A disabled-by-default desktop-control feasibility contract with exact version
  and capability gating, revision-bound task-selection offers, stale-target
  rejection, and fail-closed cleanup semantics.
- A source-clean, content-free desktop feasibility probe that proved task
  listing, reversible task selection, exact version gating, and listener
  cleanup without enabling renderer access in the packaged plugin.
- ADR 0006 defining a hybrid authority model: official typed app-server
  operations for Sandalphon-owned work plus a narrowly version-gated desktop
  co-presence feasibility boundary.
- Composable Session Status, Resume Session, Attention, and Stream Deck +
  Sessions dial actions for use alongside ordinary controls in user profiles.
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
