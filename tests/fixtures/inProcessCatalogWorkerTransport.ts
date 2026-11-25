import type { CatalogWorkerTransport } from '../../tools/mcpm-workbench/@types/CatalogWorkerTransport';
import { createCatalogWorkerHandler } from '../../tools/mcpm-workbench/src/catalogWorker/createCatalogWorkerHandler';

/**
 * The catalog worker's handler run in-process, both directions a microtask
 * apart as a real Worker's messages are, so tests need no Worker. Needs a File
 * with `stream()`: Node's own, not jsdom's.
 */
export function inProcessCatalogWorkerTransport(): CatalogWorkerTransport {
  let live = true;
  let deliver: Parameters<CatalogWorkerTransport['listen']>[0] = () => {};
  const handle = createCatalogWorkerHandler((response) =>
    queueMicrotask(() => live && deliver(response)),
  );
  return {
    post: (request) => queueMicrotask(() => live && handle(request)),
    listen: (onResponse) => (deliver = onResponse),
    terminate: () => (live = false),
  };
}
