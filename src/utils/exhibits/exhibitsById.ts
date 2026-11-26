import type { Exhibit } from '../../@types/exhibits/Exhibit';

/**
 * Exhibit rows keyed by id; the keys are the rows' own ids, so `ExhibitId` follows from the list.
 * Throws on a duplicate exhibit id and on an exhibit with more than one hold-bearing section.
 */
export function exhibitsById<const Rows extends readonly Exhibit[]>(
  exhibits: Rows,
): Readonly<Record<Rows[number]['id'], Exhibit<Rows[number]['id']>>> {
  const byId: Record<string, Exhibit> = {};
  for (const exhibit of exhibits) {
    if (byId[exhibit.id]) throw new Error(`exhibitsById: duplicate exhibit id '${exhibit.id}'`);
    byId[exhibit.id] = exhibit;
    if (exhibit.body.filter((s) => s.kind.hold !== undefined).length > 1)
      throw new Error(`exhibitsById: '${exhibit.id}' has more than one hold-bearing section`);
  }
  // Every key written above is a row's own id, which the loop cannot show the compiler.
  return byId as Record<Rows[number]['id'], Exhibit<Rows[number]['id']>>;
}
