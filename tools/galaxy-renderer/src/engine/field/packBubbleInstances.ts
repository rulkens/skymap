/**
 * packBubbleInstances — packs the bubble-view overlay's two independent
 * placement lists (relic bubbles, HII cavities — dustBubblePlacements.ts)
 * into one instance buffer, byte-for-byte matching
 * `milkyWayField/bubblePresent.wesl`'s vertex attributes: `@location(0)`
 * `vec4<f32>` (center.xyz, radius) and `@location(1)` `f32` kind, at an
 * instance-stepped `arrayStride` of `BUBBLE_RECORD_FLOATS * 4`. A mismatch
 * here is silent garbage on screen, not a crash.
 *
 * Relics land first (kind 0), cavities second (kind 1) — the shader's own
 * palette switch (`select(RELIC_COLOR, CAVITY_COLOR, kind > 0.5)`) depends
 * on the lane value alone, not on record order, but callers (
 * `createGalaxyModel.ts`'s `rebuildBubblePlacements`) size their buffer to
 * `relics.length + cavities.length` and expect that contiguous layout.
 */
import type { DustBubblePlacement } from '../../../../../src/services/engine/galaxyGenerator/v2/dustBubblePlacements';

/** Floats per instance: a vec4 (center.xyz, radius) then a kind lane. */
export const BUBBLE_RECORD_FLOATS = 5;

const RELIC_KIND = 0;
const CAVITY_KIND = 1;

function writeBubbleRecord(
  out: Float32Array,
  index: number,
  placement: DustBubblePlacement,
  kind: number,
): void {
  const base = index * BUBBLE_RECORD_FLOATS;
  out[base] = placement.center[0];
  out[base + 1] = placement.center[1];
  out[base + 2] = placement.center[2];
  out[base + 3] = placement.radius;
  out[base + 4] = kind;
}

export function packBubbleInstances(
  relics: readonly DustBubblePlacement[],
  cavities: readonly DustBubblePlacement[],
): Float32Array {
  const total = relics.length + cavities.length;
  const out = new Float32Array(total * BUBBLE_RECORD_FLOATS);
  let i = 0;
  for (const p of relics) writeBubbleRecord(out, i++, p, RELIC_KIND);
  for (const p of cavities) writeBubbleRecord(out, i++, p, CAVITY_KIND);
  return out;
}
