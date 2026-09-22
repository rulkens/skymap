/**
 * callbackIterable — the two properties a subscribe-fed Layer depends on: a
 * value emitted before the consumer asks survives, and the unsubscribe runs
 * once, on close.
 */

import { describe, it, expect, vi } from 'vitest';
import { callbackIterable } from '../../../src/utils/async/callbackIterable';

describe('callbackIterable', () => {
  it('buffers values emitted before the consumer asks, in order', async () => {
    let emit: (value: number) => void = () => {};
    const iterable = callbackIterable<number>((fn) => {
      emit = fn;
      return () => {};
    });

    const iterator = iterable[Symbol.asyncIterator]();
    emit(1);
    emit(2);

    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await iterator.next()).toEqual({ value: 2, done: false });

    const pending = iterator.next();
    emit(3);
    expect(await pending).toEqual({ value: 3, done: false });
  });

  it('runs the unsubscribe once, on return()', async () => {
    const unsubscribe = vi.fn();
    const iterator = callbackIterable<number>(() => unsubscribe)[Symbol.asyncIterator]();

    expect(await iterator.return!()).toEqual({ value: undefined, done: true });
    await iterator.return!();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
});
