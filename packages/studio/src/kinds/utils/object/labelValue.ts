/** A row label's value with its waypoint subjects read by name, `via Andromeda, point 2 +1`. */
import { formatNameList } from '../../../utils/format/formatNameList';
import { objectText } from './objectText';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { RowLabel } from '../../../@types/rows/RowLabel';

export function labelValue({ value, subjects }: RowLabel, objects: ObjectIndex): string {
  if (subjects === undefined) return value;
  const names = subjects.map((id, i) => (id === null ? `point ${i + 1}` : objectText(id, objects)));
  return `${value} ${formatNameList(names)}`;
}
