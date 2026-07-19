# First Public Release Gate

This gate decides whether Sandalphon may publish its first installable GitHub
Release. It is deliberately narrower than a roadmap: every item below is a
ship blocker unless it is marked not applicable with evidence in the release
pull request.

The current decision is **no-ship**. The two reference-device MVPs have passed
their implementation gates, but the first public release still needs the
dual-device daily-driver record, an upgrade and removal cycle, and a candidate
artifact tied to its final version, source commit, and checksum.

## Supported Boundary

The first public release supports only this matrix:

| Boundary                | Supported                                         | Evidence authority                                      |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Operating system        | macOS 13 or newer                                 | Stream Deck manifest and CI on macOS 15                 |
| Stream Deck application | 7.1 or newer                                      | Stream Deck manifest; physical checks use 7.5.0 (22885) |
| Plugin runtime          | Stream Deck-provided Node.js 24                   | Stream Deck manifest                                    |
| Codex CLI               | Exactly `codex-cli 0.144.1`                       | Fail-closed runtime allowlist and configuration tests   |
| 15-key hardware         | Stream Deck Mk.2 using the 5-by-3 managed profile | Recorded physical-device evidence                       |
| Encoder hardware        | Standard Stream Deck +                            | Recorded physical-device evidence                       |

Other Codex CLI versions, operating systems, agents, Stream Deck models, and
control surfaces are unverified and unsupported. The 5-by-3 Classic interaction
contract may fit related hardware, but the first release makes no compatibility
claim beyond the physically verified Mk.2.

Sandalphon owns a private Codex app-server child. It does not provide ambient
control of arbitrary work already active in the Codex desktop app, originate a
new turn, submit composer input, attach files, control scheduled tasks, or
provide exact Fast or Plan modes.

## Release Decision

The release owner records one of these outcomes in the release pull request:

- **Ship:** every required gate is satisfied by linked evidence and the exact
  candidate artifact is approved.
- **No-ship:** at least one required gate is incomplete, failed, ambiguous, or
  depends on an unsupported boundary.

An accepted limitation may narrow a documented claim. It cannot waive stale
authority, consequential-action safety, credential handling, package integrity,
or an unresolved critical failure.

## Gate 1: Source and Automated Checks

- [ ] The candidate commit is on a protected pull request with required CI,
      mergeability, resolved review threads, and bounded Codex review complete.
- [ ] A clean Node.js 24 checkout passes `npm ci` and `make check`.
- [ ] The official Stream Deck validator and package dry run pass without
      warnings or ignored errors.
- [ ] Dependency audit findings are recorded; every high or critical finding is
      fixed, proven inapplicable, or explicitly blocks release.
- [ ] The candidate contains no credentials, local settings, logs, source maps,
      prompt or response content, approval payloads, or environment files.

## Gate 2: Physical and Daily-Driver Evidence

- [ ] The current candidate is installed and exercised on a Stream Deck Mk.2
      and a standard Stream Deck + with the exact app version recorded.
- [ ] Both managed profiles render cleanly and preserve their device-native
      interaction contracts.
- [ ] Session discovery, selection, Resume, next-turn reasoning preview and
      commit, Back, and Exit produce the expected authoritative state.
- [ ] A naturally reachable request is reviewed on hardware. Approve requires a
      separate 800 ms hold; reject uses its separate confirmation step.
- [ ] Stale frames, disconnect, Codex restart, Stream Deck restart, plugin
      restart, and ambiguous in-flight work fail closed and recover only after
      authoritative reconciliation or explicit Resume.
- [ ] The dual-device daily-driver record covers latency, attention noise,
      context switching, default-layout usefulness, configuration friction, and
      cross-device consistency.
- [ ] Every critical reliability gap is fixed or leaves the decision at
      no-ship. Accepted non-critical limitations are copied into release notes.

Earlier device notes in [Development](development.md) establish MVP behavior;
they do not replace candidate-specific daily-driver evidence.

## Gate 3: Install, Upgrade, and Removal

Use the same candidate bytes that will be published.

### Fresh install

- [ ] Start from a Stream Deck installation without Sandalphon.
- [ ] Double-click the `.streamDeckPlugin` candidate and approve installation.
- [ ] Confirm the plugin and both read-only managed profiles are installed.
- [ ] Confirm installation does not force-switch the active profile.
- [ ] Enter each managed profile explicitly and complete a basic Resume and
      navigation check.

### Upgrade

- [ ] Install a previously tested lower-version Sandalphon package and record
      its manifest version. For the first public release, use the latest
      retained internal candidate rather than claiming a prior public release.
- [ ] Install the higher-version candidate over it without manually deleting
      plugin data first.
- [ ] Confirm the new manifest version is active, the plugin launches once, and
      both profiles are available.
- [ ] Confirm valid settings survive, unknown newer settings remain untouched,
      stale offers and confirmation arms do not survive, and no intent is
      replayed automatically.

### Removal

- [ ] Uninstall Sandalphon from Stream Deck Preferences > Plugins and confirm
      the removal prompt.
- [ ] Confirm the plugin process stops, Sandalphon actions are unavailable, and
      no Sandalphon package remains installed after Stream Deck restarts.
