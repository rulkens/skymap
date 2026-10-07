import type { ObjectRow } from '../@types/ObjectRow';
import type { ObjectSection } from '../@types/ObjectSection';
import type { ObjectSubList } from '../@types/ObjectSubList';
import { objectLetter } from './objectLetter';

/** A section's rows cut into its smaller lists, in the order the rows come; one unnamed list when the section is not cut. */
export function objectSubLists(
  section: ObjectSection,
  rows: readonly ObjectRow[],
): ObjectSubList[] {
  const lists: ObjectSubList[] = [];
  for (const row of rows) {
    const label =
      section.split === 'parent'
        ? row.parent
        : section.split === 'letter'
          ? objectLetter(row.name)
          : undefined;
    const list = lists.find((candidate) => candidate.label === label);
    if (list) list.rows.push(row);
    else lists.push({ label, rows: [row] });
  }
  return lists;
}
