# SO1-179 Desktop-Control Feasibility Proof

## Result

The bounded source-clean proof succeeded on 2026-07-20. Sandalphon can use
public Chrome DevTools Protocol primitives plus an exact-version-gated private
desktop capability selector to list opaque Codex desktop tasks, select another
visible task, and restore the original task.

This result was initially accepted for production integration work in SO1-180.
Later feasibility work showed that the private route was unsupported and too
sensitive to frequent Codex Desktop updates to be a viable product foundation.
ADR 0008 cancels the integration. The proof never enabled the bridge in the
packaged plugin.

## Exact Boundary

- Codex desktop application: `26.715.52143`
- Chromium engine: `150.0.7871.124`
- CDP protocol: `1.3`
- Endpoint: random port on `127.0.0.1`
- CDP page targets: exactly one
- Allowed capabilities: `task.list` and `task.select`
- Task data retained during proof: opaque bounded identifiers plus selected and
  visible booleans
- Diagnostics: capability names, counts, versions, and boolean outcomes only

The independently authored proof did not consult or reuse prototype source,
assets, schemas, handlers, or implementation structure. It used current
renderer structure observed through the authorized live CDP session and then
promoted the narrow behavior into
`scripts/probe-desktop-control.mjs` with deterministic fail-closed tests.

## Observed Evidence

The read-only capability phase found:

- 16 tasks;
- 16 unique valid opaque identifiers;
- exactly one selected task; and
- seven visible alternative tasks.

The authorized reversible action phase reported:

- `switched: true`; and
- `restored: true`.

No task identifier, title, prompt, response, reasoning, diff, command,
credential, or renderer payload was recorded in repository evidence.

Both managed hardware implementations emitted session selection through the
shared application boundary rather than device-specific transport logic. Their
deterministic suites covered Classic key selection and Plus dial-preview then
press-to-select, but no production Desktop-control route was accepted.

## Cleanup Evidence

After the proof, Codex was fully quit and reopened normally. The replacement
process had no remote-debugging arguments, and the former random port had no
listening socket. The Chromium-generated port file remained as stale metadata;
the socket check, not file presence, established cleanup.

## Decision and Follow-Up

The isolated proof succeeded, but the route did not remain viable as a product
boundary. SO1-180 and the production integration were canceled. No package may
enable desktop task selection, and this archived proof must not be used as a
current launch or development procedure. See ADR 0008.
