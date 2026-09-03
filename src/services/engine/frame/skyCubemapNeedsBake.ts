import type { SkyCubemapBakeKey } from '../../../@types/engine/state/SkyCubemapBakeKey';

/**
 * True when the sky-cubemap's cached bake is missing or stale against
 * `current` — `settings`/`selection` compared by reference (see
 * `SkyCubemapBakeKey`'s docs for why reference equality is the right check).
 * `current.fadesAnimating` forces true unconditionally, re-baking every
 * frame a ramp runs; the `fadesAnimating` field comparison below then
 * catches the settle edge (baked mid-ramp, current settled) for the one
 * final bake, the same way any other field flip does.
 */
export function skyCubemapNeedsBake(
  baked: SkyCubemapBakeKey | null,
  current: SkyCubemapBakeKey,
): boolean {
  if (baked === null) return true;
  if (current.fadesAnimating) return true;
  return (
    baked.settings !== current.settings ||
    baked.selection !== current.selection ||
    baked.tier !== current.tier ||
    baked.faceSizePx !== current.faceSizePx ||
    baked.fadesAnimating !== current.fadesAnimating
  );
}
