import type { CatalogWorkerRequest } from './CatalogWorkerRequest';
import type { CatalogWorkerResponse } from './CatalogWorkerResponse';

/** CatalogWorkerTransport — the channel to the catalog worker: a real Worker, or the handler in-process. */
export type CatalogWorkerTransport = {
  readonly post: (request: CatalogWorkerRequest) => void;
  readonly listen: (onResponse: (response: CatalogWorkerResponse) => void) => void;
  readonly terminate: () => void;
};
