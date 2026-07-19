# Contributing

Thanks for helping build Sandalphon. The project values focused changes,
explicit state, human control, and calm Stream Deck-native interaction.

## Local Setup

Install Node.js 24 or newer, Stream Deck 7.1 or newer, and the Stream Deck
desktop application.

    git clone https://github.com/so1omon563/sandalphon.git
    cd sandalphon
    nvm use
    npm ci
    make check

Use npm run dev:link once to link the local sdPlugin directory. After a build,
npm run dev:restart restarts the plugin in Stream Deck.

## Pull Requests

- Create a scoped branch before editing; do not work directly on main.
- Keep each PR to one logical change.
- Include tests or a clear validation note.
- Run make check before requesting review.
- Update CHANGELOG.md under Unreleased for user-visible changes.
- Include the Linear issue key when work is tracked there.
- Use #patch, #minor, or #major in the title only when the merge should create a
  version tag.
- Add #release only when the merge is intentionally prepared to publish a
  GitHub Release and installable plugin.
- Explain why a maintenance PR intentionally omits a version marker.

Release preparation must satisfy the
[first public release gate](docs/release-gate.md). Do not add `#release` while
the recorded decision is no-ship or while the candidate artifact differs from
the reviewed bytes.

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
