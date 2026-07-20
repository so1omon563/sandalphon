# Sandalphon

[![CI](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml/badge.svg)](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml)

Sandalphon is a human interface layer for directing and supervising software
agents from physical control surfaces.

The first implementation is Codex-first, Elgato Stream Deck-first, and
macOS-first. It treats Stream Deck hardware as a persistent interface to active
agent work: useful controls in, legible state and attention out.

## Current Status

The repository currently contains the independent foundation, deterministic
behavioral core, and verified live integrations for Stream Deck + and the
15-key Stream Deck capability class:

- an original Node.js 24 and TypeScript Stream Deck plugin;
- self-contained Session Status, Resume, Attention, and Stream Deck + Sessions
  dial actions for ordinary user profiles;
- strict formatting, linting, type checking, tests, coverage, build, validation,
  and packaging gates;
- immutable agent/session/run state reduction with latched terminal results;
- revision- and connection-bound action offers with fail-closed validation;
- an explicit opt-in, exact-version desktop co-presence path for opaque task
  listing and task selection, with a source-clean reversible proof;
- deterministic confirmation, invocation locking, and duplicate suppression;
- an owned Codex app-server lifecycle with validated local configuration,
  bounded JSON-RPC framing, live session discovery, resume, official change
  review and context compaction, and next-turn settings;
- explicit Classic 15 and Stream Deck + capability frames plus deterministic
  simulated boundaries;
- an exact Classic 15 managed interaction map with stable anchors, key-native
  ordered choices, bounded request review, and deterministic acceptance
  fixtures;
- an exact Stream Deck + managed interaction map with contextual dial lanes,
  separate press commits, coordinated strip review, conservative touch, and
  deterministic acceptance fixtures;
- a generated managed Stream Deck + profile, live SDK key and encoder adapters,
  and physical-device verification on Stream Deck 7.5;
- a generated managed Classic 15 profile, live 15-key SDK adapter, and the exact
  accepted key-native roster, session, action, choice, and request surfaces;
- the original Liminal Signal state palette, icon grammar, deterministic SVG
  references, and redistributable asset-provenance policy;
- public contribution, design, security, licensing, and architecture guidance;
- CI, opt-in semantic version tagging, and an evidence-backed
  first-public-release gate.

The bundled managed profiles remain optional full-surface reference and
consequential-review environments. Normal daily use is being validated through
the composable controls so Sandalphon can coexist with the user's ordinary
Stream Deck actions without a profile Exit dependency.

Sandalphon uses a hybrid control model. Sandalphon-owned sessions use official
typed app-server operations for Codex workflows such as turns, interruption,
compaction, review, and model selection. An optional second plane can select a
task already open in the exact supported Codex desktop build. It is disabled
by default and requires an explicit property-inspector consent because its
random loopback Chrome DevTools listener grants privileged renderer access to
other processes running as the same macOS user. Missing capabilities, version
drift, stale targets, disconnect, or cleanup remove every desktop offer.

Desktop control is limited to opaque task listing and selection. It cannot
submit composer text, answer requests, approve, reject, interrupt, change
reasoning, or invoke generalized desktop automation. See
[Development](docs/development.md) and [Security](SECURITY.md) before enabling
it.

## Requirements

- macOS 13 or newer
- Node.js 24 or newer
- Stream Deck 7.1 or newer
- Codex CLI 0.144.1
- Stream Deck Mk.2 or standard Stream Deck + for the supported hardware paths

## Development

    nvm use
    npm ci
    make check

To link the local plugin into Stream Deck:

    npm run dev:link
    npm run dev:restart

To create a local installer:

    make package

To build an evidence-bearing release candidate after all manual release gates
are satisfied:

    make release-candidate

See [Development](docs/development.md) for the complete local workflow.
The [first public release gate](docs/release-gate.md) defines the exact support
boundary, physical evidence, install/upgrade/removal checks, security and
privacy claims, and artifact provenance required before publication.

## Design

Sandalphon models durable human intent and reliable agent state rather than a
grid of raw commands. Device adapters remain thin, consequential actions stay
fail-closed, and the first concrete experience takes precedence over
speculative provider or hardware frameworks.

See [Design](DESIGN.md) and the
[architecture decisions](docs/architecture/decisions).
Visual implementation follows the [Liminal Signal system](docs/visual-language.md)
and [asset policy](ASSETS.md).
The accepted Classic profile follows the
[Classic 15 interaction map](docs/classic-15-interaction-map.md).
The accepted Plus profile follows the
[Stream Deck + interaction map](docs/stream-deck-plus-interaction-map.md).
The ordinary-profile path follows the
[composable controls contract](docs/composable-controls.md).

## Independent Implementation

This repository was created with its own source, tests, documentation, artwork,
assets, package identity, and Git history. Implementation inputs are neutral
Sandalphon requirements and public official interfaces.

No source expression, generated artifact, asset, documentation, test, history,
or implementation structure from another implementation belongs here.

## Contributing and Security

See [Contributing](CONTRIBUTING.md) before opening a pull request. Report
security issues privately according to [Security](SECURITY.md).

Sandalphon is licensed under the [MIT License](LICENSE).
