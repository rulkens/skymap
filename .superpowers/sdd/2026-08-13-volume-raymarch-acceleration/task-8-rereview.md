# Task 8 fix round 1 — re-review

**Verdict: ADDRESSED (both findings)**

## Finding 1 (Important — "CF-4 flow" → "CF-4 density")

ADDRESSED. Diff changes the parenthetical to "MCPM cosmic web, CF-4 density." Verified against `src/data/sources/cf4-density.ts`: `CF4_DENSITY_ENTRY` has `type: 'volume'`, `label: 'CF-4 DM density'`. "CF-4 density" is accurate and terse; the `FLOW_ENTRY` (`type: 'flow'`) remains correctly unmentioned since it isn't part of `VolumeFieldId`/this renderer.

## Finding 2 (Minor — max-pyramid construction path)

ADDRESSED. New wording: "both upload-time-only ... and both built through `gpu/lib/generateMipChain3d.ts`: a display chain (... filled by the module's `generateMipChain3d` loop) ..., and a separate max-value pyramid — own base at dims/8 built by three direct cross-texture `downsampleLevel3d` reductions from the raw cube, with `generateMipChain3d` filling only the levels above that base — ...". Verified against `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts:289-359` (`buildMaxPyramid`): three `downsampleLevel3d` calls (raw texture → scratchA → scratchB → `maxPyramidTexture` level 0) build the dims/8 base, then `generateMipChain3d(device, maxPyramidTexture, 'max')` fills levels 1..N-1. Matches exactly, including "cross-texture" phrasing (borrowed correctly from `downsampleLevel3d`'s own docblock in `generateMipChain3d.ts:101-103`). "Built through `gpu/lib/generateMipChain3d.ts`" now correctly refers to the module (which exports both `generateMipChain3d` and `downsampleLevel3d`), not the single function, so no residual overstatement.

## New breakage from this diff

None. Diff is a single-bullet edit (1 insertion / 1 deletion) confined to `docs/RENDERER.md`'s scalar-volume line; nothing else touched (`git status` clean at HEAD `7acc2ce2d`). `npx prettier --check docs/RENDERER.md` passes — line stays within the file's existing single-long-line-per-bullet convention, comparable in density to the neighboring Earth surface virtual texture bullet. No new factual claims introduced beyond the two findings' scope.
