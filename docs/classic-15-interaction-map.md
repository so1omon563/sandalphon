# Classic 15 Interaction Map

## Status and Boundary

This is Sandalphon's accepted v0 design contract for the managed 15-key,
5-by-3 Stream Deck Classic surface. It fixes physical placement, local
navigation, roster density, ordered-choice adaptation, request review, and
feedback before live Stream Deck and Codex adapters are added.

The map consumes Sandalphon snapshots, action offers, safety plans, and local
surface state. It does not parse provider messages, construct commands, add
hidden gestures, emulate encoders or touch, or broaden an unavailable offer.
Composable actions remain self-contained and do not inherit managed-surface
authority.

## Coordinate System

Keys are numbered in the same row-major order used by the deterministic
presenter:

| Top row     |             |             |             |             |
| ----------- | ----------- | ----------- | ----------- | ----------- |
| `K0` (0,0)  | `K1` (0,1)  | `K2` (0,2)  | `K3` (0,3)  | `K4` (0,4)  |
| `K5` (1,0)  | `K6` (1,1)  | `K7` (1,2)  | `K8` (1,3)  | `K9` (1,4)  |
| `K10` (2,0) | `K11` (2,1) | `K12` (2,2) | `K13` (2,3) | `K14` (2,4) |

Coordinates are zero-based `(row,column)`. The exact executable role map is
defined in [`src/classic15.ts`](../src/classic15.ts).

## Stable Anchors

| Key   | Stable responsibility                         | Rule                                                                                                         |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `K0`  | Selected session or primary unavailable state | Selection never moves because another session needs attention.                                               |
| `K5`  | Interruption decision in request review       | Shows Cancel Request when advertised; otherwise Cancel Run when available. The two are never shown together. |
| `K7`  | Denial decision in request review             | Reject/decline is distinct from cancellation and always keeps this position.                                 |
| `K9`  | Attention and positive authorization          | Opens the selected request, or the priority attention roster. In request review it is the Approve position.  |
| `K10` | Home/Back                                     | Local navigation only. It never rejects, cancels, interrupts, acknowledges, or changes provider state.       |
| `K11` | Previous/decrease                             | Moves one page, session, detail page, or ordered option according to the visible view.                       |
| `K12` | Position/value                                | Names the current roster, page, session position, or choice preview. It never commits a choice.              |
| `K13` | Next/increase                                 | Mirrors `K11` in the forward direction.                                                                      |
| `K14` | Exit Sandalphon                               | Requests the prior Stream Deck profile. It does not stop Codex or acknowledge state.                         |

Every frame labels before accepting a new meaning. A held key cannot cross a
frame revision into a different action. The bottom row remains local
navigation in every managed view, and `K14` always requests managed-profile
exit.

The official plugin API cannot select a user-defined profile. `K14` can return
only while Stream Deck still has a prior-profile context from entry during the
current application session. A full application restart while the managed
profile is active loses that usable return target. SO1-177 treats this as a
release blocker for both managed profiles.

## Rendering Contract

- Managed keys use plugin-controlled SVG images, not user-overridable titles,
  for essential meaning.
- Session keys show one bounded identity line, the exact Liminal Signal state
  label and glyph, and static selected, favorite, unassigned, or attention
  overlays. Color is supplementary.
- A nonessential session label longer than 12 visible characters is shortened
  to 11 characters plus an ellipsis. The full privacy-safe identity belongs in
  the session inspection view.
- Waiting, failed, completed, and unavailable remain persistent until the
  authoritative domain rule clears them. No state pulses, flashes, or cycles.
- Empty cells render only the dark canvas and accept no input. Primary
  navigation frames also leave unavailable actions empty; they do not repeat
  disabled labels or unavailable glyphs. Offline and consequential-review
  frames may keep non-actionable context visible when it explains recovery or
  a pending decision.
- `showOk` and `showAlert` are transient acknowledgements only. The complete
  frame is immediately reapplied from current truth.

## Home and Roster

