import type { StructureStore } from '../../../@types/engine/data/StructureStore';
import type { StructureRecord } from '../../../@types/engine/data/StructureRecord';
import type { StructureGroupId } from '../../../@types/engine/data/StructureGroupId';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';

/**
 * Fixed concatenation order for `all()`. Anchors come before bulk so the
 * merged list matches the historical `poiSubsystem` order, preserving the
 * ring pick-path's per-category instance-index alignment.
 */
const GROUP_ORDER: readonly StructureGroupId[] = ['anchors', 'bulk'];

/**
 * createStructureStore — factory for the structure data store.
 *
 * Same factory + closure shape as the other stores: private group map +
 * two visibility maps, read-only query surface, mutation only through the
 * setters. `all()` recomputes the concatenation on demand rather than
 * caching it — the group set changes rarely (slot commits) and the lists
 * are small (~375 structures total), so a cache would add invalidation
 * complexity for no measurable gain.
 */
export function createStructureStore(): StructureStore {
  const groups = new Map<StructureGroupId, readonly StructureRecord[]>();
  const markerVisibility = new Map<StructureCategory, boolean>();
  const labelVisibility = new Map<StructureCategory, boolean>();

  const all = (): readonly StructureRecord[] => GROUP_ORDER.flatMap((id) => groups.get(id) ?? []);

  return Object.freeze({
    setGroup(id: StructureGroupId, records: readonly StructureRecord[]): void {
      groups.set(id, records.slice());
    },
    clearGroup(id: StructureGroupId): void {
      groups.delete(id);
    },
    all,
    byId(id: string): StructureRecord | null {
      return all().find((r) => r.id === id) ?? null;
    },
    byCategory(category: StructureCategory): readonly StructureRecord[] {
      return all().filter((r) => r.category === category);
    },
    markerVisible(category: StructureCategory): boolean {
      return markerVisibility.get(category) ?? true;
    },
    labelVisible(category: StructureCategory): boolean {
      return labelVisibility.get(category) ?? true;
    },
    setMarkerVisible(category: StructureCategory, visible: boolean): void {
      markerVisibility.set(category, visible);
    },
    setLabelVisible(category: StructureCategory, visible: boolean): void {
      labelVisibility.set(category, visible);
    },
  });
}
