# Development

> [!CAUTION]
> Sandalphon is a canceled feasibility project with no supported release or
> active development workflow. This document is an archival record. Do not link
> the plugin, restart Stream Deck for Sandalphon, run Desktop-control probes, or
> create an installer from these instructions.

## Prerequisites

- macOS 13 or newer
- Node.js 24 or newer
- Stream Deck 7.1 or newer
- Stream Deck desktop application and a reference device for hardware checks

The repository records Node 24 in .nvmrc and .node-version. Newer supported
local Node versions may run the checks, but CI and the plugin manifest use Node
24 as the compatibility baseline.

## Historical Source Verification

    nvm use
    npm ci
    make check

This verifies the preserved source only. It does not link Sandalphon into Stream
Deck or produce a functional Codex Desktop controller.

## Historical Component Checks

    make format
    make lint
    make typecheck
    make test
    make build
    make validate

The former pre-PR gate was:

    make check

The check target validates formatting, lint, strict types, deterministic
coverage, bundle output, manifest structure, and a package dry run.

## Desktop-Control Feasibility Proof

The privileged Desktop-control proof is retired. It is not part of the plugin
bundle, did not provide a viable supported control path, and must not be run
from this archived guide. Its bounded design and feasibility result remain in
[SO1-179 Desktop-Control Feasibility Proof](so1-179-desktop-control-proof.md) as
historical evidence.

## Supervised Companion Headless Proof

ADR 0007 replaces in-plugin desktop lifecycle ownership with a separately
supervised companion. The first slice is deliberately headless: it exercises
the lifecycle supervisor and a real Unix-domain socket with deterministic
drivers, without launching Codex, restarting Stream Deck, or enabling task
selection in the plugin.

Run the focused proof with:

    npm test -- --run test/desktopCompanion.test.ts test/desktopCompanionServer.test.ts

The IPC test creates a short temporary macOS socket path, verifies a `0600`
socket inside a `0700` current-user directory, disconnects and reconnects a
client without changing companion ownership, and removes the socket on clean
shutdown. The macOS driver and launchd definition remain a later SO1-180 slice;
do not repeat live Codex or hardware restart testing until that driver passes
its own bounded lifecycle matrix.

## Historical Packaging and Release

Sandalphon was canceled before a supported release. Do not create or distribute
an installer from this repository: it does not provide usable control of the
active Codex Desktop task.

The package and release-candidate tooling remains in source only to preserve the
feasibility record. It is not a current workflow. Packaging or release work may
resume only after the reactivation conditions in the root `AGENTS.md` are met
and the project contract, Linear project, and durable wiki status are updated
first.

## Device Verification

Automated checks cannot prove physical interaction quality. Device milestones
record the Stream Deck application version, reference hardware, visible state,
input exercised, expected result, and observed result.

Do not claim Classic 15 or Stream Deck + behavior from a build alone.

### Stream Deck 15-key verification — 2026-07-19

- Hardware: Stream Deck Mk.2, using the supported 5-by-3 Stream Deck capability
  profile.
- Stream Deck application: 7.5.0 (22885).
- Profile: generated `Sandalphon Classic 15` single-page profile with 15 managed
  key contexts.
- Verified: normal packaged installation without developer mode, successful
  profile import and selection, clean dynamic images on every physical key, and
  a physical selected-session press changing the device from the roster to the
  expected session controls. A physical Resume action changed the selected
  historical session from unavailable to idle.
- Restart and recovery: quitting and reopening Stream Deck restored the profile
  while correctly withholding stale session authority. Selecting the session
  and explicitly invoking Resume restored the idle state without reinstalling
  the plugin or profile.
- Accepted validation boundary: the shipped v0 controls cannot originate a new
  turn or submit composer input, so an idle resumed session cannot deliberately
  produce live attention or a consequential offer on the Sandalphon-owned
  connection. Deterministic Classic tests cover request attention, complete
  review, stale-frame rejection, separate confirmation, and the 800 ms approval
  hold. An organically reachable live attention and consequential-action case
  remains part of SO1-175 daily-driver validation.
- Physical feedback finding: imported profile titles must be suppressed both in
  the generated profile state and by the live adapter so they cannot overlap the
  SVG-rendered labels.

### Stream Deck + verification — 2026-07-19

- Hardware: standard Stream Deck +.
- Stream Deck application: 7.5.0 (22885).
- Profile: eight Keypad-only managed key contexts and four separately
  identified managed encoder contexts.
- Verified: dynamic key images, coordinated quarter-local touch-strip frames,
  session preview and explicit selection, touch navigation, historical-thread
  Resume, and next-turn reasoning preview.
- Long-thread evidence: Resume accepted a 5.74 MiB JSON-RPC history response
  without disconnecting after the bounded raw UTF-8 transport limit was raised
  to 16 MiB. The prior 1 MiB limit failed closed as Offline/disconnected.
- Physical feedback finding: an uncommitted session now labels its strip lane
  Preview and returns to Session only after the selecting dial press. Lanes
  omit rotate or press descriptions when no distinct valid choice exists.
- Blocking finding: after the Stream Deck application restarted with the
  managed profile active, the Exit key request could not return to a normal
  user profile. The SDK only exposes return-to-previous for this case and
  forbids plugins from selecting user-defined profiles. The managed surface is
  not daily-driver-ready until it has a restart-safe escape design.
- Daily-driver direction: bundled managed profiles remain optional reference
  and consequential-review surfaces. The composable actions are placed in an
  ordinary user profile, so restarting Stream Deck does not require a
  Sandalphon Exit path. See [Composable Controls](composable-controls.md).

## Node Resolution on macOS

Multiple Node installations may coexist. Verify which -a node and node
--version when results differ between the shell, editor, and Stream Deck.
Sandalphon requires Node 24 or newer for development and declares Node 24 in the
plugin manifest.
