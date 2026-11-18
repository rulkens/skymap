/** createLabelFrame — the per-frame label columns for `capacity` records, all zero. */

import type { LabelFrame } from '../../../@types/rendering/LabelFrame';

export function createLabelFrame(capacity: number): LabelFrame {
  return {
    capacity,
    located: new Uint8Array(capacity),
    visible: new Uint8Array(capacity),
    onScreen: new Uint8Array(capacity),
    px: new Float32Array(capacity * 2),
    up: new Float32Array(capacity * 2),
    pxPerRad: new Float32Array(capacity),
    diameterPx: new Float32Array(capacity),
    distanceMpc: new Float64Array(capacity),
    depthMpc: new Float64Array(capacity),
    textPx: new Float32Array(capacity),
    rect: new Float32Array(capacity * 4),
    target: new Float32Array(capacity),
    clickable: new Uint8Array(capacity),
    named: new Uint8Array(capacity),
    rank: new Float64Array(capacity),
    order: new Uint32Array(capacity),
    orderCount: 0,
    accepted: new Uint32Array(capacity),
    survivor: new Uint8Array(capacity),
    held: new Float32Array(capacity),
    rampFrom: new Float32Array(capacity),
    rampTo: new Uint8Array(capacity),
    rampSinceMs: new Float64Array(capacity),
    fresh: new Uint8Array(capacity),
    keys: [],
    generation: -1,
    ramping: false,
  };
}
