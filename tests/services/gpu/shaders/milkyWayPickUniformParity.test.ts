/**
 * Parity guard: `milkyWay/pick/io.wesl`'s `Uniforms` struct is a hand-written
 * prefix MIRROR of the points pick uniform buffer — the MW pick draw reuses
 * the caller's bound @group(0) (the full 176-byte points pick buffer), so
 * every field the mirror declares must sit at the exact byte offset the
 * points layout puts it, through the mirror's 112-byte read extent
 * (`cam` .. `pxPerRad`).  Because `?static` WESL linking does pure
 * build-time linking with NO value injection, nothing but a test keeps the
 * two homes from drifting (same rationale as `constants.parity.test.ts`).
 *
 * Two authorities are compared, with no third copy of magic numbers here:
 *
 *   - WESL side: the struct text is scraped from `io.wesl` (plus the
 *     embedded `CameraUniforms` from `lib/camera.wesl`) and each field's
 *     byte offset is computed from WGSL uniform layout rules.
 *   - TS side: `packGalaxyPointUniforms` is run with unique sentinel values and
 *     each field's offset is OBSERVED by locating its sentinel in the
 *     packed buffer — the packer's behaviour, not its comments, is the
 *     authority.  The exported `SELECTED_PACKED_BYTE_OFFSET` /
 *     `POINT_SIZE_BYTE_OFFSET` (the slots the pick pass overrides) are
 *     tied in as well.
 *
 * Reordering or retyping a field within the first 112 bytes of EITHER home
 * moves one side's offset and fails the comparison.
 */

import { describe, expect, it } from 'vitest';

import type { Mat4 } from 'wgpu-matrix';
import type { GalaxyPointDrawSettings } from '../../../../src/@types/rendering/GalaxyPointDrawSettings';
import { packGalaxyPointUniforms } from '../../../../src/utils/gpu/packGalaxyPointUniforms';
import {
  SELECTED_PACKED_BYTE_OFFSET,
  POINT_SIZE_BYTE_OFFSET,
} from '../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPointVertexLayout';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

// ─── WESL side: scrape the struct text and compute WGSL offsets ─────────────

const primitive = (owner: string) => (type: string) => {
  const p = wgslPrimitiveLayout(type);
  if (!p) throw new Error(`${owner} field type ${type} has no layout entry`);
  return p;
};

const cameraFields = parseWgslStructFields(
  readShaderSource('src/services/gpu/shaders/lib/camera.wesl'),
  'CameraUniforms',
);
// CameraUniforms' natural alignment is already 16, so the uniform space's
// nested-struct round-up is a no-op here and the measured layout goes back in.
const camera = layoutWgslStruct(cameraFields, primitive('CameraUniforms'));

const mirrorFields = parseWgslStructFields(
  readShaderSource('src/services/gpu/shaders/milkyWay/pick/io.wesl'),
  'Uniforms',
);
const mirror = layoutWgslStruct(mirrorFields, (t) =>
  t === 'CameraUniforms' ? camera.layout : primitive('Uniforms')(t),
);

// ─── TS side: pack sentinels and observe where they land ────────────────────

// Unique values, exactly representable in f32, so each field is found at
// exactly one place in the packed buffer.
const SENTINEL = {
  pointSizePx: 11111,
  brightness: 22222,
  camPosWorldX: 33333,
  pxPerRad: 44444,
  viewportPxX: 55555,
  selectedPacked: 0xabcd1234,
} as const;

