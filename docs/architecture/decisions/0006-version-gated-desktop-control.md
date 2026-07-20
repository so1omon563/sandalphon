# ADR 0006: Use Official Codex Control with a Version-Gated Desktop Bridge

- Status: Accepted for feasibility; production adoption pending live proof
- Date: 2026-07-20
- Decision: SO1-179

## Context

Sandalphon's owned Codex app-server connection is a sound authority boundary
for work that it starts or resumes. It cannot control a turn already active in
the Codex desktop app because that app owns a separate private connection.
Status reporting, historical selection, and Resume are not enough for a useful
daily Stream Deck interface; direct interaction with the active desktop
workspace is a product requirement.

The official app-server already exposes typed operations behind many familiar
Codex CLI workflows: thread start, resume, fork, archive, compaction, review,
turn start, steer, interruption, model and reasoning selection, and approval
responses. Slash commands are TUI affordances, not a transport contract.
Sandalphon should invoke the corresponding typed RPC instead of injecting
literal strings such as `/compact` or `/review` into user input.

Current official Codex app-server documentation includes a Unix-socket control
plane, but the installed desktop app does not expose that socket and the public
protocol does not document peer control of a turn owned by another live
client. OpenAI's Codex Micro product demonstrates active-chat switching and
other direct controls in the desktop product, but does not publish a third-
party control API.

Electron officially supports a Chrome DevTools Protocol listener. That
listener is privileged renderer access. Binding it to loopback prevents remote
hosts from connecting, but does not authenticate same-user local processes.
Chrome explicitly treats remote debugging against a real user profile as a
credential-extraction risk and requires additional isolation for Chrome 136
and newer. Private renderer capabilities can also change in any desktop build.

A bounded local probe against Codex desktop `26.715.52143`, Chromium
`150.0.7871.124`, and CDP `1.3` confirmed this compatibility risk: task status
remained observable while the previously available task-selection behavior no
longer completed.

## Decision

Adopt a hybrid control model with one Sandalphon intent layer and two explicit
Codex authority planes.

### Official app-server plane

The owned app-server remains Sandalphon's primary production control plane.
For a session it owns, Sandalphon may map supported intent directly to official
typed RPCs:

| Sandalphon intent           | Official operation                             |
| --------------------------- | ---------------------------------------------- |
| Start, resume, or fork work | `thread/start`, `thread/resume`, `thread/fork` |
| Submit or redirect work     | `turn/start`, `turn/steer`                     |
| Stop active work            | `turn/interrupt`                               |
| Compact context             | `thread/compact/start`                         |
| Review changes              | `review/start`                                 |
| Select model or reasoning   | `model/list` plus turn settings                |
| Archive or restore history  | `thread/archive`, `thread/unarchive`           |
| Resolve an approval         | the correlated server-request response         |

Client-only commands such as help and status are rendered from Sandalphon's
own state. A literal slash command is never sent as a prompt. The official
`thread/shellCommand` operation is intentionally excluded from the hardware
surface because it runs unsandboxed with full access.

### Desktop co-presence plane

Admit a second desktop-control boundary solely for the SO1-179 feasibility
proof. It fills the one capability the official owned connection lacks:
co-presence with a task already controlled by the Codex desktop app. It must
satisfy all of these constraints:

- The bridge is disabled by default and requires an explicit local opt-in.
- It binds only to `127.0.0.1` on a randomly selected port. Wildcard, LAN, and
  externally forwarded listeners are rejected.
- Sandalphon requires an exact allowlisted tuple of desktop application,
  Chromium engine, and CDP protocol versions. Ranges and best-effort fallback
  are not allowed.
- A live capability probe must independently prove `task.list` and
  `task.select` before any selection offer exists. Private handler names,
  module locations, hashes, and event shapes are not compatibility promises.
- Task identifiers and selection offers are bound to one connection epoch and
  snapshot revision. Capability loss, disconnect, malformed state, stale
  targets, or cleanup removes every offer and retained target identifier.
- The feasibility surface may list tasks and select a different task. It may
  not submit composer text, change reasoning, start work, answer a request,
  approve, reject, interrupt, or invoke another consequential action.
- Diagnostics remain content-free. They may record versions, capability names,
  lifecycle state, and failure categories, but not task titles, prompts,
  responses, reasoning, diffs, commands, credentials, or renderer payloads.
- The live proof must own and remove its temporary launcher state. Ending the
  proof includes closing the listener or explicitly restarting the desktop app
  normally and verifying that no listener remains.
- No production package or public release may enable the bridge until a later
  decision accepts its security, lifecycle, maintenance, and user-consent
  costs based on the live proof.

### Authority routing

Every visible task has one explicit control classification:

- `appServerOwned`: route supported intent only through official app-server
  RPCs.
- `desktopControlled`: expose only capabilities proven by the version-gated
  desktop bridge.
- `historicalOnly`: expose history and an official Resume path, but no live
  action until Sandalphon acquires authority.
- `unavailable`: expose no control offers.

Presentation never chooses a transport. It invokes a Sandalphon intent, and
the application boundary routes that intent only when the selected task's
current authority proves the operation. The same intent may have different
availability across tasks; Sandalphon never sends one action through both
planes or silently falls back after a failed dispatch.

The pure contract in `src/desktopControlContract.ts` encodes the feasibility
gate without attaching to the desktop app. A later source-clean adapter may
implement the live proof from this contract and public official interfaces.

An official shared desktop-control or peer-co-presence API supersedes this
feasibility boundary. Sandalphon should prefer that API and retire private
renderer access rather than preserve compatibility with both.

## Consequences

- SO1-175 remains paused until task switching works end to end or the project
  explicitly chooses to wait for an official API.
- The bridge cannot silently degrade into reporting-only behavior. Missing
  control capability makes the entire desktop-control surface unavailable.
- Exact version allowlisting creates deliberate maintenance work for every
  Codex desktop update.
- Loopback CDP still enlarges the same-user attack surface. Users must receive
  an explicit warning and must be able to verify cleanup.
- The feasibility proof can fail without weakening the existing app-server
  integration or device presentation.
- Most useful Codex controls can progress independently through the official
  plane even if desktop co-presence remains unavailable.
- Sandalphon owns semantic intent instead of mirroring the CLI's slash-command
  menu or the Micro device's physical arrangement.

## Evidence

- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- https://github.com/openai/codex/issues/3641
- https://github.com/openai/codex/issues/21551
- https://openai.com/supply/co-lab/work-louder/
- https://www.electronjs.org/docs/latest/api/command-line-switches
- https://developer.chrome.com/blog/remote-debugging-port
