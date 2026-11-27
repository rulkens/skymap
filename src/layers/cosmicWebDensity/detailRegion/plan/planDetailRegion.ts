/**
 * planDetailRegion — one frame of a field's detail region as a pure step (spec §6.2): the target box
 * around the eye clamped into the dataBox, the reach gate, the settled box's growth by whole held
 * layers, and the fade each change of it becomes (§8). The region object keeps the state.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import { VOLUME_BRICK_EDGE } from '../../../../data/volume/volumeBrickEdge';
import { brickId } from '../../../../utils/volume/brickId';
import type { BrickBox } from '../@types/BrickBox';
import type { DetailRegionFade } from '../@types/DetailRegionFade';
import type { DetailRegionPlan } from '../@types/DetailRegionPlan';
import type { DetailRegionPlanInput } from '../@types/DetailRegionPlanInput';
import type { DetailRegionState } from '../@types/DetailRegionState';

export function planDetailRegion(
  prev: DetailRegionState,
  input: DetailRegionPlanInput,
): DetailRegionPlan {
  const { grid, dims, bricksPerAxis: k, eyeVox, held, failed } = input;
  const centre = eyeVox.map((v, a) => Math.min(Math.max(v, 0), dims[a]!)) as Vec3;
  if (
    Math.hypot(eyeVox[0] - centre[0], eyeVox[1] - centre[1], eyeVox[2] - centre[2]) >= input.gateVox
  ) {
    // Rays march only inside the stored box, whose nearest point to the eye is the centre: past the
    // gate distance no region sample could pass the per-ray gate. The held bricks stay for the return.
    return { state: { ...prev, inReach: false }, wanted: [], shown: [], busy: false };
  }
  const seed = centre.map((v, a) =>
    Math.min(Math.floor(v / VOLUME_BRICK_EDGE), grid[a]! - 1),
  ) as Vec3;
  const lo = seed.map((s, a) => Math.max(0, Math.min(s - Math.floor(k / 2), grid[a]! - k))) as Vec3;
  const target: BrickBox = { lo, hi: lo.map((v, a) => Math.min(v + k, grid[a]!)) as Vec3 };
  // No failed check: only a fetch marks a brick failed, and a held brick is never fetched.
  const usable = (box: BrickBox) => bricksOf(box).every((c) => held(brickId(c, grid)));

  let settled = prev.settled;
  let fade: DetailRegionFade | null = null;
  if (prev.fade) {
    const w = Math.min(1, prev.fade.w + input.rampStep);
    if (w < 1) fade = { ...prev.fade, w };
    else settled = prev.fade.into;
  }
  if (!fade) {
    // Clip, not regrow from the centre: regrowing stalls in a half-written entering layer and
    // collapsed the spike's region to 36–50% for 3–6 frames after a shift.
    const kept = settled && clip(settled, target);
    const unit: BrickBox = { lo: seed, hi: seed.map((s) => s + 1) as Vec3 };
    const start = kept ?? (usable(unit) ? unit : null);
    const next = start && grow(start, target, usable);
    if (!sameBox(next, settled)) {
      // `next` contains `kept` and lies in the target, so `into` and `out` meet only in `kept`.
      fade = { into: next, out: settled, w: 0 };
      settled = kept;
    }
  }

  const ranked = bricksOf(target).flatMap((c) => {
    const b = brickId(c, grid);
    if (held(b) || failed(b)) return [];
    const d = c.map((v, a) => v - seed[a]!);
    return [{ b, shell: Math.max(...d.map(Math.abs)), d2: d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2 }];
  });
  ranked.sort((p, q) => p.shell - q.shell || p.d2 - q.d2);
  const shown = [settled, fade?.into, fade?.out].filter((box): box is BrickBox => !!box);
  return {
    state: { target, settled, fade, inReach: true },
    wanted: ranked.map((r) => r.b),
    shown,
    busy: ranked.length > 0 || fade !== null,
  };
}

function bricksOf(box: BrickBox): Vec3[] {
  const coords: Vec3[] = [];
  for (let z = box.lo[2]; z < box.hi[2]; z++)
    for (let y = box.lo[1]; y < box.hi[1]; y++)
      for (let x = box.lo[0]; x < box.hi[0]; x++) coords.push([x, y, z]);
  return coords;
}

function clip(box: BrickBox, to: BrickBox): BrickBox | null {
  const clipped: BrickBox = {
    lo: box.lo.map((v, a) => Math.max(v, to.lo[a]!)) as Vec3,
    hi: box.hi.map((v, a) => Math.min(v, to.hi[a]!)) as Vec3,
  };
  return clipped.hi.some((hi, a) => hi <= clipped.lo[a]!) ? null : clipped;
}

/** Adds whole layers, each face independently, while the next layer is usable. */
function grow(box: BrickBox, target: BrickBox, usable: (layer: BrickBox) => boolean): BrickBox {
  const lo = [...box.lo] as Vec3;
  const hi = [...box.hi] as Vec3;
  const layer = (axis: number, at: number): BrickBox => ({
    lo: lo.map((v, a) => (a === axis ? at : v)) as Vec3,
    hi: hi.map((v, a) => (a === axis ? at + 1 : v)) as Vec3,
  });
  for (let grew = true; grew; ) {
    grew = false;
    for (let a = 0; a < 3; a++) {
      if (lo[a]! > target.lo[a]! && usable(layer(a, lo[a]! - 1))) {
        lo[a] = lo[a]! - 1;
        grew = true;
      }
      if (hi[a]! < target.hi[a]! && usable(layer(a, hi[a]!))) {
        hi[a] = hi[a]! + 1;
        grew = true;
      }
    }
  }
  return { lo, hi };
}

function sameBox(p: BrickBox | null, q: BrickBox | null): boolean {
  if (!p || !q) return p === q;
  return p.lo.every((v, a) => v === q.lo[a]) && p.hi.every((v, a) => v === q.hi[a]);
}
