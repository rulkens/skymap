/** What an object field reads: the object's name for a focus id (the id until the index holds it), or a stored position. */
import { formatPosition } from '../../../utils/format/formatPosition';
import { objectLabel } from './objectLabel';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';

export function objectText(value: unknown, index: ObjectIndex): string {
  if (Array.isArray(value)) return formatPosition(value as Vec3);
  if (typeof value !== 'string') return 'none';
  return objectLabel(value, index)?.name ?? value;
}
