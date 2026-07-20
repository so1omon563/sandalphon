# Stream Deck + Interaction Map

## Status and Boundary

This is Sandalphon's accepted v0 design contract for the managed standard
Stream Deck + surface: eight LCD keys, four push encoders, and four touch-strip
quarters. It fixes physical placement, contextual dial lanes, touch behavior,
ordered choices, request review, and feedback before live Stream Deck and
Codex adapters are added.

The map consumes Sandalphon snapshots, action offers, safety plans, and local
surface state. It does not parse provider messages, construct commands, infer
undocumented gestures, or broaden an unavailable offer. Composable actions
remain self-contained and do not inherit managed-surface authority.

## Physical Model

Keys are numbered in row-major order. Encoders and their touch-strip quarters
are numbered left to right:

| Top keys    |             |             |             |
| ----------- | ----------- | ----------- | ----------- |
| `K0` (0,0)  | `K1` (0,1)  | `K2` (0,2)  | `K3` (0,3)  |
| `K4` (1,0)  | `K5` (1,1)  | `K6` (1,2)  | `K7` (1,3)  |
| `Q0` / `E0` | `Q1` / `E1` | `Q2` / `E2` | `Q3` / `E3` |

Each encoder action owns one `Qn` quarter with a 200 by 100 layout canvas.
When the managed profile owns all four encoder actions, one immutable frame
may coordinate them into an apparent 800 by 100 strip. It still updates four
quarter-local action contexts and never claims native full-strip ownership.

The exact executable role and input map is defined in
[`src/streamDeckPlus.ts`](../src/streamDeckPlus.ts).

## Official Input Boundary

The supported SDK input facts are deliberately narrow:

- dial down and dial up identify an explicit push;
- dial rotation reports signed ticks and whether the dial was pressed;
- touch tap reports quarter-relative position and a `hold` boolean;
- no official swipe or continuous touch-motion event exists.

Sandalphon therefore ignores pressed rotation in v0, does not infer swipe from
separate taps, and does not turn timing into an undocumented gesture.

## Stable Key Anchors

| Key  | Stable responsibility                 | Rule                                                                                         |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `K0` | Selected session or unavailable state | Attention never steals selection.                                                            |
| `K3` | Attention or positive authorization   | Opens attention normally and becomes Approve or positive review confirmation only in review. |
| `K4` | Home/Back                             | Local navigation only; it never changes provider state.                                      |
| `K5` | Cancellation in request review        | Cancellation is distinct from rejection and approval.                                        |
| `K6` | Details or rejection in request       | Home opens Details here; Reject remains a separate physical decision in review.              |
| `K7` | Exit Sandalphon                       | Requests the prior Stream Deck profile without stopping Codex or acknowledging results.      |

Every changed meaning is labeled in a new frame before input is accepted. A
held key, dial press, or touch cannot cross a frame revision into a new role.

## Home

| `K0` Selected | `K1` Empty | `K2` Run action | `K3` Review request |
| ------------- | ---------- | --------------- | ------------------- |
| `K4` Empty    | `K5` Empty | `K6` Details    | `K7` Exit           |

| Lane | Strip feedback                         | Rotate                    | Press                    |
| ---- | -------------------------------------- | ------------------------- | ------------------------ |
| `E0` | Empty                                  | None                      | None                     |
| `E1` | Empty                                  | None                      | None                     |
| `E2` | Privacy-safe session preview and state | Preview another session   | Select previewed session |
| `E3` | Attention count and preview, if any    | Preview attention session | Select it explicitly     |

- Rotation changes only local preview. Session selection occurs on a new `E2`
  or `E3` press and acknowledges no result.
- An uncommitted `E2` session is titled Preview; the title returns to Session
  only after the selecting press is reflected in the current snapshot.
- A lane omits rotate or press affordances when no distinct valid choice exists.
- `K2` is labeled Start, Resume, Cancel run, or Retry only when the current
  exact offer supports that state. Consequential variants enter review; the
  entry press never dispatches them.
