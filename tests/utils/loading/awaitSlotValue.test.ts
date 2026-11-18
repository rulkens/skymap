import { describe, expect, it, vi } from 'vitest';
import { awaitSlotValue } from '../../../src/utils/loading/awaitSlotValue';
import { createAssetSlot } from '../../../src/services/loading/AssetSlot';
import type { AssetSlot } from '../../../src/@types/loading/AssetSlot';

const never = (): Promise<string> => new Promise(() => {});

/** A real slot whose subscriptions are counted, so a test can see each one dropped. */
function countedSlot(fetch: () => Promise<string>) {
  const slot = createAssetSlot<string, void>({ name: 'test', fetch, retry: () => 'give-up' });
  let live = 0;
  const watched: AssetSlot<string, void> = {
    ...slot,
    subscribe: (fn) => {
      live += 1;
      const off = slot.subscribe(fn);
      return () => {
        live -= 1;
        off();
      };
    },
  };
  return { slot: watched, live: () => live };
}

describe('awaitSlotValue', () => {
  it('resolves with the value once the slot commits, and drops its listener', async () => {
    const { slot, live } = countedSlot(() => Promise.resolve('catalog'));
    const pending = awaitSlotValue(slot);
    void slot.load();
    expect(await pending).toBe('catalog');
    expect(live()).toBe(0);
  });

  it('resolves at once with a value already committed, subscribing nothing', async () => {
    const { slot, live } = countedSlot(() => Promise.resolve('catalog'));
    await slot.load();
    expect(await awaitSlotValue(slot)).toBe('catalog');
    expect(live()).toBe(0);
  });

  it('resolves null when the load errors, before or after the call', async () => {
    const { slot, live } = countedSlot(() => Promise.reject(new Error('404')));
    const pending = awaitSlotValue(slot);
    await slot.load();
    expect(await pending).toBeNull();
    expect(await awaitSlotValue(slot)).toBeNull();
    expect(live()).toBe(0);
  });

  it('resolves null when the slot is released mid-load, and drops its listener', async () => {
    const { slot, live } = countedSlot(never);
    void slot.load();
    const pending = awaitSlotValue(slot);
    slot.release();
    expect(await pending).toBeNull();
    expect(live()).toBe(0);
  });

  it('waits through loading without resolving', async () => {
    const { slot, live } = countedSlot(never);
    void slot.load();
    const settled = vi.fn();
    void awaitSlotValue(slot).then(settled);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).not.toHaveBeenCalled();
    expect(live()).toBe(1);
  });
});
