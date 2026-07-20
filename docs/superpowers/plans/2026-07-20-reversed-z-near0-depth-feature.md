# Reversed-Z depth on the NEAR0 slab — feature plan (flip the flag)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Load the `wesl-shaders` skill before touching any `.wesl` file** (Tasks 2, 3) — single-quote comments only, never backticks; a mislinked or silently-inverted shader fails only on-device (worst case iOS drops the whole frame — see CLAUDE.md and [V6]).

## Goal

The Sun (and every NEAR0 body) renders as a solid, stable disk with correct
occlusion from any viewpoint — Earth's surface out to Jupiter's orbit — in one
`depth32float` buffer, because NEAR0 now uses **infinite-far reversed-Z**: clear
`0.0`, `perspectiveReverseZ(fov, aspect, near)` with `zFar` omitted (near→1, ∞→0),
**greater-z-wins**. No change to what occludes what, to pick priority, or to caption
occlusion — only the depth convention on NEAR0 is inverted. The six visual
clip-survival clamps stay untouched (harmless under infinite-far).

Spec: `docs/superpowers/specs/2026-07-20-reversed-z-near0-depth.md` — this plan
implements its **"Feature PR — flip NEAR0"**, "Reversed-Z semantics", "Testing →
Feature PR", and the [V1]–[V6] visual pass. Read current source before editing;
do not trust any line offset below where it has since shifted.

## DEPENDENCY: the prep tasks land first, in the SAME PR

Prep + feature ship in **one PR** (user decision). This plan runs **after** the prep
plan's Tasks 1–7 have landed as commits on this same branch — the derive-the-
convention no-op (`reversedZ = false`) must be green first (its Task 7 checkpoint),
which is what makes this feature a one-line flag flip plus shader/comment inversions
rather than a 14-site hand-flip. Prep already provides and threads:

- `Slab.reversedZ` (`@types/engine/frame/Slab.d.ts`) + `SLAB_REVERSED_Z: Record<number, boolean>` in `slabs.ts` (`{ [NEAR0]: false, [COSMO]: false }`), copied onto each `Slab` by `deriveSlabs`.
- `resolveDepthCompare(intent, reversedZ)` and `depthClearValueFor(reversedZ)` (`utils/gpu/`), consumed by every NEAR0 renderer factory (`depthCompare`) and every clear site (`executeFrame.ts`, `pickProgram.ts`).
- `computeForegroundViewProj` gained a `reversedZ` param that selects `mat4d.perspectiveReverseZ` vs `mat4d.perspective`; `deriveSlabs` passes `near0.reversedZ`.

If any of the above is absent, STOP — the prep tasks have not landed on this branch;
this plan cannot proceed. **Do not re-implement the prep infrastructure here.**

## Ground preparation

Done by the prep PR (see the spec's "Ground preparation" section + its
refactor-ground verdict table). Nothing further is prepared here; this feature is
pure `growth` on the seams prep installed — one constant flips and the derived
sites follow.

## Global constraints

- **`type` aliases, never `interface`**; deep relative imports, no barrels; didactic comments (explain *why* + the rejected alternative).
- **Meticulous WESL (`feedback_wgsl_meticulous`, `feedback_wesl_no_backticks`):** `.wesl` edits are delicate. Single quotes in comments, never backticks. WGSL depth math is verified VISUALLY (no CPU unit test for shader depth). A silently-inverted compare or band is exactly the class of bug [V1]–[V5] and iOS [V6] guard.
- **Commits:** stage specific paths (never `git add -A` / `.`); format only touched files; the main thread runs `npm test` + `npm run typecheck` + `npm run build` and commits. Background implementers may self-run `npx tsc --noEmit` as a pre-flight only. `npm run build` = `tsc --noEmit` + `vite build` (this is what links the WESL).
- **No TS file moves** — no `npm run move-files` needed.
- **Dev server** stays running for HMR; never start/kill it. Visual checks ask the user to look (closing section).
- **All tasks must land before the visual pass is meaningful.** Between Task 1 (flag flip) and the shader tasks the branch is transiently inverted — that is expected on a feature branch; correctness is judged only at the end of the task list.

---

## Task 1: Flip `SLAB_REVERSED_Z[NEAR0]` + the regression test + TS test updates

**Files:**

- Modify `src/services/engine/frame/passes/slabs.ts` — the one-line flag.
- Add regression test to `tests/utils/camera/computeForegroundViewProj.test.ts`.
- Update NEAR0 pipeline/executor/pick tests (list below) to the reversed values.

