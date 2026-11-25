import type { CatalogSource } from '../../@types/CatalogSource';
import type { CatalogWorkerRequest } from '../../@types/CatalogWorkerRequest';
import type { CatalogWorkerResponse } from '../../@types/CatalogWorkerResponse';
import { previewCatalog } from './previewCatalog';
import { readCatalogSource } from './readCatalogSource';

/**
 * createCatalogWorkerHandler — the catalog worker's side of the protocol, free
 * of `self` so tests run it in-process. Latest wins: a read or drop forgets the
 * held files and any waiting derive, and a stale read finishing late is ignored;
 * derives wait for their read and coalesce, so only the newest one runs. The
 * stored arrays leave as transferables: the worker keeps no copy of a preview.
 */
export function createCatalogWorkerHandler(
  post: (response: CatalogWorkerResponse, transfer: Transferable[]) => void,
): (request: CatalogWorkerRequest) => void {
  let generation = 0;
  let source: CatalogSource | null = null;
  let pending: Extract<CatalogWorkerRequest, { kind: 'derive' }> | null = null;
  let scheduled = false;

  // A timeout, not a microtask, so derives already queued behind this one land first.
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (!source || !pending) return;
      const { id, settings, autoFitPercent } = pending;
      pending = null;
      const preview = previewCatalog(source, settings, autoFitPercent);
      const catalog = preview.outcome.kind === 'problem' ? null : preview.outcome.catalog;
      const transfer = catalog
        ? [catalog.points.positions.buffer, catalog.points.weight.buffer]
        : [];
      post({ kind: 'derived', id, preview }, transfer);
    }, 0);
  };

  return (request) => {
    if (request.kind === 'derive') {
      pending = request;
      schedule();
      return;
    }
    const mine = ++generation;
    source = null;
    pending = null;
    if (request.kind === 'drop') return;
    const current = (): boolean => generation === mine;
    readCatalogSource(request.files, current).then(
      (read) => {
        if (!current() || !read) return;
        source = read;
        post({ kind: 'read', id: request.id, problem: null }, []);
        schedule();
      },
      (err: unknown) => {
        if (current()) post({ kind: 'read', id: request.id, problem: (err as Error).message }, []);
      },
    );
  };
}
