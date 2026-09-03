import type { SkyCubemapBakeKey } from '../../../@types/engine/state/SkyCubemapBakeKey';

/**
 * True when the sky-cubemap's cached bake is missing or stale against
 * `current` — `settings`/`selection` compared by reference (see
 * `SkyCubemapBakeKey`'s docs for why reference equality is the right check).
 * `current.rosterSettling` forces true unconditionally, re-baking every
 * frame a ramp runs; the `rosterSettling` field comparison below then
 * catches the settle edge (baked mid-ramp, current settled) for the one
 * final bake, the same way any other field flip does.
 */
export function skyCubemapNeedsBake(
  baked: SkyCubemapBakeKey | null,
  current: SkyCubemapBakeKey,
): boolean {
  if (baked === null) return true;
  if (current.rosterSettling) return true;
  return (
    baked.settings !== current.settings ||
    baked.selection !== current.selection ||
    baked.tier !== current.tier ||
    baked.faceSizePx !== current.faceSizePx ||
    baked.rosterSettling !== current.rosterSettling
  );
}
