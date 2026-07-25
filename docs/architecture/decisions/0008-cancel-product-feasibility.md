# ADR 0008: Cancel Sandalphon Product Development

- Status: Accepted
- Date: 2026-07-24
- Decision: Sandalphon project closeout
- Supersedes: ADR 0006 and ADR 0007

## Context

Sandalphon set out to make Stream Deck hardware a useful direct interface to
the active Codex Desktop task. Its physical presentation and status reporting
worked, and the official Codex app-server could execute typed operations in a
separate Sandalphon-owned session.

That official authority did not control or visibly update the user's active
Codex Desktop task, expose useful results there, or provide a practical
continuation workflow. The separately explored private Desktop mechanisms were
unsupported and sensitive to frequent Codex Desktop updates. A supervised
companion could improve lifecycle ownership but could not turn that private
boundary into a supported, maintainable product interface.

Further Stream Deck UI and hardware refinement could not solve the missing
Codex Desktop control path.

## Decision

Cancel Sandalphon as a product-feasibility project.

- Do not continue implementation, hardware refinement, private Desktop
  integration, packaging, or release work.
- Do not ship or advertise the repository as a functional Codex Desktop
  controller.
- Preserve the source, tests, architecture decisions, assets, abandoned
  branches, and feasibility evidence for research.
- Accept only preservation, documentation, and responsible security
  maintenance under the repository contract.
- Reconsider product work only if Codex provides a supported interface for
  controlling the active visible Desktop task, or if the user explicitly
  reopens unsupported private-interoperability research with its risks
  acknowledged.

Any reactivation must first update the root `AGENTS.md`, the Sandalphon Linear
project, and the durable wiki status.

## Consequences

- ADR 0006's proposed version-gated production bridge is canceled.
- ADR 0007's companion implementation sequence is canceled.
- SO1-197 and the Sandalphon Linear project are Canceled.
- No supported Sandalphon version, installer, package, or release exists.
- The development plugin is unlinked from Stream Deck.
- Historical commands and designs do not constitute a current workflow or
  support promise.

## Evidence

- [ADR 0006](0006-version-gated-desktop-control.md)
- [ADR 0007](0007-supervised-desktop-companion.md)
- [SO1-179 desktop-control feasibility proof](../../so1-179-desktop-control-proof.md)
- [Project README](../../../README.md)
