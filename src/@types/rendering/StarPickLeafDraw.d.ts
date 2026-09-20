/**
 * StarPickLeafDraw — one source's pick draw: compacted flat leaf arrays the
 * pick renderer packs verbatim. `drawCount` valid entries; scalar arrays
 * index `[i]`, the origin vec3 indexes `[3*i]` — the same flat shape
 * `StarNodeStream` carries, so the pick renderer's pack loop matches the
 * visual one.
 */

import type { SourceType } from '../data/SourceType';

export type StarPickLeafDraw = {
  source: SourceType;
  drawCount: number;
  firstRecord: Uint32Array;
  recordCount: Uint32Array;
  originRelCamMpc: Float32Array;
  cellScaleMpc: Float32Array;
};
