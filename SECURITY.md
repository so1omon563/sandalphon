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

SO1-179 also contains a disabled-by-default feasibility contract for privileged
desktop control. Any live proof must use a random loopback-only endpoint, exact
application, engine, and protocol allowlisting, explicit user opt-in,
content-free diagnostics, and verified cleanup. It is not a supported release
surface. A loopback Chrome DevTools listener still exposes renderer authority
to other processes running as the same macOS user.

Issues in Codex, Stream Deck, macOS, Node.js, or a package dependency should be
reported upstream unless Sandalphon directly contributes to the vulnerability.

## Response

Credible reports are triaged privately. Fixes and mitigations are prepared
before coordinated public disclosure when practical.
