# Security Policy

## Supported Versions

Security fixes are provided for the latest released Sandalphon version. During
pre-release development, fixes land on main and are included in the next
published package.

## Reporting a Vulnerability

Do not open a public issue with vulnerability details.

Use GitHub private vulnerability reporting:

https://github.com/so1omon563/sandalphon/security/advisories/new

If private reporting is unavailable, open a public issue asking for a private
maintainer contact path without including exploit details, credentials, logs,
agent content, repository data, or local configuration.

Useful reports include the affected version, macOS and Stream Deck versions,
minimal reproduction, expected impact, and whether credentials, agent actions,
plugin packaging, or update integrity may be affected.

## Scope

Security-sensitive areas include:

- Codex child-process ownership and app-server message validation;
- the 16 MiB raw UTF-8 per-line Codex app-server boundary, which accepts bounded
  resume history pages and closes the transport on malformed or oversized
  traffic;
- approval, interruption, retry, redirect, and action-offer validation;
- settings validation, migration, and secret exclusion;
- content-free logging and error handling;
- Stream Deck package integrity and release automation;
- dependency and supply-chain changes.

The optional Codex desktop-control plane is privileged and disabled by default.
The Stream Deck property inspector presents the same-user listener warning and
requires explicit opt-in before Sandalphon launches or attaches. The runtime
accepts only the exact documented application, Chromium, and CDP tuple, one
verified `127.0.0.1` page endpoint, the exact Codex process arguments, and live
`task.list` plus `task.select` capabilities. It retains only bounded opaque task
identifiers and selected booleans in memory; settings persist only the opt-in
boolean. Diagnostics contain no task identifiers or Codex content.

Disabling desktop control, a normal plugin shutdown, or a detected transport
failure immediately revokes every task offer and attempts to terminate the
controlled Codex process, verify the random listener is gone, and reopen Codex
normally. The opt-in remains set when cleanup cannot be verified so the next
plugin run does not mistake an incomplete cleanup for a safe disabled state.
The property inspector then requires a normal Codex restart. A loopback Chrome
DevTools listener still exposes renderer authority to other processes running
as the same macOS user while the mode is active.

`scripts/probe-desktop-control.mjs` remains the bounded source-clean proof tool.
It rejects non-loopback discovery, version drift, multiple or malformed page
targets, malformed task state, and failed restoration, and never emits task
identifiers or content.

Issues in Codex, Stream Deck, macOS, Node.js, or a package dependency should be
reported upstream unless Sandalphon directly contributes to the vulnerability.

## Response

Credible reports are triaged privately. Fixes and mitigations are prepared
before coordinated public disclosure when practical.
