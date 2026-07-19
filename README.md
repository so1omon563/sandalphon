# Sandalphon

[![CI](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml/badge.svg)](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml)

Sandalphon is a human interface layer for directing and supervising software
agents from physical control surfaces.

The first implementation is Codex-first, Elgato Stream Deck-first, and
macOS-first. It treats Stream Deck hardware as a persistent interface to active
agent work: useful controls in, legible state and attention out.

## Current Status

The repository currently contains the independent foundation and deterministic
behavioral core:

- an original Node.js 24 and TypeScript Stream Deck plugin;
- a minimal Foundation Status action;
- strict formatting, linting, type checking, tests, coverage, build, validation,
  and packaging gates;
- immutable agent/session/run state reduction with latched terminal results;
- revision- and connection-bound action offers with fail-closed validation;
- deterministic confirmation, invocation locking, and duplicate suppression;
- explicit Classic 15 and Stream Deck + capability frames plus simulated Codex
  and surface adapters;
- an exact Classic 15 managed interaction map with stable anchors, key-native
  ordered choices, bounded request review, and deterministic acceptance
  fixtures;
- an exact Stream Deck + managed interaction map with contextual dial lanes,
  separate press commits, coordinated strip review, conservative touch, and
  deterministic acceptance fixtures;
- the original Liminal Signal state palette, icon grammar, deterministic SVG
  references, and redistributable asset-provenance policy;
- public contribution, design, security, licensing, and architecture guidance;
- CI and opt-in semantic version tagging.

Live Codex transport, Stream Deck SDK event wiring, physical-device validation,
and daily-driver behavior are intentionally delivered in later milestones.

## Requirements

- macOS 13 or newer
- Node.js 24 or newer
- Stream Deck 7.1 or newer
- Elgato Stream Deck hardware for device verification

## Development

    nvm use
    npm ci
    make check

To link the local plugin into Stream Deck:

    npm run dev:link
    npm run dev:restart

To create a local installer:

    make package

See [Development](docs/development.md) for the complete local workflow.

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
