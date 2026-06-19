// src/@types/engine/SelectionRow.d.ts
import type { GalaxyRow } from './GalaxyRow';
import type { StructureInfo } from '../data/structure/StructureInfo';

/**
 * SelectionRow — the serializable DISPLAY projection of a selected thing, held
 * in the saga-owned `selectionRows` derived cache. The galaxy arm is the small
 * `GalaxyRow` (built React-side into a `GalaxyInfo` by `buildFocusable`); the
 * structure arm is the already-serializable `StructureInfo` record used as-is;
 * the Milky Way is the singleton tag.
 *
 * Every arm is JSON-serializable (`GalaxyRow.objId` is a string,
 * `StructureInfo` is a plain record), so the RTK serializability check stays on.
 */
export type SelectionRow = GalaxyRow | StructureInfo | { readonly type: 'milkyWay' };
