# ADR 0007: Isolate Desktop Co-Presence in a Supervised Companion

- Status: Accepted for bounded feasibility
- Date: 2026-07-21
- Decision: SO1-180

## Context

ADR 0006 accepted exact-version desktop co-presence as a narrow feasibility
exception for listing and selecting Codex desktop tasks. The independent proof
succeeded. A later attempt to put controlled Codex launch, renderer attachment,
cleanup, settings, and device routing inside the Stream Deck plugin passed its
deterministic and packaging gates but failed repeated physical lifecycle
validation. The plugin could restore a normal Codex process and close its
listener yet still retain recovery state. Restarting the Stream Deck host also
restarts the plugin at exactly the point where stable ownership is most needed.

That implementation was closed without merge. Its result rejects the process
boundary, not the exact-gated task capability or the official app-server
controls already on `main`.

The replacement must remain independently authored from Sandalphon's accepted
contracts and public interfaces. It must not use another implementation as a
source. It must also avoid another physical restart loop until ownership,
recovery, and cleanup can be proven without Stream Deck hardware.

## Decision

Move every privileged desktop lifecycle responsibility into a separately
supervised, same-user companion process. The Stream Deck plugin becomes an
unprivileged client of a narrow local protocol and never launches, terminates,
or attaches to Codex desktop.

### Ownership

The production companion will run under a per-user launchd service. It alone
may:

- create and retain the controlled-launch record;
- choose the random loopback debugging port;
- launch the exact allowlisted Codex executable with the bounded listener;
- prove the exact application, Chromium, CDP, page, and task capabilities;
- attach to that exact renderer;
- terminate only the exact controlled process it owns;
- verify listener removal; and
- restore and verify an argument-free normal Codex launch.

The plugin may request status, start, stop, and recovery through the companion.
Task listing and revision-bound task selection may be added to the same
protocol only after live lifecycle feasibility passes. A plugin disconnect has
no process-lifecycle consequence. It neither stops controlled Codex nor weakens
the companion's cleanup authority.

### Local IPC

The companion listens on one Unix-domain socket inside a companion-owned
runtime directory. The directory is owned by the current uid with mode `0700`;
the socket has mode `0600`. The native socket path is limited to 103 UTF-8
bytes so macOS cannot silently truncate it. The initial protocol is version 1,
uses newline-delimited JSON capped at 4096 raw bytes per line, permits at most
eight simultaneous clients and one request per connection, destroys every
active client connection during shutdown, and accepts only this exact request
envelope:

```json
{
  "protocolVersion": 1,
  "requestId": "opaque-client-id",
  "method": "status|start|stop|recover"
}
```

The OS ownership and mode boundary authenticates the accepted same-user client
class. It does not protect against a malicious process already running as the
same macOS user; neither does the privileged loopback renderer listener. A
bearer token stored beside the socket would not improve that same-user threat
boundary, so the first protocol adds no custom secret store. Request ids are
bounded correlation values, not authority. Malformed, oversized, extra-field,
or future-version requests receive one content-free error and the connection
closes.

Responses contain only lifecycle state, counters, failure categories,
allowlisted capability names, and bounded opaque task identity when the
existing desktop-control contract is ready. They contain no task titles,
prompts, responses, reasoning, diffs, commands, credentials, renderer payloads,
or raw driver errors.

### Lifecycle

The companion exposes exactly six lifecycle states:

| State              | Meaning                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `stopped`          | No controlled authority is retained; normal Codex is the required terminal condition.                    |
| `starting`         | Launch or restart reconciliation is in progress; no client action authority exists.                      |
| `ready`            | Exact process, listener, version, renderer, and task capabilities are proven.                            |
| `degraded`         | Prior authority was revoked after a start or capability failure; serialized cleanup follows immediately. |
| `cleaningUp`       | Exact controlled-process termination, listener removal, and normal restart verification are in progress. |
| `recoveryRequired` | Ownership or cleanup is ambiguous; automatic relaunch and task actions remain disabled.                  |

Every transition advances a monotonic sequence. Renderer authority is carried
only by the existing exact-version desktop-control state. Capability loss
immediately revokes every task target and offer before cleanup begins.

Start, stop, and recovery operations are serialized across all clients. A
start is bounded to 30 seconds, restart reconciliation to 10 seconds, and
cleanup to 30 seconds. A new supervisor begins in `recoveryRequired` and must
reconcile before it can accept Start. Drivers receive an abort signal for each
deadline plus one second to prove the timed-out operation has quiesced. A
failed or quiesced timed-out start attempts cleanup. An operation that remains
live beyond the abort fence enters `recoveryRequired` without cleanup and can
never lead to stopped state; the companion must restart before accepting
another lifecycle operation. A cleanup failure or timeout also enters
`recoveryRequired`; it never reports stopped, launches another controlled
process, or guesses at ownership. Restart reconciliation may accept only one
of three content-free results: normal, one exactly verified controlled process,
or ambiguous. Ambiguous state authorizes neither Stop nor cleanup and is never
a kill target.

### Bounded implementation sequence

The first slice implements the lifecycle supervisor, strict protocol decoder,
secure Unix-socket server, stale-socket discrimination, and deterministic
drivers. This headless proof demonstrates serialization, plugin disconnect and
reconnect, exact capability acceptance, fail-closed cleanup, and ambiguous
restart behavior without launching Codex or touching Stream Deck hardware.

The next slice may implement the macOS driver and launchd definition. It must
pass repeated cold start, companion restart, controlled-process loss, cleanup,
and normal-restart trials before the plugin gains an IPC client. Only after
those trials pass may task selection be reconnected and tested on the Stream
Deck Mk.2 and Stream Deck +.

## Consequences

- The Stream Deck plugin no longer owns a restart-sensitive Codex desktop
  lifecycle.
- The companion becomes a separately installed and supervised component with
  its own upgrade, compatibility, diagnostics, and cleanup obligations.
- A stable companion can reconcile plugin restarts without changing desktop
  process ownership.
- Same-user CDP remains a privileged opt-in risk and exact desktop version
  allowlisting remains deliberate maintenance work.
- The initial headless slice is not a supported desktop-control surface and is
  not imported into the plugin bundle.
- SO1-175 remains blocked until the live companion driver, plugin IPC client,
  and both hardware paths pass their bounded validation.
- An official shared desktop-control API still supersedes and should retire
  the private renderer boundary.

## Evidence

- [ADR 0006](0006-version-gated-desktop-control.md)
- [SO1-179 desktop-control feasibility proof](../../so1-179-desktop-control-proof.md)
- https://www.electronjs.org/docs/latest/api/command-line-switches
- https://developer.chrome.com/blog/remote-debugging-port
