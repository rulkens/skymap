/**
 * dispatchCatalogLoaded — emits the `catalogLoaded` event for a source whose
 * cloud just committed to the GPU. Called from the one cloud-commit path; it
 * lets the reconciler, deep-link, and tier-reanchor sagas re-resolve refs whose
 * cloud just arrived. A pure signal — it carries the source, never the cloud
 * bytes (intent.md: emit a descriptor, never the resource).
 */
import { catalogLoaded } from '../../../state/catalog/catalogLoaded';
import type { AppStore } from '../../../store/types';
import type { SourceType } from '../../../@types/data/SourceType';

export function dispatchCatalogLoaded(store: AppStore, source: SourceType): void {
  store.dispatch(catalogLoaded({ source }));
}
