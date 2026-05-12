/**
 * spaceMouseSubsystem — unit tests for the 6DOF puck subsystem.
 *
 * The subsystem is exercised through its `inputFactory` test seam: we
 * pass a stub factory that returns a controllable fake
 * `SpaceMouseInputLike` so we can synchronously fire `onAxes` /
 * `onConnectionChange` without touching WebHID.
 *
 * Coverage focus areas (matches the spec):
 *   1. `hasAxes()` flips with the latest report.
 *   2. `applyToCamera()` mutates `cam` when axes are non-zero.
 *   3. `applyToCamera()` calls `cancelTween` when axes are non-zero,
 *      and does NOT call it when the puck is at rest.
 *   4. The `onAxes` engine callback fires for every decoded report.
 *   5. Connection-change forwards through to the engine callback.
 *   6. `setSensitivity` scales the per-frame camera mutation.
 *   7. `connect()` / `isConnected()` / `disconnect()` plumb through.
 */

import { describe, it, expect, vi } from 'vitest';

import { createOrbitCamera } from '../../../../src/services/camera/orbitCamera';
import { createSpaceMouseSubsystem } from '../../../../src/services/engine/subsystems/spaceMouseSubsystem';
import type { SpaceMouseInputCtorOptions } from '../../../../src/@types/input/SpaceMouseInputCtorOptions';
import type { SpaceMouseInputLike } from '../../../../src/@types/input/SpaceMouseInputLike';
import type { SpaceMouseAxes } from '../../../../src/@types/input/SpaceMouseAxes';

function makeCam() {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: 1,
    far: 1000,
  });
}

/**
 * Build a stub SpaceMouseInputLike + a control surface that lets the
 * test drive the subsystem the same way real HID reports would.
 */
function makeStubFactory() {
  const connectMock = vi.fn(async () => true);
  const disconnectMock = vi.fn(() => {});
  const driver: {
    fireAxes: (axes: SpaceMouseAxes) => void;
    fireConnectionChange: (connected: boolean) => void;
    connectMock: typeof connectMock;
    disconnectMock: typeof disconnectMock;
    connectedRef: { value: boolean };
  } = {
    fireAxes: () => {
      throw new Error('fireAxes called before factory');
    },
    fireConnectionChange: () => {
      throw new Error('fireConnectionChange called before factory');
    },
    connectMock,
    disconnectMock,
    connectedRef: { value: false },
  };
  const factory = (options: SpaceMouseInputCtorOptions): SpaceMouseInputLike => {
    driver.fireAxes = options.onAxes;
    driver.fireConnectionChange = (connected) => {
      driver.connectedRef.value = connected;
      options.onConnectionChange?.(connected, null);
    };
    return {
      connect: () => driver.connectMock(),
      disconnect: () => driver.disconnectMock(),
      isConnected: () => driver.connectedRef.value,
    };
  };
  return { factory, driver };
}

const ZERO: SpaceMouseAxes = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };

