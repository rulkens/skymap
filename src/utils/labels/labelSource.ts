/** labelSource — identity, so a Layer's source row infers its `Item` from `items`. */

import type { LabelSource } from '../../@types/engine/layer/LabelSource';

export function labelSource<Item>(row: LabelSource<Item>): LabelSource<Item> {
  return row;
}
