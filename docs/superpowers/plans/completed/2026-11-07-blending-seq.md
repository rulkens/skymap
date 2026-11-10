# Blending seq Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** `seq(steps, { overlap })` starts each step before the previous one ends, and the compiler
works out how every camera channel crosses each join: a crossfade where a channel's two writers
overlap, a velocity-matched (Hermite) join where they abut.

**Architecture:** Three behaviour-free prep commits first (one segment interpolator, the
`ease` → `curve` union, `resolveClipFoci` keeping structural fields). Then the seq places its steps
with the overlap and records each step's index ranges; a post-walk pass `resolveSeqJoins` beside
`continuedFromComposite` classifies every join per channel and writes `blendIn` and Hermite curves
onto the incoming or both segments. The evaluator keeps its walk and blends at most two active
segments. Evaluation stays a pure function of (compiled clip, t).

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/completed/2026-11-07-blending-seq-design.md`

## Global Constraints

- `overlap` is a number or an array with one entry per join **between steps that have a duration**;
  zero-length steps (cues, `show`/`hide`, `focus`, `frameTo`, `fork`, `osc`, `over: 0` writers) don't
  count and fire at the start of the next step with a duration (at the seq's end if none follows).
- No option ⇒ today's rest, byte-identical compile. `overlap: 0` ⇒ matched joins.
- Every rule violation is a compile error naming the seq and the join, never a clamp. Message
  prefix: `` `seq at ${startSec}s, join ${j + 1}: ` `` (`j` 0-based over the duration joins).
- The blend lives on the incoming segment: `BaseSegment.curve: SegmentCurve` + `blendIn?`.
- Prep commits change no behaviour; the parity probe (below) proves it.
- `type`, never `interface`; one symbol per file in `utils/` and `@types/`; comment budget
  (module header ≤ 10 lines, comments ≤ half the code lines). Stage by path.

## Review Focus

1. An overlapping seq nested inside another overlapping seq's step, on the same channel: each join
   classifies its own pair, no segment gets two `blendIn`s → test in Task 6.
2. A zero-length snap (`dollyTo(x, 0)`) between two steps on the blended channel → compile error, not
   a silent mis-walk → test in Task 6.
3. A `'live'`-start clip compiled for `durationSec` only (placeholder zero pose, `ln 0`) with a
   matched join on the channel's first writer → no throw, finite duration → test in Task 7.
4. A yaw crossfade whose two plans straddle ±π → no 2π jump mid-window → test in Task 6.
5. `rate`/`osc` inside an overlapped step shift with it and are not blended → test in Task 4.

## Decisions taken here (for the owner's plan review)

- **D1 — parity as a probe, not a committed snapshot.** The spec's "every existing clip compiles and
  evaluates identically" is proved by a scratch probe run at BASE and after every prep commit and at
  the end (results in the ledger). A committed snapshot of every clip would be a second golden that
  every intentional camera change must regenerate; the existing clip, evaluator and golden-trace
  suites stay the standing net.
- **D2 — a composite in any join on a shared channel is an error**, abutting included: a composite
  cannot take a Hermite curve, and silently resting would break `overlap: 0`'s promise.
- **D3 — rule 4 also covers the outgoing segment's start.** A matched join needs the outgoing span at
  compile time; if a frame leg opens between the channel's previous writer and the join, the
  outgoing start is converted at run time, so the join throws ("add a snap of the channel at the
  leg start"). Legs come from the evaluator's own rule (`buildFrameLegs`, extracted in Task 6), so
  the guard can't drift from playback. `fov` is frame-free and exempt.
- **D9 — joins are classified per consecutive pair of a channel's writers**, each pair belonging to
  at most one overlapping seq: no per-join search, no de-duplication, and a stray writer between two
  steps fails rule 3 on its own.
- **D4 — a looping `spin` never joins** (it has no end): compile error.
- **D5 — a matched join between segments of different `space` throws** (their speeds are in
  different units).
- **D6 — the outer end of a Hermite curve keeps its ease's end slope, limited to
  `[0, √(9 − m_join²)]`** so the curve stays monotone (Fritsch–Carlson); the join slope is never
  touched, so the match holds. Only steep-start eases (`easeOutCubic` and steeper) hit the limit.
- **D7 — target (Vec3) joins match speed, not direction**: speeds are `|Δ|/dur`, a reversal is
  `dot(Δout, Δin) ≤ 0`. A corner between non-collinear moves keeps its direction change; documented
  as a known limit.
- **D8 — `Effect.d.ts`'s "four structural nodes" is fixed in Task 4** (that comment is rewritten
  there anyway); the missing `validateCompositeExclusivity` / `channelValueAt` tests go to the
  backlog in Task 7.

## Parity probe (controller-owned, not committed)

`<scratchpad>/parity.mts`, run with `npx tsx`: for every `ClipData` reachable from `clipRegistry`
and `tourRegistry` that compiles without a resolver or frame deps (skip and count those that throw),
`evaluateFramedClip` at 64 evenly spaced `t` over `[0, durationSec]`; write JSON. Baseline at BASE
`f404c92e3`; each prep commit and the final HEAD must diff to zero on clips without an overlapping
seq (none exist on main, so: zero, full stop).

---

### Task 1: One segment interpolator (prep 1) — `review: yes`

**Files:**
- Create: `src/services/engine/animation/segmentValueAt.ts`,
  `src/services/engine/animation/lerpChannel.ts`
- Modify: `src/services/engine/camera/clips/evaluateClip.ts:350-474` (both base walks),
  `src/services/engine/animation/channelValueAt.ts:28-42`

**Interfaces:**
- Produces: `lerpChannel<V extends number | Vec3>(channel: Channel, space: Space, a: V, b: V, w: number): V`
  — the one home of "how a channel interpolates": yaw/roll `lerpAngleShortest(a, b, w)`, `target`
  component-wise linear, otherwise `lerpInSpace(space, a, b, w)`. Task 6's crossfade calls it with
  `CHANNEL_SPACE[channel]`.
- Produces: `segmentValueAt<V extends number | Vec3>(seg: BaseSegment, from: V, t: number): V` —
  the channel value `seg` gives at `t ≥ seg.startSec`, starting from `from`: tween →
  `lerpChannel(seg.channel, seg.space, from, to, e)`, spin → `from + by·e`; past `endSec` a tween holds `to`, a finite spin holds `from + by`, a `loop`
  spin continues linearly at `by` per window. Exactly today's arithmetic, including the
  zero-duration `localT = 1` case. Its value at `seg.endSec` is the segment's planned end (the
  crossfade's and the matched join's `from` rule) — no separate end-value function.

- [x] Replace `evaluateBaseScalar` and `evaluateBaseVec3` with ONE generic walk
      `evaluateBaseTrack<V>(segments, startVal: V, t, window): V` that calls `segmentValueAt` for
      the active segment and for the fold of ended ones (`runningVal = segmentValueAt(seg, from, t)`
      when `t ≥ endSec`, which keeps today's loop-spin fold at `t`). The Vec3 caller still returns
      a fresh array. `fovYRadAt` and `evaluateBaseAt` call the generic walk.
- [x] `channelValueAt`'s base-segment arm becomes `segmentValueAt(w, w.from ?? value, atSec)`.
- [x] No new test (pure extraction; the parity probe and the evaluator suite pin it).
- [x] `npm run typecheck:fast`; `npx vitest run tests/services/engine/camera tests/services/engine/animation tests/data/animation`.
- [x] Commit: "Clip evaluator: one segment interpolator for every base walk".

### Task 2: `ease` → `curve` union (prep 2)

**Files:**
- Create: `src/@types/animation/compiledClip/SegmentCurve.d.ts`
- Modify: `src/@types/animation/compiledClip/BaseSegment.d.ts:37`,
  `src/services/engine/animation/compileClip.ts:190,207,226`,
  `src/services/engine/animation/segmentValueAt.ts`,
  `tests/services/engine/animation/validateSingleWriter.test.ts`,
  `tests/services/engine/animation/compileClip.test.ts` (any `ease` on a compiled segment)

**Interfaces:**
- Produces: `export type SegmentCurve = { readonly kind: 'ease'; readonly ease: Ease };` (one arm;
  Task 7 adds `'hermite'`). `BaseSegment.ease` is removed; `BaseSegment.curve: SegmentCurve`.
- `segmentValueAt` reads progress through a local `curveProgress(curve, u)` switch.

- [x] Reshape type, the three writers (`curve: { kind: 'ease', ease: effect.ease }`), the reader and
      the two test files. `VelRamp`/`OscTrack` keep `ease`.
- [x] No new test (a type reshape; the compiler finds every site).
- [x] typecheck + the animation and clip tests; parity probe → zero diff.
- [x] Commit: "Compiled clip: a segment's curve is a variant".

### Task 3: `resolveClipFoci` keeps structural fields (prep 3)

**Files:** Modify `src/services/engine/animation/resolveClipFoci.ts:148-166`

- [x] `seq`, `all`, `fork` rebuild with `{ ...effect, children: … }` / `{ ...effect, child: … }`, as
      `applyPathTuning.ts:64` already does.
- [x] No test here (no field to lose yet; Task 4 adds the `overlap` round-trip test).
- [x] typecheck + `npx vitest run tests/services/engine/animation/resolveClipFoci.test.ts`; parity → zero.
- [x] Commit: "resolveClipFoci: structural nodes keep their fields".

### Task 4: Authoring and step placement (rules 1–2)

**Files:**
- Create: `src/@types/animation/SeqOverlap.d.ts`, `src/@types/animation/SeqSteps.d.ts`,
  `src/@types/animation/StepSpan.d.ts`, `src/services/engine/animation/hasDuration.ts`
- Modify: `src/@types/animation/Effect.d.ts` (seq arm + header bullets, "four" → "five"),
  `src/services/engine/animation/effectHelpers.ts:326` (`seq`),
  `src/services/engine/animation/compileClip.ts` (seq case ~153, `Accum`),
  `docs/animation/clip-primitives.md` (seq row ~230)
- Test: `tests/services/engine/animation/compileClip.test.ts`,
  `tests/services/engine/animation/resolveClipFoci.test.ts`

**Interfaces:**
- `export type SeqOverlap = number | readonly number[];`
- Effect seq arm: `{ readonly kind: 'seq'; readonly children: Effect[]; readonly overlap?: SeqOverlap }`.
- `seq(children: Effect[], opts?: { readonly overlap?: SeqOverlap }): Effect & { kind: 'seq' }` —
  sets `overlap` only when given (a plain seq stays `{ kind, children }`).
- `hasDuration(effect: Effect): boolean` — structural: `hold`/`wait` `sec > 0`; `set`/`setVec`/
  `spin`/`rate` `over > 0`; `flyPath` true; `geodesic` `over === undefined || over > 0`; `osc`,
  `fork`, scene cues false; `seq`/`all` any child; unresolved focus-bound arms throw as compileClip
  does. The walk throws if a step's real duration disagrees (a zero-arc geodesic).
- `export type StepSpan = { readonly segs: readonly [number, number]; readonly composites: readonly [number, number]; readonly cues: readonly [number, number] };`
  — `[lo, hi)` index ranges into `acc.baseSegs` / `acc.compositeTracks` / `acc.cues` for one step
  with a duration **plus the zero-length children placed before it** (the first span also takes
  leading ones; trailing ones go in a span of their own appended last).
- `export type SeqSteps = { readonly startSec: number; readonly steps: readonly StepSpan[] };`
  `Accum` gains `seqs: SeqSteps[]`; only a seq with `overlap` set records one.

Placement (the seq case): step k+1 (with a duration) starts at `end(step k) − overlap[k]`;
zero-length children go where the next step with a duration starts; the seq's duration is
`end(last step) − atSec`. Validation after placement:
- rule 1: entries finite and ≥ 0; an array's length equals the number of duration joins;
- rule 2: `overlap[k] ≤ dur(step k)` and `≤ dur(step k+1)`; `overlap[k−1] + overlap[k] ≤ dur(step k)`.

- [x] Tests (compileClip.test.ts, `describe('seq overlap')`), each from a concrete `start` pose:
  - `shifts each step start and shrinks the duration` — `seq([dollyTo(300, 4), spin('yaw', { by: 1, over: 4 })], { overlap: 1 })`
    → yaw segment `startSec === 3`, `durationSec === 7`.
  - `counts only steps with a duration` — `seq([dollyTo(300, 4), show(['label:body:planet']), spin('yaw', { by: 1, over: 4 }), hold(2)], { overlap: [1, 0.5] })`
    → cue `atSec === 3`, yaw `startSec === 3`, `durationSec === 8.5`.
  - `trailing zero-length steps fire at the seq end` — `seq([dollyTo(300, 4), spin(…4)], { overlap: 1 })` + trailing `show` → cue at 7.
  - `rate and osc shift with their step` — a `rate('distance', …)` in step 2 of an overlap-1 seq has
    `startSec === 3`; a windowed `oscillate` likewise.
  - throws: `/seq at 0s, join 1/` for `overlap: -1`, `NaN`, an array of the wrong length,
    `overlap: 5` against a 4 s step; `/seq at 0s, join 2/` for `overlap: [3, 3]` around a 4 s middle step.
  - `resolveClipFoci keeps overlap` (resolveClipFoci.test.ts): a resolved clip's seq still carries
    `overlap: [1, 2]`.
- [x] Run them → fail. Implement. Run → pass.
- [x] clip-primitives.md seq row: the new signature and one sentence pointing at "Blending a seq"
      (Task 7 writes that section).
- [x] Commit: "seq overlap: steps start before the previous one ends".

### Task 5: Cue order guard (rule 6)

**Files:** Create `src/services/engine/animation/validateSeqCueOrder.ts`; modify `compileClip.ts`
(call it after the walk); test `tests/services/engine/animation/validateSeqCueOrder.test.ts`.

**Interfaces:**
- `validateSeqCueOrder(seqs: readonly SeqSteps[], cues: readonly SceneCue[]): void` — `cues` in push
  (tree) order. For each join k of each seq: a cue pushed in spans `0..k` that fires strictly later
  than a cue pushed in spans `k+1..` throws when both set the same thing. Keys: `show`/`hide` → one
  key per arg, `JSON.stringify(arg)`; `scene` → `action.type`. `fade`, `focus`, `frameTo` carry no
  key (`computeSceneEntering` doesn't fold them). Message names the seq, the join and both cue kinds,
  and says the tour rebuilds scenes in written order.

- [x] Tests: `throws when an overlap fires a later show before an earlier hide of the same layer`
      (step 1 ends with `hide([x])` at its end, step 2 opens with `show([x])`, overlap 1 → throws
      `/seq at 0s, join 1/`); `passes when the keys differ`; `passes at equal times` (stable order);
      `ignores fade cues`.
- [x] Fail → implement → pass. Commit: "seq overlap: cue order must match written order".

### Task 6: Crossfade (rules 3, 4, composite, loop) — `review: yes`

**Files:**
- Create: `src/services/engine/animation/resolveSeqJoins.ts`, `src/utils/math/smootherstep.ts`,
  `src/services/engine/animation/buildFrameLegs.ts`, `src/services/engine/animation/legIndexAt.ts`,
  `src/@types/animation/compiledClip/FrameLeg.d.ts`
- Modify: `BaseSegment.d.ts` (`blendIn?`, doc: ordered by start, overlapping only as a blend pair),
  `CompiledClip.d.ts` (same doc line), `compileClip.ts` (call after `continuedFromComposite`),
  `validateSingleWriter.ts`, `evaluateClip.ts` (the generic walk; `frameLegsOf:524-547`,
  `legIndexAt:549-555`)
- Test: `tests/services/engine/animation/resolveSeqJoins.test.ts`,
  `tests/services/engine/animation/validateSingleWriter.test.ts`,
  `tests/services/engine/camera/clips/evaluateClip.test.ts`

**Interfaces:**
- `BaseSegment.blendIn?: { readonly startSec: number; readonly endSec: number }` — set on the
  incoming segment: `[in.startSec, out.endSec)`.
- `buildFrameLegs(baseTracks: Record<Channel, BaseSegment[]>): { readonly legs: readonly FrameLeg[]; readonly snapLegs: ReadonlyMap<BaseSegment, number> }`
  — the pure body of today's `frameLegsOf` (same filter, sort and snap rule), so the evaluator and
  rule 4 read ONE definition of where a frame leg opens. `frameLegsOf` keeps its cache and its
  `snapLeg` WeakMap, filled from `snapLegs`. `FrameLeg` moves to its own type file; `legIndexAt`
  moves to its own file. Extract with `npm run refactor` (see `.claude/skills/refactor/SKILL.md`),
  not by hand.
- `smootherstep(u: number): number` — `6u⁵ − 15u⁴ + 10u³`, `u` clamped to [0, 1].
- `resolveSeqJoins(baseSegs: readonly BaseSegment[], composites: readonly CompositeTrack[], seqs: readonly SeqSteps[], start: CameraPose): BaseSegment[]`
  — same indices in, same indices out.

Classification, per channel, per **consecutive pair** `(out, in)` of that channel's writers (its
base segments plus the composites declaring it, ordered by start): find the overlapping seq whose
*different* spans hold the two (at most one — the seq where their paths part); none ⇒ skip, today's
rules apply (a plain seq, an `all`). Messages name that seq and the join just before `in`'s span.
Then, by windows:
- a gap (`in.startSec > out.endSec`) → rest;
- otherwise a composite on either side → throw (D2); a `loop` spin on either side → throw (D4);
- `in.startSec < out.endSec` → crossfade: requires `out.startSec ≤ in.startSec`,
  `in.endSec ≥ out.endSec` and no third writer still live at `in.startSec` (rule 3), and no frame
  leg opening inside `(out.startSec, out.endSec)` (rule 4, via `buildFrameLegs`; this also catches
  an `in` of another frame; `fov` exempt); writes `blendIn`;
- equal → matched join (Task 7; until then: rest).
A zero-length snap step between two blended steps falls out of this: it is the `in` of a pair and
ends before `out`, so rule 3 throws.

`validateSingleWriter`: an overlap passes only when the later segment's `blendIn` equals
`[b.startSec, a.endSec)` and `a.endSec ≤ b.endSec`; a segment may never overlap the one two after it
(at most two writers live). Keep today's message for an unmarked overlap.

Evaluator: in the generic walk, while `seg` is active and the next segment has `blendIn` and
`t ≥ next.startSec`: `inFrom = next.from ?? segmentValueAt(seg, from, seg.endSec)`, return
`lerpChannel(channel, CHANNEL_SPACE[channel], segmentValueAt(seg, from, t), segmentValueAt(next, inFrom, t), smootherstep((t − blendIn.startSec) / (blendIn.endSec − blendIn.startSec)))`.
Once `seg` ends, the walk continues as today (the next segment starts from the planned end).

- [x] Tests (evaluateClip.test.ts, `describe('blending seq: crossfade')`, start distance 100,
      `seq([dollyTo(400, 4, 'linear'), dollyTo(200, 4, 'linear')], { overlap: 2 })`):
  - `value and velocity are continuous at both window ends` — at t = 2 and t = 4, one-sided
    differences (h = 1e-4) on ln(distance) agree within 1e-3, and the value matches the lone plan's.
  - `a reversal turns inside the window without overshoot` — 64 samples over [0, 6] all within
    [100, 400]; d ln D/dt > 0 at t = 1 and < 0 at t = 5.
  - `the incoming plan starts from the outgoing plan's end` — at t = 6, distance = 200; at t = 5,
    distance = `lerpInSpace('log', 400, 200, 0.75)`.
  - `a yaw crossfade across ±π never jumps` — yaw tweens to 3.0 then to −3.0 (short way through π),
    overlap 1: consecutive samples (dt = 0.01) differ by < 0.05.
  - `nested overlapping seqs classify their own joins` — inner overlap seq as step 1 of an outer one,
    both blending distance: compiles, each `in` has one `blendIn`, and the evaluation is continuous.
