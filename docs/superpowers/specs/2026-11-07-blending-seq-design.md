# Blending seq — design

- **Date:** 2026-11-07
- **Status:** draft, for the owner's review
- **Source:** tour PR #1070 conversation (beat 02's dolly zoom stops between steps), refactor-ground
  checkpoint 2026-11-07 (rulings below); earlier ground pass on velocity-matched joins
  (`feat/animation-flow-joins`, `docs/superpowers/ground/2026-11-06-animation-flow-joins-ground.md`)
- **Lands:** its own PR off main, before the grand tour's beat 02 rebuild uses it

## Intent

Every camera step eases in and out, so a `seq` of steps comes to rest at every join. A clip that
should flow (pull out, narrow the lens, hold, open the lens, turn) shows a dead moment at each
handover, and hand-staggering steps inside `all` to avoid it is fragile and unreadable. `seq` gets an
option that blends its steps: each step starts before the previous one ends, and the compiler works
out how every channel crosses each join. Evaluation stays a pure function of (compiled clip, t).

## Authoring

```ts
seq(steps)                                // unchanged: each step starts where the last ended
seq(steps, { overlap: 2 })                // every join overlaps by 2 s
seq(steps, { overlap: [1, 2, 0, 4] })     // one entry per join
```

- `overlap` is a number or an array with one entry per join **between steps that have a duration**.
  Zero-length steps (scene cues, `show`/`hide`, `focus`, `frameTo` with `over: 0`) don't count, so
  inserting a label cue never shifts the overlaps after it; they fire where they stand in the
  sequence, moving with the step that follows them.
- Step i+1 starts `overlap[i]` seconds before step i ends; the seq's duration shrinks by the sum.
- The top-level `timeline` stays a plain seq. A clip that wants blending wraps its steps in one.

## How a channel crosses a join

The compiler classifies each join **per channel, from the real windows** of the last writer before
it and the first writer after it, not from the overlap number alone:

| windows on the channel | result |
|---|---|
| overlapping (`in.start < out.end`) | **crossfade** over the overlap window |
| abutting, in a seq with `overlap` set | **velocity-matched join** (no stop) |
| a gap (the channel rests between its writers), or a plain seq | rest, as today |

A channel written on only one side of a join just runs; channels on different steps run together
through the overlap.

**Crossfade.** Inside the window the channel's value is `(1 − w)·out(t) + w·in(t)` in its channel
space (log for distance and fov, unwrapped angles for yaw/pitch/roll, linear for target), with
`w` a smootherstep of progress through the window. `w′ = 0` at both ends, so value and velocity
are continuous; the mix is convex, so it never overshoots the two plans. The incoming segment starts
from the outgoing one's **planned** end value, the same `from` rule as a plain seq. A reversal (out,
then back in) turns around smoothly inside the window.

**Velocity-matched join.** Both segments' curves become cubic Hermite in progress, with the shared
speed at the join set to the harmonic mean of their average speeds (monotone: never faster than
twice the slower one; zero at a reversal, which is the right stop). An outer end keeps its ease's end
speed. Slopes are stored relative to each segment's span, so they hold inside a frame leg.

## Rules (compile errors, never clamps)

1. `overlap` entries are finite and ≥ 0; an array's length equals the joins between steps with a
   duration.
2. An overlap no longer than either neighbouring step, and `overlap[i−1] + overlap[i] ≤ step i`, so
   step i−1 never reaches step i+1.
3. At most two writers live on a channel at once; a blend window lies inside both segments (the
   incoming one may not end before the outgoing one).
4. No blend or matched join across a change of reference frame.
5. A composite move (`flyPath`, `geodesic`) overlapping another writer on a shared channel stays an
   error, as today.
6. If an overlap makes two cues that set the same thing fire in a different order than they are
   written, compile throws: the tour folds cues in written order (`computeSceneEntering`) to rebuild
   the scene on a skip or Prev, and the two must agree.