**The flip (the whole logic change):**

```ts
// slabs.ts — SLAB_REVERSED_Z
{ [NEAR0]: true, [COSMO]: false }
```

Flipping this ONE entry cascades automatically (via the prep infrastructure) to:
every NEAR0 renderer's `resolveDepthCompare(...)` → `'greater'` / `'greater-equal'`;
the `foreground:0` clear (`executeFrame.ts`) + the NEAR0 pick clear
(`pickProgram.ts`) → `0` via `depthClearValueFor(true)`; `computeForegroundViewProj`
→ `perspectiveReverseZ`. **COSMO stays `false`** → its pick pipelines + clear are
untouched.

**New regression test — the genuine flip guard (pure matrix math, no GPU):**

Test name: `Sun depth from an Earth-view frustum is resolvable from the far clear`

Contract:
- Build the bracket from `foregroundFrustum(1e-15)` (Earth-focus camDistance).
- Read `const reversedZ = SLAB_REVERSED_Z[NEAR0]` and `const clear = depthClearValueFor(reversedZ)` — the test derives BOTH from the slab constant, so it is red on the pre-flip `false` path and green after the flip.
- Eye `[0,0,0]`, target `[0,0,-1]`, `up [0,1,0]`, `renderOrigin [0,0,0]`; project the Sun at `[0, 0, -4.85e-12]` (1 AU along view) through `computeForegroundViewProj({ …, near, far, reversedZ })`, then `ndcDepth = clip.z / clip.w`.
- Assert `Math.abs(ndcDepth - clear) > 6e-8` (one float32 ulp near the clear).

Rationale to put in a comment: on the non-reversed path the Sun projects to
`1 − ~2e-8`, inside one ulp of the `1.0` clear → the disk collapses onto the far
plane and flickers (the bug). Under reversed-Z the Sun sits far from the `0.0`
clear → resolvable. This is a real regression guard, not a mirror test: it fails on
the exact pre-fix code and passes on the fix.

**TS test updates (these break the instant the flag flips — update in this commit):**

