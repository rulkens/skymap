import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';
import type { ExhibitSectionKind } from '../../@types/exhibits/ExhibitSectionKind';

/**
 * Exhibit rows keyed by id. Throws on a duplicate exhibit id, on two kinds sharing an id (React
 * keys and the shortcut walk read it), and on an exhibit with more than one hold-bearing section.
 */
export function exhibitsById(exhibits: readonly Exhibit[]): Readonly<Record<ExhibitId, Exhibit>> {
  const byId: Partial<Record<ExhibitId, Exhibit>> = {};
  const kinds = new Map<string, ExhibitSectionKind<unknown>>();
  for (const exhibit of exhibits) {
    if (byId[exhibit.id]) throw new Error(`exhibitsById: duplicate exhibit id '${exhibit.id}'`);
    byId[exhibit.id] = exhibit;
    for (const { kind } of exhibit.body) {
      if ((kinds.get(kind.id) ?? kind) !== kind)
        throw new Error(`exhibitsById: two section kinds share the id '${kind.id}'`);
      kinds.set(kind.id, kind);
    }
    if (exhibit.body.filter((s) => s.kind.hold !== undefined).length > 1)
      throw new Error(`exhibitsById: '${exhibit.id}' has more than one hold-bearing section`);
  }
  // A listed id with no row is the featured-tabs test's to catch, not a compile error here.
  return byId as Record<ExhibitId, Exhibit>;
}
