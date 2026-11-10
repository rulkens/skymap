/** A row's label as one line, `Distance → 300 Mpc`; a bound subject shows by name, `Look-at → Andromeda`, never its resolved number (Q22). */
import { objectText } from '../../kinds/utils/object/objectText';
import type { ObjectIndex } from '../../@types/kinds/ObjectIndex';
import type { RowLabel } from '../../@types/rows/RowLabel';

export function formatRowTitle(
  { name, op, value, subject, qualifier }: RowLabel,
  objects: ObjectIndex,
): string {
  const shown = subject === undefined ? value : objectText(subject, objects);
  const line = [name, op, shown].filter((part) => part !== '').join(' ');
  return qualifier === undefined ? line : `${line} · ${qualifier}`;
}