describe('createSpaceMouseSubsystem', () => {
  it('hasAxes returns false until the first non-zero report', async () => {
    const { factory, driver } = makeStubFactory();
    const sm = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factory,
    });
    await sm.connect();
    expect(sm.hasAxes()).toBe(false);
    driver.fireAxes({ ...ZERO, tx: 0.5 });
    expect(sm.hasAxes()).toBe(true);
    driver.fireAxes(ZERO);
    expect(sm.hasAxes()).toBe(false);
  });

  it('applyToCamera mutates the camera when an axis is non-zero', async () => {
    const { factory, driver } = makeStubFactory();
    const sm = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factory,
    });
    await sm.connect();
    const cam = makeCam();
    const yawBefore = cam.yaw;
    // rz (full deflection, normalised) → yaw rotation in the camera mapping.
    driver.fireAxes({ ...ZERO, rz: 1 });
    sm.applyToCamera(cam, 0);
    sm.applyToCamera(cam, 16); // second frame to integrate with measured dt
    expect(cam.yaw).not.toBe(yawBefore);
  });

  it('applyToCamera calls cancelTween when axes are non-zero', async () => {
    const { factory, driver } = makeStubFactory();
    const cancelTween = vi.fn();
    const sm = createSpaceMouseSubsystem({
      cancelTween,
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factory,
    });
    await sm.connect();
    const cam = makeCam();
    driver.fireAxes({ ...ZERO, tx: 1 });
    sm.applyToCamera(cam, 16);
    expect(cancelTween).toHaveBeenCalledTimes(1);
  });

  it('applyToCamera does NOT call cancelTween when the puck is at rest', async () => {
    const { factory, driver } = makeStubFactory();
    const cancelTween = vi.fn();
    const sm = createSpaceMouseSubsystem({
      cancelTween,
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factory,
    });
    await sm.connect();
    const cam = makeCam();
    driver.fireAxes(ZERO);
    sm.applyToCamera(cam, 16);
    expect(cancelTween).not.toHaveBeenCalled();
  });

  it('onAxes engine callback fires for each decoded report', async () => {
    const { factory, driver } = makeStubFactory();
    const onAxes = vi.fn();
    const sm = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange: () => {},
      onAxes,
      inputFactory: factory,
    });
    await sm.connect();
    driver.fireAxes({ ...ZERO, tx: 1 });
    driver.fireAxes({ ...ZERO, tx: 2 });
    driver.fireAxes(ZERO);
    expect(onAxes).toHaveBeenCalledTimes(3);
  });

  it('connection-change forwards to the engine callback (and wipes axes on disconnect)', async () => {
    const { factory, driver } = makeStubFactory();
    const onConnectionChange = vi.fn();
    const sm = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange,
      onAxes: () => {},
      inputFactory: factory,
    });
    await sm.connect();
    driver.fireAxes({ ...ZERO, tx: 0.7 });
    expect(sm.hasAxes()).toBe(true);
    driver.fireConnectionChange(false);
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
    // Wipe is part of the contract — the per-frame loop must stop applying
    // the last-seen reading after disconnect.
    expect(sm.hasAxes()).toBe(false);
  });

  it('setSensitivity scales the per-frame camera mutation', async () => {
    const { factory, driver } = makeStubFactory();
    // Two subsystems, identical inputs except sensitivity.  We use rz
    // (yaw mapping) at full deflection so the cube curve hits its
    // maximum response and the sensitivity multiplier dominates the
    // resulting yaw delta.
    const a = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factory,
    });
    await a.connect();
    a.setSensitivity(0.5);
    const camA = makeCam();
    driver.fireAxes({ ...ZERO, rz: 1 });
    a.applyToCamera(camA, 16);
    a.applyToCamera(camA, 32);
    const yawA = camA.yaw;

    const { factory: factoryB, driver: driverB } = makeStubFactory();
    const b = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factoryB,
    });
    await b.connect();
    b.setSensitivity(2.0);
    const camB = makeCam();
    driverB.fireAxes({ ...ZERO, rz: 1 });
    b.applyToCamera(camB, 16);
    b.applyToCamera(camB, 32);
    const yawB = camB.yaw;

    // Higher sensitivity should produce a larger yaw delta from neutral.
    expect(Math.abs(yawB)).toBeGreaterThan(Math.abs(yawA));
  });

  it('connect/isConnected/disconnect plumb through to the underlying input', async () => {
    const { factory, driver } = makeStubFactory();
    const sm = createSpaceMouseSubsystem({
      cancelTween: () => {},
      onConnectionChange: () => {},
      onAxes: () => {},
      inputFactory: factory,
    });
    expect(sm.isConnected()).toBe(false);
    driver.connectMock.mockImplementationOnce(async () => {
      driver.connectedRef.value = true;
      return true;
    });
    const result = await sm.connect();
    expect(result).toEqual({ ok: true });
    expect(sm.isConnected()).toBe(true);
    sm.disconnect();
    expect(driver.disconnectMock).toHaveBeenCalled();
  });
});
