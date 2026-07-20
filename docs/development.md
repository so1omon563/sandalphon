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

## Node Resolution on macOS

Multiple Node installations may coexist. Verify which -a node and node
--version when results differ between the shell, editor, and Stream Deck.
Sandalphon requires Node 24 or newer for development and declares Node 24 in the
plugin manifest.
