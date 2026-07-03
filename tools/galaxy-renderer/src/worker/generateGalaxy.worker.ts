/**
 * Web-worker entry point for `generateGalaxy` — a straight port of the
 * spike's `galaxy-worker.js` (17 lines): receive `{ id, params }`, run the
 * (heavy — hundreds of thousands of interleaved-buffer writes) generator off
 * the main thread, and post the result back as transferable buffers so the
 * caller's thread never blocks while a galaxy is being generated.
 *
 * `stars`/`dust` are sliced to tight, standalone buffers before the
 * transfer rather than transferring `generateGalaxy`'s own return arrays
 * directly. `GeneratedGalaxy.stars` is `ctx.stars.view()` — a zero-copy
 * *subarray* of `StarWriter`'s pre-sized (over-allocated, see its docblock)
 * scratch buffer — so transferring its `.buffer` verbatim would (a) hand the
 * caller the whole backing array, headroom included, well past what
 * `starCount` says was written, and (b) detach that backing array out from
 * under the writer, which is meant to be scratch space local to this one
 * generation call. `slice()` copies out exactly the filled region into its
 * own `ArrayBuffer` first, so the transfer carries only live bytes and never
 * touches the generator's internals. `dust` is already a tight copy
 * (`DustWriter.toFloat32Array()`), but is sliced too for the same verbatim
 * shape as the spike's worker — one uniform "always transfer a tight copy"
 * rule, not a per-field special case.
 *
 * The `id` round-trips unchanged: the caller (plan 02's engine) tags each
 * request so multiple in-flight generations — e.g. a user dragging a slider
 * faster than a single generation completes — can be routed back to the
 * right resolver.
 */
import { generateGalaxy } from '../model/generateGalaxy';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';

/** Request message: `params` to generate, tagged with the caller's request id. */
export type GenerateGalaxyWorkerRequest = {
  readonly id: number;
  readonly params: GalaxyParams;
};

/** Response message: the generated buffers, tagged with the request's id. */
export type GenerateGalaxyWorkerResponse = {
  readonly id: number;
  readonly stars: Float32Array;
  readonly starCount: number;
  readonly dust: Float32Array;
  readonly dustCount: number;
};

self.onmessage = (event: MessageEvent<GenerateGalaxyWorkerRequest>) => {
  const { id, params } = event.data;
  const galaxy = generateGalaxy(params);

  const stars = galaxy.stars.slice();
  const dust = galaxy.dust.length ? galaxy.dust.slice() : new Float32Array(0);

  const response: GenerateGalaxyWorkerResponse = {
    id,
    stars,
    starCount: galaxy.starCount,
    dust,
    dustCount: galaxy.dustCount,
  };
  (self as unknown as Worker).postMessage(response, [stars.buffer, dust.buffer]);
};
