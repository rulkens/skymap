# Inside-atmosphere rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [x]`) syntax for tracking.

> **WESL tasks (5, 10):** load the `wesl-shaders` skill (`.claude/skills/wesl-shaders/SKILL.md`)
> BEFORE touching any `.wesl` file. Linker gotchas that bite here specifically: an imported
> entry point's NAME does not survive inlining (every consumer declares its own `@vertex`/
> `@fragment` wrapper — already the shape `shell/vertex.wesl` follows and Task 5 extends);
> comments are single-quoted, never backticks; `package::` imports only.

**Goal:** Let the atmosphere shell keep rendering once the camera descends
inside it. Today the shell is a two-walled proxy sphere whose near wall
carries over-disc haze and far wall carries the limb/sky
(`shell/fragment.wesl:12–26`); once the camera crosses inside the top
sphere, the near wall's triangles sit behind the eye and stop rasterising,
so the sky vanishes discontinuously at the boundary instead of thickening
into a day-sky dome. The fix is a full-screen pass reusing the SAME LUTs,
uniforms, and two-pass multiply/add compositing through two new fragment
entry points, triggered by `hypot(camPosLocal) < 1`. Two smaller adjacent
fixes ride this branch: deleting an unwired `sunIrradiance` decoy field, and
hoisting a duplicated `camPosLocal`/`sunDirLocal` derivation.

**Architecture:** `AtmosphereUniforms` grows one `mat4` (`invMvp`, CPU-
inverted via `mat4d.inverse` in f64, narrowed at upload) so the new fragment
entry points can unproject a full-screen triangle's screen position back
into the shell's local frame and reconstruct a view ray — substituting for
the mesh-interpolated ray the outside path derives from `localPos`. Both
paths then hand off to the SAME shared sampling core (`sampleShellRay`,
extracted from today's `sampleShell`), so the LUT lookups, ground-occlusion
clamp, and ring-in-front logic never fork. The renderer grows two pipelines
over the SAME `shellPipelineLayout` (`depthCompare: 'always'`, no
`frag_depth`, no vertex buffers), and `draw()` grows an `inside: boolean`
discriminant selecting which pipeline pair runs — the existing MULTIPLY-
before-ADD ordering is unchanged either way. The layer computes the trigger
once per body (already has `camPosLocal` in scope) and threads it through.
Two prep commits (§5b's decoy deletion, §5a's hoist) land first so the
byte-offset table and the entry-point wiring change once each, not twice.

**Tech Stack:** TypeScript (Vite/Vitest), raw WebGPU + WGSL/WESL,
`wgpu-matrix` (`mat4d`) for the f64 compose-then-invert-then-narrow seam.

**Spec:**
[docs/superpowers/specs/2026-08-24-inside-atmosphere-rendering-design.md](../specs/2026-08-24-inside-atmosphere-rendering-design.md)
— authoritative for every ratified decision this plan does not re-derive
(§2's approach ruling, §4's design, §5's three adjacent-work items, §7's
landmines). This plan does not re-litigate any of it.

## Global Constraints

- **Suite stays green.** `npm test` (600+ files, 7200+ tests) passes after
  every task's commit. `npm run typecheck` (both tsconfigs) is the gate;
  `npm run typecheck:fast` (tsgo) is the inner loop only — a `:fast`-only
  failure is a tsgo bug, confirm against `tsc` before acting on it.
- **`testing.md` applies.** No constant/registry restatements, no mirror
  tests (never recompute an expected value with the same formula the source
  uses), no clamp-boundary tests unless `<` vs `<=` is observationally
  distinguishable at the boundary (the inside-shell threshold IS such a
  case — Task 7 tests it straddling, not at, the boundary). Byte-layout /
  WGSL-TS-parity tests are an explicit keep-rule; see Task 6's note on the
  one deliberate exception this plan takes (a source-level regex check,
  flagged there).
- **Comment budget.** Module header ≤ 10 lines, comment lines ≤ half the
  code lines in any file this plan touches or creates.
- **`type` aliases, never `interface`.** One exported symbol per file in
  `src/utils/` and `src/@types/`, filename matching the export.
- **WESL skill first, on every `.wesl` task.** See the banner above.
- **Perf-halt rule** (`feedback_code_is_liability`): `npm run perf`
  before/after any renderer/GPU-side change, measured against THIS
  worktree's own dev server (`--url http://localhost:<port>` from its
  `Local:` line — never another branch's server). A neutral-or-negative
  measurement halts the landing pipeline; land/park is the user's ruling,
  not process momentum.
- **Namesake collision — do not touch.** `EarthSurfaceParams.sunIrradiance`
  (`src/data/bodies/earthSurfaceParams.ts:80,87`, read by `pbr.wesl`) and
  `CloudShellUniforms`'s own `sunIrradiance` field (`sphere.wesl:~350–386`,
  packed by `packCloudShellUniforms`/`cloudShellLayer.ts:178`) are
  DIFFERENT, live fields that happen to share a name with the atmosphere
  shell's decoy. Task 1 touches ONLY `AtmosphereParams.sunIrradiance` /
  `packAtmosphereUniforms` / the `AtmosphereUniforms` WGSL struct
  (`sphere.wesl:392–454`) / `atmosphereShellLayer.ts` — a blind
  project-wide rename or grep-and-delete on the string `sunIrradiance`
  would corrupt Earth's surface lighting and the cloud deck.
- **Backlog edits already landed.** The spec commit
  (`9118df9f5 docs(spec): inside-atmosphere rendering design`) already
  deleted `docs/backlog/2026-08-20-inside-atmosphere-rendering.md`,
  `docs/backlog/2026-07-29-in-atmosphere-haze.md`,
  `docs/backlog/2026-08-18-atmosphere-sun-irradiance-named-pad.md`, their
  `docs/BACKLOG.md` index lines, and appended §5a's line to
  `docs/backlog/2026-08-20-hoist-solar-system-derivations.md`. No task
  below touches `docs/backlog/` or `docs/BACKLOG.md` — verify this is still
  true at Task 1 (`git log` the three deleted paths) before assuming it,
  since plan-authoring and plan-execution may be separated in time.

---

## Strategy

Tasks 1–2 are the two prep commits (§5b, §5a), each touching the same
`AtmosphereUniforms`/`AtmosphereDrawEntry` surface the feature grows next,
landing first so each surface changes once. Task 3 captures the perf
baseline before any renderer/GPU-side code changes. Tasks 4–7 build the
feature bottom-up (uniform layout → WESL → renderer pipelines → layer
trigger), each leaving the tree green and behaviourally inert until Task 7
flips the real trigger on. Task 8 re-measures perf against Task 3's
baseline. Task 9 is the human visual-gate checkpoint. Task 10 is §5c (cloud
deck from below), independent of Tasks 4–9's code but sequenced after so
its own visual QA can be judged against an already-working inside-shell sky.
Task 11 is the descent-fade tuning pass the spec's §7 landmine anticipates.
Task 12 is the closing verification gate.

## Definition of Done