- [x] Tests (resolveSeqJoins.test.ts, through `compileClip`): throws `/seq at 0s, join 1/` for —
      a `flyPath` overlapping a `dollyTo` (composite); a zero-length `dollyTo(x, 0)` step between two
      dolly steps; a looping `spin` followed by a yaw tween; a crossfade whose incoming dolly ends
      before the outgoing one (`all` inside the step); a body-framed `set` crossfading into an
      absolute one. `channels on different steps run together` — dolly then yaw spin with overlap 1
      gets no `blendIn` anywhere.
- [x] Tests (validateSingleWriter.test.ts): `an overlap with a matching blendIn passes`;
      `a blendIn that does not match the overlap throws`; `three live writers throw`.
- [x] Fail → implement → pass; parity probe → zero. Commit: "Blending seq: crossfade where a
      channel's writers overlap".

### Task 7: Velocity-matched join + docs — `review: yes`

**Files:**
- Create: `src/utils/math/hermiteUnit.ts`, `src/services/engine/animation/easeEndSlopes.ts`
- Modify: `SegmentCurve.d.ts` (second arm), `segmentValueAt.ts` (`curveProgress`),
  `resolveSeqJoins.ts`, `docs/animation/clip-primitives.md` (single-writer paragraph ~118, a
  "Blending a seq" section under Timeline structure), `docs/BACKLOG.md` + a detail file (D8 tests)
