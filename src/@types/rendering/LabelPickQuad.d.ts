/**
 * LabelPickQuad — one label's clickable screen rectangle plus the identity it
 * stamps. `packedId` is `packSelection(sourceCode, localIdx +
 * PICK_SENTINEL_OFFSET)`, byte-identical to what the subject's own geometry
 * pick writes, so a label click resolves through the existing `resolvePick`
 * arms unchanged.
 */

import type { ScreenRectPx } from './ScreenRectPx';

export type LabelPickQuad = {
  readonly rect: ScreenRectPx;
  readonly packedId: number;
};
