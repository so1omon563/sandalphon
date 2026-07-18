# ADR 0001: Independent Stream Deck Plugin Foundation

- Status: Accepted
- Date: 2026-07-17
- Decision: SO1-167

## Context

Sandalphon needs a source repository that can build and test an original
minimal plugin before Codex transport, domain state, or device layouts are
implemented.

The foundation must support the current official Stream Deck SDK while keeping
the product model, trust boundaries, and future device work understandable. It
must also make repository provenance and public quality standards explicit.

## Decision

- Use one public repository with its own package identity, history, source,
  tests, documentation, artwork, and assets.
- Use Node.js 24, TypeScript ES modules, Stream Deck SDK version 3, and Stream
  Deck 7.1 as the minimum desktop baseline.
- Build the Node plugin with Rollup and the official Elgato Node SDK.
- Keep src/plugin.ts as the application composition root and Stream Deck action
  handlers as thin adapters.
- Validate format, type-aware lint, strict types, deterministic tests and
  coverage, bundle output, the official manifest rules, and package assembly
  before merge.
- Use root DOX guidance, protected main, scoped branches, pull requests, CI,
  bounded Codex review, and opt-in semantic version markers consistently with
  the maintainer's other repositories.
- License repository-authored code, documentation, and visual assets under MIT.
- Permit implementation inputs only from Sandalphon requirements and public
  official interfaces. Do not import implementation expression from another
  implementation.

## Consequences

- The foundation action proves packaging and SDK wiring but does not claim
  Codex integration or reference-device MVP behavior.
- Managed profiles, configuration UI, Codex transport, the domain reducer, and
  device-native layouts remain owned by their later milestones.
- GitHub Release and Marketplace publication stay disabled until the v0.1
  release gate can package and validate a useful product.
- New durable architectural decisions receive numbered ADRs rather than being
  hidden in implementation commits.

## Evidence

- https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/
- https://docs.elgato.com/streamdeck/sdk/references/manifest/
- https://docs.elgato.com/streamdeck/cli/commands/validate/
- https://docs.elgato.com/streamdeck/cli/commands/pack/
