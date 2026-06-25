/**
 * focusReady — is the focus target's data loaded and resolvable?
 *
 * The tour saga must not start flying to a focus target if the underlying
 * data is not yet available — a galaxy cloud might still be loading, or a
 * structure catalog might not be seeded yet. This predicate answers "can the
 * saga safely call extractSelectionRow right now?".
 *
 * ### Logic
 *
 *   - `ref === null`: a narration beat has no focus target; it is trivially ready.
 *   - structure / milkyWay refs: these resolve against already-serializable
 *     in-memory data (`deps.structures.byId` / the singleton tag). They are
 *     always immediately ready.
 *   - galaxyCatalog refs: `extractSelectionRow` returns null if the cloud for
 *     the ref's source has not yet loaded (`deps.catalogs.get(source)` returns
 *     undefined). A null return signals "not ready" — `focusReady` surfaces
 *     that as false so the saga polls until the cloud arrives.
 *
 * This is consumed by `waitUntil(() => focusReady(beat.focus, resolveDeps()))`
 * in `visitBeatSaga`, which polls every POLL_MS milliseconds. The poll is cheap —
 * `extractSelectionRow` touches only the in-memory catalog map, not the GPU or
 * disk.
 */

import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';

/**
 * Returns true when the focus target for a beat is resolvable with the
 * current engine state. A null ref (narration beat) is always ready.
 * A galaxy ref is ready only once its source cloud has loaded.
 */
export function focusReady(ref: SelectionRef | null, deps: ResolveDeps): boolean {
  if (ref === null) return true;
  return extractSelectionRow(ref, deps) !== null;
}
