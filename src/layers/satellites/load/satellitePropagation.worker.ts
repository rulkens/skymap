/**
 * Web-worker entry for SGP4: `init` builds the satrecs once (≈0.1–0.4 s for 20k objects), each
 * `sweep` propagates them all and transfers the result back. It never sweeps on its own; the
 * main thread pulls.
 */
import { parseSatelliteCatalog } from './parseSatelliteCatalog';
import { createSatelliteSweeper } from './createSatelliteSweeper';
import type { SatelliteWorkerRequest } from '../@types/SatelliteWorkerRequest';
import type { SatelliteWorkerReply } from '../@types/SatelliteWorkerReply';

let sweeper: ReturnType<typeof createSatelliteSweeper> | null = null;
const post = (reply: SatelliteWorkerReply, transfer: Transferable[] = []): void =>
  (self as unknown as Worker).postMessage(reply, transfer);

self.onmessage = (event: MessageEvent<SatelliteWorkerRequest>) => {
  const msg = event.data;
  if (msg.kind === 'init') {
    sweeper = createSatelliteSweeper(parseSatelliteCatalog(msg.buffer));
    post({ kind: 'ready' });
    return;
  }
  if (sweeper === null) throw new Error('satellitePropagation: sweep before init');
  const { posKm, velKmS, valid } = sweeper.sweep(msg.simMs);
  post({ kind: 'swept', simMs: msg.simMs, posKm, velKmS, valid }, [
    posKm.buffer,
    velKmS.buffer,
    valid.buffer,
  ]);
};