- `tests/services/gpu/renderers/bodies/starRenderer.test.ts` (`depthCompare: 'less'` → `'greater'`, ~`:76`).
- `tests/services/gpu/renderers/bodies/planetRenderer.test.ts`, `ringRenderer.test.ts`, `texturedBodyRenderer.test.ts`, `earthRenderer.test.ts` — the NEAR0 body pipelines → `'greater'` (and `atmosphereShellRenderer`'s `'nearer-or-equal'` → `'greater-equal'` if its pipeline is asserted anywhere; note there is NO `atmosphereShellRenderer.test.ts`).
- `tests/services/gpu/renderers/bodies/bodyPickRenderer.test.ts` → `'greater'` (both its pipelines). NOTE there is NO `starCatalogPickRenderer.test.ts`.
- `tests/services/gpu/renderers/milkyWay/milkyWayPickRenderer.test.ts` → `'greater'`.
- `tests/services/engine/frame/executeFrame.test.ts` — the `foreground:0` `depthClearValue` assertion `1` → `0` (spec cites `:495`).
- `tests/services/engine/frame/pickProgram.test.ts` — the NEAR0 pick clear `1.0` → `0` (spec cites `:356`); **the COSMO pick clear assertion stays `1.0` — do not touch it.**
- `tests/services/gpu/renderTargets.test.ts` — check `:106`; update only if it pins a NEAR0 clear/compare value (it should stay a format/usage assertion — leave untouched if so).

Per `testing.md`: do NOT add tests for the GPU depth test itself (visual), the eps
constants (unchanged), or the doc restatements (Task 5).

**Steps:**

- [x] Add the regression test above to `computeForegroundViewProj.test.ts` — red under the current `SLAB_REVERSED_Z[NEAR0] === false`.
- [x] Flip `SLAB_REVERSED_Z[NEAR0]` to `true` in `slabs.ts`.
- [x] Update every NEAR0 pipeline/executor/pick test listed above to the reversed values; leave all COSMO assertions unchanged.
- [x] `npm test` green; `npm run typecheck` clean.
- [x] Commit (stage `slabs.ts` + the touched test files).

---

## Task 2: Invert the caption occlusion compare — `sceneDepth.wesl`

**Files:** modify `src/services/gpu/shaders/lib/sceneDepth.wesl`.

**Change (`:30`):**

```
// before (non-reversed, less-wins, clear 1.0):
return textureLoad(sceneDepthTex, vec2i(fragXY), 0) < fragDepth;
// after (reversed, greater-wins, clear 0.0):
return textureLoad(sceneDepthTex, vec2i(fragXY), 0) > fragDepth;
```

Under greater-wins a NEARER body now writes a LARGER stored depth, so
`storedSample > fragDepth` means a nearer body already covers this pixel — discard.
Empty sky reads the `0.0` clear, never `> fragDepth`, so a caption over empty sky is
kept. Same occlusion behaviour, inverted encoding.

Update the `## Why 'less' means occluded` header block (`:11-16`) to the reversed
convention: attachment is `depthCompare: greater` cleared to `0.0` (far); a stored
sample strictly GREATER than this fragment's depth means a nearer body covers the
pixel → discard. Single quotes, no backticks. Leave the `textureLoad`/no-sampler and
scale-1 texel-indexing paragraphs unchanged.

**Verification: build + visual only** — no CPU unit test for a shader compare
(`testing.md`); [V4] is the guard.

**Steps:**

- [x] Load the `wesl-shaders` skill. Flip `<` → `>` in `occludedByScene`.
- [x] Reword the "why occluded" header block to the reversed (greater-means-occluded, clear 0.0) rationale.
- [x] `npm run build` clean (WESL links); `npm run typecheck` clean.
- [x] Commit (stage `sceneDepth.wesl`).

---

## Task 3: Invert the pick-band mappings + `pickDepthBands.wesl` header

**Files:**

- Modify `src/services/gpu/shaders/bodies/starPointPick.wesl`
- Modify `src/services/gpu/shaders/milkyWayPick/vertex.wesl`
- Modify `src/services/gpu/shaders/starCatalog/vertex.wesl`
- Modify `src/services/gpu/shaders/lib/pickDepthBands.wesl` (header + rationale only)

**The eps CONSTANTS in `pickDepthBands.wesl` and their descending order are
UNCHANGED.** Under greater-wins, `z/w = eps` makes a LARGER eps a LARGER z that
still wins, so `EARTH(5.0e-4) > PLANET(4.5e-4) > MOON(4.0e-4) > SCENE(1e-4) >
SURVEY(0.5e-4) > BACKDROP(0.25e-4)` priority is preserved by the same numbers,
now sitting just ABOVE the `0.0` clear instead of just BELOW the `1.0` clear.

There are **two distinct WESL forms** to invert — do NOT treat them identically:

**A. Forced-band sites — `(1 - eps)` → `eps` (the simple form the spec quotes):**

```
// starPointPick.wesl  vsGlint (~:176):
out.clip.z = out.clip.w * (1.0 - eps);      →   out.clip.z = out.clip.w * eps;
// milkyWayPick/vertex.wesl (~:79):
let bandZ = centerClip.w * (1.0 - PICK_BAND_BACKDROP_EPS);
                                            →   let bandZ = centerClip.w * PICK_BAND_BACKDROP_EPS;
// starCatalog/vertex.wesl  vs, the PICK branch (the select's SECOND arg, ~:458):
out.clip.w * (1.0 - PICK_BAND_SURVEY_STAR_EPS)  →  out.clip.w * PICK_BAND_SURVEY_STAR_EPS
```

**B. Min-clamp site — `min(z, w*(1 - eps))` → `max(z, w*eps)` (BOTH operator and
mapping flip). ONE site under infinite-far:** the depth-tested PICK scene-star band.
It forces beyond-band fragments onto the scene band while letting nearer ones keep
true depth for pick priority. Under non-reversed the true-depth side is the SMALL z,
so `min` clamps DOWN to the band. Under reversed-Z a nearer thing has the LARGER z,
so keeping true depth means `max`, clamping onto the (now small, just-above-`0.0`)
band:

```
// starPointPick.wesl  vs, scene-star pick clamp (~:130):
out.clip.z = min(out.clip.z, out.clip.w * (1.0 - PICK_BAND_SCENE_STAR_EPS));
   →        out.clip.z = max(out.clip.z, out.clip.w * PICK_BAND_SCENE_STAR_EPS);
```

**In `starCatalog/vertex.wesl` (the `select(...)`), flip ONLY the pick branch (form A
above); LEAVE the visual branch alone.** The select is
`select(min(z, w*(1-CLIP_Z_EPS)) /*visual*/, w*(1-SURVEY_EPS) /*pick*/, pickPass)`.
Change only the second (pick) arg to `w*SURVEY_EPS`. The **first (visual) arg — the
`CLIP_Z_EPS` min-clamp — is UNCHANGED** because under **infinite-far** reversed-Z
there is no beyond-far, so that depthless clip-survival clamp is a harmless near-cap
(`z ∈ (0,1]` always survives); flipping it would be needless churn. (World-space far
clamps like `NEAR0_FAR_CLAMP_FRACTION` are depth-convention-agnostic and also
unchanged.)

**DO NOT TOUCH the six visual clip-survival clamps** — infinite-far makes them all
harmless no-ops, and two are shared with COSMO (flipping them would corrupt the
COSMO copy): `starPoints/vertex.wesl:121`, `bodyGlint/vertex.wesl:75`,
`milkyWayCloud/dust.wesl:91`, `milkyWayCloud/stars.wesl:118`, and the shared
`labels/vertex.wesl:83` + `markerLines/vertex.wesl:81`. They stay `min(z, w*(1-eps))`
verbatim. This is a deliberate non-edit (see spec "Reversed-Z semantics").

Update the rationale comments at each edited site AND the `pickDepthBands.wesl`
header: bands now sit just ABOVE the `0.0` clear; "larger eps → smaller z → wins
'less'" becomes "larger eps → larger z → wins 'greater'"; the min-clamp prose
becomes max-clamp. Single quotes, no backticks. The ASCII band table (eps →
z/w = 0.9995…) should read `z/w = eps` (0.0005…) in ascending-wins order. Do NOT
change any numeric constant.

**Verification: build + visual only** — no CPU unit test for shader depth
(`testing.md`); [V5] is the pick-priority guard, [V1]/[V3] the survey/sprite guard.
Update any test assertion that pins the `(1 - eps)` mapping (grep `1.0 - PICK_BAND`
/ `1 - eps` across `tests/` — none expected, but confirm).

**Steps:**

- [x] Load the `wesl-shaders` skill.
- [x] Invert the three forced-band sites (form A) to `eps` (`starPointPick::vsGlint`, `milkyWayPick`, `starCatalog` pick branch — the select's SECOND arg only).
- [x] Invert the ONE min-clamp site (form B) to `max(…, w*eps)` — `starPointPick::vs` scene-star clamp; verify it is a `min` today and becomes `max`.
- [x] Confirm the `starCatalog` VISUAL branch (`CLIP_Z_EPS` min-clamp, select's FIRST arg) and the six visual clip-survival clamps are LEFT UNCHANGED (infinite-far makes them harmless; two are COSMO-shared).
- [x] Update the per-site rationale comments + the `pickDepthBands.wesl` header (greater-wins, bands above the 0.0 clear); constants untouched.
- [x] Grep `tests/` for any `(1 - eps)` / `1.0 - PICK_BAND` assertion; update if present.
- [x] `npm run build` clean; `npm run typecheck` clean; `npm test` green.
- [ ] Commit (stage the four `.wesl` paths + any touched test).

---

## Task 4: `cloudShellRenderer` depthBias — flip sign or delete (decide against [V3])

**Files:** modify `src/services/gpu/renderers/bodies/cloudShellRenderer.ts` (`depthBias` / `depthBiasSlopeScale`, ~`:281-282`, + the rationale comment ~`:266-282`).

The bias pulls the cloud shell a few ulps toward the camera to resolve the
shell-vs-surface self-tie. Under non-reversed, toward-camera is SMALLER depth, so
the signs are NEGATIVE (`-4` / `-2`). Under reversed-Z, toward-camera is LARGER
depth, so the equivalent bias is POSITIVE (`+4` / `+2`).

**IMPORTANT — this is a decision to make against the visual pass, not a guess.**
Reversed-Z gives near-uniform relative precision, so the self-tie the bias exists to
paper over MAY already be resolved with NO bias. So:

1. First try **deleting** `depthBias` + `depthBiasSlopeScale` entirely (and the "Signs are NEGATIVE because…" rationale) — the cleanest outcome; the spec's perf note calls this a marginal saving.
2. Run [V3] (Earth close-up, cloud shell). If cloud-over-Earth z-fighting reappears, restore the bias with FLIPPED signs (`+4` / `+2`) and update the rationale comment: signs are POSITIVE because under `depthCompare: 'greater'` (reversed-Z) larger depth is nearer — toward the camera is toward the larger value.

Do not commit the choice until [V3] confirms it. Update the comment to match whichever lands (deleted → remove the bias paragraph; kept → flip the sign rationale). Do NOT leave a stale "signs are NEGATIVE / smaller is nearer" comment — that is a trap.

**Verification:** build + typecheck green; the load-bearing check is [V3].

**Steps:**

- [x] Delete `depthBias` + `depthBiasSlopeScale` and the sign-rationale paragraph.
- [x] `npm run build` + `npm run typecheck` clean; ask the user to run [V3].
- [ ] If [V3] shows shell z-fighting: restore the bias with `+4` / `+2` and the flipped rationale; re-confirm [V3]. Else keep it deleted.
- [ ] Commit (stage `cloudShellRenderer.ts`).

---

## Task 5: Doc-comment restatements → reversed convention (comments only)

**Files (stale-comment traps, no logic):**

- `src/@types/rendering/AtmosphereShellRenderer.d.ts` — `depthCompare: 'less-equal'` (~`:38`) → `'greater-equal'`.
- `src/@types/rendering/BodyPickRenderer.d.ts` — `depthCompare: 'less'` (~`:46`) → `'greater'`.
- `src/@types/rendering/StarCatalogPickRenderer.d.ts` — `depthCompare: 'less'` (~`:27`) → `'greater'`.
- Pass headers restating NEAR0 clear `1.0` / `less`: `ringsLayer.ts`, `cloudShellLayer.ts`, `atmosphereShellLayer.ts` (grep each for `less`, `1.0`, `clear` / `far plane` depth prose and reword to clear `0.0`, greater-wins).

Reword each to the reversed convention (clear `0.0`, greater-z-wins,
`perspectiveReverseZ`). These are comments, not logic — but a stale
`depthCompare: 'less'` here is a trap for the next reader/agent, which is why they
are in scope. Per `testing.md`, no test guards a doc restatement.

**Steps:**

- [ ] Reword the three `.d.ts` `depthCompare` restatements to `'greater'` / `'greater-equal'`.
- [ ] Grep the three pass headers for NEAR0 depth prose (`less`, clear `1.0`, far-plane) and reword to reversed-Z; leave unrelated prose alone.
- [ ] `npm run typecheck` clean (comment-only, but confirm nothing structural slipped).
- [ ] Commit (stage the touched paths).

---

## Visual verification (real device — load-bearing)

Copied verbatim from the spec's "Visual verification". Dev server with real data
linked (`http://localhost:5176`). These are check items the USER runs, not code
tasks. All Tasks 1–5 must be landed first (the branch is transiently inverted
mid-list).

- **[V1]** From Earth looking at the Sun: the Sun is a **solid, stable disk** — no flicker, no holes, at rest and while auto-rotating.
- **[V2]** Two planets roughly in line: the nearer occludes the farther correctly (occlusion direction not inverted).
- **[V3]** Earth close-up: surface, cloud shell, atmosphere shell, and rings layer correctly (no inverted cloud/atmosphere, no new z-fight on the cloud shell — confirm whether the `depthBias` is still needed → Task 4 decision).
- **[V4]** Near-field captions still **occlude behind nearer bodies** (#461 path: `sceneDepth.wesl` compare correctly inverted — captions hidden behind a nearer planet, kept over empty sky).
- **[V5]** Click-picking priority unchanged: a famous/scene star out-picks an overlapping Gaia dot; a planet's disk out-picks its glint; the Milky Way backdrop loses to any dot (pick bands correctly inverted).
- **[V6] iOS pass** — the `perspectiveReverseZ` projection and the flipped shaders compile and present on WebKit (stricter than Tint; a bad shader silently drops the whole frame — see CLAUDE.md). Confirm via `createShaderModuleWithDevLog`.

## Definition of done

- `npm test` green (full suite), `npm run typecheck` clean (both tsconfigs), `npm run build` clean (WESL links).
- The new regression test passes on the flipped flag and is confirmed to fail on the pre-flip path.
- All COSMO pick assertions (clear `1.0`, `depthCompare: 'less'`) confirmed UNCHANGED.
- [V1]–[V6] all confirmed by the user on a real device, including the iOS [V6] pass and the Task 4 `depthBias` decision.
- Run `/feature-done` **BEFORE merge** — it gates the DoD, sweeps the backlog, and relocates this plan + its spec to `plans/completed/` + `specs/completed/`.