- [ ] Record whether Stream Deck retains or removes the managed profiles. Any
      retained inert profile must be documented and must not imply a running
      integration.
- [ ] Reinstall the candidate and confirm a clean explicit entry still works.

Manual deletion from Stream Deck's plugin directory is a troubleshooting
fallback, not the normal removal result.

## Gate 4: Security and Privacy

- [ ] Sandalphon launches only an ordinary allowlisted Codex CLI and reuses its
      existing authentication; the package contains no credential material.
- [ ] Codex communication remains one plugin-owned private stdio JSONL
      connection with no TCP or Unix listener.
- [ ] Malformed, invalid UTF-8, or over-16-MiB JSON-RPC lines close the transport
      and invalidate live offers.
- [ ] Logs remain content-free by default and global settings contain no
      prompts, responses, reasoning, diffs, commands, request payloads,
      approval tokens, or connection authority.
- [ ] Consequential offers are revision-, connection-, request-, and
      effect-bound; restart and disconnect invalidate physical confirmation.
- [ ] The release notes link [Security](../SECURITY.md), state the local process
      and authentication boundary, and make no broader privacy claim.

## Gate 5: Assets, Licenses, and Public Documentation

- [ ] `LICENSE` covers repository-authored source, documentation, and artwork.
- [ ] [Asset provenance](../ASSETS.md) accounts for every packaged visual asset;
      `npm run assets:check` and `npm run profile:check` pass.
- [ ] Every third-party or generated asset, if any, has source, author, license,
      modification, derivative, and redistribution records. Unclear rights
      block release.
- [ ] README requirements and limitations match this support boundary.
- [ ] Installation, upgrade, removal, recovery, unsupported-version, missing
      authentication, and profile-selection troubleshooting are user-readable.
- [ ] `CHANGELOG.md` has a versioned release section with user-visible changes
      and accepted limitations; `Unreleased` is ready for the next cycle.

## Gate 6: Artifact and Provenance

1. Select an unused semantic Git tag. Existing development tags are never
   moved or reused.
2. Set the Stream Deck manifest version to the same three numeric components
   plus a fourth package revision component. For example, tag `v0.3.0` maps to
   manifest version `0.3.0.0`.
3. From the exact candidate commit, run:

       npm ci
       make release-candidate

4. Review the official pack inventory. It must contain only the manifest,
   compiled plugin, two managed profiles, the Plus layout, and declared runtime
   images.
5. Attach the exact `.streamDeckPlugin` and `release-evidence.json` produced by
   that run to the GitHub Release. Do not rebuild between approval and upload.
6. Verify that the evidence commit equals the annotated tag target, the package
   version matches the tag mapping, and the published artifact SHA-256 equals
   the evidence SHA-256.
7. Download the public asset into a clean location, verify its SHA-256, install
   it once, and repeat the basic device smoke check.
8. Confirm the GitHub Release notes contain the support matrix, installation
   path, security boundary, known limitations, changelog, and checksum.

`make release-candidate` runs the canonical repository gate, creates the real
installer with the official Stream Deck pack command, and writes deterministic
metadata for the produced bytes to `dist/release-evidence.json`. The artifact
hash is expected to identify those exact bytes; rebuilding creates a new
candidate that must be reviewed again.

## Troubleshooting Boundary

- **Offline / missing Codex:** verify `codex --version` is exactly the supported
  version and that the ordinary binary is executable from a standard install
  path. Sandalphon never selects a Codex binary inside a desktop app bundle.
- **Authentication required:** authenticate with the Codex CLI, then restart
  the plugin. Sandalphon does not collect or store credentials.
- **Managed profile absent:** reinstall the package, then use Enter Sandalphon
  on the matching device. Installation intentionally does not force a profile
  switch.
- **Historical session unavailable:** select it and use Resume. Discovery alone
  is not live ownership.
- **Controls become unavailable after restart:** wait for reconciliation and
  explicitly select or Resume the session. Do not repeat an ambiguous action.
- **Plugin cannot be removed in the app:** quit Stream Deck before using
  Elgato's documented manual plugin-directory fallback.

## Evidence Record

The release pull request or attached validation note records:

- candidate commit and annotated tag;
- manifest, Codex CLI, macOS, Stream Deck app, and hardware versions;
- CI run and bounded review result;
- `make release-candidate` result and evidence JSON;
- fresh-install, upgrade, removal, reinstall, and public-download observations;
- daily-driver duration and scenarios exercised on each device;
- security/dependency review result;
- unresolved gaps, accepted limitations, and the final ship/no-ship decision.

Official Stream Deck references:

- [Distribution and packaging](https://docs.elgato.com/streamdeck/sdk/introduction/distribution/)
- [`streamdeck pack`](https://docs.elgato.com/streamdeck/cli/commands/pack/)
- [Manifest requirements](https://docs.elgato.com/streamdeck/sdk/references/manifest/)
- [Plugin removal](https://help.elgato.com/hc/en-us/articles/11434818801293-Elgato-Stream-Deck-How-to-Uninstall-Stream-Deck-Plugins)