- `K3` exists only when the selected session has a request. Other attention is
  isolated to `E3` and never changes selection automatically.
- Details appears only when it can reveal a secondary action, reasoning
  control, or live activity. It does not open a submenu that merely duplicates
  the primary action already visible on `K2`.
- Empty keys and lanes render as the dark canvas, without a card, state glyph,
  label, rail, or trigger description.

## Session

| `K0` Selected | `K1` Empty | `K2` Run action | `K3` Review request |
| ------------- | ---------- | --------------- | ------------------- |
| `K4` Back     | `K5` Empty | `K6` Empty      | `K7` Exit           |

| Lane | Strip feedback                    | Rotate                 | Press                         |
| ---- | --------------------------------- | ---------------------- | ----------------------------- |
| `E0` | Empty                             | None                   | None                          |
| `E1` | Current action, when available    | Preview action         | Activate or enter its review  |
| `E2` | Next-turn choice, when advertised | Preview ordered option | Commit current advertised one |
| `E3` | Current activity, while active    | None                   | None                          |

- `E1` press invokes only a current release-level offer or enters the current
  safety review. It never performs the final reviewPress or reviewHold step.
- Review changes and Compact are release-level official actions in this lane
  for an idle app-server-owned session. They share one start-work lock and
  disappear while work is active.
- The dedicated `E2` reasoning choice is not duplicated in the `E1` action
  catalog.
- `E2` is enabled only for an advertised turn-boundary choice. Rotation does
  not wrap; press revalidates and commits the current preview without starting
  work.
- An uncommitted value is titled `Preview reasoning`. Only an authoritative
  snapshot matching the committed value returns the lane title to `Reasoning`.
- A lane disappears again when its contextual action, setting, or activity is
  no longer present.

## Contextual Actions

`E1` rotates the currently available action catalog. An `E1` press revalidates
the displayed token. Release-level actions may dispatch once; consequential
actions only enter their dedicated review frame.

The implemented catalog order is Resume, Inspect/Acknowledge, Review changes,
Compact, Retry, and Cancel Run; the current primary key action is omitted from
the dial. Reasoning remains on its dedicated lane. Unsupported operations
remain absent. There is no command, prompt,
keystroke, terminal, browser, commit, or pull-request fallback.

## Ordered Choice

| `K0` Selected | `K1` Choice context | `K2` Preview value | `K3` Attention |
| ------------- | ------------------- | ------------------ | -------------- |
| `K4` Back     | `K5` Empty          | `K6` Empty         | `K7` Exit      |

Only `E2` is active. Its strip quarter names the complete option and position;
the other quarters provide coordinated context but accept no rotation or
press. Rotation moves by the reported signed ticks, stops at either endpoint,
and never wraps. Rotation while the encoder is pressed is ignored. A separate
unpressed `E2` push commits the exact advertised option.

Back discards preview with no domain change. A newer frame, target change,
offer change, disconnect, or restart also discards it. Touch never commits a
choice.

## Request and Consequential Review

| `K0` Selected | `K1` Request target | `K2` Review state | `K3` Approve |
| ------------- | ------------------- | ----------------- | ------------ |
| `K4` Back     | `K5` Cancel         | `K6` Reject       | `K7` Exit    |

All four quarters form one coordinated detail page. `E0` through `E2` display
detail segments without dial input. `E3` rotates previous or next detail pages
and pressing it returns to the first unread page. Paging is local and never a
decision.

Each quarter contains at most two 18-grapheme lines. Decision-critical fields
are first serialized into visible reversible text and then paged without
ellipsis or omission. The executable paginator preserves up to twelve pages,
or 1,728 displayed grapheme clusters. An invalid control, invisible-format,
standalone variation selector, surrogate, private-use, unassigned,
line-separator, isolated joiner, oversized value, or other unfaithful content
makes complete-inspection actions unavailable with `Review in Codex`.
Validated emoji presentation and joiner sequences remain intact.

