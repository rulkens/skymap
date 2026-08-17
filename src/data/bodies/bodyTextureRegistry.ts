/**
 * bodyTextureRegistry — the one authored table of textured bodies: texture kinds,
 * each kind's tier ceiling, its colour treatment. Registry membership IS "is this
 * body textured?"; the runtime tier clamp and the texture build both derive from it,
 * over the same `(bodyId|ring, kind)` key space as `tools/utils/io/textureSources.ts`,
 * so a textured body with no raw source is a type/test failure, not a silent render.
 * LANDMINE: nothing cross-checks an authored ceiling against the source it names.
 * Author above what `tools/textures/tiersFittingSourceWidth.ts` can emit and the
 * build omits the tile, the loader 404s, and the body stays on its boot-atlas tile.
 */

import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { BodyTextureSpec } from '../../@types/scene/BodyTextureSpec';

// Keyed by id rather than an array so a missing or extra body is a compile error,
// and so the per-body-per-frame proximity-loader lookup stays O(1).
export const BODY_TEXTURE_REGISTRY: Readonly<Record<BodyTextureId, BodyTextureSpec>> = {
  mercury: {
    bodyId: 'mercury',
    kinds: { surface: 'large' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Look ceiling: the source is unresolved cloud, so there is no 8 k detail to have.
  venus: {
    bodyId: 'venus',
    kinds: { surface: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Beyond the day albedo: `night` (Black Marble city lights, sRGB) and `clouds`
  // (sRGB colour + luminance-derived alpha) hold the full 8 k ceiling — both resolve
  // fine detail. `material` (roughness + ocean mask) and `normal` (baked from the
  // GEBCO heightfield) are linear-PNG and capped at 4 k: a land/ocean mask and a
  // normal map both downsample cleanly, so 8 k buys nothing.
  earth: {
    bodyId: 'earth',
    kinds: {
      surface: 'large',
      night: 'large',
      material: 'medium',
      normal: 'medium',
      clouds: 'large',
    },
    provenance: 'nasa',
    treatment: { kind: 'colour' },
  },
  mars: {
    bodyId: 'mars',
    kinds: { surface: 'large' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Jupiter / Saturn: a SOURCE ceiling, not a look one. Their Solar System Scope
  // files are 4096×2048 despite the `8k_` filename prefix, so `large` has no tile to
  // emit; raising it back without sourcing a bigger image is a regression.
  jupiter: {
    bodyId: 'jupiter',
    kinds: { surface: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  saturn: {
    bodyId: 'saturn',
    kinds: { surface: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Look ceiling: near-featureless discs, so `small` is the highest useful tier.
  uranus: {
    bodyId: 'uranus',
    kinds: { surface: 'small' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  neptune: {
    bodyId: 'neptune',
    kinds: { surface: 'small' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // `normal` is baked from the LOLA heightfield, capped at 4 k like Earth's.
  moon: {
    bodyId: 'moon',
    kinds: { surface: 'large', normal: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  io: {
    bodyId: 'io',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'colour' },
  },
  // Europa + Callisto: the USGS mosaics are single-channel with no colour source at
  // all, so the build tints them to restore a plausible hue the mono map lacks.
  europa: {
    bodyId: 'europa',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'monoTint', tint: [0.86, 0.82, 0.74] },
  },
  ganymede: {
    bodyId: 'ganymede',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'colour' },
  },
  callisto: {
    bodyId: 'callisto',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'monoTint', tint: [0.62, 0.58, 0.52] },
  },
  // Pluto / Charon: a LOOK ceiling — both sources measure well past 8 k (24888 px
  // and 12693 px) and both are single-channel (`sharp().metadata()`: channels=1,
  // space=b-w). Pluto gets `panSharpen` because a co-registered global chroma source
  // exists (NASA MVIC, PIA11707), so hue is derived rather than guessed. Charon stays
  // `monoTint` because none does — only single-hemisphere disc portraits — and it is
  // genuinely near-neutral but for a reddish polar cap (Grundy+16, Science 351
  // aad9189); that is what its source supports, not a shortfall against Pluto's.
  pluto: {
    bodyId: 'pluto',
    kinds: { surface: 'medium' },
    provenance: 'usgs',
    treatment: {
      kind: 'panSharpen',
      // Re-check with `npm run fit-pluto-chroma`; expect ~1% digit drift, since the
      // fit averages gradient-quiet tiles and the reference rendition these came from
      // is gone. Gate on outcome, not digits: stay within half a delta-E of a fresh
      // fit (3.16 vs 3.13 today) and still beat the uniform-scale baseline (7.02).
      calibration: {
        matrix: [
          [1.0354, 0.3565],
          [-0.0686, 0.1579],
        ],
        gain: 0.958,
      },
    },
  },
  charon: {
    bodyId: 'charon',
    kinds: { surface: 'medium' },
    provenance: 'usgs',
    treatment: { kind: 'monoTint', tint: [0.6, 0.58, 0.56] },
  },
};

// Takes `string`, not `BodyTextureId`, so a caller holding an arbitrary body id can
// branch on the `null` — this doubles as the body makers' "is it textured?" test.
export function bodyTextureSpec(id: string): BodyTextureSpec | null {
  return (BODY_TEXTURE_REGISTRY as Record<string, BodyTextureSpec | undefined>)[id] ?? null;
}
