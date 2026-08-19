# Task 8 report — RENDERER.md wrap-up

**Status:** done.

**Commit:** `074269dc8` — `docs(renderer): add scalar-volume renderer to the quick map`

## What was documented

Added one bullet to `docs/RENDERER.md`'s "Renderer quick map" (after the Earth
surface virtual texture entry, before "Things that have bitten us before"),
matching the section's existing one-bullet-per-renderer, single-paragraph
density. Covers:

- `volumeField/volumeFieldRenderer.ts` + `shaders/scalarVolume/*.wesl` as the
  file/shader pair.
- The two GPU-built mip pyramids per field, both filled at `upload()` time via
  the shared `gpu/lib/generateMipChain3d` primitive, never persisted, never
  CPU-computed: a display box-filter chain the raymarch samples through
  cone-footprint LOD, and a separate max-value pyramid (own base at dims/8)
  storing normalised **deviation** from contrast center rather than raw
  values — called out as why the same skip logic is correct for both
  sequential (MCPM) and divergent (CF-4) palettes.
- The TF-adaptive skip cutoff deriving live from contrast/trim uniforms (no
  rebuild on slider change).
- `pixelConeTan`'s role and that it already carries the spec's factor of 2 (the
  shader does `t * pixelConeTan`, not `2 * t * pixelConeTan`).
- `STEP_COUNT` as an iteration safety cap, not a density divisor, with the
  per-iteration step floor that guarantees full ray coverage.
- The pose-dependent perf verdict (faster where skip finds empty space, a net
  tax where it doesn't) without restating exact numbers — points at the plan.
- The `volume` render-target row staying at `scale: 3` after the 2026-08-19
  `scale: 2` regression, referencing `renderTargets.ts`.
- Links to the design spec and this plan for full detail, per the brief's
  "point at this plan + the spec ... rather than restating either."

Ran `npx prettier --write docs/RENDERER.md` (reported "unchanged" — the added
line was already within the file's line-length convention). Ran
`npm run typecheck` — green (both `tsc --noEmit` projects), as expected for a
docs-only change.

## Cross-checking against code

Verified every factual claim against source before writing it:

- `volumeFieldRenderer.ts`: confirmed `group0Bgl` has bindings 0–5 (uniform,
  volume 3D tex, sampler, palette 2D tex, palette sampler, max-pyramid 3D
  tex), `UNIFORM_BYTES = 272`, `buildMaxPyramid` reduces from the raw cube in
  deviation space via `applyContrastWindow`'s same `halfRange` formula, and
  `upload()` calls `generateMipChain3d` for both the display chain (`'box'`)
  and the max pyramid (`'max'`) — matches the "never persisted, never
  CPU-computed" claim.
- `fragment.wesl`: confirmed `STEP_COUNT = 256` is documented in-shader as "a
  safety cap only," the per-iteration step floor
  `max(lodStepLength, (tMax - t) / remainingSteps)`, the skip cutoff
  `deadband - 0.05` derived from live `u.contrast`/`u.trim`, and the
  `pixelConeTan` comment explicitly stating it "already carries the spec's
  '2'" so `coneLod` uses `t * pixelConeTan` not `2 * t * pixelConeTan`.
- `scalarVolumeLayer.ts`: confirmed `pixelConeTan = (2 * Math.tan(fovYRad/2)) / vh`
  is computed once per frame (not per-field, not per-galaxy).
- `renderTargets.ts`: confirmed the `volume` row's `scale: 3` and the
  2026-08-19 landmine comment recording the `scale: 2` regression
  ("`volume-inside` regressed TOTAL merged by ~1.3 ms ... over the
  acceleration stack's 1 ms budget").
- `tools/perf/perfScenarios.ts`: confirmed both `volume-inside` and
  `void-inside` scenario rows exist.

## Factual mismatch found (pre-existing, out of scope)

`renderTargets.ts`'s "Why the volume row renders at 1/3 scale" docblock
(`git blame`: authored 2026-07-09, commit `ffc9c21158`, predates this plan)
says *"the heaviest per-pixel pass (192 raymarch steps × N active fields...)"*.
The shader's actual `STEP_COUNT` is 256 today, and was bumped from 128→256 in
this plan's Task 6 (`0218c610e feat(volumes): cone-footprint LOD + honest
step sizing`). 192 doesn't match either the pre-plan (128) or current (256)
value — it looks like a stale figure from some earlier constant value that
was never updated when `STEP_COUNT` changed. Left as-is: it's outside Task
8's scope (that docblock isn't in the "Renderer quick map" section this task
was scoped to touch), and fixing a pre-existing unrelated doc comment risks
scope creep on the final task of the plan. Flagging here for whoever next
touches `renderTargets.ts`'s volume-row doc.

## Fix round 1

Reviewer fact-check (`task-8-review.md`) found two issues in the RENDERER.md
bullet, both fixed in commit `7acc2ce2d`:

1. **[Important] Field mislabel.** The bullet's opening parenthetical read
   "(MCPM cosmic web, CF-4 **flow**)". The scalar-volume renderer's
   `VolumeFieldId` union is populated from `type: 'volume'` registry rows —
   for CF-4 that's `CF4_DENSITY_ENTRY` (`src/data/sources/cf4-density.ts`,
   `label: 'CF-4 DM density'`). "Flow" is a distinct, unrelated source
   (`FLOW_ENTRY`, `type: 'flow'`, `src/data/sources/flow.ts`) — the CF4++
   peculiar-velocity particle field, rendered by a different subsystem
   entirely (particle advection, not this raymarch) and excluded from
   `VolumeFieldId` by construction. Changed "CF-4 flow" → "CF-4 density" in
   both places the bullet names the field.
2. **[Minor, rides along per reviewer] Max-pyramid build path.** The bullet
   said both pyramids were "filled ... via the shared `gpu/lib/generateMipChain3d`
   primitive," which is true for the display chain but not the max pyramid:
   its dims/8 base is built by three direct cross-texture `downsampleLevel3d`
   calls in `buildMaxPyramid` (reducing raw cube values into deviation space),
   and `generateMipChain3d`'s own loop only fills the levels *above* that
   base — exactly as `generateMipChain3d.ts`'s module header states. Reworded
   to "both built through `gpu/lib/generateMipChain3d.ts`" (the module, not
   a specific function) and spelled out which construction path fills which
   part of the max pyramid, without growing the bullet's density beyond the
   section's convention.

Verification: `npx prettier --write docs/RENDERER.md` reported "unchanged"
(line still fits the file's single-long-line-per-bullet convention);
`npm run typecheck` green (both `tsc --noEmit` projects). Diff is exactly
`docs/RENDERER.md`, 1 insertion / 1 deletion, per `git diff` shown above.