- **Deliverable inventory:** `src/utils/camera/isInsideAtmosphereShell.ts`;
  `AtmosphereDrawEntry` grown with `camPosLocal`/`sunDirLocal`;
  `AtmosphereParams`/`packAtmosphereUniforms`/the WGSL `AtmosphereUniforms`
  struct with `sunIrradiance` deleted and `invMvp` added (176 bytes);
  `shell/vertex.wesl`'s `insideVs` and `shell/fragment.wesl`'s
  `sampleShellRay`/`fsInsideMultiply`/`fsInsideAdd`; two new pipelines +
  the `inside` arg on `AtmosphereShellRenderer.draw`; the inside/outside
  dispatch in `atmosphereShellLayer.draw`; `cloudShellRenderer`'s second
  (`cullMode: 'front'`) pipeline + `inside` arg on its `draw`, and the
  re-tuned `CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii`.
- **Named observable behaviours for the manual smoke pass (Tasks 9, 10, 11;
  dev server):** Earth day-side descent through the shell boundary thickens
  into a full sky dome with no pop/gap at the crossing; night-side descent
  keeps stars visible near the boundary and hides them once deep inside if
  sun-lit, restoring them past the terminator into shadow; bright day sky
  washes out stars/Milky Way/galaxies behind it in `hdr`, night side keeps
  them visible, the swap-chain label layer is untouched either way; Mars
  and Titan show correct hue and no crash/blank frame entering their
  shells; the cloud deck's overcast reads correctly from below at low
  altitude, neither vanishing early nor popping at the old ~238 km edge.
- **The deferral boundary:** the froxel aerial-perspective volume
  (arbitrary-occluder, per-pixel-depth haze), a bespoke sun-glare/bloom
  pass, non-Earth atmosphere tuning beyond a sanity check, any change to
  `atmosphereDrawList`'s cull rules or the LUT bake dimensions/cadence, and
  a real per-body solar-irradiance falloff are all out of scope (spec §6).

---

## Task 1: delete the `sunIrradiance` decoy pad (spec §5b)

**Files:**

