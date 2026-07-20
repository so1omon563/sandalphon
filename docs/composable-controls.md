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

## First Stream Deck + Set

| Control            | Idle presentation                                                                      | Input                              | Authority                                       |
| ------------------ | -------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Session Status key | Selected session name plus primary-state glyph and accent                              | None                               | Read-only                                       |
| Resume Session key | Distinct Resume glyph only while an exact current Resume offer exists; otherwise blank | Press and release                  | Revalidates and dispatches only `ResumeSession` |
| Attention key      | Distinct attention glyph and count only while attention exists; otherwise blank        | Press and release                  | Selects an attention session only               |
| Sessions dial      | Selected session, or a clearly labeled local preview, in one strip quarter             | Rotate to preview; press to select | Session selection only                          |

The four controls may be placed anywhere in the user's profile. Sandalphon
does not inspect, move, relabel, or coordinate neighboring foreign actions.
Only the Sessions dial owns its 200 by 100 touch-strip quarter.

## Safety Boundary

Composable controls cannot approve, reject, cancel, interrupt, retry, redirect,
or commit a next-turn setting. They never receive managed-surface authority.
Resume captures the current revision and opaque offer token on key-down and
dispatches only if both are unchanged on release. Attention similarly rejects
a stale target. Dial rotation is local preview; selection requires a separate
press.

Complete request inspection and final high-consequence confirmation remain on
the optional managed surface with the accepted review, separate-confirmation,
and 800 ms hold contracts.

## Validation

SO1-178 validates the Stream Deck + set first in an ordinary existing profile:

1. Place the three keys and one dial beside normal user actions.
2. Confirm each role is visually distinct in the action catalog and on-device.
3. Confirm Resume appears and dispatches only for a resumable selected session.
4. Preview sessions by dial without changing selection; press to select.
5. Confirm Attention selects a target without deciding its request.
6. Fully quit and reopen Stream Deck while the ordinary profile is active and
   confirm the controls recover without an Exit dependency.

After that walkthrough, the three key controls are validated on the Stream Deck
Mk.2 and a bounded composable session-navigation control is added only if the
physical workflow demonstrates the need.
