import type { CatalogWorkerResponse } from '../../../@types/catalog/worker/CatalogWorkerResponse';
import type { CatalogWorkerTransport } from '../../../@types/catalog/worker/CatalogWorkerTransport';
// jsdom tests cannot resolve `?worker`; they mock this module with the handler in-process.
import CatalogWorker from './catalogWorker.worker?worker';

/** createCatalogWorkerTransport — a fresh catalog worker behind the transport shape. */
export function createCatalogWorkerTransport(): CatalogWorkerTransport {
  const worker = new CatalogWorker();
  return {
    post: (request) => worker.postMessage(request),
    listen: (onResponse) => {
      worker.onmessage = (event: MessageEvent<CatalogWorkerResponse>) => onResponse(event.data);
    },
    terminate: () => worker.terminate(),
  };
}
