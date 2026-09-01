import type { StructureStore } from '../../../@types/engine/data/StructureStore';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { StructureGroupId } from '../../../@types/data/structure/StructureGroupId';
import type { StructureId } from '../../../@types/data/structure/StructureId';

/**
 * Fixed concatenation order for `all()`. Anchors come before bulk so the
 * merged list matches the order the ring pick-index decode contract requires,
 * preserving the pick-path's per-category instance-index alignment.
 */
const GROUP_ORDER: readonly StructureGroupId[] = ['anchors', 'bulk'];

/**
 * createStructureStore — factory for the structure data store.
 *
 * Same factory + closure shape as the other stores: a private group map and a
 * read-only query surface, mutation only through `setGroup`/`clearGroup`.
 * Per-category marker/label visibility is NOT held here — it lives in the
 * FadeRegistry (structure/labelLayer handles), the same animated opacity the
 * rings fade through. `all()` recomputes the concatenation on demand rather
 * than caching it — the group set changes rarely (slot commits) and the lists
 * are small (~375 structures total), so a cache would add invalidation
 * complexity for no measurable gain.
 */
export function createStructureStore(): StructureStore {
  const groups = new Map<StructureGroupId, readonly StructureInfo[]>();

  const all = (): readonly StructureInfo[] => GROUP_ORDER.flatMap((id) => groups.get(id) ?? []);
  const byCategory = (category: StructureId): readonly StructureInfo[] =>
    all().filter((r) => r.category === category);

  return Object.freeze({
    setGroup(id: StructureGroupId, records: readonly StructureInfo[]): void {
      groups.set(id, records.slice());
    },
    clearGroup(id: StructureGroupId): void {
      groups.delete(id);
    },
    all,
    byId(id: string): StructureInfo | null {
      return all().find((r) => r.id === id) ?? null;
    },
    byCategory,
    // Built from `byCategory` itself so it can't drift from it — the single
    // source for "position within byCategory(cat)" the ring pick-index and a
    // structure's own label pick-id must both agree on.
    categoryIndexOf(category: StructureId, id: string): number {
      return byCategory(category).findIndex((r) => r.id === id);
    },
  });
}