The initial roster is **Priority**. It orders actionable waits, unacknowledged
failure, unacknowledged completion, active work, then recency. The other views
are Recent, Favorites, and Custom.

| `K0` Selected | `K1` Roster 1       | `K2` Roster 2       | `K3` Roster 3   | `K4` Roster 4  |
| ------------- | ------------------- | ------------------- | --------------- | -------------- |
| `K5` Empty    | `K6` Empty          | `K7` Empty          | `K8` Empty      | `K9` Attention |
| `K10` Empty   | `K11` Previous page | `K12` Roster / page | `K13` Next page | `K14` Exit     |

- `K0` always shows the selected session. Pressing it opens Session.
- `K1` through `K4` show four other sessions per page. Pressing one changes
  selection only; the next frame moves that session to `K0`. A later press on
  `K0` opens it. No double-tap or foreground-app behavior exists.
- `K12` shows, for example, `Priority` and `1/3`. Pressing it opens a local
  choice view for Priority, Recent, Favorites, or Custom.
- `K9` opens the selected session's current request when one exists. Otherwise
  it opens the Priority roster filtered to sessions needing attention; the
  user still selects a session explicitly. With no attention it is blank and
  disabled.
- Later attention never steals selection. Selection and paging never
  acknowledge a result.
- An unassigned Custom cell shows Start only when a complete `StartWork` offer
  exists. Otherwise it shows Empty or Unconfigured and has no token.

Five simultaneous identities—one selected and four candidates—leave the
middle row quiet enough to scan. Previous and Next appear only when another
page exists; Home is omitted because the frame is already Home.

## Session

| `K0` Selected | `K1` Inspect           | `K2` Resume            | `K3` Review        | `K4` Reasoning       |
| ------------- | ---------------------- | ---------------------- | ------------------ | -------------------- |
| `K5` Empty    | `K6` Empty             | `K7` Retry             | `K8` Cancel run    | `K9` Other attention |
| `K10` Back    | `K11` Previous session | `K12` Session position | `K13` Next session | `K14` Exit           |

- Inspect opens current activity, exact request, or exact result detail.
  An exact terminal result exposes a separate Acknowledge key only after its
  detail has been inspected completely.
- `K2` says Resume only for a known safely resumable historical session. It
  never implies that arbitrary historical sessions are controllable.
- Review appears only for a selected pending request. Other attention appears
  only when another thread genuinely needs attention; it never duplicates the
  selected request's Review control.
- Reasoning opens the ordered Choice view for currently advertised next-turn
  effort. It cannot change an active run.
- Retry and Cancel Run have separate permanent positions. Each opens its own
  review frame and never dispatches on the entry press.
- An action is visible only while its exact current offer is available.
  Missing actions leave a blank cell rather than a disabled control. They
  never fall back to commands or keystrokes.

## Intent Trace

| Sandalphon intent or operation         | Default entry                                              | Final activation                                                                |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Select Session                         | Home `K1`–`K4`, or Session `K11`/`K13`                     | Same current key release; selection alone acknowledges nothing                  |
| Resume Session                         | Session `K2`                                               | Current safely resumable offer; reconciliation precedes live actions            |
| Inspect                                | Session `K1`                                               | Current detail target; exact result inspection follows the acknowledgement rule |
| Acknowledge Result                     | Result review `K9`                                         | Current exact result offer after complete inspection                            |
| Review                                 | Session `K3`                                               | Current turn-boundary review offer                                              |
| Approve Request                        | Home/Session `K9` to Request                               | New 800 ms hold at Request `K9` after complete inspection                       |
| Reject Request                         | Request `K7`                                               | New press at Request `K7` after target inspection                               |
| Cancel Request                         | Request `K5`                                               | New 800 ms hold at Request `K5`; success waits for interrupted run evidence     |
| Cancel Run                             | Session `K8` or Request `K5` when no request cancel exists | New 800 ms hold at Request `K5`; success waits for interrupted run evidence     |
| Retry Work                             | Session `K7`                                               | New press at Request `K9` after complete new-run-plan inspection                |
| Change Next-Turn Options               | Session `K4`                                               | Choice `K8` Apply after a separate preview                                      |
| Recover Integration                    | Unavailable `K9`                                           | Current recovery offer; never replays a prior intent                            |
| Roster view, page, preview, Back, Exit | Bottom navigation row                                      | Local presentation change only                                                  |

