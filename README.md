# Sandalphon

[![CI](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml/badge.svg)](https://github.com/so1omon563/sandalphon/actions/workflows/ci.yml)

> [!CAUTION]
> **Sandalphon is a canceled feasibility project, not a functional Codex Desktop
> controller. Do not install it expecting to control Codex Desktop from a
> Stream Deck.**
>
> The plugin can display limited state and its research code can invoke
> operations in separate Sandalphon-owned Codex app-server sessions. It cannot
> control or visibly update the active task in the Codex Desktop app, expose
> useful results there, or provide a practical continuation workflow. No
> supported release exists.

Sandalphon explored a Codex-first, Elgato Stream Deck-first, macOS-first human
interface for software agents. The repository is preserved as research evidence
after the core product requirement proved infeasible through supported
interfaces.

## Feasibility Result

The project established two important boundaries:

- The official Codex app-server interface can operate a separate
  Sandalphon-owned session, but it does not control the user's active visible
  Codex Desktop task.
- The private Desktop mechanisms explored during feasibility work are
  unsupported and sensitive to frequent Codex Desktop updates, so they are not
  a viable product foundation.

Physical-device testing confirmed that the Stream Deck presentation and status
reporting worked. It did not turn the hardware into a useful Codex Desktop
controller. Further hardware refinement was stopped because it could not solve
that missing control path.

The source, tests, architecture decisions, visual assets, and experimental
integration work remain available for study. Development and release work are
stopped unless Codex gains a supported interface for controlling the active
Desktop task, or the user explicitly reopens unsupported private-interoperability
research with its compatibility and maintenance risks acknowledged. The root
`AGENTS.md` is the governing reactivation contract.

## Requirements

- macOS 13 or newer
- Node.js 24 or newer
- Stream Deck 7.1 or newer
- Codex CLI 0.144.1
- Stream Deck Mk.2 or standard Stream Deck + for the supported hardware paths

## Research Build

    nvm use
    npm ci
    make check

These commands verify the preserved source; they do not produce a functional
Codex Desktop controller. Do not link or package Sandalphon for normal use.

See the historical [development record](docs/development.md) for research
context.
The historical [first public release gate](docs/release-gate.md) remains as part
of the research record; the project did not meet it and no release is planned.

## Research Record

The historical [design](DESIGN.md), [architecture
decisions](docs/architecture/decisions), interaction maps, visual system, and
asset policy are preserved for study. They are not supported product contracts
or an active roadmap. [ADR 0008](docs/architecture/decisions/0008-cancel-product-feasibility.md)
is the authoritative closeout decision.

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
