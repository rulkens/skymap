/**
 * runLayerFeedSaga — the saga behind both Layer feeds: every yield reaches the
 * consumer in order, cancelling the task closes the iterator (the unsubscribe
 * behind `callbackIterable`), and a feed that rejects ends quietly rather than
 * taking the root saga down.
 */

import { describe, it, expect, vi } from 'vitest';
import { runSaga, stdChannel, type Task } from 'redux-saga';
import { put } from 'typed-redux-saga';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';

import { runLayerFeedSaga } from '../../../../src/state/engine/sagas/runLayerFeedSaga';

const reported = createAction<number>('test/reported');

function run(feed: AsyncIterable<number>): { puts: UnknownAction[]; task: Task } {
  const puts: UnknownAction[] = [];
  const task = runSaga(
    {
      channel: stdChannel(),
      dispatch: (action: UnknownAction) => puts.push(action),
      getState: () => ({}),
    },
    () => runLayerFeedSaga(feed, (value) => put(reported(value))),
  );
  return { puts, task };
}

describe('runLayerFeedSaga', () => {
  it('hands every yield to consumeSaga in order', async () => {
    const { puts, task } = run(
      (async function* () {
        yield 1;
        yield 2;
      })(),
    );

    await task.toPromise();

    expect(puts).toEqual([reported(1), reported(2)]);
  });

  it('calls the iterable’s return() when the task is cancelled', async () => {
    const close = vi.fn();
    // Never resolves, so the task is parked on `next()` when the cancel lands.
    const feed: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<number>>(() => {}),
        return: () => {
          close();
          return Promise.resolve({ value: undefined, done: true });
        },
      }),
    };

    const { task } = run(feed);
    task.cancel();
    await task.toPromise();

    expect(close).toHaveBeenCalledOnce();
  });

  it('ends the feed without throwing when next() rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { puts, task } = run(
      (async function* () {
        yield 1;
        throw new Error('feed broke');
      })(),
    );

    await task.toPromise();

    expect(task.isRunning()).toBe(false);
    expect(puts).toEqual([reported(1)]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
