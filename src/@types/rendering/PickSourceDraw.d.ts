/**
 * PickSourceDraw — one per-source draw record passed to
 * `PickRenderer.pick()`.
 *
 * Multi-survey rendering issues one instanced draw per loaded survey; the
 * picker mirrors that so its packed-identity space lines up with the
 * visual pass.  `sourceBuffer` carries this source's SourceUniforms
 * GPU buffer — the vertex stage reads `source.sourceCode` from it to
 * compose `(sourceCode << 27u) | instance_index`, which `fsPick`
 * writes into the pick texture (with a +1 sentinel).
 *
 * The `source` field is mostly ceremonial — picker drives all real
 * decoding from the packed value the GPU writes — but it lets the
 * caller filter by visibility mask before handing the iterable to
 * `pick()`.
 */

import type { Source } from '../../data/sources';

export type PickSourceDraw = {
  source: Source;
  vertexBuffer: GPUBuffer;
  count: number;
  /**
   * The per-source SourceUniforms GPU buffer (was `cloudFadeBuffer`
   * pre-unified-fade). PickRenderer builds its own bind group against
   * the canonical sourceUniformsBgl layout to bind this buffer at
   * @group(2). Per-source identity (the 5-bit sourceCode) flows from
   * here into the picker's packed (sourceCode << 27 | instanceIdx)
   * output.
   */
  sourceBuffer: GPUBuffer;
};
