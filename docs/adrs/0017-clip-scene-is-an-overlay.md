# ADR 0017 — A Clip's Scene Is an Overlay Evaluated at t, Never Dispatched

- **Status:** Accepted (owner rulings Q1, Q2 and Q48–Q53, 2026-11-10)
- **Date:** 2026-11-10
- **Decision-makers:** project owner, Claude
- **Supersedes:** —
- **Superseded by:** —
- **Related:** `docs/superpowers/specs/2026-11-10-clip-studio-s3-scene-tracks.md` (the design),
  `docs/superpowers/plans/2026-11-10-clip-studio-s3-scene-tracks.md`,
  `docs/grill-sessions/clip-studio-2026-11-07.md` (Q1, Q2), ADR 0001 and ADR 0012 (the fade registry
  and its data-arrival gate), `docs/animation/clip-primitives.md`

## Context

A clip's camera has always been a pure function of its clock (`evaluateClip(data, t)`), but its
scene was not. The clip player fired each scene cue once, as the clock crossed it, and
`applySceneEffect` turned the cue into Redux intent writes (`setVisibility`, the `scene` action,
`updateSelectionFocus`, `setOrientation`) that outlived the clip; `fade` drove a private
per-address fade controller. Nothing could answer "what is the scene at t?", so the clip studio's
seek (S4) had no truthful frame to show, and a standalone clip left its scene behind in the user's
settings, the URL and the panel.

## Decision

**A clip's scene is an overlay on intent, a pure function of the clip clock, and the clip never
dispatches it.** `compileClip` emits `CompiledClip.scene: SceneTracks` (settings steps, focus steps,
per-address factor segments). Each tick the clip player counts the steps applied at t and the engine
reads the root through `clipPlayer.view(root)`: intent with those steps folded in through the real
reducers (`sceneView`, sharing `sceneActionsOf` with the tour's `computeSceneEntering`). Sagas, React,
the URL and snapshot captures keep reading intent, so during a clip they show the user's own
settings.

- **Targets, not ramps.** The overlay holds the scene's targets. The subsystems that animate user
  changes animate a clip's too: the player hands each crossed step to the fade registry with its
  `over`, and a `frameTo` to a frame roll from the live up-basis. `fade` alone is evaluated in full
  (`clipFactorAt`), because nothing else owns it.
- **The end belongs to the play.** `playClip(clip, frame, atEnd)` states it at every call.
  `'revert'` drops the overlay and publishes the difference at the default durations (600 ms in,
  100 ms out, the 1 s roll). `'keep'` commits the view to intent in the tick the clip ends, while the
  clip is still live, so nothing republishes and ramps in flight carry on. The tour's enter and dwell
  clips keep, inside its snapshot bracket; every other play reverts. A `fade` has no intent field, so
  `keep` cannot commit it: the factor returns to 1 either way.

Not decided here: seek, pause and transport (S4). The overlay is evaluable at any t, but a jump has no
crossings to publish; S4 seeds the registry and the frame roll instead. A paused frame inside a roll
shows the roll's destination, not a mid-roll pole: the roll runs on wall time, not on the clip clock.

## Seeking (S4, 2026-11-11)

A play can be under transport: `camera.clip.transport` (`paused` at a t, or `running` from one
with an optional loop span) owns its clock, anchored at the first frame that sees each transport
object. A jump (a new transport, new data, any transported wrap) publishes by **seeding** the fade
registry at t: `setImmediate` to the value a continuous play shows there (`rampAt`, the fade
controller's curve), then, while running, `fadeTo` for the ramp's remaining time; a mid-roll
`frameTo` restarts from the slerp at t. Paused seeds start no ramps, because the registry runs on
wall time while the clip clock stands, so a paused frame inside a roll shows the destination. The
alternative, ramps evaluated in clip time, makes a paused frame exactly f(t) but is the second ramp
engine rejected below; seeding keeps the registry's data-arrival gate and label envelope. Past the
end a paused transport shows intent with every factor at 1: the play's end with `revert`.

## Consequences

### Positive

- The whole frame is a function of the clip clock, which S4's seek and scrub need.
- A standalone clip no longer leaks its scene into the user's settings, the hash or the panel.
- The edge-triggered path is gone: `applySceneEffect`, the clip opacity channel and the cue cursor.

### Negative

- Every engine read of `settings`, `selection` or `selectionRows` must go through `readRoot()`;
  a bypass silently ignores the overlay. `tests/conventions/engineRootRead.test.ts` ratchets it.
- During a clip the panel, the remote and the URL lag the picture; a tour updates them at each clip's
  end instead of at each cue.
- Ramps are seeded, not evaluated, on a jump, so S4 owns a seed step the registry does not have yet.

### Neutral / forward-looking

- Two folds remain: the tour's over unresolved beats in written order, the clip's over compiled steps
  in time order. `validateSeqCueOrder` keeps their orders agreeing until the tour fold can evaluate
  compiled tracks.

## Rejected alternatives

- **Affine overlay values (`k · intent + c`) with the overlay owning every ramp.** It would make a
  paused frame exactly f(t), but it is a second ramp engine beside the fade registry, losing the
  registry's data-arrival gate (a clip-shown layer would pop in on load) and duplicating the label
  envelope.
- **A tour compiled into one concatenated scene.** Beats wait on foci, settle, skip, step back and
  pause, so a tour is not one timeline; the cost of staying is one `keep` commit per clip seam.
- **The tour folding a clip into intent after `playClip` resolves.** One rendered frame of reverted
  scene would reach asset demand between clips.
- **Publishing the view into Redux.** A mirror of state that already has a home.

## References

- S3 spec §1–§3 (model, player, composition) and §9 (rulings); S4 spec §9 (what S4 builds on).
