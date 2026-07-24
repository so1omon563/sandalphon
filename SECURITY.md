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

SO1-180 moved the privileged desktop lifecycle boundary into a separately
supervised same-user companion. The Stream Deck plugin must not launch,
terminate, or attach to Codex desktop. The headless companion proof accepts
local clients only through a current-uid runtime directory with mode `0700` and
a Unix socket with mode `0600`. It rejects socket paths beyond the macOS native
bound, caps newline-delimited JSON requests at 4096 raw bytes, accepts only an
exact versioned method envelope with one request per connection, and emits
content-free failure categories. Shutdown destroys all active client
connections before unlinking the socket, including clients with incomplete
requests. Supervisor start, reconciliation, and cleanup
operations have fixed deadlines, abort signals, and an abort-quiescence fence.
A protocol revision 2 failure diagnostic may retain one prior allowlisted
failure category and the numeric renderer target count; it never includes
target metadata or renderer content.
A reported loss of an accepted renderer capability revokes authority and
queues cleanup in the same serialized lifecycle operation.
A fresh supervisor must reconcile before Start. An operation that remains live
after its fence authorizes neither cleanup nor stopped state until the
companion restarts, and ambiguous recovery authorizes no termination target.
These permissions exclude other local users but do not defend against a
malicious process already running as the same user. No live macOS driver or
plugin client is enabled by the headless proof.

SO1-196 implements the macOS driver behind that same boundary. The companion
persists an owner-only launch record before stopping normal Codex, admits only
the current uid and exact PID/start-time/control-marker tuple, requires the
listener owner to match that process or a same-user direct child whose parent
is still that exact process, and rechecks the official OpenAI bundle
and Team ID, sealed code signature, Gatekeeper assessment, exact renderer page,
CDP protocol, and bounded task contract. A new signed build gains authority
only after a reversible task-selection canary restores the original task and
writes an owner-only receipt bound to its code hash, build identity, renderer
engine, protocol, and Sandalphon contract revision. Receipt or contract drift
fails closed and requires requalification, not a source-level version
allowlist change. Cleanup terminates only the recorded process, verifies
listener removal, and restores exactly one argument-free normal Codex process.
Ambiguous ownership fails closed without creating another controlled process
or choosing a termination target. An inherited child listener never becomes a
termination target; cleanup still signals only the exact recorded parent and
requires every inherited listener descriptor to close. The per-user LaunchAgent installs an
owner-only companion artifact and records; its management output omits opaque
task identifiers and renderer content. The driver remains an explicit
development feasibility surface until its bounded live lifecycle matrix
passes, and the Stream Deck plugin still has no companion client.

Issues in Codex, Stream Deck, macOS, Node.js, or a package dependency should be
reported upstream unless Sandalphon directly contributes to the vulnerability.

## Response

Credible reports are triaged privately. Fixes and mitigations are prepared
before coordinated public disclosure when practical.
