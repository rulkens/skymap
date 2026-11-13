/**
 * Worker entry for the catalog decode: ~900k rows of trig take ~150 ms on a fast desktop and several
 * times that on a phone, which would stall the frame loop the moment the Layer turns on. The file
 * comes in transferred and every decoded column goes back transferred (`runDisposableWorker`); the
 * per-class H columns, one level down, are copied.
 */
import { parseAsteroidCatalog } from './parseAsteroidCatalog';

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  const catalog = parseAsteroidCatalog(event.data);
  const buffers = new Set<ArrayBuffer>();
  for (const value of Object.values(catalog)) {
    if (ArrayBuffer.isView(value)) buffers.add(value.buffer as ArrayBuffer);
  }
  (self as unknown as Worker).postMessage(catalog, [...buffers]);
};
