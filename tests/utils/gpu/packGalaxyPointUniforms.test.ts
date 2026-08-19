/**
 * packGalaxyPointUniforms — byte-layout guard tests.
 *
 * Every written offset is asserted against a known fixture so a layout
 * drift (reordering struct fields, changing pad allocation, forgetting a
 * write) fails loudly here rather than silently producing a bad frame.
 *
 * The function is a pure ArrayBuffer packer: no GPU device, no WebGPU
 * globals needed.
 */

import { describe, it, expect } from 'vitest';
import { packGalaxyPointUniforms } from '../../../src/utils/gpu/packGalaxyPointUniforms';
import {
  UNIFORM_BYTES,
  SELECTED_PACKED_BYTE_OFFSET,
  POINT_SIZE_BYTE_OFFSET,
  PICK_PASS_BYTE_OFFSET,
} from '../../../src/services/gpu/renderers/galaxyCatalog/galaxyPointVertexLayout';
import type { Mat4 } from 'wgpu-matrix';
import type { GalaxyPointDrawSettings } from '../../../src/@types/rendering/GalaxyPointDrawSettings';
import type { ProvenanceFilter } from '../../../src/@types/settings/ProvenanceFilter';
import { PROVENANCE_FILTER_CODE } from '../../../src/data/provenanceFilter';

// ─── Fixture ──────────────────────────────────────────────────────────────────

// A recognisable viewProj: identity with a distinct value at [15] so every
// float index maps to a clearly non-default value.  The test below checks
// all 16 floats verbatim, so any mis-placement is caught.
function makeViewProj(): Mat4 {
  const m = new Float32Array(16);
  // Diagonal 1s (identity-ish) with a unique value per slot so transposition
  // bugs show up.
  for (let i = 0; i < 16; i++) m[i] = i + 1; // 1..16
  return m as unknown as Mat4;
}

const VIEW_PROJ = makeViewProj();
const VIEWPORT_PX: readonly [number, number] = [1920, 1080];

// A selection encoding that isn't the "no-selection" sentinel so we can
// confirm the real value passes through unmodified.
const SELECTED_PACKED = ((3 << 27) | 42) >>> 0;

// Stub GPUBindGroup for focusBindGroup — packGalaxyPointUniforms doesn't touch it,
// but GalaxyPointDrawSettings requires the field.
const FOCUS_BIND_GROUP = {} as unknown as GPUBindGroup;

const SETTINGS: GalaxyPointDrawSettings = {
  pointSizePx: 2.5,
  brightness: 0.75,
  selectedPacked: SELECTED_PACKED,
  visibleSourceMask: 0b11111,
  camPosWorld: [100, 200, 300],
  pxPerRad: 600,
  // Deliberately asymmetric across the four slots so a mis-ordered write
  // (highlight/filter swapped, or the two axes transposed) changes a byte.
  provenance: {
    orientation: { highlight: true, filter: 'estimated' },
    size: { highlight: false, filter: 'measured' },
  },
  biasMode: 2,
  absMagLimit: -19.5,
  depthFadeEnabled: true,
  pxFadeStart: 4,
  pxFadeEnd: 8,
  sbScale: 8,
  sbMax: 30,
  falloffStrength: 0.8,
  focusBindGroup: FOCUS_BIND_GROUP,
  // packGalaxyPointUniforms does not call this; fadeOpacityOf is a per-draw-loop
  // concern owned by the renderer.  The pure packer receives the settings
  // shape, not the render loop.
  fadeOpacityOf: () => 1,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('packGalaxyPointUniforms — byteLength', () => {
  it('returns a buffer of exactly UNIFORM_BYTES (192)', () => {
    // The size is the single source of truth (exported UNIFORM_BYTES); a
    // mismatch here means the alloc and the layout constant are out of sync.
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    expect(buf.byteLength).toBe(UNIFORM_BYTES);
    expect(buf.byteLength).toBe(192);
  });
});

describe('packGalaxyPointUniforms — CameraUniforms prefix (bytes 0..79)', () => {
  it('copies all 16 viewProj floats starting at byte 0', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    // Float indices 0..15 are the mat4x4 (column-major, 64 bytes).
    for (let i = 0; i < 16; i++) {
      expect(f32[i]).toBe(VIEW_PROJ[i]);
    }
  });

  it('writes viewportPx.x at byte 64 (float index 16)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[16]).toBe(VIEWPORT_PX[0]); // 1920
  });

  it('writes viewportPx.y at byte 68 (float index 17)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[17]).toBe(VIEWPORT_PX[1]); // 1080
  });

  it('leaves cam._pad0/1 (bytes 72..79, float indices 18/19) as zero', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[18]).toBe(0);
    expect(f32[19]).toBe(0);
  });
});

