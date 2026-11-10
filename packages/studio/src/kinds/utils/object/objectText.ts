/** What an object field reads: the name of a focus id or selection ref (its id until it is known), or a stored position. */
import { formatPosition } from '../../../utils/format/formatPosition';
import { objectLabel } from './objectLabel';
import { formatSelectionRef } from '../formatSelectionRef';
import { refKey } from '../../../../../../src/utils/selection/refKey';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { SelectionRefBase } from '../../../../../../src/@types/engine/selection/SelectionRefBase';

export function objectText(value: unknown, index: ObjectIndex): string {
  if (Array.isArray(value)) return formatPosition(value as Vec3);
  if (typeof value === 'object' && value !== null) {
    const ref = value as SelectionRefBase;
    return index.refNames[refKey(ref)] ?? formatSelectionRef(ref);
  }
  if (typeof value !== 'string') return 'none';
  return objectLabel(value, index)?.name ?? value;
}
