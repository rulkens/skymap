import type { FadeIdentity } from '../../@types/animation/FadeIdentity';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { visibilityAddressOf } from './visibilityAddressOf';

/** Every fade identity an entry owns: one per item, or one item-less. */
export function fadeIdentitiesOf(entry: VisibilityEntry): readonly FadeIdentity[] {
  const address = visibilityAddressOf(entry);
  return entry.items === undefined ? [{ address }] : entry.items.map((item) => ({ address, item }));
}