An unavailable or absent offer leaves its location disabled with a reason. The
physical map never turns a disabled intent into a different transport action.

## Choice

| `K0` Selected | `K1` Choice context | `K2` Option 1            | `K3` Option 2 | `K4` Option 3  |
| ------------- | ------------------- | ------------------------ | ------------- | -------------- |
| `K5` Option 4 | `K6` Option 5       | `K7` Option 6            | `K8` Apply    | `K9` Attention |
| `K10` Back    | `K11` Lower         | `K12` Preview / position | `K13` Higher  | `K14` Exit     |

- Direct option keys and Lower/Higher change local preview only.
- Lower and Higher move one advertised option per release, stop at the ends,
  and never wrap or repeat because a key remains held.
- `K12` names the complete preview and position. Its press does nothing.
- Apply is a separate release and revalidates the current offer and option.
  For reasoning, it commits only at a turn boundary and does not start work.
- At most six options are visible at once; the visible window follows the
  preview, while paired keys can reach every ordered option.
- Back discards the preview with no domain change. Expiry or a newer frame also
  discards it.

This is an explicit key adaptation. Classic does not receive a virtual dial,
rotation acceleration, touch region, swipe, or hidden long-press selector.

## One-Handed Operation

- Home/Back, Previous/Lower, position/value, Next/Higher, and Exit remain in
  the bottom row so ordinary navigation needs no chord or reach between rows.
- Request decisions remain separated across `K5`, `K7`, and `K9`. Approval and
  interruption require holding one key, not two simultaneous keys.
- No default depends on double-tap, simultaneous presses, hold-to-repeat,
  multi-action timing, or switching hands while a press is active.
- The only timed default is the visible 800 ms final hold for approval or
  interruption. Entry, detail paging, and arming are separate releases.
- The arrangement is intended for either hand, but no ergonomic or
  accessibility claim is made until real Classic hardware validates reach,
  labels, hold progress, and the 10-second arm window.

## Request and Consequential Review

| `K0` Selected | `K1` Detail 1         | `K2` Detail 2     | `K3` Detail 3     | `K4` Detail 4 |
| ------------- | --------------------- | ----------------- | ----------------- | ------------- |
| `K5` Cancel   | `K6` Detail 5         | `K7` Reject       | `K8` Detail 6     | `K9` Approve  |
| `K10` Back    | `K11` Previous detail | `K12` Detail page | `K13` Next detail | `K14` Exit    |

The six detail cells are read in key order `K1`, `K2`, `K3`, `K4`, `K6`,
`K8`. Each contains at most two 12-grapheme lines. Decision-critical fields
are first serialized in a visible, reversible form, then paged without
ellipsis or omitted characters. The executable paginator preserves up to 12
pages, or 1,728 displayed Unicode grapheme clusters. When complete context
contains unescaped control, invisible-format, standalone variation selector,
surrogate, private-use, unassigned, line-separator, or bidirectional control
characters, exceeds that bound, or cannot otherwise be represented faithfully,
Approve and other complete-inspection actions are unavailable with `Review in
Codex`; a target-level Reject or Cancel may remain available when its own exact
context fits. A validated emoji presentation or ZWJ grapheme remains
renderable; an isolated selector or invisible joiner does not. Callers may
replace rejected characters only through a documented visible, reversible
escaping step before pagination.

### Decision positions

- `K5` is Cancel Request when the request advertises cancel. Otherwise it may
  be Cancel Run with the explicit `Interrupt run` consequence. Both never
  appear together. Final cancellation is an 800 ms hold at `K5` after a
  separate review entry and sufficient target inspection.
