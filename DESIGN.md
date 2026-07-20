# Design

## Product Role

Sandalphon carries human intent from a physical control surface into a software
agent and returns useful state, context, and attention to the operator.

The Stream Deck is both an input device and an ambient status surface. A control
represents what the user is trying to accomplish, not merely an underlying
command.

## Initial Product

The first implementation is deliberately concrete:

- Codex-first
- Elgato Stream Deck-first
- macOS-first
- designed first for the 15-key Stream Deck Classic capability class and the
  standard Stream Deck +
- useful as a daily interface rather than only a technical demonstration

This focus does not make current Codex commands or one physical layout the
permanent product definition.

## Principles

1. Model intent, not transport commands.
2. Make reliable agent state legible.
3. Preserve human control around approval, cancellation, retry, redirection,
   and future-setting changes.
4. Use keys, encoders, touch, profiles, pages, labels, and visual state as real
   hardware affordances.
5. Prefer contextual but predictable controls over a huge static action grid.
6. Add abstractions only after a second concrete need appears.
7. Keep general agent concepts distinct from Codex integration details where
   the distinction is already real.
8. Build an original Stream Deck-native interaction and visual language.

## Architectural Direction

The first system has four production responsibilities:

1. a Codex integration that owns an official app-server lifecycle;
2. a Sandalphon domain core that reduces supported provider facts into stable
   agent state and validates user intent;
3. Stream Deck presentation for the two reference device profiles;
4. validated user configuration with useful defaults.

Sandalphon uses a hybrid Codex control model. App-server-owned sessions route
supported intent through official typed RPCs for turns, steering, interruption,
compaction, review, model selection, and approvals. Slash commands remain CLI
UI affordances; Sandalphon does not inject them as prompt text. An opt-in
feasibility boundary may separately test direct task selection in the active
Codex desktop workspace. It is not production authority: exact desktop,
engine, and protocol versions plus live task-list and task-selection
capabilities must match before it can issue a revision-bound selection offer.
See [ADR 0006](docs/architecture/decisions/0006-version-gated-desktop-control.md).

Each task is explicitly app-server-owned, desktop-controlled, historical-only,
or unavailable. Presentation invokes Sandalphon intent without selecting a
transport; the application layer routes only through the authority proven for
that task and never silently falls back between planes.

Raw provider parsing and command construction do not live in individual key or
dial handlers. Presentation consumes Sandalphon state and invokes typed offers.

## Deterministic Core

The transport-neutral core is executable without a Codex process or physical
device. It reduces authoritative events into orthogonal integration, session,
run, request, result, attention, and next-turn-setting state. Presentation
receives a complete snapshot and opaque action offers; it never supplies raw
provider identifiers or command parameters.

Offers are bound to one connection epoch and snapshot revision. Invocation
validation checks current selection, ownership, freshness, run and request
identity, inspection, advertised decisions, and ordered options before a side
effect can be dispatched. One invocation id and effect key suppress duplicate
or racing device input inside the current process.

Consequential confirmation is a separate deterministic reducer. Review,
inspection, arming, 800 ms hold, expiry, invalidation, and dispatch do not
change provider truth by themselves. Simulated Codex, Classic 15, and Stream
Deck + boundaries prove these rules deterministically; the managed Classic 15
and Plus adapters then apply the same contracts to the live Codex app-server
and Stream Deck SDK.

## Safety

Physical input is not authority by itself. Consequential actions require
current, inspectable context and fixed confirmation semantics. Stale,
ambiguous, unsupported, or unowned state narrows capability and fails closed.

## Visual Language

Liminal Signal is Sandalphon's original visual system. It uses one deep dark
surface, system typography, the existing bridge identity, and six semantic
state treatments. Every state combines an exact label, a unique geometric
glyph, and a contrast-tested accent; color never carries meaning alone.

Classic 15 and Stream Deck + share these semantics while using compositions
native to their displays. V0 status is static: no looping or animated assets.
Editable JSON and SVG sources are authoritative, generated references are
deterministic, and every current asset is repository-authored under MIT. See
[Visual Language](docs/visual-language.md) and [Asset Policy](ASSETS.md).

The Classic 15 managed experience has an exact 5-by-3 spatial contract for
selection, roster paging, local navigation, ordered choices, consequential
review, and recovery. See the
[Classic 15 Interaction Map](docs/classic-15-interaction-map.md).

The managed Stream Deck + experience has an exact eight-key and four-encoder
contract for roster and action previews, dial-press choice commit, coordinated
request detail, conservative touch, consequential review, and recovery. See
the [Stream Deck + Interaction Map](docs/stream-deck-plus-interaction-map.md).

## Scope Discipline

The initial implementation does not introduce provider, hardware, persistence,
or configuration plugin frameworks. It also does not become a generic macro
launcher. Concrete evidence must justify new seams.
