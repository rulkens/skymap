/** A row's label as one line, `Distance → 300 Mpc`; a bound subject shows by name, `Look-at → Andromeda`, never its resolved number (Q22). */
import { objectText } from '../../kinds/utils/object/objectText';
import { labelValue } from '../../kinds/utils/object/labelValue';
import type { ObjectIndex } from '../../@types/kinds/ObjectIndex';
import type { RowLabel } from '../../@types/rows/RowLabel';

export function formatRowTitle(label: RowLabel, objects: ObjectIndex): string {
  const { name, op, subject, qualifier } = label;
  const shown = subject === undefined ? labelValue(label, objects) : objectText(subject, objects);
  const line = [name, op, shown].filter((part) => part !== '').join(' ');
  return qualifier === undefined ? line : `${line} · ${qualifier}`;
}
