import { describe, expect, it } from 'vitest';
import { asteroidsSearch } from '../../../../src/layers/asteroids/focus/present/asteroidsSearch';
import type { AsteroidsRuntime } from '../../../../src/layers/asteroids/@types/AsteroidsRuntime';
import { loadedAsteroids } from '../fixtures/loadedAsteroids';

describe('asteroidsSearch', () => {
  it('search yields named rows only and skips the meshed numbers', async () => {
    const loaded = loadedAsteroids();
    const runtime = { slot: { current: () => loaded } } as unknown as AsteroidsRuntime;
    const feed = asteroidsSearch(runtime)[Symbol.asyncIterator]();
    const { value } = await feed.next();
    expect(value).toEqual([
      { id: 'asteroid-2', class: 'catalog', names: ['(2) Pallas', 'Pallas'], chip: 'Asteroid' },
      { id: 'asteroid-5', class: 'catalog', names: ['(5) Astraea', 'Astraea'], chip: 'Asteroid' },
    ]);
  });

  it('ends without rows, and drops its listener, when the slot is released before loading', async () => {
    const listeners = new Set<(state: { kind: string }) => void>();
    const runtime = {
      slot: {
        current: () => null,
        subscribe: (fn: (state: { kind: string }) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      },
    } as unknown as AsteroidsRuntime;
    const pending = asteroidsSearch(runtime)[Symbol.asyncIterator]().next();
    listeners.forEach((fn) => fn({ kind: 'idle' }));
    expect((await pending).done).toBe(true);
    expect(listeners.size).toBe(0);
  });
});
