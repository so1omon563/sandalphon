# Sandalphon

[![CI](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml/badge.svg)](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml)

Sandalphon is a human interface layer for directing and supervising software
agents from physical control surfaces.

The first implementation is Codex-first, Elgato Stream Deck-first, and
macOS-first. It treats Stream Deck hardware as a persistent interface to active
agent work: useful controls in, legible state and attention out.

## Current Status

The repository currently contains the independent foundation:

- an original Node.js 24 and TypeScript Stream Deck plugin;
- a minimal Foundation Status action;
- strict formatting, linting, type checking, tests, coverage, build, validation,
  and packaging gates;
- public contribution, design, security, licensing, and architecture guidance;
- CI and opt-in semantic version tagging.

Codex transport, domain state, managed Classic 15 and Stream Deck + profiles,
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
