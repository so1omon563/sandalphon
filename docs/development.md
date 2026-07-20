# Development

## Prerequisites

- macOS 13 or newer
- Node.js 24 or newer
- Stream Deck 7.1 or newer
- Stream Deck desktop application and a reference device for hardware checks

The repository records Node 24 in .nvmrc and .node-version. Newer supported
local Node versions may run the checks, but CI and the plugin manifest use Node
24 as the compatibility baseline.

## Setup

    nvm use
    npm ci
    npm run dev:link

The link command builds the plugin first, then enables Stream Deck developer
mode and points the desktop application at the repository sdPlugin directory.

`npm run dev:restart` reloads the JavaScript bundle, but Stream Deck 7.5 caches
managed action contexts and touch-strip layout files. After adding or changing
a profile, action context, or layout JSON file, fully quit and reopen the
Stream Deck application before judging the hardware result. A plugin-only
restart may continue displaying the prior frame or Elgato fallback glyphs.
Use Command-Q and confirm the Stream Deck application has actually exited
before reopening it; closing the window or receiving a successful plugin
restart response does not prove that action contexts reconnected.
Select a normal user profile before the full application restart. Stream Deck
does not preserve a plugin-usable prior-profile return target when it restarts
inside a managed profile, and the official plugin API cannot select a
user-defined recovery profile.

## Daily Commands

    make format
    make lint
    make typecheck
    make test
    make build
    make validate
    npm run dev:restart

Before a pull request:

    make check

The check target validates formatting, lint, strict types, deterministic
coverage, bundle output, manifest structure, and a package dry run.

## Opt-in Codex Desktop Control

The packaged plugin includes a disabled-by-default desktop task-selection mode
for the exact supported Codex desktop tuple. Selecting any Sandalphon action in
the Stream Deck application opens its property inspector. Read the same-user
listener warning before enabling the checkbox.

If Codex is already running normally, Sandalphon fails closed with **Quit Codex,
then retry**. Quit Codex yourself and press **Retry after quitting Codex**.
Sandalphon then launches the exact application executable with a random
`127.0.0.1` debugging port, verifies the application, Chromium engine, CDP
protocol, page endpoint, process arguments, and live task capabilities, and
shows only opaque task-selection state to the shared application boundary.
The page endpoint must use the exact Codex `app://-` application origin.
In-app paths, query parameters, and fragments are renderer navigation state,
not authority; non-page, credentialed, port-bearing, and foreign-origin
targets fail closed.
The production launcher uses the same macOS `open -na … --args` route accepted
by the feasibility proof, then independently discovers and verifies exactly one
resulting controlled Codex main process before endpoint authority exists.

Disabling the checkbox revokes offers before cleanup, terminates only the
verified controlled Codex process, confirms that the random listener is gone,
and reopens Codex normally. If cleanup cannot be proven, opt-in remains set and
the inspector instructs the user to restart Codex normally. Never treat the
stale `DevToolsActivePort` file alone as evidence that a listener is active.
Initial renderer readiness is retried only within one bounded launch attempt.
If that attempt fails after verified cleanup, Sandalphon clears opt-in instead
of permitting an automatic restart cycle; enabling it again requires fresh
explicit consent.

If the bounded attempt fails, the property inspector reports only its startup
category: endpoint availability or shape, listener or process verification,
renderer timeout, unavailable exact capability, invalid bounded task state, or
a generic connection failure. These categories contain no task IDs, titles,
prompts, responses, or renderer payloads.

Listener discovery may report multiple Chromium process owners. Sandalphon
grants authority only when exactly one reported owner is the Codex main
executable with the accepted remote-debugging arguments. Helper processes never
receive authority, while zero or multiple matching main processes fail closed.

This mode can list and select desktop tasks only. It cannot submit composer
text, answer requests, approve, reject, interrupt, change reasoning, or execute
general renderer actions.

## Desktop-Control Feasibility Proof

The desktop proof is privileged, explicit-opt-in development tooling. It is
not part of the plugin bundle and must not be used as a normal launch path.
Read [SO1-179 Desktop-Control Feasibility Proof](so1-179-desktop-control-proof.md)
and the security warning before running it.

Launch Codex desktop with a random loopback-only debugging endpoint only for a
bounded proof:

    open -na /Applications/ChatGPT.app --args \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port=0

After reading the generated port, run the content-free list proof. The tool
independently re-verifies the installed application version:

    node scripts/probe-desktop-control.mjs \
      --port <port> \
      --application-version 26.715.52143

Add `--switch-and-restore` only when one reversible selection proof is
explicitly authorized. The tool rejects version drift, unsafe debugger URLs,
malformed task state, and failed restoration. It prints counts, capabilities,
and boolean outcomes only—never task IDs, titles, prompts, responses, or other
renderer content.

End every proof by fully quitting Codex, reopening it normally without debug
arguments, and verifying the former port has no listener. A stale
`DevToolsActivePort` file is not evidence of an active listener; verify the
socket itself.

## Packaging

    make package

This creates an installable streamDeckPlugin file under dist. Local package
artifacts and generated bundles are ignored by Git.

## Release Candidate

Use the dedicated release target only after the manual gates in
[First Public Release Gate](release-gate.md) are ready for candidate evidence:

    npm ci
    make release-candidate

This reruns the complete repository gate, creates the real installer with the
official Stream Deck pack command, and writes its source commit, package
identity, compatibility metadata, byte count, and SHA-256 digest to
`dist/release-evidence.json`. A rebuild is a new candidate and requires new
evidence.

## Device Verification

Automated checks cannot prove physical interaction quality. Device milestones
record the Stream Deck application version, reference hardware, visible state,
input exercised, expected result, and observed result.

### SO1-180 desktop task-selection verification — pending

- Install the current branch and enable desktop control through the property
  inspector after manually quitting a normally running Codex app.
- On Stream Deck Mk.2, select a different visible desktop task with the existing
  roster key and select the original task again.
- On Stream Deck +, rotate the Sessions dial to preview another desktop task,
  press to select it, then preview and restore the original task.
- Confirm an old key frame or dial preview cannot select after the desktop task
  revision changes.
- Disable desktop control, confirm Codex reopens normally, and verify the former
  random port has no listening socket.

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