- `K7` is Reject. Entry opens reject review. After target inspection and a new
  frame, a separate press on `K7` confirms decline and allows the run to
  continue. It is never labeled Cancel.
- `K9` is Approve. Entry opens approval review. Only after every complete
  detail page has been displayed for the same offer and target does a new frame
  label `K9` as `Hold approve`. A new 800 ms hold dispatches one-shot accept.

The entry press cannot confirm. Holding an entry key across the new frame does
nothing. Early release returns to armed review. The arm expires after 10
seconds. Back, Exit, page target change, request resolution, offer change,
device disconnect, Stream Deck restart, plugin restart, or connection change
invalidates it.

Retry and Redirect reuse the same detail grid. Their final reviewPress control
is `K9`, clearly labeled `Confirm retry` or `Send redirect`, after complete
inspection. Cancel Run uses the `K5` hold. Approval, interruption, retry, and
redirect never dispatch from a composable action, multi-action, key-logic
action, or transient feedback command.

## Unavailable and Recovery

| `K0` Offline | `K1` Reason | `K2` Detail 1        | `K3` Detail 2 | `K4` Detail 3 |
| ------------ | ----------- | -------------------- | ------------- | ------------- |
| `K5` Empty   | `K6` Empty  | `K7` Empty           | `K8` Empty    | `K9` Recover  |
| `K10` Home   | `K11` Empty | `K12` Recovery state | `K13` Empty   | `K14` Exit    |

- Starting and reconciliation are static Offline frames with `Starting` or
  `Checking` context. No action token exists while authority is incomplete.
- Missing configuration, authentication, unsupported versions, ownership
  conflict, protocol failure, stale state, and disconnected integration each
  receive a stable literal reason and recovery path.
- `K9` invokes Recover Integration only when the core offers it. It never
  chooses a new binary, supplies credentials, resumes unknown work, or replays
  an earlier intent.
- A disconnected physical Classic cannot originate input. A still-visible
  action in the Stream Deck application may render Device disconnected, but
  this is not evidence that hardware received the frame.
- A newer unsupported settings schema says Upgrade required and remains
  untouched. Invalid references say Unconfigured. Setup and repair continue in
  the Stream Deck property inspector.

## Persistent and Transient Feedback

| Evidence                             | Persistent frame                                                                        | Optional transient feedback                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Local preview or review              | Violet focus plus exact Preview/Review label                                            | None                                                          |
| Accepted for dispatch                | Sending, with conflicting controls disabled                                             | None                                                          |
| Waiting for authority                | Approving, Rejecting, Canceling, Starting retry, Redirect sent, or Saving as applicable | None                                                          |
| Authoritatively confirmed            | New snapshot state                                                                      | `showOk` on the originating key                               |
| Definite validation/provider failure | Stable reason and current offer state                                                   | `showAlert` on the originating key                            |
| Ambiguous transport outcome          | Checking / Uncertain; conflicting effects remain locked                                 | `showAlert` may accompany the persistent frame                |
| Completed run                        | Complete remains latched                                                                | None required                                                 |
| Failed run                           | Failed remains latched; Retry may be offered                                            | `showAlert` only for the transition, never as the sole result |
| Interrupted run                      | Idle plus interrupted result context                                                    | `showOk` only after the exact interrupted terminal event      |

Request resolution alone never proves Approve, Reject, or Cancel won a race.
Interrupt acceptance alone never proves a run stopped. An approved command
that later fails is a run failure, not an approval failure. Provider automatic
retry remains Working/Retrying and exposes no Retry key.

## Composable Actions

Managed geometry and safety do not leak into user profiles:

- Session Status renders its own integration or selected-session state.
- Resume Session dispatches only an unchanged current `ResumeSession` offer.
- Attention selects an attention session without deciding its request.
- Open Managed Surface explicitly enters the optional bundled reference and
  consequential-review profile.

