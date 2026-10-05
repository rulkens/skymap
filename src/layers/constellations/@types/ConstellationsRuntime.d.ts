/**
 * The constellations family's whole runtime: the renderer and the slot that
 * commits into it. Non-null throughout — `create` builds both before
 * returning, which is what lets the pass and the caption producer read the
 * renderer/slot without a null check.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { ConstellationRenderer } from '../../../@types/rendering/ConstellationRenderer';

export type ConstellationsRuntime = {
  readonly renderer: ConstellationRenderer;
  readonly slot: AssetSlot<ConstellationsArtifact, void>;
};