### Decision positions

- `K5` is Cancel Request when advertised; otherwise it may be Cancel Run with
  the explicit `Interrupt run` consequence. The two never appear together.
  Final cancellation is a new 800 ms `K5` hold after target inspection.
- `K6` is Reject. Entry opens target review. After a new frame, a separate
  `K6` press confirms decline and lets the run continue.
- `K3` is Approve. Entry opens complete review. Only after every exact page has
  been displayed does a new frame label it `Hold approve`; a new 800 ms `K3`
  hold dispatches one-shot acceptance.

The entry press cannot confirm, and a key held across the new frame does
nothing. The arm expires after ten seconds. Back, Exit, page target change,
request resolution, offer change, device disconnect, Stream Deck restart,
plugin restart, or connection change invalidates it.

Retry and Redirect reuse the full-strip review. Their final reviewPress control
is `K3`, clearly labeled for the exact consequence. Touch, dial press, pressed
rotation, composable actions, multi-actions, and key-logic actions cannot
perform final high-consequence confirmation.

## Touch Contract

Touch is deliberately conservative:

- a tap may open or focus only the exact local context displayed in that
  quarter; it does not invoke an action offer, commit a choice, acknowledge a
  result, select a decision, or confirm a consequence;
- a reported touch hold performs no v0 action and has no trigger description;
- swipe is unavailable because the official SDK exposes no swipe or motion
  event; Sandalphon does not infer it from separate tap positions or timing;
- quarter-relative tap position may refine a declared local focus target only
  when the current immutable frame defines that target.

These limits leave room for measured physical validation without turning the
touch strip into an unreviewed authority surface.

## Unavailable and Recovery

| `K0` Offline | `K1` Reason | `K2` Recovery detail | `K3` Recover |
| ------------ | ----------- | -------------------- | ------------ |
| `K4` Home    | `K5` Empty  | `K6` Empty           | `K7` Exit    |

The coordinated strip provides static failure and recovery context; all four
encoders and touch regions accept no input. Recover exists only when the core
offers the exact recovery operation. It never chooses credentials, broadens
configuration, resumes unknown work, or replays an ambiguous intent.

Starting, reconciliation, missing configuration, authentication failure,
unsupported versions, ownership conflict, stale state, and disconnect each
receive a stable label and disabled controls. A newer settings schema remains
untouched and requires an upgrade.

## Persistent and Transient Feedback

| Evidence                             | Persistent frame                                   | Optional transient feedback            |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------- |
| Rotation preview                     | Violet focus plus exact preview label              | None                                   |
| Dial or key accepted for dispatch    | Sending with conflicting controls disabled         | None                                   |
| Waiting for authority                | Exact pending verb, such as Approving or Canceling | None                                   |
| Authoritatively confirmed            | New snapshot state                                 | `showOk` on the originating control    |
| Definite validation/provider failure | Stable reason and current offer state              | `showAlert` on the originating control |
| Ambiguous transport outcome          | Checking/Uncertain with conflicting effects locked | `showAlert` may accompany the frame    |
| Completed or failed run              | Exact terminal result remains latched              | Never transient feedback alone         |

Request resolution alone never proves which decision won. Interrupt acceptance
alone never proves a run stopped. Provider automatic retry remains
Working/Retrying and exposes no explicit Retry control.

## Composable Actions

Managed geometry and authority do not leak into user profiles. The first
ordinary-profile set is deliberately small:

- Session Status renders the selected session name and primary state.
- Resume Session appears only for the exact current `ResumeSession` offer and
  revalidates the offer on release.
- Attention renders only when attention exists; pressing it selects an
  attention session but never decides its request.
- Sessions owns one dial and one strip quarter. Rotation previews locally and
  press selects; it never coordinates foreign quarters.

