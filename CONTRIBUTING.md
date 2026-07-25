# Contributing

Sandalphon is a canceled feasibility project with no active implementation
roadmap or supported release. The repository is preserved as research evidence.

Do not submit feature, hardware-integration, packaging, or release changes
unless the reactivation conditions in `AGENTS.md` have been met first.

## Preservation Changes

Documentation corrections, dependency maintenance needed to keep the preserved
source inspectable, and responsible security fixes may still be considered.
They must not claim that Sandalphon controls Codex Desktop or restore an active
product workflow.

For source-only verification:

    git clone https://github.com/so1omon563/sandalphon.git
    cd sandalphon
    nvm use
    npm ci
    make check

Do not link the plugin into Stream Deck or create an installer for normal use.

## Pull Requests

- Create a scoped branch before editing; do not work directly on main.
- Keep each PR to one logical change.
- Include tests or a clear validation note.
- Run make check before requesting review.
- Update CHANGELOG.md under Unreleased for user-visible changes.
- Include the Linear issue key when work is tracked there.
- Omit version and release markers. The project has no supported release path.

Main is protected. Required CI, mergeability, resolved review threads, and the
bounded Codex review must complete before merge.

## Architecture Decisions

Use a numbered ADR in docs/architecture/decisions for durable choices that
affect responsibilities, public contracts, trust boundaries, persistence,
safety, or release behavior.

An ADR records status, context, decision, consequences, and evidence. Replace a
decision with a new superseding ADR rather than silently rewriting history.

## Independent Source and Assets

Contributions must be authored for Sandalphon from its requirements and public
official interfaces. Do not copy, translate, reconstruct, or import source,
tests, documentation, assets, generated artifacts, history, or implementation
structure from another implementation.

Original repository content is MIT licensed. Record any approved third-party
asset or source with its license and provenance before committing it. Never
commit assets with unclear rights.

## Security

Do not commit credentials, tokens, local settings, logs, prompt or response
content, approval payloads, or environment values. Follow SECURITY.md for
private vulnerability reporting.
