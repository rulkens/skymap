import type { EngineCallbacks } from '../EngineCallbacks';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { StructureRecord } from '../data/StructureRecord';

/**
 * Hooks the subsystem needs from the outside world.  All passed once
 * at construction; the cloud / sidecar accessors are CLOSURES (not
 * values) so the subsystem reads the live state at call time — see
 * the module header for why that matters.
 */
export type CreateSelectionSubsystemInput = {
  /** UI-callback sink — only `onHoverChange` / `onSelectChange` are read. */
  cb: EngineCallbacks;
  /** Live read of source catalogs; closure rather than snapshot so tier swaps land. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Live read of the famous-galaxy meta sidecar (curated names + thumbnail IDs). */
  getFamousMeta: () => readonly FamousMetaEntry[];
  /**
   * Live read of the structure table.  Closure (not snapshot) so a
   * tier swap that replaces the structure list lands in subsequent
   * lookups without re-binding.  Returns null for unknown ids — the
   * subsystem treats that as "no structure to expand" and fires the
   * callback with null.
   */
  getStructure: (id: string) => StructureRecord | null;
  /**
   * Wake the render loop one frame. setSelected/setFocused call this on
   * actual change; setHovered does not (see the module header's wake contract).
   */
  requestRender: () => void;
};
