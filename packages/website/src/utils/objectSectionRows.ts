import type { ObjectRow } from '../@types/ObjectRow';
import type { ObjectSection } from '../@types/ObjectSection';

/** The rows a section of the object catalogue lists: those of its kinds, in the catalogue's order. */
export function objectSectionRows(section: ObjectSection, rows: readonly ObjectRow[]): ObjectRow[] {
  return rows.filter((row) => section.kinds.includes(row.kind));
}
