/**
 * The Local Bubble shell family's whole runtime: the renderer and the slot
 * that commits into it. Non-null throughout — `create` builds both before
 * returning, which is what lets the pass and the fade guard read the
 * renderer without a null check.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import type { LocalBubbleRenderer } from '../../../@types/rendering/LocalBubbleRenderer';

export type LocalBubbleRuntime = {
  readonly renderer: LocalBubbleRenderer;
  readonly slot: AssetSlot<ShellMesh, void>;
};
