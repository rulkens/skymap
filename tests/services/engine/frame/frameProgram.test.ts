/**
 * frameProgram — unit tests for the FRAME program literal and the
 * `timedSlotsOf` derivation.
 *
 * The whole point of `frameProgram` is that a frame's order is *data*: an
 * inspectable `FrameStep[]` rather than a hand-wired call sequence. These
 * tests exploit exactly that — they deep-equal the program against its
 * literal and read the derived timing slots straight off the array, with no
 * GPU device in sight.
 *
 * `timedSlotsOf` is driven here with small hand-built fake registries (two
 * `ContentLayer` rows apiece): at this task the real `scalar-volume` layer
 * doesn't exist yet, so the real-`CONTENT_LAYERS` assertion is deferred to
 * task 7. The fakes exercise the same three rules — layers per render step
 * in registry order, `'<source>→<dest>'` per composite, `'pick'` last.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import {
  frameProgram,
  timedSlotsOf,
} from '../../../../src/services/engine/frame/frameProgram';
import { CONTENT_LAYERS } from '../../../../src/services/engine/frame/passes';
import { COSMO, NEAR0, deriveSlabs } from '../../../../src/services/engine/frame/slabs';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';
import type { ContentLayer } from '../../../../src/@types/engine/frame/ContentLayer';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

const TONE: ToneMap = { exposure: 1.5, curve: 4 };

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

/**
 * A minimal `ContentLayer` fixture — only the fields `timedSlotsOf` reads
 * (`name`, `target`, `slab`) carry meaning; `enabled`/`draw` are typed
 * stubs so the row satisfies the contract without a renderer.
 */
function fakeLayer(name: string, target: string, slab: number): ContentLayer {
  return {
    name,
    slab,
    target,
    blend: 'additive',
    enabled: vi.fn<ContentLayer['enabled']>(() => true),
    draw: vi.fn<ContentLayer['draw']>(),
  };
}

describe('frameProgram', () => {
  it('emits the eight-step main program', () => {
    expect(frameProgram(TONE)).toEqual([
      { kind: 'compute', name: 'flow' },
      { kind: 'render', target: 'volume', slab: COSMO },
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: TONE } },
      { kind: 'render', target: 'swap', slab: COSMO },
      { kind: 'render', target: 'foreground:0', slab: NEAR0 },
      {
        kind: 'composite',
        step: { source: 'foreground:0', dest: 'swap', blend: 'over', tone: TONE },
      },
      { kind: 'render', target: 'swap', slab: NEAR0 },
    ]);
  });

  it('the two composites share one tone instance', () => {
    // The hdr→swap tone-map and the foreground:0→swap OVER must carry the
    // SAME tone object — identity, not just equal values — so the tone curve
    // is guaranteed identical across the Sun's limb. This enforces the
    // shared-curve requirement by reference rather than a constants file.
    const program = frameProgram(TONE);
    const [hdrComposite, foregroundComposite] = program.filter((step) => step.kind === 'composite');
    // Narrow away both the possibly-undefined index result and the FrameStep
    // union before touching `.step` — the same guard idiom the sibling
    // composite assertions use.
    if (hdrComposite?.kind !== 'composite' || foregroundComposite?.kind !== 'composite') {
      throw new Error('expected two composite steps');
    }
    expect(hdrComposite.step.tone).toBe(foregroundComposite.step.tone);
  });

  it('references only slabs present in deriveSlabs’ table (NEAR0 and COSMO)', () => {
    const slabs = deriveSlabs(makeCam(), new Float32Array(16) as unknown as Mat4);
    for (const step of frameProgram(TONE)) {
      if (step.kind === 'render') {
        expect([NEAR0, COSMO]).toContain(step.slab);
        expect(slabs[step.slab]).toBeDefined();
      }
    }
  });
});

describe('timedSlotsOf', () => {
  it('lists layer slots per render step, composite slots, then pick', () => {
    // Two hdr layers, two swap layers — same (target, slab) grouping the
    // real registry uses. The volume render step matches no fake layer, so
    // it contributes nothing (the real scalar-volume layer lands in task 7).
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('milky-way', 'hdr', COSMO),
      fakeLayer('selection-ring', 'swap', COSMO),
      fakeLayer('labels', 'swap', COSMO),
    ];

    // The foreground:0→swap slot is emitted from the program's composite STEP
    // independent of the layers fixture (a composite step always contributes
    // its '<source>→<dest>' slot). This synthetic fixture has no
    // debug-spheres / foreground-labels rows, so those two near-field RENDER
    // slots correctly don't appear — but the composite slot must.
    expect(timedSlotsOf(frameProgram(TONE), layers)).toEqual([
      'point-sprites',
      'milky-way',
      'hdr→swap',
      'selection-ring',
      'labels',
      'foreground:0→swap',
      'pick',
    ]);
  });

  it('yields unique names', () => {
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('selection-ring', 'swap', COSMO),
    ];
    const slots = timedSlotsOf(frameProgram(TONE), layers);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('derives the real registry slot list: scalar-volume, nine hdr, hdr→swap, five swap, near-field tail, pick', () => {
    // The real CONTENT_LAYERS registry against the real program — the exact
    // ordered slot list the timing service allocates from and the DebugPanel
    // iterates. scalar-volume leads (the volume render step), then the nine
    // hdr layers in registry order, the tone-map composite, the five swap
    // overlays, then the near-field tail (the foreground:0 body render →
    // debug-spheres, the foreground:0→swap composite, and the NEAR0 swap
    // caption render → foreground-labels), and pick last.
    expect(timedSlotsOf(frameProgram(TONE), CONTENT_LAYERS)).toEqual([
      'scalar-volume',
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'milky-way',
      'filaments',
      'flow',
      'volume-upsample',
      'horizon-shell',
      'structure-markers',
      'hdr→swap',
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'clip-path-debug',
      'debug-spheres',
      'foreground:0→swap',
      'foreground-labels',
      'pick',
    ]);
  });
});