The first composable slice uses the same three key actions on Classic and Plus.
The Plus-only Sessions dial has no invented Classic equivalent; bounded
composable Classic session navigation remains a later SO1-178 validation step.

Foreign actions are never inspected, relabeled, moved, or controlled. User
title or image overrides may reduce composable live-state fidelity, so no
composable action is the sole high-consequence surface.

## Explicit Unavailable Defaults

Exact Fast mode, exact Plan mode, voice input, hands-free recording, private
composer submission, desktop task focus, attachments, scheduled tasks,
generic browser or terminal actions, arbitrary commands or prompts, commit,
pull request, persistent approval, permission grants, policy changes, model
selection, and mid-turn reasoning changes do not appear as functioning v0
controls. A configured control that lacks a later accepted action offer is
disabled with a reason; it never imitates the behavior through host input or a
private interface.

## Acceptance Walkthrough

1. **First run:** with no validated CLI, all 15 cells form the Configuration
   required Offline frame. Exit requests the prior profile when Stream Deck
   still owns that context; Recover cannot broaden setup authority.
2. **Quiet roster:** Priority shows one fixed selected session plus at most
   four alternatives. Paging controls appear only when needed, selection is
   preserved, and the unused middle-row cells stay dark.
3. **Attention without theft:** a nonselected session begins waiting. Its tile
   and `K9` show attention, but `K0` does not change until the user selects it.
4. **Working session:** Session shows privacy-safe activity, disables
   turn-boundary reasoning, offers Cancel Run only for the exact active run,
   and keeps Back local.
5. **Reasoning choice:** at idle, Lower/Higher and direct option keys preview
   only. Apply commits a current advertised choice once; Back commits nothing.
6. **Inspectable approval:** Review request opens the exact paged detail.
   Approve remains disabled until every required page is seen. A new 800 ms
   hold on `K9` dispatches once; 799 ms or a stale frame dispatches nothing.
7. **Oversized approval:** content requiring a thirteenth page disables
   Approve as Review in Codex. Exact target-level Reject or Cancel remains
   separate when safely inspectable.
8. **Reject versus cancel:** `K7` decline requires review plus a separate press
   and lets the run continue. `K5` cancellation requires a hold and remains
   pending until the exact run is authoritatively interrupted.
9. **Terminal failure and retry:** Failed stays latched at idle. Retry opens a
   complete new-run review and uses a separate `K9` confirmation. It never
   replays a prior side effect.
10. **Completion acknowledgement:** Complete survives paging, selection, and
    restart. Inspecting or acknowledging the exact result clears only that
    latch; selection alone does not.
11. **Disconnect during consequence:** the old offer, arm, and pressed key are
    invalid. The effect becomes Uncertain, the frame shows Checking, and
    recovery never automatically repeats it.
12. **Composable coexistence:** a standalone Status or Session action updates
    only itself, honors user display precedence, and cannot navigate or confirm
    for neighboring or foreign actions.
13. **Restart:** action contexts are rebuilt, shared validated selection and
    result latches return after reconciliation, while local pages, previews,
    inspection receipts, arms, and offer tokens return to a safe base state.

These are deterministic software acceptance scenarios. Physical legibility,
latency, the 800 ms hold, the 10-second arm window, and one-handed comfort still
require real-device validation at the daily-driver release gate.

## Official Interface Evidence

- [Elgato Stream Deck SDK: Keys](https://docs.elgato.com/streamdeck/sdk/guides/keys/)
- [Elgato Stream Deck SDK: Devices](https://docs.elgato.com/streamdeck/sdk/guides/devices/)
- [Elgato Stream Deck SDK: Profiles](https://docs.elgato.com/streamdeck/sdk/guides/profiles/)
- [Elgato Stream Deck SDK: Plugin WebSocket API](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/)
- [Sandalphon visual language](visual-language.md)
- [ADR 0002: Deterministic core](architecture/decisions/0002-deterministic-core.md)
- [ADR 0003: Original visual language](architecture/decisions/0003-original-visual-language.md)