- Test: `tests/services/engine/camera/clips/evaluateClip.test.ts`, `resolveSeqJoins.test.ts`,
  `tests/utils/math/hermiteUnit.test.ts`

**Interfaces:**
- `SegmentCurve` gains `| { readonly kind: 'hermite'; readonly m0: number; readonly m1: number }` —
  slopes of progress over normalised time (d progress / d u), relative to the segment's span, so
  they hold inside a frame leg.
- `hermiteUnit(m0: number, m1: number, u: number): number` — `h(0) = 0`, `h(1) = 1`, `h′(0) = m0`,
  `h′(1) = m1`, `u` clamped to [0, 1].
- `easeEndSlopes(ease: Ease): { readonly start: number; readonly end: number }` — one-sided
  difference of `EASE[ease]` at 0 and 1 (h = 1e-4).

Matched join (abutting pair in an overlapping seq): compile-time spans in each segment's own `space`
— spin `by`; yaw/roll tween the short arc; log space `ln to − ln from`; target `|to − from|` — with
`from` folded along the channel's track (`seg.from ?? segmentValueAt(prev, …, prev.endSec)`, else the clip
start: `start.roll ?? 0`, `start.fov ?? DEFAULT_FOV_Y_RAD`). Average speeds `s = span / dur`.
Join speed `v = 2·sOut·sIn / (sOut + sIn)` when both share a sign (target: `dot ≤ 0` ⇒ 0), else 0;
`m1(out) = v / sOut`, `m0(in) = v / sIn`; a zero or non-finite span gives slope 0. The other end of
each segment keeps `easeEndSlopes` of its ease, limited to `[0, √(9 − m_join²)]` (D6). A segment
matched at both ends takes both join slopes. Throw for different `space` (D5) and for a frame leg
opening inside `(prev.startSec, in.startSec]`, `prev` being the channel's writer before `out`
(absent ⇒ −∞), read through `buildFrameLegs`/`legIndexAt` (D3, rule 4; `fov` exempt).