Open Managed Surface remains an explicit optional route to complete review and
consequential confirmation. It is not the normal daily-driver entry point.

Foreign actions are never inspected, relabeled, moved, or controlled. User
title or image overrides may reduce composable fidelity, so no composable
action is the sole consequential review surface.

The official plugin API cannot select a user-defined profile. `K7` can return
only while Stream Deck still has a prior-profile context from entry during the
current application session. A full application restart while the managed
profile is active loses that usable return target. SO1-177 treats this as a
release blocker for managed-profile daily use. SO1-178 therefore keeps the
managed profile as a reference surface and moves daily use into the user's
ordinary profile, where no Sandalphon Exit is required.

## Acceptance Walkthrough

1. **First run:** missing validated configuration produces the static Offline
   frame. Exit requests the prior profile when Stream Deck still owns that
   context; Recover cannot broaden setup authority.
2. **Quiet roster navigation:** only `E2` previews sessions; a separate press
   selects one without acknowledgement. Other lanes stay dark unless genuine
   attention exists.
3. **Attention without theft:** `E3` previews attention sessions and press
   selects explicitly. Later attention never changes `K0` on its own.
4. **Working session:** `K2` becomes Cancel run only for the exact active run,
   enters review, and keeps Back local.
5. **Action catalog:** `E1` previews one typed offer. Press dispatches a
   release-level action or enters review; it never skips safety confirmation.
6. **Reasoning choice:** `E2` rotation previews ordered options without wrap.
   Press commits once at the turn boundary; pressed rotation and touch do
   nothing consequential.
7. **Inspectable approval:** the four quarters show complete paged detail.
   Approval remains disabled until every page is displayed; a new 800 ms `K3`
   hold dispatches once. A 799 ms hold or stale frame dispatches nothing.
8. **Oversized approval:** a thirteenth detail page disables approval as
   `Review in Codex`. Safely inspectable reject or cancel may remain separate.
9. **Reject versus cancel:** `K6` decline uses a separate press and lets the
   run continue. `K5` interruption uses a hold and waits for exact interrupted
   terminal evidence.
10. **Touch boundary:** tap changes only declared local context. Hold and swipe
    produce no v0 action and cannot arm or confirm review.
11. **Failure and retry:** Failed stays latched. Retry opens complete new-run
    review and confirms on a new `K3` press; it never replays a side effect.
12. **Disconnect during consequence:** old offers, inspection receipts, arms,
    and physical input are invalid. The frame shows Checking and never retries
    automatically.
13. **Composable coexistence:** one encoder updates only its quarter, honors
    user display precedence, and cannot coordinate neighboring actions.
14. **Restart:** action contexts rebuild and persisted selection/results return
    only after reconciliation. Local previews, detail pages, arms, and offer
    tokens return to a safe base state.

These are deterministic software acceptance scenarios. Touch legibility, dial
direction and detents, strip coordination, key reach, 800 ms holds, the
ten-second arm window, latency, recovery, and restart behavior require the
physical standard Stream Deck + validation in SO1-173.

## Official Interface Evidence

- [Elgato Stream Deck SDK: Dials and touch strip](https://docs.elgato.com/streamdeck/sdk/guides/dials/)
- [Elgato Stream Deck SDK: Touch strip layout](https://docs.elgato.com/streamdeck/sdk/references/touch-strip-layout/)
- [Elgato Stream Deck SDK: Plugin WebSocket API](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/)
- [Elgato Stream Deck SDK: Devices](https://docs.elgato.com/streamdeck/sdk/guides/devices/)
- [Sandalphon visual language](visual-language.md)
- [ADR 0002: Deterministic core](architecture/decisions/0002-deterministic-core.md)
- [ADR 0003: Original visual language](architecture/decisions/0003-original-visual-language.md)
- [ADR 0005: Stream Deck + interaction map](architecture/decisions/0005-stream-deck-plus-interaction-map.md)
