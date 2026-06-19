/**
 * dispatchCatalogLoaded — projects an AssetSlot's just-committed generation
 * into the dataStatus slice as the serializable readiness descriptor. Called
 * from the ONE cloud-commit path (wireGalaxyCatalogSourceSlot's commit), it
 * lets the reconciler + deep-link + tier-reanchor sagas re-resolve refs whose
 * cloud just arrived. We dispatch a NUMBER, never the cloud (intent.md: store
 * the descriptor, never the resource bytes).
 */
import { catalogLoaded } from '../../../state/dataStatus/dataStatusSlice';
import type { AppStore } from '../../../store/types';
import type { SourceType } from '../../../@types/data/SourceType';

export function dispatchCatalogLoaded(
  store: AppStore,
  source: SourceType,
  generation: number,
): void {
  store.dispatch(catalogLoaded({ source, generation }));
}
