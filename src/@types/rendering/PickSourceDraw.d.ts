/**
 * PickSourceDraw — one per-source draw record passed to
 * `GalaxyPickRenderer.drawPoints()`.
 *
 * Multi-galaxy catalog rendering issues one instanced draw per loaded galaxy catalog; the
 * picker mirrors that so its packed-identity space lines up with the
 * visual pass.  `sourceBuffer` carries this source's SourceUniforms
 * GPU buffer — the vertex stage reads `source.sourceCode` from it to
 * compose `(sourceCode << 27u) | instance_index`, which `fsPick`
 * writes into the pick texture (with a +1 sentinel).
 *
 * The `source` field is mostly ceremonial — picker drives all real
 * decoding from the packed value the GPU writes — but it lets the
 * caller filter by visibility mask before handing the records to
 * `drawPoints()`.
 */

import type { SourceType } from '../data/SourceType';

export type PickSourceDraw = {
  source: SourceType;
  vertexBuffer: GPUBuffer;
  count: number;
  /**
   * The per-source SourceUniforms GPU buffer. GalaxyPickRenderer builds its
   * own bind group against the canonical sourceUniformsBgl layout to
   * bind this buffer at @group(2). Per-source identity (the 5-bit
   * sourceCode) flows from here into the picker's packed
   * (sourceCode << 27 | instanceIdx) output.
   */
  sourceBuffer: GPUBuffer;
};
