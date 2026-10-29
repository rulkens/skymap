/**
 * createSatellitePropagator — owns the SGP4 worker's lifetime and its one-in-flight message loop.
 * The asset slot calls `start` on commit and `stop` on release, which is what keeps the worker
 * alive only while the Layer is active. The worker gets a copy of `satellites.satg`: the main thread
 * keeps its own parsed views for the names and the epoch window.
 */
import { parseSatelliteCatalog } from '../load/parseSatelliteCatalog';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { SatellitePropagator } from '../@types/SatellitePropagator';
import type { SatelliteSweep } from '../@types/SatelliteSweep';
import type { SatelliteWorkerReply } from '../@types/SatelliteWorkerReply';
import type { SatelliteWorkerRequest } from '../@types/SatelliteWorkerRequest';

export function createSatellitePropagator(
  WorkerCtor: new () => Worker,
  onSwept: () => void,
): SatellitePropagator {
  let worker: Worker | null = null;
  let ready = false;
  let inFlight = false;
  let catalog: SatelliteCatalog | null = null;
  let latest: SatelliteSweep | null = null;
  // A release can land while the worker is still building satrecs; the slot's commit awaits
  // `start`, so it must settle then too, or every later commit queues behind it forever.
  let abortStart: ((err: Error) => void) | null = null;

  const send = (msg: SatelliteWorkerRequest, transfer: Transferable[] = []): void =>
    worker?.postMessage(msg, transfer);

  function stop(): void {
    abortStart?.(new Error('satellite propagation stopped before it was ready'));
    abortStart = null;
    worker?.terminate();
    worker = null;
    ready = false;
    inFlight = false;
    catalog = null;
    latest = null;
  }

  return {
    start(file) {
      stop();
      const cat = parseSatelliteCatalog(file);
      const w = new WorkerCtor();
      worker = w;
      catalog = cat;
      return new Promise((resolve, reject) => {
        abortStart = reject;
        w.onerror = (event) => {
          const err =
            event.error ?? new Error(event.message || 'satellite propagation worker error');
          if (worker === w) stop();
          reject(err);
        };
        w.onmessage = (event: MessageEvent<SatelliteWorkerReply>) => {
          if (worker !== w) return;
          const reply = event.data;
          if (reply.kind === 'ready') {
            abortStart = null;
            ready = true;
            resolve();
            return;
          }
          inFlight = false;
          const { simMs, posKm, velKmS, valid } = reply;
          latest = { simMs, posKm, velKmS, valid };
          onSwept();
        };
        const buffer = file.slice(0);
        send({ kind: 'init', buffer }, [buffer]);
      });
    },
    stop,
    catalog: () => catalog,
    latest: () => latest,
    request(simMs) {
      if (!ready || inFlight) return;
      inFlight = true;
      send({ kind: 'sweep', simMs });
    },
  };
}
