import type { CatalogPreview } from '../../../@types/catalog/import/CatalogPreview';
import type { CatalogRead } from '../../../@types/catalog/import/CatalogRead';
import type { CatalogWorkerClient } from '../../../@types/catalog/worker/CatalogWorkerClient';
import type { CatalogWorkerTransport } from '../../../@types/catalog/worker/CatalogWorkerTransport';

/**
 * createCatalogWorkerClient — the page's side of the catalog worker protocol.
 * The worker starts at the first read, not before. One read and one derive are
 * awaited at a time: a newer request resolves the one it supersedes with null,
 * and a late answer to it is dropped by id.
 */
export function createCatalogWorkerClient(
  createTransport: () => CatalogWorkerTransport,
): CatalogWorkerClient {
  let transport: CatalogWorkerTransport | null = null;
  let nextId = 0;
  let readId = 0;
  let settleRead: ((read: CatalogRead | null) => void) | null = null;
  let deriveId = 0;
  let settleDerive: ((preview: CatalogPreview | null) => void) | null = null;

  const settleReading = (read: CatalogRead | null): void => {
    const settle = settleRead;
    settleRead = null;
    settle?.(read);
  };
  const settleDeriving = (preview: CatalogPreview | null): void => {
    const settle = settleDerive;
    settleDerive = null;
    settle?.(preview);
  };

  const connect = (): CatalogWorkerTransport => {
    if (transport) return transport;
    const created = createTransport();
    created.listen((response) => {
      if (response.kind === 'derived') {
        if (response.id === deriveId) settleDeriving(response.preview);
        return;
      }
      if (response.id !== readId) return;
      if (response.problem === null) return settleReading({ kind: 'held' });
      settleReading({ kind: 'problem', message: response.problem });
      settleDeriving(null); // nothing is held, so a waiting derive would never be answered
    });
    transport = created;
    return created;
  };

  return {
    read(files) {
      settleReading(null);
      settleDeriving(null);
      readId = ++nextId;
      connect().post({ kind: 'read', id: readId, files });
      return new Promise((settle) => (settleRead = settle));
    },
    derive(settings, autoFitPercent) {
      settleDeriving(null);
      deriveId = ++nextId;
      connect().post({ kind: 'derive', id: deriveId, settings, autoFitPercent });
      return new Promise((settle) => (settleDerive = settle));
    },
    drop() {
      settleReading(null);
      settleDeriving(null);
      transport?.post({ kind: 'drop' });
    },
    dispose() {
      settleReading(null);
      settleDeriving(null);
      transport?.terminate();
      transport = null;
    },
  };
}
