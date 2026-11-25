/**
 * Worker entry for the load dialog: reading and deriving a catalog of millions
 * of rows takes seconds, which on the main thread froze the page once per
 * settings change. The protocol lives in createCatalogWorkerHandler.
 */
import type { CatalogWorkerRequest } from '../../@types/CatalogWorkerRequest';
import { createCatalogWorkerHandler } from './createCatalogWorkerHandler';

const scope = self as unknown as Worker;
const handle = createCatalogWorkerHandler((response, transfer) =>
  scope.postMessage(response, transfer),
);
scope.onmessage = (event: MessageEvent<CatalogWorkerRequest>) => handle(event.data);
