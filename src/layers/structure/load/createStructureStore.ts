import type { StructureStore } from '../@types/StructureStore';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { StructureGroupId } from '../@types/StructureGroupId';
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
 * Per-category marker/label visibility is NOT held here — core hands the
 * producers a per-category value. The merged list, per-category lists and per-category id
 * index are derived once per `setGroup`/`clearGroup`: `categoryIndexOf` runs
 * once per label per frame, so rebuilding on each call was O(N²) allocation.
 */
export function createStructureStore(): StructureStore {
  const groups = new Map<StructureGroupId, readonly StructureInfo[]>();

  const build = () => {
    const all: readonly StructureInfo[] = GROUP_ORDER.flatMap((id) => groups.get(id) ?? []);
    const byCategory = new Map<StructureId, StructureInfo[]>();
    const indexInCategory = new Map<StructureId, Map<string, number>>();
    for (const r of all) {
      let list = byCategory.get(r.category);
      if (!list) byCategory.set(r.category, (list = []));
      let index = indexInCategory.get(r.category);
      if (!index) indexInCategory.set(r.category, (index = new Map()));
      // First occurrence wins, matching findIndex.
      if (!index.has(r.id)) index.set(r.id, list.length);
      list.push(r);
    }
    return { all, byCategory, indexInCategory };
  };
  let derived: ReturnType<typeof build> | null = null;
  const derive = () => (derived ??= build());
  const all = (): readonly StructureInfo[] => derive().all;
  const byCategory = (category: StructureId): readonly StructureInfo[] =>
    derive().byCategory.get(category) ?? [];

  return Object.freeze({
    setGroup(id: StructureGroupId, records: readonly StructureInfo[]): void {
      groups.set(id, records.slice());
      derived = null;
    },
    clearGroup(id: StructureGroupId): void {
      groups.delete(id);
      derived = null;
    },
    all,
    byId(id: string): StructureInfo | null {
      return all().find((r) => r.id === id) ?? null;
    },
    byCategory,
    // Position within byCategory(cat): the ring pick-index and a structure's
    // own label pick-id must both agree on it.
    categoryIndexOf(category: StructureId, id: string): number {
      return derive().indexInCategory.get(category)?.get(id) ?? -1;
    },
  });
}
