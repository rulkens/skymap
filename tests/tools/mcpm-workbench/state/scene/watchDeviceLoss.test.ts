/**
 * A lost device reaches the store as `view.deviceLost` alone (the toast's and
 * the frame driver's signal); the catalog status channel stays catalog-only.
 */
import type { Action } from '@reduxjs/toolkit';
import { runSaga } from 'redux-saga';
import { describe, expect, it } from 'vitest';
import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import type { RenderResources } from '../../../../../tools/mcpm-workbench/@types/render/RenderResources';
import { watchDeviceLoss } from '../../../../../tools/mcpm-workbench/src/state/scene/watchDeviceLoss';
import { deviceLost } from '../../../../../tools/mcpm-workbench/src/state/view/viewSlice';

async function dispatchedOnLoss(
  reason: GPUDeviceLostReason,
  current: 'current' | 'stale',
): Promise<Action[]> {
  const gpu = {
    device: { lost: Promise.resolve({ reason, message: '' }) },
  } as unknown as GpuContext;
  const otherGpu = { device: {} } as unknown as GpuContext;
  const resources = { gpu: current === 'current' ? gpu : otherGpu } as RenderResources;
  const dispatched: Action[] = [];
  await runSaga(
    { dispatch: (a: Action) => dispatched.push(a) },
    watchDeviceLoss,
    resources,
    gpu,
  ).toPromise();
  return dispatched;
}

describe('watchDeviceLoss', () => {
  it('marks the device lost, and nothing else, when the current device is lost', async () => {
    expect(await dispatchedOnLoss('unknown', 'current')).toEqual([deviceLost()]);
  });

  it('ignores an intentional destroy and a device a later build replaced', async () => {
    expect(await dispatchedOnLoss('destroyed', 'current')).toEqual([]);
    expect(await dispatchedOnLoss('unknown', 'stale')).toEqual([]);
  });
});
