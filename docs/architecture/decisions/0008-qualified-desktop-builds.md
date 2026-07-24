# ADR 0008: Qualify Signed Desktop Builds at Runtime

- Status: Accepted for bounded feasibility
- Date: 2026-07-24
- Decision: SO1-196

## Context

ADRs 0006 and 0007 used an exact Codex application, Chromium, and CDP tuple to
bound the private renderer feasibility surface. That was appropriate for the
first proof, but Codex desktop ships frequently. Requiring a Sandalphon source
change for every official update creates a maintenance loop without proving
that a newly allowlisted build still supports the required behavior.

The separately supervised companion already owns the only acceptable process,
listener, renderer, cleanup, and normal-launch boundary. It can therefore
qualify the narrow behavior directly before granting task-selection authority.

## Decision

Keep the standalone proof tool exactly version-gated. Replace the production
companion's per-version allowlist with automatic, fail-closed qualification.

Before changing process state, the companion requires the canonical
`/Applications/ChatGPT.app` path, bundle identifier `com.openai.codex`, OpenAI
Team ID `2DC432GLL2`, a strict sealed-code verification, and a successful
Gatekeeper execution assessment. Its durable controlled-launch record captures
the complete signed-build identity, including application version, bundle
version, and CDHash, so an on-disk update cannot change the identity of an
already owned process.

After controlled launch, the companion still requires one loopback listener
owned by that exact process, one `app://-` renderer page, CDP protocol `1.3`,
the bounded sidebar task projection, and exactly one selected opaque task.
The observed Chromium version is diagnostic and part of the qualification key;
it is not manually allowlisted.

The first start for each signed-build and renderer-contract tuple performs one
reversible canary. It records the selected opaque task, selects one other task,
verifies that selection, restores the original task, and verifies restoration.
Only then may it atomically write an owner-only compatibility receipt under
`~/Library/Application Support/Sandalphon`. The receipt is bound to:

- the complete signed application identity;
- the observed Chromium engine and CDP protocol; and
- the Sandalphon desktop-control contract revision.

A matching receipt avoids repeating the visible canary on later starts.
Missing, malformed, stale, or mismatched receipts grant no authority and cause
requalification. A missing alternate task or any failed selection or
restoration fails Start; serialized companion cleanup then removes the listener
and restores normal Codex. No task title or content is read or persisted.

## Consequences

- Routine official Codex updates do not require Sandalphon source changes.
- Compatibility is demonstrated by the behavior Sandalphon needs, not inferred
  from an application version string.
- The first controlled start after an update visibly changes tasks once and
  restores the original task.
- A signed update can still fail closed when its renderer contract changes.
- Changing Sandalphon's accepted task behavior increments the contract revision
  and invalidates every older receipt.
- Same-user CDP remains a privileged explicit-opt-in risk.
- An official shared desktop-control API still supersedes and should retire
  this private renderer boundary.

## Evidence

- [ADR 0006](0006-version-gated-desktop-control.md)
- [ADR 0007](0007-supervised-desktop-companion.md)