describe('packGalaxyPointUniforms — selectedPacked + pad (bytes 80..91)', () => {
  it('writes selectedPacked (u32) at SELECTED_PACKED_BYTE_OFFSET (80)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const u32 = new Uint32Array(buf);
    // u32 index 20 = byte 80.
    expect(u32[20]).toBe(SELECTED_PACKED >>> 0);
    expect(SELECTED_PACKED_BYTE_OFFSET).toBe(80);
  });

  it('leaves the pad slot at byte 84 (u32 index 21) as zero', () => {
    // Slot 21 (byte 84) is reserved for sourceCode — the renderer writes
    // this per-source in the draw loop, not in the uniform pack.  The
    // packer leaves it untouched (zero-initialised by ArrayBuffer).
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const u32 = new Uint32Array(buf);
    expect(u32[21]).toBe(0);
  });

  it('writes pointSizePx at POINT_SIZE_BYTE_OFFSET (88, float index 22)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[22]).toBeCloseTo(SETTINGS.pointSizePx);
    expect(POINT_SIZE_BYTE_OFFSET).toBe(88);
  });

  it('writes brightness at byte 92 (float index 23)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[23]).toBeCloseTo(SETTINGS.brightness);
  });
});

describe('packGalaxyPointUniforms — camPosWorld + pxPerRad (bytes 96..111)', () => {
  it('writes camPosWorld.x at byte 96 (float index 24)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[24]).toBe(SETTINGS.camPosWorld[0]);
  });

  it('writes camPosWorld.y at byte 100 (float index 25)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[25]).toBe(SETTINGS.camPosWorld[1]);
  });

  it('writes camPosWorld.z at byte 104 (float index 26)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[26]).toBe(SETTINGS.camPosWorld[2]);
  });

  it('writes pxPerRad at byte 108 (float index 27)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[27]).toBe(SETTINGS.pxPerRad);
  });
});

describe('packGalaxyPointUniforms — provenance block (bytes 112..127)', () => {
  // This block is the contract with `points/io.wesl`'s Uniforms struct
  // (orientationHighlight / orientationFilter / sizeHighlight / sizeFilter)
  // — nothing but these assertions keeps the two sides from drifting, so
  // every slot is pinned to its byte explicitly.

  it('writes orientation highlight + filter at bytes 112 / 116 (u32 indices 28 / 29)', () => {
    const u32 = new Uint32Array(packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS));
    expect(u32[28]).toBe(1); // orientation.highlight: true
    expect(u32[29]).toBe(PROVENANCE_FILTER_CODE.estimated);
  });

  it('writes size highlight + filter at bytes 120 / 124 (u32 indices 30 / 31)', () => {
    const u32 = new Uint32Array(packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS));
    expect(u32[30]).toBe(0); // size.highlight: false
    expect(u32[31]).toBe(PROVENANCE_FILTER_CODE.measured);
  });

  it('packs every filter value as its GPU code, per axis', () => {
    // The tri-state cull is the reason the slot is a code and not a boolean:
    // a wrong code silently renders the complement of what the UI asked for.
    const filters: readonly ProvenanceFilter[] = ['all', 'measured', 'estimated'];
    for (const filter of filters) {
      const orient = new Uint32Array(
        packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, {
          ...SETTINGS,
          provenance: { ...SETTINGS.provenance, orientation: { highlight: false, filter } },
        }),
      );
      expect(orient[29]).toBe(PROVENANCE_FILTER_CODE[filter]);

      const size = new Uint32Array(
        packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, {
          ...SETTINGS,
          provenance: { ...SETTINGS.provenance, size: { highlight: false, filter } },
        }),
      );
      expect(size[31]).toBe(PROVENANCE_FILTER_CODE[filter]);
    }
  });

  it('packs the highlight booleans as 0 / 1 u32s in their own slots', () => {
    const on = new Uint32Array(
      packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, {
        ...SETTINGS,
        provenance: {
          orientation: { highlight: true, filter: 'all' },
          size: { highlight: true, filter: 'all' },
        },
      }),
    );
    expect([on[28], on[30]]).toEqual([1, 1]);

    const off = new Uint32Array(
      packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, {
        ...SETTINGS,
        provenance: {
          orientation: { highlight: false, filter: 'all' },
          size: { highlight: false, filter: 'all' },
        },
      }),
    );
    expect([off[28], off[30]]).toEqual([0, 0]);
  });
});

