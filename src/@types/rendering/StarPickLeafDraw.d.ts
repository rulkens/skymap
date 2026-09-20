/** One source's pick draw: compacted flat leaf arrays the pick renderer
 * packs verbatim — the same flat shape `StarNodeStream` carries. */

import type { SourceType } from '../data/SourceType';

export type StarPickLeafDraw = {
  source: SourceType;
  drawCount: number;
  firstRecord: Uint32Array;
  recordCount: Uint32Array;
  originRelCamMpc: Float32Array;
  cellScaleMpc: Float32Array;
};