- [x] Tests (evaluateClip.test.ts, `describe('blending seq: matched join')`, start distance 150):
  - `the join speed is the harmonic mean of the two average speeds` —
    `seq([dollyTo(300, 4), dollyTo(900, 4)], { overlap: 0 })`: d ln D/dt at t = 4 ± 1e-3 is
    0.2125 ± 1e-3 on both sides.
  - `a reversal stops at the join` — 150 → 300 → 150: |d ln D/dt| at t = 4 < 1e-3.
  - `the join is never faster than twice the slower average` — three pairs (ratios 1:1, 1:4, 1:20).
  - `an outer end keeps its ease's end speed` — `easeInOutCubic` outer start: speed at t = 0⁺ < 1e-3;
    `linear` outer start: speed = sOut ± 1e-3.
  - `a plain seq still rests at the join` — same steps, no option: speed at t = 4 < 1e-3.
  - `a target join matches speed and stops at a reversal` — `moveTarget` there and back: speed 0.
- [x] Tests (resolveSeqJoins.test.ts): throws `/join 1/` for `dollyTo(…, 'linear')` in `'log'`
      against a `tween('distance', { space: 'lin', … })`; for a body-framed tween starting between
      the channel's previous writer and the outgoing segment. `a 'live' start compiles` — a
      `start: 'live'` clip with a matched join on its first distance writer: no throw, finite
      `durationSec`.
