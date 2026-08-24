/**
 * atmosphereShellLayer's `invMvp` un-projection — a regression lock for the
 * `mat4d.inverse` dst-last / f64 contract (spec §9: "catching a dst-last/
 * f64-wrapper mistake before it reaches the GPU"). `mat4d.inverse` returns a
 * FRESH matrix rather than writing into a caller-supplied `dst`, and it must
 * run on the UN-narrowed f64 `mvp` (narrowing first reintroduces per-element
 * rounding — see `composeBodyMvp`'s header). Pure math: no GPU, engine
 * state, or ctx mocking.
 */

import { describe, it, expect, vi } from 'vitest';
import { mat4d } from 'wgpu-matrix';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { IDENTITY_MAT3 } from '../../../../../src/utils/math/identityMat3';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { ATMOSPHERE_PARAMS } from '../../../../../src/data/bodies/atmosphereParams';
import type { AtmosphereDrawEntry } from '../../../../../src/@types/engine/frame/AtmosphereDrawEntry';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';

// atmosphereShellLayer.draw walks atmosphereDrawList's resolved entries; stub it
// so the dispatch test drives ONE controlled camPosLocal per case rather than
// standing up a full body/camera fixture the sub-pixel cull would have to clear.
vi.mock('../../../../../src/services/engine/frame/atmosphereDrawList', () => ({
  atmosphereDrawList: vi.fn(),
}));
import { atmosphereDrawList } from '../../../../../src/services/engine/frame/atmosphereDrawList';
import { atmosphereShellLayer } from '../../../../../src/services/engine/frame/passes/atmosphereShellLayer';

describe('invMvp inversion sanity (mat4d.inverse dst-last / f64 contract)', () => {
  it('unprojects a clip-space point through narrowMat4(mat4d.inverse(mvp)) back to the known local point', () => {
    // mvp = T(5,0,0) * S(2,2,2): a column vector v transforms as
    // world = 2*v_local + (5,0,0) — scale first, then translate (read
    // right-to-left, same convention composeBodyMvp documents).
    const mvp = mat4d.multiply(mat4d.translation([5, 0, 0]), mat4d.scaling([2, 2, 2]));

    // Its inverse undoes that in the opposite order: local = 0.5*(world - (5,0,0)),
    // i.e. S(0.5) * T(-5,0,0) — NOT computed via mat4d.inverse, so this isn't a
    // mirror test of the function under test.
    const invMvp = mat4d.inverse(mvp);
    const invMvpF32 = narrowMat4(invMvp);

    // A chosen clip-space point [7, 3, -2, 1]. Hand-worked expected unprojection:
    // local = 0.5*(7-5, 3, -2) = (1, 1.5, -1). mvp/invMvp are pure affine
    // (translate+scale only), so w stays 1 throughout — no perspective divide
    // needed, but the test still divides by w to exercise the real un-project path.
    const clip: [number, number, number, number] = [7, 3, -2, 1];

    // Plain column-major 4x4 * vec4 — hand-rolled, one-off verification, not a
    // reusable util: out[row] = sum_col m[col*4 + row] * v[col].
    const unprojected: [number, number, number, number] = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let col = 0; col < 4; col++) {
        sum += invMvpF32[col * 4 + row]! * clip[col]!;
      }
      unprojected[row] = sum;
    }
    const [x, y, z, w] = unprojected;

    expect(w).toBeCloseTo(1, 6);
    expect(x! / w!).toBeCloseTo(1, 6);
    expect(y! / w!).toBeCloseTo(1.5, 6);
    expect(z! / w!).toBeCloseTo(-1, 6);
  });
});

describe('draw — inside/outside dispatch', () => {
  const PASS_STUB = {} as GPURenderPassEncoder;

  /** An identity `SlabView` — draw's f64 seam only needs a valid vp, not a
   *  particular camera pose; this test drives camPosLocal directly via the
   *  stubbed atmosphereDrawList, not via a real camera-to-body geometry. */
  function makeView(): SlabView {
    const slab: Slab = {
      index: NEAR0,
      nearMpc: 0.0005,
      farMpc: 500,
      vp: mat4d.identity() as Float64Array,
      originRelative: true,
      precision: 'f64',
      reversedZ: false,
    };
    return {
      slab,
      vp: new Float32Array(16),
      camPos: [0, 0, 0],
      viewportPx: [1280, 720],
    };
  }

  /** One resolved entry, `camPosLocal` the sole varying — the value
   *  `isInsideAtmosphereShell` classifies. */
  function makeEntry(camPosLocal: readonly [number, number, number]): AtmosphereDrawEntry {
    return {
      body: SCENE_EARTH,
      params: ATMOSPHERE_PARAMS['earth']!,
      positionMpc: [0, 0, 0],
      orientation: IDENTITY_MAT3 as Mat3,
      camPosLocal: [...camPosLocal],
      sunDirLocal: [0, 0, 1],
    };
  }

  function makeState(rendererDraw: ReturnType<typeof vi.fn>): EngineState {
    return {
      gpu: { atmosphereShellRenderer: { draw: rendererDraw } },
      settings: { earth: { atmosphereExposure: ATMOSPHERE_PARAMS['earth']!.exposure } },
    } as unknown as EngineState;
  }

  const CTX_STUB = {} as ReadyFrameContext;

  it('dispatches inside=true for a camera well inside the atmosphere shell', () => {
    vi.mocked(atmosphereDrawList).mockReturnValue([makeEntry([0.1, 0, 0])]);
    const rendererDraw = vi.fn();
    atmosphereShellLayer.draw(PASS_STUB, makeView(), CTX_STUB, makeState(rendererDraw));

    expect(rendererDraw).toHaveBeenCalledTimes(1);
    expect(rendererDraw.mock.calls[0]![3]).toBe(true);
  });

  it('dispatches inside=false for a camera well outside the atmosphere shell', () => {
    vi.mocked(atmosphereDrawList).mockReturnValue([makeEntry([5, 0, 0])]);
    const rendererDraw = vi.fn();
    atmosphereShellLayer.draw(PASS_STUB, makeView(), CTX_STUB, makeState(rendererDraw));

    expect(rendererDraw).toHaveBeenCalledTimes(1);
    expect(rendererDraw.mock.calls[0]![3]).toBe(false);
  });
});
