# Repository Guidelines and DOX Rail

## DOX Framework

This repository uses AGENTS.md files as binding work contracts for their
subtrees. The root file is the project-wide rail for durable workflow rules,
quality expectations, constraints, and the Child DOX Index.

### Core Contract

- Work must remain understandable from the nearest applicable AGENTS.md plus
  each parent AGENTS.md above it.
- A child file may specialize local rules but must not weaken this root
  contract.
- Re-read the applicable DOX chain in the current session before editing. Do
  not rely on remembered repository rules.

### Read Before Editing

1. Read the root AGENTS.md.
2. Identify each path expected to change.
3. Walk from the repository root to each target.
4. Read every AGENTS.md on that route.
5. Use the nearest file as the local contract together with every parent.

### Update After Editing

Every meaningful change requires a DOX pass. Update the closest owning
AGENTS.md when a change affects durable structure, responsibilities, inputs,
outputs, constraints, side effects, quality gates, or workflow. Update parent
indexes when child boundaries change. Small edits may leave the docs unchanged,
but the pass still occurs.

### Child DOX Index

There are no child AGENTS.md files yet. This root owns the contracts for:

- .github/workflows: CI, version tagging, and future release automation.
- dev.so1omon.sandalphon.sdPlugin: distributable manifest and immutable plugin
  assets.
- src: plugin bootstrap, application/domain seams, Stream Deck presentation,
  and supported agent integrations.
- test: deterministic unit and contract tests.
- docs: development guidance, architecture decisions, and the accepted Classic
  15 interaction map.
- artwork: editable sources for original Sandalphon visual assets.
- scripts: deterministic repository tooling, including visual-asset export and
  stale-output checks.
- Root project files: public introduction, design, contribution, security,
  licensing, changelog, build, formatting, and package configuration.

Add a child AGENTS.md only when a subtree gains durable local rules that would
make this root rail too broad.

## Project Structure

Sandalphon is a macOS-first Node.js Stream Deck plugin.

- dev.so1omon.sandalphon.sdPlugin contains the Stream Deck manifest, generated
  bin/plugin.js bundle, and runtime assets.
- src/plugin.ts owns SDK registration and connection.
- src/actions contains Stream Deck event adapters. Keep business rules out of
  individual action handlers.
- src/domain contains the transport-neutral state model, reducer, action-offer
  validation, invocation locking, and consequential confirmation reducer.
- src/presentation.ts resolves the two reference capability profiles into
  coherent device-neutral frames.
- src/classic15.ts defines the exact managed Classic 15 role map, bounded
  detail pagination, and key-based ordered-choice movement.
- src/harness.ts provides deterministic simulated Codex and surface boundaries;
  it is test support for the product contract, not live transport.
- src/foundation.ts retains the minimal installed-plugin status contract until
  later milestones wire the domain core into the Stream Deck runtime.
- test contains Vitest unit and manifest-contract coverage.
- docs/architecture/decisions contains numbered ADRs.
- artwork/source contains editable original asset sources.

The first reference devices are the 15-key Stream Deck Classic capability class
and the standard Stream Deck +. Do not generalize to other agents, transports,
or hardware until a concrete requirement proves the seam.

## Independent Source Contract

- Implement from Sandalphon's accepted behavior contracts and public official
  interfaces.
- Do not copy, transform, translate, or reconstruct source, tests,
  documentation, assets, generated artifacts, commit history, naming, or
  implementation structure from another implementation.
- Keep public artifacts source-clean. Do not include private repository names,
  local paths, employer provenance, or renamed-port framing.
- Preserve Sandalphon's own vocabulary, visual identity, tests, and history.
- Third-party dependencies and assets must be intentional, licensed, and
  recorded. Repository-authored code, documentation, and artwork are MIT unless
  a file says otherwise.

## Build, Test, and Development Commands

Use Node.js 24 or newer and Stream Deck 7.1 or newer.

- make install: install the locked dependency graph.
- make format: verify Prettier formatting.
- make lint: run type-aware ESLint.
- make typecheck: run strict TypeScript checks.
- make test: run deterministic Vitest tests.
- make coverage: enforce the current coverage threshold.
- make build: bundle the plugin into the sdPlugin directory.
- make validate: run official Stream Deck validation.
- make package: produce a local installer under dist.
- make check: run every pre-PR quality gate.

Use npm ci from a clean checkout. Commit package-lock.json whenever dependency
resolution changes.

The official Stream Deck CLI normalizes manifest.json when it packages a
plugin. That file is excluded from Prettier and remains protected by strict
manifest contract tests plus the official validate and pack checks.

## Coding Style and Architecture

- Use strict TypeScript and ES modules.
- Classes use PascalCase; functions and variables use camelCase; durable
  constants use UPPER_SNAKE_CASE only when they are true constants.
- Prefer small pure functions for state reduction, validation, and
  presentation. Keep SDK callbacks thin.
- Stream Deck adapters emit user intent and render application state; they do
  not parse raw provider messages or construct provider commands.
- Codex-specific transport stays explicit behind the Sandalphon domain
  boundary. Do not hide the first real implementation behind speculative
  provider frameworks.
- Treat settings and transport inputs as untrusted runtime data even when
  TypeScript declarations exist.
- Avoid content-bearing logs by default. Never log credentials, prompts,
  responses, reasoning, diffs, commands, approval payloads, or environment
  values.

## Testing Guidelines

- Add deterministic tests for every behavior or contract change.
- Keep `artwork/visual-language.json` authoritative for semantic visual tokens;
  regenerate and commit `artwork/generated` outputs after token changes.
- Prefer pure fixtures and fake boundaries over live Codex, network, or Stream
  Deck dependencies.
- Keep manifest, package identity, minimum runtime, and action safety properties
  under contract tests.
- Hardware-facing work needs unit/contract coverage plus a documented real
  Stream Deck verification note when the behavior reaches a device milestone.
- Run make check before opening or updating a pull request.

## Commit and Pull Request Guidelines

- Create or switch to a scoped codex/<scope> branch before editing. Do not
  accumulate work directly on main.
- Use short imperative commit subjects and keep each commit to one logical
  change.
- All repository changes flow through pull requests. Main is protected; force
  pushes and branch deletion are blocked.
- Open a draft PR after first publication unless the work is explicitly
  canceled. Move it to ready when implementation and local checks are complete.
- PRs include the Linear issue key when applicable, a concise summary, impact,
  checks run, and any config, migration, packaging, or security implications.
- Use exactly one #patch, #minor, or #major marker in titles when a merge should
  create a version tag. Add #release only when the same merge should publish a
  GitHub Release and plugin package. Explain intentional no-bump PRs.
- Keep Linear work In Review while its PR is open and move it to Done only after
  merge.
- Codex review is the default. Merge only after required CI passes, the branch
  is mergeable, actionable review threads are resolved, and the bounded Codex
  review completes.

## Security and Configuration

- Never commit API keys, account tokens, OAuth data, cookies, local settings,
  debug logs, or credential material.
- Sandalphon reuses the selected Codex CLI authentication; it does not own
  credentials.
- Keep consequential-action confirmation and permission boundaries
  fail-closed.
- Use SECURITY.md for private vulnerability reporting and keep it aligned with
  credential, transport, plugin package, and release changes.

## Closeout

Before finishing:

1. Re-check changed paths against the DOX chain.
2. Update owning documentation when durable contracts changed.
3. Run the relevant checks, normally make check.
4. Record user-visible changes in CHANGELOG.md under Unreleased.
5. Report validation, review state, and anything intentionally deferred.