- [x] Test (hermiteUnit.test.ts): end values and end slopes for (0, 0), (1, 1), (2, 0.5).
- [x] Docs: clip-primitives.md — the single-writer paragraph names the blend pair as its one
      exception; "Blending a seq": authoring, the three-row table, the crossfade and the matched join
      in a few lines each, the rules, the known limits (turn rates on a narrow lens; no blending
      across clip boundaries; target corners keep their direction change). BACKLOG line + detail
      file for the missing `validateCompositeExclusivity` / `channelValueAt` tests.
- [x] Fail → implement → pass; parity probe → zero. Commit: "Blending seq: velocity-matched joins
      where writers abut".

---

## Definition of Done

**Deliverables**
- `seq(children, { overlap })` with `overlap?: SeqOverlap` on the Effect's seq arm.
- `SegmentCurve` (`'ease' | 'hermite'`), `BaseSegment.curve`, `BaseSegment.blendIn?`.
- `segmentValueAt`, `lerpChannel`, `buildFrameLegs`, `legIndexAt`, `hasDuration`, `resolveSeqJoins`,
  `validateSeqCueOrder`, `easeEndSlopes`; `utils/math/smootherstep`, `utils/math/hermiteUnit`.
- One generic base walk in `evaluateClip.ts`; `channelValueAt` on `segmentValueAt`.
- clip-primitives.md: seq row, single-writer paragraph, "Blending a seq".

**Observable behaviours**
- Plain seq: unchanged (parity probe zero diff at HEAD).
- Crossfade: no velocity step at either window end; a reversal turns without overshoot.
- Matched join: 0.2125 /s at the 150 → 300 → 900 join; 0 at a reversal.
- Each rule throws with `seq at <s>s, join <n>`.

**Deferred (out of scope)**
- Beat 02's telephoto rebuild and its eye check (tour PR #1070, after this merges).
- Blending across clip boundaries; composite blends; blending inside `all`.
- The `validateCompositeExclusivity` / `channelValueAt` tests (backlogged in Task 7).
