/**
 * Sphere-family uniform byte-layout guards.
 *
 * A WGSL struct and the CPU code that fills it must agree byte-for-byte: a
 * mismatch produces no GPU error, just a wrong (or, on iOS, silently dropped)
 * frame. This is the `testing.md` keep-rule for uniform layouts — it fails on a
 * real drift no compiler check catches. Two structs are guarded here:
 *
 *   - `LitBodyUniforms` (`shaders/lib/sphere.wesl`) ↔ `packLitBodyUniforms`.
 *   - `SpherePickUniforms` (`shaders/bodies/spherePick.wesl`) ↔ the scratch
 *     `bodyPickRenderer.drawSphere` uploads per draw.
 *
 * Both tests drive the real producing code (not a source-text grep of the
 * shader): they feed distinct, non-round values into every slot and read the
 * bytes back at the offsets the struct pins. The producer computes those offsets
 * independently of these assertions, so a reordered field or a lost write fails
 * here.
 *
 * `TexturedBodyUniforms` — the sibling that extends the lit prefix — has its own
 * parity guard in `tests/utils/gpu/packTexturedBodyUniforms.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  packLitBodyUniforms,
  LIT_BODY_UNIFORM_FLOATS,
} from '../../../../src/utils/gpu/packLitBodyUniforms';
import { createBodyPickRenderer } from '../../../../src/services/gpu/renderers/bodies/bodyPickRenderer';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct, non-unit sun direction so a mis-mapped component perturbs a byte
// the check would catch (not a normalised vector — the packer does not
// renormalise, and using 0.5/0.25/0.75 makes each lane unique).
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];

describe('LitBodyUniforms byte offsets', () => {
  it('packs mvp + sunDirLocal@64 into an 80-byte / 20-f32 record, tail @76 zeroed', () => {
    const rec = packLitBodyUniforms(MVP, SUN_DIR);
    expect(rec.length).toBe(LIT_BODY_UNIFORM_FLOATS);
    expect(rec.length).toBe(20); // 80 bytes
    expect(rec.byteLength).toBe(80);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16), 16-byte aligned.
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // byte 76 (float index 19) is the vec3's trailing pad — zeroed. Ambient is
    // NOT carried on the uniform; it lives in bodyLighting.wesl's AMBIENT const.
    expect(rec[19]).toBe(0); // byte 76 — _pad
  });
});

// Distinct, non-round ray origin: a camera a few floored-pick-radii off-centre,
// each lane unique so a swapped component shows up.
const CAM_POS_LOCAL: Vec3 = [3.5, -1.25, 7.75];
// High-bit-set so a signed read (or a lost `>>> 0`) would surface as a negative.
const PACKED_ID = 0xdeadbeef;

/**
 * The narrowest `GPUDevice` stand-in `createBodyPickRenderer` needs — Vitest runs
 * in Node with no WebGPU surface. Kept local rather than shared with
 * `bodyPickRenderer.test.ts`: that file's mock surfaces buffer/pipeline IDENTITY
 * for its multi-slot contract, while this one only needs the bytes handed to
 * `queue.writeBuffer`, and coupling the two would make either test's mock harder
 * to change for the other's reason.
 */
function mockDevice(): GPUDevice {
  return {
    limits: { minUniformBufferOffsetAlignment: 256 },
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

describe('SpherePickUniforms byte offsets', () => {
  it('drawSphere uploads mvp + camPosLocal@64 + packedId@76 as one 80-byte record', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.drawSphere(pass, { mvp: MVP, camPosLocal: CAM_POS_LOCAL, packedId: PACKED_ID });

    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const uniformWrite = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as { label?: string }).label === 'body-pick-sphere-uniform',
    )!;
    const data = uniformWrite[2] as ArrayBuffer;

    // 80 bytes, NOT 96: `packedId` lives in the 4 bytes `camPosLocal`'s 16-byte
    // alignment leaves over, so the struct did not grow a row. A 96-byte record
    // here means the pad-slot trick was lost and `minBindingSize` drifted with it.
    expect(data.byteLength).toBe(80);

    const f32 = new Float32Array(data);
    const u32 = new Uint32Array(data);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(f32[i]).toBe(MVP[i]);

    // camPosLocal — vec3 at byte 64 (float index 16), 16-byte aligned.
    expect(f32[16]).toBe(CAM_POS_LOCAL[0]); // byte 64
    expect(f32[17]).toBe(CAM_POS_LOCAL[1]); // byte 68
    expect(f32[18]).toBe(CAM_POS_LOCAL[2]); // byte 72

    // packedId — u32 word 19 (byte 76), the vec3's trailing slot as a REAL field.
    expect(u32[19]).toBe(PACKED_ID);
  });
});