function packSentinels(): ArrayBuffer {
  const viewProj = new Float32Array(16);
  for (let i = 0; i < 16; i++) viewProj[i] = 1001 + i; // distinct, none collide
  const settings: GalaxyPointDrawSettings = {
    pointSizePx: SENTINEL.pointSizePx,
    brightness: SENTINEL.brightness,
    selectedPacked: SENTINEL.selectedPacked,
    visibleSourceMask: 0b11111,
    camPosWorld: [SENTINEL.camPosWorldX, SENTINEL.camPosWorldX + 1, SENTINEL.camPosWorldX + 2],
    pxPerRad: SENTINEL.pxPerRad,
    provenance: {
      orientation: { highlight: false, filter: 'all' },
      size: { highlight: false, filter: 'all' },
    },
    biasMode: 0,
    absMagLimit: 0,
    depthFadeEnabled: false,
    sbScale: 8,
    sbMax: 30,
    falloffStrength: 0.8,
    pxFadeStart: 0,
    pxFadeEnd: 0,
    focusBindGroup: {} as unknown as GPUBindGroup,
    fadeOpacityOf: () => 1,
    viewSlot: 0,
  };
  return packGalaxyPointUniforms(
    viewProj as unknown as Mat4,
    [SENTINEL.viewportPxX, 720],
    settings,
  );
}

/** Byte offset of a sentinel float in the packed buffer (must be unique). */
function observedF32Offset(buf: ArrayBuffer, value: number): number {
  const f32 = new Float32Array(buf);
  const idx = f32.indexOf(value);
  expect(idx, `sentinel ${value} not found in packed buffer`).toBeGreaterThanOrEqual(0);
  expect(f32.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(idx);
  return idx * 4;
}

// ─── The parity assertions ───────────────────────────────────────────────────

describe('milkyWay/pick/io.wesl Uniforms ↔ packGalaxyPointUniforms layout parity', () => {
  const buf = packSentinels();
  const at = (name: string): number => {
    const o = mirror.offsets.get(name);
    expect(o, `field ${name} missing from the WESL mirror`).toBeDefined();
    return o!;
  };

  it('mirrors the CameraUniforms prefix at offset 0 (80 bytes)', () => {
    expect(at('cam')).toBe(0);
    expect(camera.layout.size).toBe(80);
    // viewportPx inside the prefix — observed from the pack.
    const viewportInCam = camera.offsets.get('viewportPx');
    expect(viewportInCam).toBeDefined();
    expect(observedF32Offset(buf, SENTINEL.viewportPxX)).toBe(at('cam') + viewportInCam!);
  });

  it('places selectedPacked where the packer writes it (and the pick override targets)', () => {
    const u32 = new Uint32Array(buf);
    const idx = u32.indexOf(SENTINEL.selectedPacked);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(at('selectedPacked')).toBe(idx * 4);
    expect(at('selectedPacked')).toBe(SELECTED_PACKED_BYTE_OFFSET);
  });

  it('places pointSizePx where the packer writes it (and the pick override targets)', () => {
    expect(at('pointSizePx')).toBe(observedF32Offset(buf, SENTINEL.pointSizePx));
    expect(at('pointSizePx')).toBe(POINT_SIZE_BYTE_OFFSET);
  });

  it('places brightness where the packer writes it', () => {
    expect(at('brightness')).toBe(observedF32Offset(buf, SENTINEL.brightness));
  });

  it('places camPosWorld where the packer writes it (all three lanes)', () => {
    expect(at('camPosWorld')).toBe(observedF32Offset(buf, SENTINEL.camPosWorldX));
    expect(observedF32Offset(buf, SENTINEL.camPosWorldX + 1)).toBe(at('camPosWorld') + 4);
    expect(observedF32Offset(buf, SENTINEL.camPosWorldX + 2)).toBe(at('camPosWorld') + 8);
  });

  it('places pxPerRad where the packer writes it', () => {
    expect(at('pxPerRad')).toBe(observedF32Offset(buf, SENTINEL.pxPerRad));
  });

  it('reads exactly the documented 112-byte prefix, within the 192-byte buffer', () => {
    // The mirror must stay a PREFIX: its total extent is what the MW draw
    // reads through the caller's bind group, and WGSL only permits the
    // bound buffer to be LARGER than the declared struct — never smaller.
    expect(mirror.layout.size).toBe(112);
    expect(buf.byteLength).toBeGreaterThanOrEqual(mirror.layout.size);
  });
});
