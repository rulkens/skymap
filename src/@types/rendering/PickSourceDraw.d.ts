/**
 * PickSourceDraw — one per-source draw record passed to
 * `PickRenderer.pick()`.
 *
 * Multi-survey rendering issues one instanced draw per loaded survey; the
 * picker mirrors that so its packed-identity space lines up with the
 * visual pass.  `cloudBindGroup` carries this source's `@group(1)`
 * (CloudFade) binding — the vertex stage reads `cloud.sourceCode` from
 * it to compose `(sourceCode << 27u) | instance_index`, which `fsPick`
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
   * Underlying `GPUBuffer` of this source's CloudFade uniform (opacity
   * + 5-bit sourceCode).  PickRenderer builds its own per-source
   * `@group(1)` bind group around this buffer using its OWN pipeline's
   * `getBindGroupLayout(1)` — bind groups created against PointRenderer's
   * auto-derived layout are not compatible with PickRenderer's auto-derived
   * layout, even though both pipelines compile from the same WGSL.
   */
  cloudFadeBuffer: GPUBuffer;
};
