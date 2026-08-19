# Task 8 review — RENDERER.md wrap-up

**Verdict: Changes-Requested** (one Important fact error; otherwise solid)

## Spec checklist (brief)

- [x] Only `docs/RENDERER.md` touched — diff confirms `1 file changed, 1 insertion(+)`; `git log`/`git status` confirm HEAD `074269dc8` is exactly this diff, tree clean.
- [x] Bullet added in "Renderer quick map," after the Earth surface virtual texture entry, before "Things that have bitten us before" — correct location, matches `:5-13` scope.
- [x] Names `volumeField/volumeFieldRenderer.ts` + `shaders/scalarVolume/*.wesl` — path verified against `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`.
- [x] States both GPU-built pyramids: display chain (box filter, self-referential) + max-value pyramid (own base dims/8, used for skip).
- [~] "both filled ... via the shared `gpu/lib/generateMipChain3d` primitive" — true only for the display chain; the max pyramid's own base (dims/8) is built by three direct `downsampleLevel3d` cross-texture reduction calls in `buildMaxPyramid`, and `generateMipChain3d` only fills the chain *above* that base. `generateMipChain3d.ts`'s own module header says this explicitly ("Task 3's first reduction ... is the one call site that passes the field's real values, via `downsampleLevel3d` directly rather than this loop"). Not flat-out false (both functions live in the same `gpu/lib/generateMipChain3d.ts` file, so "primitive" read as "module" holds), but naming the specific function conflates two different construction paths. See Findings.
- [x] Never persisted, never CPU-computed — accurate (`upload()` builds both every call, no cache).
- [x] Cone-footprint LOD / `pixelConeTan` described correctly, including the "already carries the spec's 2" detail — verified verbatim match against `fragment.wesl`'s own comment and `scalarVolumeLayer.ts`'s `pixelConeTan = (2 * Math.tan(fovYRad/2)) / vh`.
- [x] Points at spec + plan rather than restating design — both links present and correctly pathed.
- [x] `npx prettier --write` run (report says "unchanged") — line is within the file's existing single-long-line-per-bullet convention; no wrapping needed.

## Fact-check findings

**[Important] "CF-4 flow" misidentifies the field.** The bullet's opening parenthetical reads "additive 3D scalar-field raymarch (MCPM cosmic web, **CF-4 flow**)". This is wrong: the scalar-volume renderer's `VolumeFieldId` union is derived from `type: 'volume'` registry rows, which for CF-4 is `CF4_DENSITY_ENTRY` (`src/data/sources/cf4-density.ts`) — `label: 'CF-4 DM density'`, `paletteId: 'coolwarm'`, `contrastCenter: 0.5`. "Flow" is a **separate, unrelated** source type (`FLOW_ENTRY`, `type: 'flow'`, `src/data/sources/flow.ts`) — the CF4++ peculiar-velocity particle field, excluded from `VolumeFieldId` by construction and rendered by an entirely different subsystem (particle advection, not this raymarch). `src/data/sources.ts:15` itself distinguishes them: `'volume' — scalar-field cubes (CF-4 DM density, MCPM cosmic web)` vs `'flow' — CF4++ peculiar-velocity field overlay`. The doc should read "CF-4 density" (or "CF-4 DM density"), not "CF-4 flow" — as written it tells the next reader this renderer draws the flow-particle field, which it never does. This is exactly the "misstates a mechanism" failure mode the task brief calls out.

**[Minor] Max-pyramid construction oversimplified.** "both filled at `upload()` time via the shared `gpu/lib/generateMipChain3d` primitive" glosses over `buildMaxPyramid`'s three-step cross-texture reduction (via `downsampleLevel3d`, not `generateMipChain3d`) that produces the pyramid's own dims/8 base from the raw cube; only the levels *above* that base go through `generateMipChain3d`'s loop. Defensible as "both come out of the same `gpu/lib/generateMipChain3d.ts` module" but not as "both filled via generateMipChain3d" read literally. Given RENDERER.md's terse-bullet convention and the brief's "point at the plan/spec rather than restating," this may be an acceptable simplification once the CF-4 label is fixed — flagging for the fixer's judgment, not blocking on its own.

**[Confirmed accurate — no issue]**
- `STEP_COUNT = 256` "iteration safety cap, not a density divisor," with the per-iteration step floor guaranteeing `tMax` is reached — matches `fragment.wesl:133-141,401-410` verbatim.
- Skip cutoff "derived live from the contrast/trim uniforms" — matches `fragment.wesl:383-390` (`u.contrast`/`u.trim` read per-fragment, not baked).
- Deviation-space max pyramid making skip logic correct for both sequential and divergent palettes — matches `buildMaxPyramid`'s docblock and `applyContrastWindow`'s shared `halfRange` formula.
- `volume` row `scale: 3` after a 2026-08-19 `scale: 2` regression — matches `renderTargets.ts:46-51` verbatim (same commit-dated A/B note).
- `texture_3d<f32>` binding, front-to-back over-compositing (`accum = accum + (1.0 - accum.a) * contrib`) — matches bindings/shader exactly.
- The pre-existing stale "192 raymarch steps" comment in `renderTargets.ts`'s docblock (actual `STEP_COUNT` is 256) — already flagged by the implementer as out-of-scope/deferred; correctly not touched or re-raised here, per this review's instructions.

## Style/density

Matches the section's existing one-bullet-per-renderer, single-long-paragraph convention (comparable in length/density to the Earth surface virtual texture entry immediately above it). No process narration, no restated research — design detail is correctly deferred to the linked spec/plan.

## Scope

Diff touches only `docs/RENDERER.md` (1 insertion). Nothing else in the tree changed; `git status` is clean at HEAD `074269dc8`.

## Recommendation

Fix the "CF-4 flow" → "CF-4 density" (or "CF-4 DM density") mislabel before merge — one-word-level edit, no other changes needed. The max-pyramid construction-path simplification is optional to tighten.
