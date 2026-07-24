# Composable Daily-Driver Controls

## Purpose

Sandalphon's bundled Classic 15 and Stream Deck + profiles remain optional
full-surface reference and consequential-review environments. They are not the
normal daily-driver entry point because the official Stream Deck plugin API
cannot reliably return from a managed profile after the application restarts
without a prior-profile target.

Composable controls live directly in an ordinary user profile. They own only
their key or encoder context, coexist with unrelated actions, and require no
Sandalphon Exit control.

## Composable Set

| Control            | Idle presentation                                                                                     | Input                              | Authority                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Session Status key | Selected session name plus a session glyph and primary-state accent                                   | None                               | Read-only                                       |
| Resume Session key | Distinct Resume glyph only while an exact current Resume offer exists; otherwise blank                | Press and release                  | Revalidates and dispatches only `ResumeSession` |
| Review Changes key | Distinct Review glyph only for an idle Sandalphon-owned session with a current offer; otherwise blank | Press and release                  | Revalidates and dispatches only `ReviewChanges` |
| Attention key      | Distinct attention glyph and count only while attention exists; otherwise blank                       | Press and release                  | Selects the next attention session only         |
| Sessions dial      | Selected session, or a clearly labeled local preview, in one strip quarter                            | Rotate to preview; press to select | Session selection only                          |

The five controls may be placed anywhere in the user's profile. Sandalphon
does not inspect, move, relabel, or coordinate neighboring foreign actions.
Only the Sessions dial owns its 200 by 100 touch-strip quarter.
When Resume, Review Changes, or Attention has nothing to present, its key
renders true black so it is physically indistinguishable from an unused key
rather than a dim tile.

## Safety Boundary

Composable controls cannot approve, reject, cancel, interrupt, retry, redirect,
or commit a next-turn setting. They never receive managed-surface authority.
Resume and Review Changes capture the current revision and opaque offer token
on key-down and dispatch only if both are unchanged on release. Review Changes
uses the typed `review/start` app-server operation and never silently resumes
or attaches to a historical session. Attention similarly rejects a stale
target and advances through attention sessions in roster order, wrapping after
the last. Dial rotation is local preview; selection requires a separate press.

Complete request inspection and final high-consequence confirmation remain on
the optional managed surface with the accepted review, separate-confirmation,
and 800 ms hold contracts.

## Validation

SO1-178 validated the initial Stream Deck + set in an ordinary existing profile.
SO1-197 adds the first directly actionable official-interface control:

1. Place the four keys and one dial beside normal user actions.
2. Confirm each role is visually distinct in the action catalog and on-device.
3. Confirm Resume appears and dispatches only for a resumable selected session.
4. Confirm Review Changes appears only after that session is owned and idle,
   then starts a real official review turn without restarting Codex.
5. Preview sessions by dial without changing selection; press to select.
6. Confirm Attention selects a target without deciding its request.
7. Fully quit and reopen Stream Deck while the ordinary profile is active and
   confirm the controls recover without an Exit dependency.

After that walkthrough, the three key controls are validated on the Stream Deck
Mk.2 and a bounded composable session-navigation control is added only if the
physical workflow demonstrates the need.

## Hardware Results — 2026-07-19

### Stream Deck +

- The three keys and Sessions dial were added to page 3 of an existing Default
  Profile. The user's two existing pages and ordinary controls remained intact.
- Session Status rendered a recognizable session glyph and selected-session
  label. Resume and Attention appeared only when their capabilities existed.
- Dial rotation changed the strip to a clearly labeled local `Preview` without
  changing Session Status. A separate dial press selected the preview, returned
  the strip to `Sessions`, and exposed Resume for the newly selected historical
  session.
- Pressing Resume consumed the current offer, removed the key, changed the
  session to idle, and did not start new work.
- Fully quitting and reopening Stream Deck while Default Profile page 3 was
  active restored that profile, the selected session, the composable controls,
  and the Sessions strip without a Sandalphon Exit dependency.
- A physically blank Attention control initially retained a faint canvas tile.
  Rendering empty controls as true black made it indistinguishable from a
  genuinely unused key after the required full application restart.

A live positive Attention case was not available during this pass, so physical
target selection without decision remains pending. Deterministic coverage
continues to prove stale-target rejection and selection-only authority.

### Stream Deck Mk.2

- Session Status, Resume, and Attention were placed together in three empty
  keys on page 1 of the existing Default Profile. Existing page navigation,
  Weather, timer, Music, Firefox, and Todoist controls remained in place.
- Session Status showed the selected session with its dedicated glyph, Resume
  was visually distinct, and unavailable Attention rendered true black beside
  genuinely unused keys.
- Pressing Resume consumed the current offer and removed only the Resume key.
  Status, Attention, and unrelated controls did not change.
- Fully quitting and reopening Stream Deck restored Default Profile page 1,
  the three Sandalphon positions, and all ordinary controls without a managed
  profile or Exit dependency. Resume correctly reappeared when the new plugin
  connection received a fresh valid offer.

The Mk.2 needed no session-navigation key pair: the validated minimum is the
three composable keys, while session preview and selection remain a native dial
interaction on Stream Deck +. Positive live Attention evidence remains for the
organic dual-device daily-driver exercise; deterministic tests establish that
the composable key selects a current target without deciding its request.