describe('packGalaxyPointUniforms — Malmquist-bias state (bytes 128..159)', () => {
  it('writes biasMode (u32) at byte 128 (u32 index 32)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const u32 = new Uint32Array(buf);
    expect(u32[32]).toBe(SETTINGS.biasMode >>> 0);
  });

  it('writes absMagLimit at byte 132 (float index 33)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[33]).toBeCloseTo(SETTINGS.absMagLimit);
  });

  it('leaves the reserved Schechter floats (bytes 136..155, indices 34..38) as zero', () => {
    // These slots (apparentMagLimit, schechterMStar, schechterAlpha,
    // schechterMLim, schechterNRef) are reserved-but-unwritten: the WGSL
    // struct declares them to keep pickPass at a stable offset.
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    for (let i = 34; i <= 38; i++) {
      expect(f32[i]).toBe(0);
    }
  });

  it('writes depthFadeEnabled as a u32 at byte 156 (u32 index 39)', () => {
    // Byte 156 is the trailing slot of the Malmquist group — depthFadeEnabled
    // lodges there so the provenance block keeps a contiguous 112..127 run.
    // The shader reads it at this offset, so a drift would leave the depth
    // fade stuck at whatever the neighbouring slot happens to hold.
    const on = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, {
      ...SETTINGS,
      depthFadeEnabled: true,
    });
    expect(new Uint32Array(on)[39]).toBe(1);
    const off = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, {
      ...SETTINGS,
      depthFadeEnabled: false,
    });
    expect(new Uint32Array(off)[39]).toBe(0);
  });
});

describe('packGalaxyPointUniforms — procedural-disk crossfade + pickPass (bytes 160..175)', () => {
  it('writes pxFadeStart at byte 160 (float index 40)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[40]).toBeCloseTo(SETTINGS.pxFadeStart);
  });

  it('writes pxFadeEnd at byte 164 (float index 41)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[41]).toBeCloseTo(SETTINGS.pxFadeEnd);
  });

  it('defaults pickPass to 0 at PICK_PASS_BYTE_OFFSET (168, u32 index 42)', () => {
    // The visual pack omits the pickPass arg, so it defaults to 0.  The pick
    // path (`pickUniformBytesOf`) passes 1 — see the next case.
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const u32 = new Uint32Array(buf);
    expect(u32[42]).toBe(0);
    expect(PICK_PASS_BYTE_OFFSET).toBe(168);
  });

  it('packs pickPass = 1 as a u32 at byte 168 when the pick path passes it', () => {
    // The pick pack bakes pickPass = 1 directly (no post-upload override).  It
    // is a u32 field: byte 168 must read 0x00000001, not the float encoding of
    // 1.0 — the byte-equality guarantee with the old override depends on this.
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS, 1);
    expect(new Uint32Array(buf)[42]).toBe(1);
  });
});

describe('packGalaxyPointUniforms — galaxy SB calibration knobs (bytes 172..191)', () => {
  it('writes galaxySbScale at byte 172 (float index 43, the old _padFade1 slot)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[43]).toBeCloseTo(SETTINGS.sbScale);
  });

  it('writes galaxySbMax at byte 176 (float index 44)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[44]).toBeCloseTo(SETTINGS.sbMax);
  });

  it('writes galaxyFalloffStrength at byte 180 (float index 45)', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[45]).toBeCloseTo(SETTINGS.falloffStrength);
  });

  it('leaves the two trailing pad words (bytes 184..191, indices 46/47) as zero', () => {
    const buf = packGalaxyPointUniforms(VIEW_PROJ, VIEWPORT_PX, SETTINGS);
    const f32 = new Float32Array(buf);
    expect(f32[46]).toBe(0);
    expect(f32[47]).toBe(0);
  });
});
