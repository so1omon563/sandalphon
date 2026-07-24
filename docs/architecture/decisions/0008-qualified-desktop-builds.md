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
owned by that exact process, exactly one canonical `app://-` renderer page
within a discovery list bounded to 64 targets, CDP protocol `1.3`, the bounded
sidebar task projection, and exactly one selected opaque task. Unrelated
debugger targets grant no authority and are not retained.
The listener and renderer may become ready at different times, so the companion
waits up to ten seconds for the bounded discovery endpoint and canonical page.
It retries only unavailable, empty, or not-yet-canonical page discovery;
version, endpoint, ambiguity, and malformed state fail immediately.
Codex may launch a same-user direct child that inherits the listener file
descriptor. That child is accepted as an inherited holder only while its
immediate parent remains the exact recorded controlled PID. It gains no
termination authority: cleanup signals only the recorded parent and still
requires the listener to disappear. Unrelated, reparented, or deeper owners
remain ambiguous and fail closed.
The observed Chromium version is diagnostic and part of the qualification key;
it is not manually allowlisted.
If bounded discovery exhausts its readiness window, companion protocol revision
2 may report only the exact number of renderer targets and whether that number
was empty or over the accepted limit. If cleanup then fails, the cleanup failure
remains primary and the renderer rejection is retained as the prior bounded
failure.
If the bounded target list does not contain exactly one canonical `app://-`
page, companion protocol revision 3 reports only whether that page is missing
or ambiguous and its numeric candidate count. This observation must inform a
reviewed contract change; it does not automatically broaden renderer authority.

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
