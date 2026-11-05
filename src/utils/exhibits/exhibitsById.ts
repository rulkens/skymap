import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';

/**
 * Exhibit rows keyed by id. Throws on a duplicate exhibit id and on an exhibit with more than one hold-bearing section.
 */
export function exhibitsById(exhibits: readonly Exhibit[]): Readonly<Record<ExhibitId, Exhibit>> {
  const byId: Partial<Record<ExhibitId, Exhibit>> = {};
  for (const exhibit of exhibits) {
    if (byId[exhibit.id]) throw new Error(`exhibitsById: duplicate exhibit id '${exhibit.id}'`);
    byId[exhibit.id] = exhibit;
    if (exhibit.body.filter((s) => s.kind.hold !== undefined).length > 1)
      throw new Error(`exhibitsById: '${exhibit.id}' has more than one hold-bearing section`);
  }
  // A listed id with no row is the featured-tabs test's to catch, not a compile error here.
  return byId as Record<ExhibitId, Exhibit>;
}
