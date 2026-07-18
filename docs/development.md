# Development

## Prerequisites

- macOS 13 or newer
- Node.js 24 or newer
- Stream Deck 7.1 or newer
- Stream Deck desktop application and a reference device for hardware checks

The repository records Node 24 in .nvmrc and .node-version. Newer supported
local Node versions may run the checks, but CI and the plugin manifest use Node
24 as the compatibility baseline.

## Setup

    nvm use
    npm ci
    npm run dev:link

The link command builds the plugin first, then enables Stream Deck developer
mode and points the desktop application at the repository sdPlugin directory.

## Daily Commands

    make format
    make lint
    make typecheck
    make test
    make build
    make validate
    npm run dev:restart

Before a pull request:

    make check

The check target validates formatting, lint, strict types, deterministic
coverage, bundle output, manifest structure, and a package dry run.

## Packaging

    make package

This creates an installable streamDeckPlugin file under dist. Local package
artifacts and generated bundles are ignored by Git.

## Device Verification

Automated checks cannot prove physical interaction quality. Device milestones
record the Stream Deck application version, reference hardware, visible state,
input exercised, expected result, and observed result.

Do not claim Classic 15 or Stream Deck + behavior from a build alone.

## Node Resolution on macOS

Multiple Node installations may coexist. Verify which -a node and node
--version when results differ between the shell, editor, and Stream Deck.
Sandalphon requires Node 24 or newer for development and declares Node 24 in the
plugin manifest.