- Modify: `src/@types/scene/AtmosphereParams.d.ts` (drop the `sunIrradiance`
  field, line 23), `src/data/bodies/atmosphereParams.ts` (drop the 9
  `sunIrradiance: 1.0,` rows at lines 57, 100, 143, 173, 216, 277, 321, 371,
  425, and the header's `sunIrradiance` sentence, lines 8–9), `src/utils/gpu/packAtmosphereUniforms.ts`,
  `src/services/gpu/shaders/lib/sphere.wesl` (`AtmosphereUniforms` struct
  ONLY — lines 392–454, not the other two structs in this file that also
  happen to declare a field named `sunIrradiance`), `src/services/engine/frame/passes/atmosphereShellLayer.ts`
  (drop the `params.sunIrradiance` argument at the `packAtmosphereUniforms`
  call, line 141, and the explanatory comment naming it, line 122),
  `src/@types/rendering/AtmosphereShellRenderer.d.ts` (line 123's doc
  mention).
- Test: `tests/utils/gpu/packAtmosphereUniforms.test.ts` (modify).

**Byte layout after this task (112 bytes / 28 f32 — unchanged total, since
the byte is structural vec3-tail padding, not content):**

```
f32 0..15  (byte   0..63):  mvp
f32 16..18 (byte  64..75):  sunDirLocal
f32 19     (byte  76..79):  bottomRadius
f32 20..22 (byte  80..91):  camPosLocal
f32 23     (byte  92..95):  _pad1 (was sunIrradiance — fills camPosLocal's vec3 tail)
f32 24     (byte  96..99):  exposure
f32 25     (byte 100..103): ringInnerRatio
f32 26     (byte 104..107): ringOuterRatio
f32 27     (byte 108..111): _pad0
```

**`packAtmosphereUniforms` signature after this task:**

```ts
export function packAtmosphereUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  bottomRadius: number,
  exposure: number,
  ringInnerRatio: number,
  ringOuterRatio: number,
): Float32Array;
```

- [x] Update `tests/utils/gpu/packAtmosphereUniforms.test.ts`: drop the
      `SUN_IRRADIANCE` sentinel and the corresponding call argument; change
      the `rec[23]` assertion from `.toBe(SUN_IRRADIANCE)` to `.toBe(0)`
      with a one-line comment ("the vec3 tail pad — was sunIrradiance,
      structural not content"); keep every other sentinel/assertion as-is.
      Run it — it should FAIL against the current 8-arg packer (confirms
      the test actually exercises the new signature before you change it).
- [x] Drop `sunIrradiance` from `AtmosphereParams` (type + all 9 rows) and
      the header sentence naming it.
- [x] Drop the `sunIrradiance` parameter from `packAtmosphereUniforms`;
      `out[23]` stays unwritten (implicitly 0, per `Float32Array`'s zero
      init).
- [x] Rename `sphere.wesl`'s `AtmosphereUniforms.sunIrradiance: f32` field
      (line 449) to `_pad1: f32`; update the struct's byte-layout comment
      block (lines 392–432) to match — the "two vec3 tails filled with REAL
      fields" framing (lines 412–415) now only names `bottomRadius`; the
      `sunIrradiance` offset line (427) becomes a plain pad note. Do NOT
      touch the two OTHER `sunIrradiance` fields elsewhere in this file
      (`EarthSurfaceUniforms`/`CloudShellUniforms` — see the Global
      Constraints namesake note).
- [x] Drop the `params.sunIrradiance` argument from
      `atmosphereShellLayer.ts`'s `packAtmosphereUniforms` call and its
      explaining comment line.
- [x] Update `AtmosphereShellRenderer.d.ts`'s `draw` doc comment (line 123)
      to drop "+ sunIrradiance" from the field list.
- [x] `npm test -- packAtmosphereUniforms atmosphereShellLayer
    atmosphereShellRenderer atmosphereParams` — green (note: no
      `atmosphereShellLayer.test.ts` exists yet at this point — the glob
      will just match nothing for that name, harmless).
- [x] `npm run typecheck` — clean.
- [x] Commit:

```
refactor(atmosphere): delete the unwired sunIrradiance decoy field

AtmosphereParams.sunIrradiance was packed into every body's uniform
buffer (all nine rows: 1.0) but no fragment ever reads u.sunIrradiance
— the shell reads exposure, bottomRadius, camPosLocal, and the ring
ratios. The byte itself is structural (vec3-tail alignment padding)
and stays; the field pretending to be a live dial does not. A real
per-body solar-irradiance falloff is future work, not this cleanup
(spec §5b).
```

---

## Task 2: hoist `camPosLocal`/`sunDirLocal` onto `AtmosphereDrawEntry` (spec §5a)

**Files:**

- Modify: `src/@types/engine/frame/AtmosphereDrawEntry.d.ts`,
  `src/services/engine/frame/atmosphereDrawList.ts`,
  `src/services/engine/frame/passes/atmosphereShellLayer.ts`,
  `src/services/engine/frame/encodeAtmosphereSkyView.ts`.
- Test: `tests/services/engine/frame/atmosphereDrawList.test.ts` (modify).

**`AtmosphereDrawEntry` grows two fields:**

```ts
export type AtmosphereDrawEntry = {
  readonly body: EarthBody | PlanetBody;
  readonly params: AtmosphereParams;
  readonly positionMpc: Vec3;
  readonly orientation: Mat3;
  /** Camera position in atmosphere-top-radius units, body-local frame —
   *  derived once here instead of independently by atmosphereShellLayer.draw
   *  and encodeAtmosphereSkyView (was two call sites, same five inputs). */
  readonly camPosLocal: Vec3;
  /** Sun direction in the body's local frame — same hoist rationale. */
  readonly sunDirLocal: Vec3;
};
```

**Where the derivation moves.** `atmosphereDrawList` already resolves
`bodyState.positionMpc`/`.orientation` per body (`atmosphereDrawList.ts:42`)
and already has `ctx.drawCamPos` in scope for the distance cull
(`:46–49`). It gains two calls per body, at both `entries.push(...)` sites
(the `distanceMpc === 0` branch, `:50–58`, and the normal branch, `:65–71`):

```ts
const atmosphereTopMpc = params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC;
const camLocal = camPosLocal(
  ctx.drawCamPos,
  bodyState.positionMpc,
  atmosphereTopMpc,
  bodyState.orientation,
);
const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
```

then both push sites add `camPosLocal: camLocal, sunDirLocal: sun` to the
entry object literal. New imports: `camPosLocal` from
`../../../utils/camera/camPosLocal`, `sunDirLocal` from
`../../../utils/camera/sunDirLocal`, `RENDER_ORIGIN_MPC` from
`../../../data/renderOrigin`.

**Consumers read the entry, stop deriving.** `atmosphereShellLayer.draw`'s
loop (`:91`) destructures `camPosLocal: camLocal, sunDirLocal: sun` off
each entry instead of calling the utils itself; delete its own
`camPosLocal(...)`/`sunDirLocal(...)` calls (`:105,113`) and the now-unused
`camPosLocal`/`sunDirLocal` imports (`:68–69` — `RENDER_ORIGIN_MPC` stays,
still used by `composeBodyMvp`). `encodeAtmosphereSkyView`'s loop (`:79`)
does the same: destructure `camPosLocal: camLocal, sunDirLocal: sun`,
delete its own `camPosMpc`/`camLocal`/`sun` derivation (`:86–96`) and the
now-unused `camPosLocal`/`sunDirLocal`/`RENDER_ORIGIN_MPC`/`SCALE_UNITS`
imports (verify `SCALE_UNITS` has no other use in this file before dropping
it — it does not, per the current read).

**Note on cost, not just correctness.** `atmosphereDrawList` is called
three times per frame (`enabled`, `draw`, `encodeAtmosphereSkyView` —
`grep -rn "atmosphereDrawList(" src/`), so this hoist does not reduce the
number of `camPosLocal`/`sunDirLocal` calls per body per frame (it was 2,
becomes up to 3, since `enabled`'s call now also builds — and discards —
the pair). That's fine: the win is single-source-of-truth (spec §5a), and
the extra vector math is immaterial next to the GPU draws it gates. Do not
"fix" this by memoizing `atmosphereDrawList` itself — that is a different,
unrequested change (the backlog item `docs/backlog/2026-08-20-hoist-solar-system-derivations.md`
names it as separate, longer-tail work).

- [x] Add the test `atmosphereDrawList derives camPosLocal/sunDirLocal once
  per body, not per consumer` to `atmosphereDrawList.test.ts`: `vi.mock`
      `src/utils/camera/camPosLocal` and `src/utils/camera/sunDirLocal` (a
      SECOND `vi.mock` block alongside the existing `sceneBodyStates` mock —
      file-scoped, does not affect other test files), asserting each is
      called exactly once for the one qualifying body in
      `atmosphereDrawList(makeState({}), makeCtx(camRadiiOut(SEEDED_EARTH,
  5)))`, and that `list[0]!.camPosLocal`/`.sunDirLocal` are the mocks'
      return values (`toBe`, referential — the mocks return fixed arrays).
      This is a wiring/call-count assertion, not a mirror: it does not
      recompute the real formula.
- [x] Grow `AtmosphereDrawEntry`, wire the two derivations into
      `atmosphereDrawList`'s both push sites.
- [x] Rewire `atmosphereShellLayer.draw` to consume the entry's fields;
      delete its own derivation + now-unused imports.
- [x] Rewire `encodeAtmosphereSkyView` to consume the entry's fields;
      delete its own derivation + now-unused imports.
- [x] `npm test -- atmosphereDrawList atmosphereShellLayer
    encodeAtmosphereSkyView` — green. `encodeAtmosphereSkyView.test.ts`
      needs NO edits (it asserts observable packed-uniform values, which
      are bit-identical before/after this pure refactor).
- [x] `npm run typecheck` — clean.
- [x] Commit:

```
refactor(atmosphere): hoist camPosLocal/sunDirLocal onto AtmosphereDrawEntry

atmosphereShellLayer.draw and encodeAtmosphereSkyView each
independently re-derived the same camPosLocal/sunDirLocal pair from
the same five inputs (view.slab.vp or ctx.drawCamPos, positionMpc,
RENDER_ORIGIN_MPC, atmosphereTopMpc, orientation). Both now read the
memoised pair off the shared AtmosphereDrawEntry atmosphereDrawList
already resolves per body, so bake and draw can never disagree on
WHERE the atmosphere is, not just WHICH bodies have one. Pure
refactor — the mock call-count test pins one derivation, not two.

Closes the atmosphere-pair half of
docs/backlog/2026-08-20-hoist-solar-system-derivations.md (spec §5a);
that item's other four derivations are untouched and stay open.
```

---

## Task 3: perf baseline capture (not a code task)

Load the `perf` skill (`.claude/skills/perf/SKILL.md`) before running
anything. Confirm the dev server is running in THIS worktree and get its
port from the `Local:` line.

- [x] `npm run perf -- --url http://localhost:<this worktree's port>` —
      run against the tree as it stands after Task 2 (no renderer/GPU code
      has changed yet). Record MERGED/PER-LAYER/FLOOR numbers (in this
      plan file's Task 8 section, or the SDD ledger) per the skill's
      interpretation guidance — this is the baseline Task 8 compares
      against.
- [x] No commit (measurement only). If a commit is wanted to anchor the
      baseline in history, a doc-only note is acceptable but not required.

---

## Task 4: `packAtmosphereUniforms` grows `invMvp` (spec §3)

**Files:**

- Modify: `src/services/gpu/shaders/lib/sphere.wesl` (`AtmosphereUniforms`
  struct, lines 392–454, post-Task-1), `src/utils/gpu/packAtmosphereUniforms.ts`,
  `src/services/engine/frame/passes/atmosphereShellLayer.ts`.
- Test: `tests/utils/gpu/packAtmosphereUniforms.test.ts` (modify), NEW
  `tests/services/engine/frame/passes/atmosphereShellLayer.test.ts`.

**Byte layout after this task (176 bytes / 44 f32):**

```
f32 0..15  (byte   0..63):  mvp
f32 16..18 (byte  64..75):  sunDirLocal
f32 19     (byte  76..79):  bottomRadius
f32 20..22 (byte  80..91):  camPosLocal
f32 23     (byte  92..95):  _pad1
f32 24     (byte  96..99):  exposure
f32 25     (byte 100..103): ringInnerRatio
f32 26     (byte 104..107): ringOuterRatio
f32 27     (byte 108..111): _pad0
f32 28..43 (byte 112..175): invMvp (mat4x4<f32>, column-major, 16-byte
                             aligned at 112 — no additional padding needed
                             before or after; 176 is already a multiple of 16)
```

`invMvp` is read only by the inside fragment entry points (Task 5) but
packed for every body regardless (spec §3: one struct, one packer, no
inside-only second buffer).

**`packAtmosphereUniforms` signature:**

```ts
export function packAtmosphereUniforms(
  mvp: Float32Array,
  invMvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  bottomRadius: number,
  exposure: number,
  ringInnerRatio: number,
  ringOuterRatio: number,
): Float32Array;
export const ATMOSPHERE_UNIFORM_FLOATS = 44;
```

**Call-site landmine (spec §7): `mat4d` inverse is f64, dst-last, computed
from the UN-narrowed `mvp`.** `composeBodyMvp` returns `Float64Array`
(`composeBodyMvp.ts:169`); narrowing it to f32 BEFORE inverting reintroduces
per-element rounding the way the same file's header already warns against
for a different consumer. Mirror `labelLeaderLine.ts:128`'s
`mat4d.inverse(m)` usage (single positional arg, returns a fresh
`Float64Array` — dst-last convention, no dst array to pre-allocate here).
In `atmosphereShellLayer.ts`, right after `const mvp = composeBodyMvp(...)`:

```ts
const invMvp = mat4d.inverse(mvp);
// ... later, at the packAtmosphereUniforms call:
narrowMat4(mvp),
narrowMat4(invMvp),
```

(new import: `import { mat4d } from 'wgpu-matrix';`)

- [x] Add the test `packs a 176-byte / 44-f32 record with invMvp at
  offset 112` to `packAtmosphereUniforms.test.ts`: extend the existing
      sentinel style (a second 16-value recognisable array, e.g. `17..32`,
      distinct from `MVP`'s `1..16` so a swap is caught), assert
      `rec.length === 44`, `rec.byteLength === 176`, and `rec[28..43]`
      equal the `invMvp` sentinel verbatim, alongside re-asserting every
      existing offset 0–27 is unchanged. Run it — FAILS against the
      current 7-arg packer.
- [x] Add `invMvp: mat4x4<f32>` to `sphere.wesl`'s `AtmosphereUniforms`
      struct (after `_pad0`) and update the byte-layout comment block
      (lines 392–432) to the table above; the "CPU side uploads 28 f32s"
      line (440) becomes 44.
- [x] Grow `packAtmosphereUniforms`'s signature + `ATMOSPHERE_UNIFORM_FLOATS`;
      add `out.set(invMvp.subarray(0, 16), 28);`.
- [x] Add the `mat4d.inverse` call + `narrowMat4(invMvp)` at
      `atmosphereShellLayer.ts`'s call site, per the sketch above.
- [x] Create `tests/services/engine/frame/passes/atmosphereShellLayer.test.ts`
      with ONE describe block, `'invMvp inversion sanity (mat4d.inverse
  dst-last / f64 contract)'` — pure math, no GPU/state/ctx mocking needed.
      Hand-pick an `mvp` whose inverse is analytically obvious (e.g. a pure
      uniform scale-then-translate: `mat4d.multiply(mat4d.translation([5,0,0]),
  mat4d.scaling([2,2,2]))`, whose inverse is
      `mat4d.multiply(mat4d.scaling([0.5,0.5,0.5]), mat4d.translation([-5,0,0]))`
      up to composition order — work out the exact expected matrix by hand,
      do not call `mat4d.inverse` to build the "expected" side of the
      assertion, or this becomes a mirror test per `testing.md`). Invert via
      `mat4d.inverse`, narrow via `narrowMat4`, unproject a chosen
      clip-space point `[cx, cy, cz, 1]` through the narrowed f32 matrix
      with a plain 4×4 matrix-vector multiply (hand-rolled in the test, no
      new source helper — this is a one-off verification, not a reusable
      util), divide by `w`, and assert the result matches a value computed
      by hand from the known transform. This is the regression lock named
      in spec §9: "catching a dst-last/f64-wrapper mistake before it
      reaches the GPU."
- [x] `npm test -- packAtmosphereUniforms atmosphereShellLayer` — green.
- [x] `npm run typecheck` — clean.
- [x] Commit:

```
feat(atmosphere): grow AtmosphereUniforms with invMvp (112 -> 176 bytes)

The upcoming inside-shell full-screen pass needs to unproject a
screen position back into the shell's local frame to reconstruct a
view ray, substituting for the mesh-interpolated localPos the
outside path uses. invMvp is computed CPU-side from the same f64 mvp
composeBodyMvp already returns (mat4d.inverse, dst-last, narrowed at
the upload boundary like mvp itself) and packed for every body
regardless of inside/outside — one struct, one packer, no separate
inside-only buffer (spec §3).

Prep for docs/superpowers/specs/2026-08-24-inside-atmosphere-rendering-design.md
§4.2 — the WESL entry points that read this field land next.
```

---

## Task 5: WESL — inside vertex stage + `fsInsideMultiply`/`fsInsideAdd` (spec §4.2)

**Load the `wesl-shaders` skill before starting.**

**Files:**

- Modify: `src/services/gpu/shaders/atmosphere/shell/vertex.wesl`,
  `src/services/gpu/shaders/atmosphere/shell/fragment.wesl`.

No TS changes in this task — the new entry points are unused dead code
until Task 6 builds pipelines against them. Behaviourally inert, safe as
its own commit.

**Vertex: `insideVs`, a two-line wrapper per the house pattern (spec §4.2,
mirroring `bloom/bright.wesl:19-20`'s `fullscreenVertex` wrapper):**

```wesl
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@vertex
fn insideVs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}
```

Add this alongside the existing `vs` in `shell/vertex.wesl` (do not touch
`vs` itself). `FullscreenOut` carries `@builtin(position) pos` and
`@location(0) uv: vec2<f32>` (`fullscreenTri.wesl:23-26`) — no vertex
buffer, no attributes; Task 6's pipeline for this stage declares no
`buffers` entry.

**Fragment: extract the shared core, add the two inside entry points.**
Today's `sampleShell(in: FsIn) -> ShellSample` (`fragment.wesl:134-268`)
does three things in one function: derives `dir` from the interpolated
`localPos`, runs the shared ray-march/LUT/ring logic, and applies the
`front_facing` wall-duty discard. Split it:

```wesl
// Shared core: everything sampleShell does EXCEPT deriving `dir` and the
// front_facing wall-duty split. `ro` is always u.camPosLocal (unchanged).
// Grows one field on ShellSample: intersectsGround, so callers can run
// their OWN wall-duty test against it (the outside path needs it; the
// inside path does not — spec §4.2, "no wall split from inside").
fn sampleShellRay(dir: vec3<f32>) -> ShellSample { ... }

// Outside path (proxy mesh) — UNCHANGED behaviour: derives dir from
// localPos, delegates to sampleShellRay, then applies the existing
// front_facing discard using the returned intersectsGround.
fn sampleShell(in: FsIn) -> ShellSample { ... }
```

`ShellSample` gains `intersectsGround: bool` (default `false` in the
off-shell early return, matching the other fields' identity-value
convention). `fsMultiply`/`fsAdd` are UNCHANGED — they still call
`sampleShell(in)`.

The two new entry points unproject the fullscreen triangle's screen
position through `u.invMvp`, then call `sampleShellRay` directly (no wall
split, no `FsIn.frontFacing` — there is no "wrong wall" for a full-screen
pass, per spec §4.2):

```wesl
@fragment
fn fsInsideMultiply(in: FullscreenOut) -> @location(0) vec4<f32> {
  let dir = insideRayDir(in.uv);
  let s = sampleShellRay(dir);
  if (!s.hit) { discard; }
  return vec4<f32>(s.transmit, 1.0 - s.coverage);
}

@fragment
fn fsInsideAdd(in: FullscreenOut) -> @location(0) vec4<f32> {
  let dir = insideRayDir(in.uv);
  let s = sampleShellRay(dir);
  if (!s.hit) { discard; }
  return vec4<f32>(s.emission, s.coverage);
}
```

`insideRayDir(uv: vec2<f32>) -> vec3<f32>` is the unprojection helper
(local to this file, not exported — nothing outside this shader needs it):
recover clip-space xy from `uv` by inverting `fullscreenVertex`'s own
mapping (`uv = ((xy+1)*0.5, (1-xy)*0.5)`, so `xy = (uv.x*2-1, 1-uv.y*2)`),
unproject `vec4<f32>(xy, 0.0, 1.0)` through `u.invMvp`, divide by `w`,
subtract `u.camPosLocal`, and **renormalize** (the house trap named in spec
§7 — the proxy's model transform is non-uniformly scaled, same reason
`sampleShell`'s existing `dir` derivation renormalizes at
`fragment.wesl:148`). Any NDC z works for the unprojected point — the ray
direction from `camPosLocal` through ANY point on the same camera ray is
proportional regardless of which z was chosen; `0.0` is arbitrary and
documented as such with a one-line comment (this is not obvious on
first read and is worth the line — do not let it exceed the file's
comment budget).

**Landmines from spec §7, both entry points:**

- **Renormalize after unproject** — see above.
- **No `frag_depth`.** Both new entry points return `@location(0)
vec4<f32>` only, matching `fsMultiply`/`fsAdd`'s existing shape — do not
  add `@builtin(frag_depth)` (that disables early-Z for the pipeline, a
  cost spec §4.4 rules against paying here).
- **Shared discard predicate.** Both `fsInsideMultiply` and
  `fsInsideAdd` call `sampleShellRay` and branch on the SAME `!s.hit` — this
  is now structurally guaranteed (one function, one hit predicate) rather
  than merely conventional, closing off the exact drift class §7 warns
  about ("a future edit that forks the two passes' hit tests would
  double-count or drop pixels").

- [x] Extract `sampleShellRay` from `sampleShell`; add `intersectsGround`
      to `ShellSample`; rewrite `sampleShell` as the thin outside-path
      wrapper. Confirm (read, do not just assume) that `fsMultiply`/`fsAdd`
      need zero edits — they still call `sampleShell(in)` with the same
      signature.
- [x] Add `insideVs` to `shell/vertex.wesl`.
- [x] Add `insideRayDir`, `fsInsideMultiply`, `fsInsideAdd` to
      `shell/fragment.wesl`.
- [x] `npm run typecheck` — clean (WESL changes alone do not typically
      break `tsc`, but the `?static` import machinery can surface a linker
      error at build time — also run `npm run build` or at minimum confirm
      `npm run dev`'s console has no shader-compile error for the
      atmosphere shell, since this task has no automated test coverage of
      its own — Task 6's pipeline-descriptor tests are the first automated
      check that these entry points parse and link).
- [x] Commit:

```
feat(atmosphere): add inside-shell fragment entry points (WESL only)

fsInsideMultiply/fsInsideAdd reconstruct a view ray by unprojecting
the full-screen triangle's screen position through the new invMvp
uniform, then hand off to sampleShellRay — the shared core extracted
from today's sampleShell, now taking `dir` as a parameter instead of
deriving it from the proxy mesh's interpolated localPos. No wall
split from inside: a full-screen pass has no "wrong wall" (spec
§4.2). Dead code until the next commit builds pipelines against it —
fsMultiply/fsAdd and the outside path are untouched.
```

---

## Task 6: renderer — two inside pipelines, `draw()` gains `inside` (spec §3, §4.4)

**Files:**

- Modify: `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`,
  `src/@types/rendering/AtmosphereShellRenderer.d.ts`,
  `src/services/engine/frame/passes/atmosphereShellLayer.ts` (placeholder
  wiring only — see below).
- Test: `tests/services/gpu/renderers/atmosphere/atmosphereShellRenderer.test.ts`
  (modify).

**No new shader modules.** `shellVsModule`/`shellFsModule`
(`atmosphereShellRenderer.ts:162-171`) already load the full linked WESL
source, which now contains `insideVs`/`fsInsideMultiply`/`fsInsideAdd`
(Task 5) — reuse the same two module handles, only the `entryPoint` string
and pipeline state differ.

**New vertex/primitive/depth state (sibling to `shellVertexState`
`:296-305`, `shellPrimitiveState` `:306-315`, `shellDepthState` `:316-323`):**

```ts
const insideVertexState: GPUVertexState = { module: shellVsModule, entryPoint: 'insideVs' }; // no `buffers` — no per-vertex attributes
const insidePrimitiveState: GPUPrimitiveState = { topology: 'triangle-list' };
const insideDepthState: GPUDepthStencilState = {
  format: depthFormat,
  depthWriteEnabled: false,
  depthCompare: 'always', // spec §4.4 — no scene-depth test needed from inside; NOT routed through resolveDepthCompare (that helper has no 'always' intent and this choice is convention-independent)
};
```

**A second pipeline factory (sibling to `createShellPipeline`
`:325-338`), SAME `layout: shellPipelineLayout`:**

```ts
function createInsideShellPipeline(
  label: string,
  entryPoint: string,
  blend: GPUBlendState,
): GPURenderPipeline {
  return device.createRenderPipeline({
    label,
    layout: shellPipelineLayout,
    vertex: insideVertexState,
    fragment: { module: shellFsModule, entryPoint, targets: [{ format: targetFormat, blend }] },
    primitive: insidePrimitiveState,
    depthStencil: insideDepthState,
  });
}

const shellInsideMultiplyPipeline = createInsideShellPipeline(
  'atmosphere-shell-inside-multiply-pipeline',
  'fsInsideMultiply' /* SAME blend object shellMultiplyPipeline uses, :349-353 */,
);
const shellInsideAddPipeline = createInsideShellPipeline(
  'atmosphere-shell-inside-add-pipeline',
  'fsInsideAdd' /* SAME blend object shellAddPipeline uses, :360-361 */,
);
```

**`draw()` grows `inside: boolean` (`atmosphereShellRenderer.ts:604-621`).
The bind-group write and MULTIPLY-before-ADD ordering are unchanged; only
which pipeline pair (and whether vertex/index buffers are bound) differs:**

```ts
function draw(
  pass: GPURenderPassEncoder,
  bodyId: string,
  uniforms: Float32Array,
  inside: boolean,
): void {
  const bundle = bundleFor(bodyId);
  device.queue.writeBuffer(bundle.shellUniformBuffer, 0, uniforms);
  pass.setBindGroup(0, bundle.shellBindGroup);
  if (inside) {
    pass.setPipeline(shellInsideMultiplyPipeline);
    pass.draw(3);
    pass.setPipeline(shellInsideAddPipeline);
    pass.draw(3);
    return;
  }
  pass.setVertexBuffer(0, positionBuffer);
  pass.setIndexBuffer(indexBuffer, 'uint16');
  pass.setPipeline(shellMultiplyPipeline);
  pass.drawIndexed(indexCount);
  pass.setPipeline(shellAddPipeline);
  pass.drawIndexed(indexCount);
}
```

`AtmosphereShellRenderer.d.ts`'s `draw` doc gains a paragraph on the
`inside` argument and the 176-byte record size.

**Sequencing landmine — keep the tree green.** After this task,
`AtmosphereShellRenderer.draw` REQUIRES a 4th argument, but the trigger
that computes it doesn't exist until Task 7. Update
`atmosphereShellLayer.ts`'s ONE call site to pass a hardcoded `false`
— a deliberate, explicitly-flagged placeholder Task 7 replaces with
`isInsideAtmosphereShell(camLocal)`. This keeps the two new pipelines dead
code for one more commit while keeping typecheck AND behaviour green.

**Pipeline-descriptor tests, extending the existing harness (spec §9):**

- [x] `'shares shellPipelineLayout across all four shell pipelines'` —
      assert `insideMultiply.layout`, `insideAdd.layout` both `toBe` the
      same reference as `multiply.layout`/`add.layout`.
- [x] `'gives fsInsideMultiply the multiply blend and fsInsideAdd the add
  blend, matching the outside pair'` — reuse `blendRole` (or extend it)
      to assert `blendRole(insideMultiply) === 'multiply'`,
      `blendRole(insideAdd) === 'add'`.
- [x] `'gives both inside pipelines the always-compare, no-depth-write
  profile'` — assert `insideMultiply.depthStencil` `toEqual`
      `{ format: depthFormat, depthWriteEnabled: false, depthCompare:
  'always' }` (and `insideAdd.depthStencil` `toEqual` the same object).
- [x] `'draws the inside geometry twice, MULTIPLY before ADD, with no
  vertex/index buffer bound'` — extend the existing pass mock (add a
      `draw: vi.fn(() => order.push('draw'))` stub alongside the existing
      `drawIndexed`) and call `renderer.draw(pass, 'earth',
  new Float32Array(ATMOSPHERE_UNIFORM_FLOATS), true)`; assert
      `order` is `['multiply', 'draw', 'add', 'draw']` (reusing
      `blendRole`/`descOf`) and that `setVertexBuffer`/`setIndexBuffer`
      were NOT called.
- [x] Update the existing `'draws the geometry twice, MULTIPLY before
  ADD'` test's call to pass `false` explicitly as the 4th arg (was a
      3-arg call) — confirms the outside path is unaffected by the new
      branch.
- [x] **One deliberate exception to the source-text-grep ban, flagged.**
      `testing.md` bans "asserting a function is called by grepping for
      its name in the file text." Spec §9 explicitly asks for a
      source-level check that `fsInsideMultiply`/`fsInsideAdd` "discard
      from the same predicate." Task 5's `sampleShellRay` extraction makes
      this true BY CONSTRUCTION (one function, one `!s.hit` check, both
      entry points call it) — that structural guarantee is the real
      protection, not a test. Add ONE small regex test anyway, mirroring
      the file's EXISTING kept precedent (`'names entry points the linked
  WESL modules actually declare'`, `:101-112`, which already regexes the
      joined shader source for a different but structurally analogous
      cross-file contract): assert `shaderCode.join('\n')` contains
      `sampleShellRay(` inside both `fsInsideMultiply` and `fsInsideAdd`'s
      bodies. Carry a one-line comment naming its real failure mode — it
      fails if a future edit forks one entry point onto its own inline hit
      test instead of the shared function — so a later `testing.md` sweep
      does not bin it as a bare rename-detector.
- [x] `npm test -- atmosphereShellRenderer atmosphereShellLayer` — green.
- [x] `npm run typecheck` — clean.
- [x] Commit:

```
feat(atmosphere): two inside-shell pipelines, draw() gains inside arg

Two new pipelines over the SAME shellPipelineLayout (spec §3): a
full-screen triangle vertex stage, always-compare/no-depth-write
depth state, and the fsInsideMultiply/fsInsideAdd entry points Task
5 added — sharing bind groups and LUT bundles with the outside pair.
draw() now takes an inside: boolean discriminant selecting which
pipeline pair runs; the existing write-then-draw and
MULTIPLY-before-ADD ordering are unchanged in both branches.

atmosphereShellLayer passes a hardcoded `false` for now — the two
new pipelines are still dead code until the next commit computes the
real trigger. Kept the tree green rather than landing renderer and
trigger as one oversized commit.
```

---

## Task 7: layer trigger — `hypot(camPosLocal) < 1` (spec §4.1, §4.6)

**Files:**

- Create: `src/utils/camera/isInsideAtmosphereShell.ts`.
- Test: `tests/utils/camera/isInsideAtmosphereShell.test.ts` (new).
- Modify: `src/services/engine/frame/passes/atmosphereShellLayer.ts`
  (replace Task 6's `false` placeholder), `tests/services/engine/frame/atmosphereDrawList.test.ts`
  (extend), `tests/services/engine/frame/passes/atmosphereShellLayer.test.ts`
  (extend, from Task 4).

**Why a new util, not an inline comparison.** The spec's §4.1 describes the
trigger as a one-comparison inline check, but the house convention (one
pure symbol per file in `src/utils/`) plus the need to unit-test the
straddling-boundary property (spec §9) without standing up GPU/pass mocks
argues for extracting it — a judgment call flagged here, not mandated
verbatim by the spec.

```ts
// src/utils/camera/isInsideAtmosphereShell.ts
export function isInsideAtmosphereShell(camPosLocal: Readonly<Vec3>): boolean;
// true iff hypot(camPosLocal) < 1 — the camera is inside the atmosphere-top
// unit sphere, in the shell's own local (atmosphere-top-radius) frame.
```

**Wiring (`atmosphereShellLayer.ts`, replacing Task 6's `false`):**

```ts
const inside = isInsideAtmosphereShell(camLocal); // camLocal = entry.camPosLocal, per Task 2
renderer.draw(pass, body.id, packAtmosphereUniforms(...), inside);
```

- [x] Add the test `isInsideAtmosphereShell classifies values straddling
  the unit-sphere boundary` to a new
      `tests/utils/camera/isInsideAtmosphereShell.test.ts`: assert `true`
      for a vector of length `0.999` and `false` for length `1.001` (e.g.
      `[0.999, 0, 0]` / `[1.001, 0, 0]`) — per `testing.md`, this is a
      genuine classifier boundary (`<` vs `<=` would reclassify a camera
      sitting EXACTLY on the shell, an observationally real difference),
      tested straddling the value, not restating the constant `1` itself.
- [x] Implement `isInsideAtmosphereShell`.
- [x] Add the test `atmosphereDrawList includes Earth when the camera is
  deep inside the atmosphere shell` to `atmosphereDrawList.test.ts`,
      using the existing `camRadiiOut` helper at a radius well under 1
      (e.g. `camRadiiOut(SEEDED_EARTH, 0.5)`) — asserts `list` still has
      length 1 and `list[0]!.body === SEEDED_EARTH`, the explicit
      regression lock spec §4.6 calls for ("this should be verified as an
      explicit test property, not assumed").
- [x] Extend `atmosphereShellLayer.test.ts` (from Task 4) with a
      `describe('draw — inside/outside dispatch')` block: mock
      `state.gpu.atmosphereShellRenderer.draw` as a spy, drive `draw` with
      a fixture camera well inside the shell and a fixture well outside
      it, and assert the spy's 4th call argument is `true`/`false`
      respectively.
- [x] Wire the real trigger into `atmosphereShellLayer.ts`, replacing
      Task 6's hardcoded `false`.
- [x] `npm test -- isInsideAtmosphereShell atmosphereDrawList
    atmosphereShellLayer` — green.
- [x] `npm run typecheck` — clean.
- [x] Commit:

```
feat(atmosphere): trigger the inside-shell pass on hypot(camPosLocal) < 1

atmosphereShellLayer.draw now switches between the outside proxy-mesh
pipelines and the inside full-screen pipelines per body, based on
whether the camera sits inside the atmosphere-top unit sphere in
that body's local frame — camPosLocal is already computed once per
body per frame (Task 2's hoist), so this is one comparison at an
existing call site, no new per-frame derivation (spec §4.1).
atmosphereDrawList's sub-pixel cull is verified, not assumed, to
still include a body the camera sits deep inside (spec §4.6).
```

---

## Task 8: perf checkpoint — post-feature (spec §9)

Not a code task beyond whatever this surfaces needing a fix.

- [x] `npm run perf -- --url http://localhost:<this worktree's port>` —
      run against the tree as it stands after Task 7. Compare MERGED/
      PER-LAYER/FLOOR numbers against Task 3's baseline.
- [x] **Land/park is the user's ruling.** A neutral-or-negative
      measurement halts the pipeline here (`feedback_code_is_liability`) —
      report the numbers, do not argue past a bad result on process
      momentum. If parked, stop here; Tasks 9–12 do not proceed until this
      is resolved.
- [x] If landed: no separate commit — record the numbers in the SDD ledger
      or this plan file.

---

## Task 9: visual gate checkpoint — HUMAN, not a subagent task (spec §9)

**Not a code task.** Requires the user's own eyes at the dev server. Do
not commit anything as part of this task.

- [x] Fly Earth's camera down through the atmosphere shell boundary on the
      DAY side. Confirm: the haze thickens into a full sky dome with no
      pop or gap at the crossing (spec §4.5 — the trigger is a hard
      switch, but both sides evaluate the identical `sampleShellRay`
      integral against the identical LUTs, so the crossing should be
      seamless by construction).
- [x] Same descent on the NIGHT side. Confirm: stars visible near the
      boundary, hidden once deep inside if sun-lit, visible again once
      past the terminator into shadow.
- [x] Confirm star/Milky Way/galaxy washout under bright day sky (the
      compositor-alpha mechanism, spec §4.3) — and confirm the swap-chain
      label layer is UNAFFECTED (drawn after the `foreground:0 -> hdr`
      composite, never washed out).
- [x] Fly into Mars's and Titan's atmosphere shells — sanity pass only
      (correct hue, no crash, no blank frame), not a tuning pass (spec
      §6).
- [x] **Ruling recorded, not assumed.** If any of the above reads wrong,
      stop here — do not proceed to Task 10 on an un-landed Task 4–7
      feature.

---

## Task 10: §5c — fix the cloud deck's interior vanishing (spec §5c)

**Files:**

- Modify: `src/services/gpu/renderers/bodies/cloudShellRenderer.ts`,
  `src/@types/rendering/CloudShellRenderer.d.ts`,
  `src/services/engine/frame/passes/cloudShellLayer.ts`,
  `src/data/bodies/cloudShellParams.ts` (`fadeEndAltitudeRadii` re-tune).
- Test: `tests/services/engine/frame/passes/cloudShellLayer.test.ts`
  (modify), NEW `tests/services/gpu/renderers/bodies/cloudShellRenderer.test.ts`.

**The coupling, restated from the spec (§5c) — both halves are needed for
anything to be visible:** the cloud shell is a CLOSED sphere drawn
`cullMode: 'back'` (`cloudShellRenderer.ts:251`) — every triangle culls
once the camera is inside it, with no `front_facing` fallback (unlike the
atmosphere shell before this branch). Fixing the cull alone changes
nothing visible: `cloudDeckFade` already fades the deck to 0 by
`CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii` (0.037 Earth radii, ≈238 km),
which also happens to mask the vanish bug, for an unrelated reason (a
tile-LOD crossover tuning). Land both in one commit.

**The fix — recommended shape, not mandated verbatim (spec leaves the
choice open between this and a two-wall duty split; this plan recommends
mirroring Tasks 6/7's already-solved shape, since it is the SAME class of
bug the atmosphere shell had):** a second pipeline with `cullMode: 'front'`
(inside), sharing everything else with the existing `cullMode: 'back'`
pipeline (outside), selected by a new `inside: boolean` argument on
`draw()` — the exact same discriminant shape Task 6 built. `cloudShellDraw`
(`cloudShellLayer.ts:88-121`) already computes `distanceMpc` and
`bodyRadiusMpc` (Earth's SURFACE radius — a DIFFERENT unit convention from
`isInsideAtmosphereShell`'s atmosphere-top-radius test; do not reuse that
util here) at one call site — add a third field to its return type:

```ts
type CloudShellDraw = {
  readonly earth: EarthBody;
  readonly deckFade: number;
  readonly insideShell: boolean; // distanceMpc / bodyRadiusMpc < CLOUD_SHELL_PARAMS.radiusRatio
};
```

computed once alongside `deckFade` (both branches of the function, the
`distanceMpc === 0` early return and the normal return), threaded into
`renderer.draw(pass, uniforms, insideShell)` at the `draw` call site
(`:171`).

**The fade re-tune.** `fadeEndAltitudeRadii` (currently 0.037, the level-z7
tile-LOD crossover altitude — `cloudShellParams.ts:99`) must move low
enough that the deck is still present as the camera descends through the
cull-fixed shell, or the cull fix has nothing to make visible. This is a
LOOK dial, not a re-derivation of the z7 math — read
`cloudShellParams.ts`'s header (the `h(z)` derivation, lines 52-77) before
touching it, and re-tune against the dev server in Task 10's own visual QA
step, not by calculation alone.

- [x] Create `tests/services/gpu/renderers/bodies/cloudShellRenderer.test.ts`,
      mirroring `atmosphereShellRenderer.test.ts`'s `mockDevice()` harness
      (cite it, do not re-derive independently). Test:
      `'builds two shell pipelines identical except cullMode'` — assert
      both pipelines' `vertex`/`fragment`/`depthStencil`/`layout` are equal
      and `primitive.cullMode` differs (`'back'` outside, `'front'`
      inside). Test: `'draws with the front-cull pipeline when inside,
  back-cull when outside'` — mirror Task 6's dispatch-order test shape.
- [x] Add `insideShell` to `CloudShellDraw`; add the second pipeline +
      `inside` arg to `cloudShellRenderer.draw`; update
      `CloudShellRenderer.d.ts`.
- [x] Update `cloudShellLayer.test.ts` for the new `CloudShellDraw` field
      and the `draw()` call's 3rd argument.
- [x] Re-tune `fadeEndAltitudeRadii` at the dev server — descend through
      the cloud deck and confirm it stays visible through the transition
      to fine surface tiles rather than vanishing before the cull fix ever
      gets a chance to matter.
- [x] **Visual QA, own line (spec §9):** overcast reads correctly from
      below the deck at low altitude; the deck neither vanishes early nor
      pops at the old ~238 km edge.
- [x] `npm run perf -- --url http://localhost:<this worktree's port>` —
      own checkpoint (spec §9's closing note: "the cloud shell now
      potentially double-sided at low altitude" is a distinct perf
      question from Tasks 3/8's atmosphere-shell measurement). Land/park
      per the same halt rule.
- [x] `npm test -- cloudShellRenderer cloudShellLayer` — green.
- [x] `npm run typecheck` — clean.
- [x] Commit:

```
fix(bodies): cloud deck stays visible from inside its own shell

cloudShellRenderer drew a closed, back-culled sphere — every
triangle culls once the camera sits inside it, with no fallback
(unlike the atmosphere shell before this branch). A second,
front-cull pipeline renders the near wall from inside, selected by
the same inside-mode discriminant shape the atmosphere shell just
grew. Paired with a re-tuned CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii
(previously tuned to a tile-LOD crossover altitude that happened to
also mask this bug) so the deck is actually visible through the
descent rather than faded to nothing before the cull fix matters
(spec §5c).
```

---

## Task 11: descent-fade tuning pass (spec §7 landmine, §10)

**Files:** `src/data/bodies/earthTileParams.ts`
(`EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM` = 300,
`EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM` = 150, lines 77/81) — tuning only,
values not structure.

**Not a new bug — an overlap the feature makes visible for the first
time.** The base-globe fade band (300km→150km) overlaps the 100km-thick
atmosphere shell. Before this branch there was nothing to look at from
inside the shell, so the overlap was invisible; now there is. This task
tunes the two existing constants against what Tasks 4–9 shipped — it does
not redesign either fade.

- [x] At the dev server, descend through the overlap band on Earth's day
      and night sides with the inside-shell sky live. Judge whether the
      base-globe fade and the new sky read coherently together (no visible
      seam, no double-darkening, no premature globe fade-out against a sky
      that's still clearly "outside").
- [x] If a re-tune is warranted, change ONLY the two constants — this is a
      look dial, not a structural change. Record the before/after values
      in the commit body.
- [x] If no re-tune is warranted, record that finding (a doc-only note in
      the commit, or skip the commit entirely if truly nothing changes) —
      do not tune for the sake of tuning.
- [x] `npm test` — green (these constants have no dedicated unit test per
      `testing.md`'s "no constant restatement" rule; this is a visual
      judgment call, not a test-driven change).
- [x] Commit (only if values changed):

```
fix(bodies): re-tune the base-globe descent fade against the inside-shell sky

EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM/GONE_ALTITUDE_KM overlap the
100km atmosphere shell; before this branch there was nothing to see
from inside it, so the overlap never read as a problem. Re-tuned
against the now-visible inside-shell sky at the dev server.
```

---

## Task 12: verification gate

**Not a code task** beyond whatever this surfaces needing a fix.

- [x] `npm test` — full suite green (7200+ tests, no new failures).
- [x] `npm run typecheck` — both tsconfigs clean.
- [x] Run the `comment-audit` skill over every file this plan touched or
      created — the comment budget (module header ≤10 lines, ≤half the
      code lines) is a standing constraint, not a suggestion, and a plan
      this size accumulates header drift across 10 code commits.
- [x] Walk the Definition of Done checklist above against the actual diff:
      every deliverable exists, every named observable behaviour was
      confirmed at Tasks 9/10/11, the deferral boundary was not crossed
      (no froxel work, no sun-glare pass, no non-Earth tuning, no
      `atmosphereDrawList` cull-rule change, no LUT bake change, no
      per-body irradiance falloff).
  - [x] `git log` confirms every commit landed in the order this plan
        specifies (T7 before T8/T9; T4–T7's inside-mode wiring never left
        a broken intermediate state per Task 6's placeholder note).
- [x] Hand off to `/feature-done` for the DoD audit + backlog sweep.

---

## Self-review notes (plan-authoring time)

**Spec coverage.** §2 (approach) → architecture section + Tasks 4-7. §3
(ground prep) → Tasks 1, 2 land first per its explicit sequencing note.
§4.1 → Task 7. §4.2 → Tasks 5, 6. §4.3 (washout) → no code task; it is a
"no bespoke code" mechanism the spec is explicit falls out of existing
compositor behaviour — verified at Task 9, not implemented anywhere. §4.4
→ Task 6's depth state. §4.5 (seamlessness) → verified at Task 9, not
separately implemented (the spec's own claim is "by construction, not by
blending logic"). §4.6 → Task 7's invariant test. §5a → Task 2. §5b → Task

1. §5c → Task 10. §6 (out of scope) → Definition of Done's deferral
   boundary + Task 9/10's "sanity not tuning" notes. §7 (landmines) → embedded
   in the task that hits each one (shared predicate: Task 5/6; ring mix:
   untouched, cited as a no-op risk in Task 5; two-pass order: Task 6's
   `draw()`; renormalize: Task 5; mat4d f64/dst-last: Task 4; iOS
   one-bad-pipeline: implicit in "reuse `createShaderModuleWithDevLog`" — no
   new shader-module calls in Task 6, so this landmine is structurally
   avoided rather than newly triggered; writeBuffer-before-draw: Task 6's
   `draw()` keeps the existing per-body pattern; descent-fade overlap: Task
   11; §5b-before-§3 sequencing: Tasks 1 then 4). §8 (backlog) → already
   landed in the spec commit, confirmed by `git log`, no plan task needed.
   §9 (testing) → every listed test named in its owning task. §10
   (interactions) → Task 11 (fades), Task 9 (Sun, labels — verified not
   implemented, since the spec says nothing changes there).

**Placeholder scan.** No task contains "handle edge cases," "TBD," or an
unresolved decision presented as settled. Two explicit, flagged judgment
calls stand where the spec leaves room: Task 7's new `isInsideAtmosphereShell`
util (spec describes an inline comparison; this plan extracts it for
testability + convention, flagged as authored, not spec-mandated) and Task
10's cull-mode fix shape (spec explicitly offers two options; this plan
recommends one, flagged, not silently chosen). Task 6's `false` placeholder
is not a plan gap — it is a deliberate, explicit, one-commit-lifetime
sequencing device to keep the tree green, documented as such at its
introduction and its removal.

**Type/signature consistency.** `packAtmosphereUniforms`'s final signature
(Task 4) is used identically at its one call site (Task 4's own edit to
`atmosphereShellLayer.ts`) and in its test file. `AtmosphereShellRenderer.draw`'s
4-arg signature (Task 6) is used identically in Task 6's placeholder call
and Task 7's real-trigger call. `CloudShellDraw`'s grown shape (Task 10) is
used identically in `cloudShellLayer.draw` and its test. No task
introduces a signature a later task silently changes.
