import { describe, expect, it, vi } from 'vitest';
import { createSatellitePropagator } from '../../../../src/layers/satellites/subsystems/createSatellitePropagator';
import { writeSatelliteCatalog } from '../../../../tools/utils/io/writeSatelliteCatalog';
import type { SatelliteWorkerReply } from '../../../../src/layers/satellites/@types/SatelliteWorkerReply';
import type { SatelliteWorkerRequest } from '../../../../src/layers/satellites/@types/SatelliteWorkerRequest';

// A stand-in Worker that records what it was sent and replies only when the test says so.
class FakeWorker {
  static last: FakeWorker;
  sent: SatelliteWorkerRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<SatelliteWorkerReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(msg: SatelliteWorkerRequest): void {
    this.sent.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: SatelliteWorkerReply): void {
    this.onmessage?.({ data } as MessageEvent<SatelliteWorkerReply>);
  }
}

const empty = new Float64Array(0);
const FILE = writeSatelliteCatalog({
  fetchedAtMs: 0,
  noradId: new Uint32Array(0),
  classCode: new Uint8Array(0),
  epochMs: empty,
  meanMotion: empty,
  eccentricity: empty,
  inclinationDeg: empty,
  raanDeg: empty,
  argPericenterDeg: empty,
  meanAnomalyDeg: empty,
  bstar: empty,
  meanMotionDot: empty,
  meanMotionDdot: empty,
  names: [],
  cosparIds: [],
}).buffer as ArrayBuffer;
const swept = (simMs: number): SatelliteWorkerReply => ({
  kind: 'swept',
  simMs,
  posKm: new Float32Array(0),
  velKmS: new Float32Array(0),
  valid: new Uint8Array(0),
});
const make = (onSwept = vi.fn()) =>
  createSatellitePropagator(FakeWorker as unknown as new () => Worker, onSwept);

describe('createSatellitePropagator', () => {
  it('keeps at most one sweep in flight and wakes the frame when one lands', async () => {
    const onSwept = vi.fn();
    const propagator = make(onSwept);
    const started = propagator.start(FILE);
    const worker = FakeWorker.last;
    propagator.request(1); // before ready: dropped
    worker.reply({ kind: 'ready', count: 0 });
    await started;
    propagator.request(2);
    propagator.request(3); // one already in flight: dropped
    expect(worker.sent.map((m) => m.kind)).toEqual(['init', 'sweep']);
    worker.reply(swept(2));
    expect(propagator.latest()).toMatchObject({ simMs: 2 });
    expect(onSwept).toHaveBeenCalledOnce();
    propagator.request(4);
    expect(worker.sent.at(-1)).toEqual({ kind: 'sweep', simMs: 4 });
  });

  it('terminates the worker and forgets its data on stop', async () => {
    const propagator = make();
    const started = propagator.start(FILE);
    const worker = FakeWorker.last;
    worker.reply({ kind: 'ready', count: 0 });
    await started;
    propagator.stop();
    expect(worker.terminated).toBe(true);
    expect(propagator.catalog()).toBeNull();
    propagator.request(5);
    expect(worker.sent.map((m) => m.kind)).toEqual(['init']);
  });

  it('settles a start that a release interrupts, so the slot never hangs', async () => {
    const propagator = make();
    const started = propagator.start(FILE);
    propagator.stop();
    await expect(started).rejects.toThrow(/stopped before it was ready/);
  });

  it('ignores a reply from a worker it has already replaced', async () => {
    const propagator = make();
    void propagator.start(FILE).catch(() => undefined);
    const stale = FakeWorker.last;
    const started = propagator.start(FILE);
    FakeWorker.last.reply({ kind: 'ready', count: 0 });
    await started;
    stale.reply(swept(9));
    expect(propagator.latest()).toBeNull();
  });
});
