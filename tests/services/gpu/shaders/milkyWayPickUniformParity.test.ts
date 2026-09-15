/**
 * Parity guard: the Milky-Way pick renderer packs `@group(0)` by hand and the
 * shader reads it through `milkyWay/pick/io.wesl`'s structs, with no value
 * injection across the `?static` link — so only a test keeps the two homes
 * from drifting (same rationale as `constants.parity.test.ts`).
 *
 * The WESL side is scraped from `io.wesl` (plus the embedded `CameraUniforms`
 * from `lib/camera.wesl`) and laid out by WGSL uniform rules; the TS side is
 * OBSERVED from the renderer under a stub device — sentinels are located in
 * the captured upload, so the packer's behaviour is the authority, not its
 * comments. A reordered field or a dropped pad on either side moves one
 * offset and fails here; on hardware it is a silently mis-sized hit target.
 */

import { describe, expect, it, vi } from 'vitest';

import { createMilkyWayPickRenderer } from '../../../../src/services/gpu/renderers/milkyWay/milkyWayPickRenderer';
import type { FadeUniformsBgl } from '../../../../src/@types/rendering/FadeUniformsBgl';
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

const IO_WESL = 'src/services/gpu/shaders/milkyWay/pick/io.wesl';

// CameraUniforms' natural alignment is already 16, so the uniform space's
// nested-struct round-up is a no-op here and the measured layout goes back in.
const camera = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/lib/camera.wesl'),
    'CameraUniforms',
  ),
  primitive('CameraUniforms'),
);

const uniforms = layoutWgslStruct(
  parseWgslStructFields(readShaderSource(IO_WESL), 'Uniforms'),
  (t) => (t === 'CameraUniforms' ? camera.layout : primitive('Uniforms')(t)),
);

const mwUniforms = layoutWgslStruct(
  parseWgslStructFields(readShaderSource(IO_WESL), 'MilkyWayPickUniforms'),
  primitive('MilkyWayPickUniforms'),
);

const at = (struct: typeof uniforms, name: string): number => {
  const o = struct.offsets.get(name);
  expect(o, `field ${name} missing from the WESL struct`).toBeDefined();
  return o!;
};

// ─── TS side: pick with sentinels and observe where they land ───────────────

// Unique values, exactly representable in f32, so each is found at exactly
// one place in the uploaded image.
const SENTINEL = {
  viewportPxX: 55555,
  camPosWorldX: 33333,
  pxPerRad: 44444,
} as const;

/** The @group(0) bytes `pickMilkyWay` uploads for one sentinel pick. */
function uploadedCameraImage(): Float32Array {
  const uploads: ArrayBufferView[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    queue: {
      writeBuffer: vi.fn((_b: unknown, _o: number, data: ArrayBufferView) => {
        uploads.push(data);
      }),
    },
  } as unknown as GPUDevice;
  const renderer = createMilkyWayPickRenderer(
    {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    },
    {} as FadeUniformsBgl,
    false,
  );
  uploads.length = 0; // discard the static @group(2) write

  const viewProj = new Float32Array(16);
  for (let i = 0; i < 16; i++) viewProj[i] = 1001 + i; // distinct, none collide
  renderer.pickMilkyWay(
    {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder,
    viewProj,
    [SENTINEL.viewportPxX, 720],
    [SENTINEL.camPosWorldX, SENTINEL.camPosWorldX + 1, SENTINEL.camPosWorldX + 2],
    SENTINEL.pxPerRad,
  );
  expect(uploads).toHaveLength(1);
  return uploads[0] as Float32Array;
}

/** Byte offset of a sentinel float in the uploaded image (must be unique). */
function observedF32Offset(image: Float32Array, value: number): number {
  const idx = image.indexOf(value);
  expect(idx, `sentinel ${value} not found in the upload`).toBeGreaterThanOrEqual(0);
  expect(image.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(idx);
  return idx * 4;
}

// ─── The parity assertions ───────────────────────────────────────────────────

describe('milkyWay/pick/io.wesl ↔ milkyWayPickRenderer uniform parity', () => {
  it('Uniforms is the 80-byte CameraUniforms prefix, then camPosWorld at 80 and pxPerRad at 92, 96 bytes total', () => {
    expect(at(uniforms, 'cam')).toBe(0);
    expect(camera.layout.size).toBe(80);
    expect(at(uniforms, 'camPosWorld')).toBe(80);
    expect(at(uniforms, 'pxPerRad')).toBe(92);
    expect(uniforms.layout.size).toBe(96);
  });

  it('pickMilkyWay uploads the prefix, camPosWorld and pxPerRad where the WESL struct reads them, and nothing longer', () => {
    const image = uploadedCameraImage();
    expect(image.byteLength).toBe(uniforms.layout.size);

    const viewportInCam = camera.offsets.get('viewportPx');
    expect(viewportInCam).toBeDefined();
    expect(observedF32Offset(image, SENTINEL.viewportPxX)).toBe(
      at(uniforms, 'cam') + viewportInCam!,
    );

    const camPos = at(uniforms, 'camPosWorld');
    expect(observedF32Offset(image, SENTINEL.camPosWorldX)).toBe(camPos);
    expect(observedF32Offset(image, SENTINEL.camPosWorldX + 1)).toBe(camPos + 4);
    expect(observedF32Offset(image, SENTINEL.camPosWorldX + 2)).toBe(camPos + 8);
    expect(observedF32Offset(image, SENTINEL.pxPerRad)).toBe(at(uniforms, 'pxPerRad'));
  });

  it('MilkyWayPickUniforms places minSizePx at byte 20 in a 32-byte struct', () => {
    expect(at(mwUniforms, 'centerWorld')).toBe(0);
    expect(at(mwUniforms, 'sourceCode')).toBe(12);
    expect(at(mwUniforms, 'radiusMpc')).toBe(16);
    expect(at(mwUniforms, 'minSizePx')).toBe(20);
    expect(mwUniforms.layout.size).toBe(32);
  });
});
