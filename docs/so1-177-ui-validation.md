# SO1-177 Managed UI Validation

## Goal

Make Sandalphon's managed profiles calm enough for normal Stream Deck use
without weakening the existing confirmation, stale-input, or Exit contracts.

## Baseline Hardware Findings

The 2026-07-19 Stream Deck Mk.2 walkthrough showed that every key carried
similar visual weight. Unavailable controls repeated the same prohibition
glyph, long thread names competed with action labels, and status, navigation,
configuration, and advanced actions appeared together. The Stream Deck +
walkthrough likewise showed redundant keys and four continuously populated
touch-strip lanes even when most lanes had no current job.

## Refinement Contract

- A primary navigation frame shows only current state, genuine attention,
  available actions, required local navigation, and Exit.
- An unused key is the dark canvas only: no card, glyph, label, or input.
- An unused Plus lane has no heading, detail, rail, or trigger description.
- Selected-session tiles use a dedicated session glyph with a semantic state
  accent. Offline surfaces, actions, and navigation remain visually distinct,
  with labels as confirmation rather than their sole identity.
- Classic Home shows the selected thread and at most four alternatives.
- Plus Home uses `E2` for session preview and `E3` only when attention exists.
- Plus Details exists only when it adds secondary context and never repeats the
  Home primary action as its sole lane.
- Plus reasoning distinguishes local preview from authoritative committed
  state in the visible lane title.
- Consequential review keeps its explicit decision positions and inspection
  requirements. Sparsity never shortens confirmation.

## Physical Walkthrough

Record the observed result for each device after installing the current build.

### Stream Deck +

1. Enter Sandalphon from the normal profile.
2. Confirm Home has one populated session lane and no decorative empty rails.
3. Rotate `E2`, press it to select, then tap its strip quarter to open Details.
4. Confirm Details shows only currently available action, reasoning, and
   activity lanes.
5. Confirm Back and Exit return predictably and no blank control responds.

### Stream Deck Mk.2

1. Enter Sandalphon from the normal profile.
2. Confirm Home shows the selected thread, at most four alternatives, roster
   mode, paging only when needed, genuine attention only, and Exit.
3. Select an alternative and open it from `K0`.
4. Confirm Session shows only offers that exist for that exact thread.
5. Confirm Back and Exit return predictably and no blank key responds.

## Result

### Stream Deck + — blocked after partial pass 2026-07-19

- Home rendered five unused keys as true blanks and reduced the strip to one
  session lane; a full Stream Deck app restart removed cached fallback glyphs
  from the three rail-free blank quarters.
- Distinct state, Resume, Details, Back, and Exit glyphs were recognizable
  before reading their labels.
- Clockwise and counter-clockwise `E2` rotation previewed adjacent sessions; a
  separate dial press selected the previewed session and rotating back restored
  the prior selection.
- Resume changed a historical session from unavailable to idle without
  starting work. Details appeared only after reasoning became available.
- Details contained only Back, Exit, and the genuine Reasoning lane. Rotation
  showed `Preview reasoning`; a separate press committed `high` and returned
  the title to `Reasoning`.
- Exit did not leave the managed profile after the Stream Deck application was
  fully quit and reopened while that profile was active. Dispatching Exit on
  key-down ruled out live frame revision churn as the cause. The official
  plugin API can only request the previously active profile and cannot name a
  user-defined profile; after application restart there was no usable prior
  profile context. This is a release blocker, not an accepted limitation.

Stream Deck Mk.2 validation remains pending.
