import { describe, expect, it } from 'vitest';
import { reduceLoadState } from '../../../src/services/loading/reduceLoadState';
import type { LoadEvent } from '../../../src/@types/loading/LoadEvent';
import type { LoadState } from '../../../src/@types/loading/LoadState';

const idle: LoadState<unknown> = { kind: 'idle' };
const ready = (value: unknown): LoadState<unknown> => ({
  kind: 'ready',
  req: { x: 1 },
  value,
  loadedAtMs: 1000,
});

describe('reduceLoadState', () => {
  it('idle + load-started → loading at attempt 0', () => {
    const out = reduceLoadState(idle, { kind: 'load-started', req: { x: 1 } });
    expect(out).toEqual({ kind: 'loading', req: { x: 1 }, loaded: 0, total: 0, attempt: 0 });
  });

  it('ready + load-started → loading at attempt 0 with new req (replaces ready)', () => {
    const out = reduceLoadState(ready('A'), { kind: 'load-started', req: { x: 2 } });
    expect(out.kind).toBe('loading');
    if (out.kind === 'loading') {
      expect(out.req).toEqual({ x: 2 });
      expect(out.attempt).toBe(0);
    }
  });

  it('loading + bytes updates loaded/total', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'bytes', loaded: 50, total: 100 });
    expect(out).toEqual({ kind: 'loading', req: 'x', loaded: 50, total: 100, attempt: 0 });
  });

  it('loading + bytes never lets total shrink', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'bytes', loaded: 10, total: 0 });
    if (out.kind === 'loading') expect(out.total).toBe(100);
  });

  it('loading + retry-scheduled bumps attempt', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'retry-scheduled', attempt: 1 });
    if (out.kind === 'loading') expect(out.attempt).toBe(1);
  });

  it('loading + fetch-succeeded → keeps loading shape (slot then issues committing)', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 100, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'fetch-succeeded' });
    expect(out.kind).toBe('loading');
  });

  it('loading + committing → committing', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 100, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'committing' });
    expect(out).toEqual({ kind: 'committing', req: 'x' });
  });

  it('committing + committed → ready with value and timestamp', () => {
    const start: LoadState<unknown> = { kind: 'committing', req: 'x' };
    const out = reduceLoadState(start, { kind: 'committed', value: { v: 1 }, nowMs: 12345 });
    expect(out).toEqual({ kind: 'ready', req: 'x', value: { v: 1 }, loadedAtMs: 12345 });
  });

  it('loading + gave-up → error', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 0, attempt: 2 };
    const err = new Error('boom');
    const out = reduceLoadState(start, { kind: 'gave-up', error: err, attempt: 2 });
    expect(out).toEqual({ kind: 'error', req: 'x', error: err, finalAttempt: 2 });
  });

  it('idle + bytes is a no-op (defensive — bytes events from a stale fetch)', () => {
    const out = reduceLoadState(idle, { kind: 'bytes', loaded: 5, total: 10 });
    expect(out).toEqual(idle);
  });

  it('ready + bytes is a no-op', () => {
    const start = ready('A');
    const out = reduceLoadState(start, { kind: 'bytes', loaded: 5, total: 10 });
    expect(out).toBe(start);
  });
});
