import type { PackedAtlas } from '../@types/PackedAtlas';

/** The spike's fill ratio at 2K — seeds the first trial after an exact-scale attempt fails. */
const SEED_FILL_RATIO = 0.6;
const SCALE_STEP = 0.98;
const MIN_TRIAL_SCALE = 0.1;

/** Largest scale whose charts fit ONE atlas. `attempt` returns the pack, or null on overflow. */
export async function fitAtlasScale(
  destSizePx: number,
  usedTexels: number, // uvCoverage × sourceSizePx², the texels the charts actually sample
  attempt: (scale: number) => Promise<PackedAtlas | null>,
): Promise<{ scale: number; packed: PackedAtlas }> {
  const exact = await attempt(1);
  if (exact) return { scale: 1, packed: exact };

  // Seed capped at SCALE_STEP, not 1: scale 1 already failed the `exact` attempt above.
  let scale = Math.min(
    SCALE_STEP,
    Math.sqrt((destSizePx * destSizePx * SEED_FILL_RATIO) / usedTexels),
  );
  while (scale >= MIN_TRIAL_SCALE) {
    const packed = await attempt(scale);
    if (packed) return { scale, packed };
    scale *= SCALE_STEP;
  }

  throw new Error(
    `fitAtlasScale: no scale fit one atlas for destSizePx=${destSizePx} usedTexels=${usedTexels}`,
  );
}
