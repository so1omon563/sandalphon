# ADR 0002: Make the behavior contract executable before live adapters

- Status: Accepted
- Date: 2026-07-18

## Context

Sandalphon must translate authoritative agent evidence into a truthful control
surface on two materially different Stream Deck profiles. Live Codex and SDK
callbacks would make early state, safety, and stale-input defects difficult to
reproduce. They would also tempt physical handlers to absorb provider rules.

The accepted product contract requires orthogonal state, latched terminal
results, opaque action offers, exact request and run correlation, deliberate
confirmation, and capability-aware presentation.

## Decision

Implement the first behavior slice as pure TypeScript plus deterministic fake
boundaries:

- `src/domain/model.ts` defines Sandalphon's transport-neutral vocabulary.
- `src/domain/reducer.ts` reduces connection and session evidence without
  inferring outcomes from timeouts or disconnects.
- `src/domain/offers.ts` derives revision- and connection-bound offers,
  revalidates invocation, and serializes competing effects.
- `src/domain/confirmation.ts` reduces review, inspection, arming, hold,
  expiry, invalidation, and at-most-once local dispatch.
- `src/presentation.ts` recognizes only the Classic 15 and Stream Deck +
  capability signatures and emits complete frames for managed or composable
  scope.
- `src/harness.ts` simulates Codex evidence and physical surfaces without a
  network, child process, SDK callback, or hardware claim.

The core fails closed when integration, selection, ownership, freshness,
active-run identity, request inspection, advertised decisions, or current
options cannot be proven. A new connection epoch requires authoritative session
observation before live controls return.

## Consequences

- Contract fixtures are deterministic, fast, and cover the full core at the
  repository's 100% statement, branch, function, and line threshold.
- Classic and Plus can express the same semantic offers through different
  native inputs without pretending keys and encoders are interchangeable.
- Live Codex transport and Stream Deck SDK handlers remain thin future adapters
  around an already-tested contract.
- Exact physical coordinates, final rendering, persistence, and live lifecycle
  behavior remain later milestone work.
- The harness proves software semantics only; it does not count as physical
  device verification.