7. `all` keeps its rule: one writer per channel at a time.

Velocity (`rate`) and oscillation layers shift with their step and are not blended; they already
allow overlaps.

## Decisions

- **Stored on the incoming segment** (checkpoint Q1): `BaseSegment` gains `curve: SegmentCurve`
  (`'ease' | 'hermite'`) and `blendIn?: { startSec; endSec }`. The evaluator keeps today's walk; it
  finds up to two active segments and blends them through one segment interpolator. Rejected: a
  rebuilt gapless per-channel piece list (cleaner, but frame legs convert their origins at run time,
  so it means reworking the base layer, frame legs and every evaluator test).
- **Composite blends are an error** for now (Q2): no clip needs one, and composites share no
  value-at-t interface to blend through.
- **Cue order is guarded by a compile error** (Q3), not a shared timing pass.
- **Zero-length steps don't count** in the overlap array (Q4).
- **Overlap 0 means a matched join; no option means today's rest** (owner, 2026-11-07).

## Ground preparation

Refactor-ground checkpoint, 2026-11-07; signed off. Prep rides this PR as its first commits (Q6),
each behaviour-free:

1. **One segment interpolator.** `segmentValueAt(seg, from, t)` and `segmentEndValue(seg, from)` in
   `src/services/engine/animation/`; the three inline ease sites in `evaluateClip.ts` (393, 416, 468)
   and `channelValueAt.ts`'s own fold (28–42) call it. Missing joint: the rule "what a segment does"
   lived in four places, and a blend would have been a second branch at each.
2. **`BaseSegment.ease` → `curve: { kind: 'ease'; ease }`**, one arm. Writers `compileClip.ts` 190,
   207, 226; tests `validateSingleWriter.test.ts`, `compileClip.test.ts`. Missing joint: the curve
   was not a variant.
3. **Structural nodes keep their fields through `resolveClipFoci`** (`resolveClipFoci.ts:148–161`
   rebuilds `seq` and `all` and drops anything new; `applyPathTuning.ts:64` already spreads). Missing
   joint: an option on `seq` would be silently lost before compile.

**Growth (the feature):** the `overlap` field on the seq node and `seq(children, opts)`; the cursor
shift in `compileClip`'s seq case; a `resolveSeqJoins` pass beside `continuedFromComposite`
(classifies joins, writes `blendIn` and Hermite curves); the `'hermite'` arm; the evaluator's
two-segment blend; the rules above in the validators; `docs/animation/clip-primitives.md` (seq row,
single-writer paragraph, a "Blending a seq" section).

**Backlogged, not fixed here:** `Effect.d.ts:22` says four structural nodes and lists five; no tests
exist for `validateCompositeExclusivity` or `channelValueAt`.

## Tests that must exist

- Every existing clip compiles to the same `CompiledClip` (modulo the `curve` reshape) and evaluates
  identically: the prep and a plain seq change nothing.
- A crossfade: value and velocity continuous at both window ends; a reversal turns without
  overshoot.
- A matched join: speed at the join > 0 for same-direction segments, 0 at a reversal, never above
  twice the slower segment's average.
- Each rule above throws with a message naming the seq and the join.
- `resolveClipFoci` keeps `overlap`; the overlap array skips zero-length steps.

## Left to the builder

- The exact smootherstep and Hermite formulas, error messages, file split (one symbol per file in
  `utils/` and `@types/`).

## Known limits

- The author still chooses overlaps that keep turns off a narrow lens (stars sweep at the turn rate
  over the lens angle); a tour test can check that, the compiler doesn't.
- No blending across clip boundaries (enter clip → dwell): that is step 2, the tour as one timeline.

## Eye check (on the tour branch, after this merges)

Beat 02's four parked telephoto previews rebuilt on `seq(…, { overlap })`: no dead moment between
the pull-out, the lens, the hold and the turn.
