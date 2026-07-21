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

`scripts/probe-desktop-control.mjs` implements only that bounded proof. It
rejects non-loopback discovery, version drift, multiple or malformed page
targets, malformed task state, and failed restoration. It never emits task
identifiers or content. Running it does not authorize production use; normal
Codex restart and listener verification are mandatory after every proof.

SO1-180 moves any future privileged desktop lifecycle into a separately
supervised same-user companion. The Stream Deck plugin must not launch,
terminate, or attach to Codex desktop. The headless companion proof accepts
local clients only through a current-uid runtime directory with mode `0700` and
a Unix socket with mode `0600`. It rejects socket paths beyond the macOS native
bound, caps newline-delimited JSON requests at 4096 raw bytes, accepts only an
exact versioned method envelope with one request per connection, and emits
content-free failure categories. Supervisor start, reconciliation, and cleanup
operations have fixed deadlines and abort signals; a timeout cannot leave the
surface ready or permit an automatic relaunch.
These permissions exclude other local users but do not defend against a
malicious process already running as the same user. No live macOS driver or
plugin client is enabled by this proof.

Issues in Codex, Stream Deck, macOS, Node.js, or a package dependency should be
reported upstream unless Sandalphon directly contributes to the vulnerability.

## Response

Credible reports are triaged privately. Fixes and mitigations are prepared
before coordinated public disclosure when practical.
