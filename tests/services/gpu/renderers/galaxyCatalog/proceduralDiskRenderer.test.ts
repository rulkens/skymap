/**
 * proceduralDiskRenderer pack-loop tests.
 *
 * The renderer is mostly a thin wrapper around the shared
 * `instancedQuadRenderer` factory — what's worth pinning at this layer is
 * the per-instance Float32Array layout that the wrapper produces. The
 * shared factory is responsible for the vertex-buffer arrayStride, but
 * the slot-by-slot meaning of each float lives here.
 *
 * Hi-res LOD Task R1 grew the per-instance stride from 12 to 16 floats
 * to make room for hi-res-array layer attributes. The procedural shader
 * doesn't read them — its trailing 4 floats must be zero so the shared
 * vertex buffer is well-defined for every consumer.
 *
 * We intercept the inner factory's `draw` call by stubbing the GPUDevice
 * and reading back the `writeBuffer` payload the factory hands to the
 * GPU queue. That's the same byte stream the shader sees.
 */

import { describe, it, expect, vi } from 'vitest';
import { createProceduralDiskRenderer } from '../../../../../src/services/gpu/renderers/galaxyCatalog/proceduralDiskRenderer';
import { FLOATS_PER_INSTANCE } from '../../../../../src/services/gpu/renderers/galaxyCatalog/instancedQuadRenderer';
import { packSelection } from '../../../../../src/data/selectionEncoding';
import type { ProceduralDiskInstance } from '../../../../../src/@types/rendering/ProceduralDiskInstance';

function makeStubInit() {
  const writeBufferCalls: Array<{ data: Float32Array; offset: number }> = [];
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      return { getBindGroupLayout: () => ({}) };
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    createSampler: vi.fn(() => ({})),
    queue: {
      // Three writeBuffer calls per frame: uniforms [0], visual instances [1],
      // pick-buffer mirror [2]. We snapshot every call so assertions can
      // address each by index.
      writeBuffer: vi.fn(
        (
          _buf: GPUBuffer,
          _bufOff: number,
          data: ArrayBufferView | ArrayBuffer,
          dataOff?: number,
          size?: number,
        ) => {
          const ab = (data as ArrayBufferView).buffer ?? (data as ArrayBuffer);
          const offset = dataOff ?? (data as ArrayBufferView).byteOffset ?? 0;
          const len =
            size ?? (data as ArrayBufferView).byteLength ?? (ab as ArrayBuffer).byteLength;
          // Copy the snapshot — the renderer reuses its scratch
          // Float32Array, so a live view would mutate between draws.
          const copy = new Uint8Array(len);
          copy.set(new Uint8Array(ab as ArrayBuffer, offset, len));
          writeBufferCalls.push({
            data: new Float32Array(copy.buffer),
            offset: _bufOff,
          });
        },
      ),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;

  return {
    init: {
      device,
      context: null as unknown as GPUCanvasContext,
      targetFormat: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      focusBgl:
        {} as unknown as import('../../../../../src/@types/rendering/FocusUniformsBgl').FocusUniformsBgl,
      reversedZ: false,
    },
    writeBufferCalls,
    renderPipelines,
  };
}

// Stub shared focus bind group passed into draw() — only bound, never read.
const FOCUS_BIND_GROUP = {} as unknown as GPUBindGroup;

function fakeProceduralInstance(
  overrides: Partial<ProceduralDiskInstance> = {},
): ProceduralDiskInstance {
  return {
    x: 1,
    y: 2,
    z: 3,
    sizeWorldMpc: 0.05,
    axisRatio: 0.6,
    positionAngleDeg: 45,
    colourIndex: 0.7,
    crossfadeAlpha: 0.5,
    procFadeOut: 1,
    sourceCode: 0,
    localIdx: 0,
    sbAmp: 1,
    ...overrides,
  };
}

describe('proceduralDiskRenderer colour target', () => {
  it('forwards init.targetFormat to the inner (visual) pipeline colour target', () => {
    const { init, renderPipelines } = makeStubInit();
    createProceduralDiskRenderer(init);
    // Two pipelines build: the additive visual pipeline (targetFormat) and the
    // r32uint pick pipeline. The visual one must carry the forwarded format.
    const formats = renderPipelines.map((p) => Array.from(p.fragment!.targets!)[0]!.format);
    expect(formats).toContain('rgba16float');
  });
});

describe('proceduralDiskRenderer pack loop (Task R2)', () => {
  it('pack writes the packed pick id into slot 6 as u32 bits', () => {
    // 1_000_000 exercises the float-vs-bits distinction: Math.fround(1_000_000)
    // === 1_000_000, but a non-round value like 0x07fffffe would not round-trip
    // as f32 and would corrupt the id if written via packed[o+6] = value.
    const { init, writeBufferCalls } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: ProceduralDiskInstance[] = [
      fakeProceduralInstance({ sourceCode: 1, localIdx: 7 }),
      fakeProceduralInstance({ sourceCode: 3, localIdx: 1_000_000 }),
    ];

    renderer.draw(
      pass,
      new Float32Array(16),
      [800, 600],
      [0, 0, 0],
      100,
      FOCUS_BIND_GROUP,
      instances,
    );

    // Visual instance payload is always writeBufferCalls[1] (uniforms first,
    // visual instances second, pick mirror third).
    const visualPayload = writeBufferCalls[1]!.data;
    // Reinterpret the same bytes as u32 to inspect the bitcast-written slot 6.
    const u32 = new Uint32Array(visualPayload.buffer);

    expect(u32[6]).toBe(packSelection(1, 7));
    expect(u32[FLOATS_PER_INSTANCE + 6]).toBe(packSelection(3, 1_000_000));
  });
});

describe('proceduralDiskRenderer.pickDisks camera', () => {
  it('pickDisks draws with the caller-supplied camera, not a cached frame value', () => {
    // The pick uniform is written from pickDisks' ARGUMENTS, not a value
    // stashed by the last draw(). We prove this by drawing with camera A
    // (all-zero viewProj, camPos [0,0,0], pxPerRad 100) and then picking
    // with a DIFFERENT camera B — the pick uniform payload must carry B.
    const { init, writeBufferCalls } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const drawPass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    // draw() with camera A — uploads one instance so pickDisks has content.
    renderer.draw(drawPass, new Float32Array(16), [800, 600], [0, 0, 0], 100, FOCUS_BIND_GROUP, [
      fakeProceduralInstance(),
    ]);

    // draw() emits three writeBuffer calls (uniforms, visual, pick mirror).
    // The next writeBuffer is pickDisks' own pick-uniform upload.
    const beforePick = writeBufferCalls.length;

    // Camera B — a distinctive viewProj[0] plus non-zero camPos / pxPerRad.
    const viewProjB = new Float32Array(16);
    viewProjB[0] = 42;
    const pickPass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.pickDisks(pickPass, viewProjB, [1024, 768], [7, 8, 9], 250, FOCUS_BIND_GROUP);

    // The pick uniform layout mirrors the visual pipeline's:
    //   f32[0..15] viewProj  f32[16..17] viewport  f32[20..22] camPos  f32[23] pxPerRad
    const pickUniform = writeBufferCalls[beforePick]!.data;
    expect(pickUniform[0]).toBe(42); // viewProj[0] from B, not A's zero
    expect(pickUniform[16]).toBe(1024);
    expect(pickUniform[17]).toBe(768);
    expect(pickUniform[20]).toBe(7);
    expect(pickUniform[21]).toBe(8);
    expect(pickUniform[22]).toBe(9);
    expect(pickUniform[23]).toBe(250);
  });
});

describe('proceduralDiskRenderer pack loop (Task R1)', () => {
  it('pack writes 16 floats per instance — last 4 are zero (procedural shader does not read them)', () => {
    const { init, writeBufferCalls } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: ProceduralDiskInstance[] = [
      fakeProceduralInstance({ x: 10, y: 20, z: 30 }),
      fakeProceduralInstance({ x: 40, y: 50, z: 60 }),
    ];

    renderer.draw(
      pass,
      new Float32Array(16),
      [800, 600],
      [0, 0, 0],
      100,
      FOCUS_BIND_GROUP,
      instances,
    );

    // draw emits three writeBuffer calls per frame: uniforms first, then
    // the visual instance payload, then the pick instance buffer mirror.
    // The visual instance payload is always at index 1.
    expect(writeBufferCalls.length).toBe(3);
    const instancePayload = writeBufferCalls[1]!.data;

    // 16 floats per instance × 2 instances = 32 floats.
    expect(FLOATS_PER_INSTANCE).toBe(16);
    expect(instancePayload.length).toBe(2 * FLOATS_PER_INSTANCE);

    // Instance 0: spot-check the meaningful slots round-trip, then
    // assert slots 12..15 are zero pad.
    expect(instancePayload[0]).toBe(10);
    expect(instancePayload[1]).toBe(20);
    expect(instancePayload[2]).toBe(30);
    expect(instancePayload[12]).toBe(0);
    expect(instancePayload[13]).toBe(0);
    expect(instancePayload[14]).toBe(0);
    expect(instancePayload[15]).toBe(0);

    // Instance 1: same pad invariant.
    const i1 = FLOATS_PER_INSTANCE;
    expect(instancePayload[i1 + 0]).toBe(40);
    expect(instancePayload[i1 + 12]).toBe(0);
    expect(instancePayload[i1 + 13]).toBe(0);
    expect(instancePayload[i1 + 14]).toBe(0);
    expect(instancePayload[i1 + 15]).toBe(0);
  });
});

describe('proceduralDiskRenderer.pickDisks draw count', () => {
  // Camera arguments pickDisks takes directly (no cached frame value):
  // viewProj / viewport / camPosWorld / pxPerRad / focusBindGroup.
  const PICK_VIEW_PROJ = new Float32Array(16);
  const PICK_VIEWPORT: [number, number] = [800, 600];
  const PICK_CAM_POS: [number, number, number] = [0, 0, 0];
  const PICK_PX_PER_RAD = 100;

  function makeStubPass() {
    return {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
  }

  function pick(
    renderer: ReturnType<typeof createProceduralDiskRenderer>,
    pass: GPURenderPassEncoder,
  ) {
    renderer.pickDisks(
      pass,
      PICK_VIEW_PROJ,
      PICK_VIEWPORT,
      PICK_CAM_POS,
      PICK_PX_PER_RAD,
      FOCUS_BIND_GROUP,
    );
  }

  it('issues draw(6, N) after draw() with N instances', () => {
    const { init } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    renderer.draw(
      makeStubPass(),
      new Float32Array(16),
      [800, 600],
      [0, 0, 0],
      100,
      FOCUS_BIND_GROUP,
      [
        fakeProceduralInstance({ sourceCode: 1, localIdx: 42 }),
        fakeProceduralInstance({ sourceCode: 2, localIdx: 99 }),
        fakeProceduralInstance({ sourceCode: 3, localIdx: 7 }),
      ],
    );

    const pickPass = makeStubPass();
    pick(renderer, pickPass);

    expect(pickPass.setPipeline).toHaveBeenCalledTimes(1);
    expect(pickPass.draw).toHaveBeenCalledWith(6, 3);
  });

  it('is a no-op on a fresh renderer with no prior draw', () => {
    const { init } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const pickPass = makeStubPass();
    pick(renderer, pickPass);

    // Nothing should have been called — lastPickInstanceCount is 0.
    expect(pickPass.setPipeline).not.toHaveBeenCalled();
    expect(pickPass.draw).not.toHaveBeenCalled();
  });

  it('is a no-op after draw() is called with an empty instances array', () => {
    // Regression: draw() with 0 instances must zero lastPickInstanceCount
    // (a stale prior-frame count would make pickDisks() re-draw the
    // previous frame's disks into the pick texture).
    const { init } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    // First draw: 3 instances. pickDisks confirms something was drawn.
    renderer.draw(
      makeStubPass(),
      new Float32Array(16),
      [800, 600],
      [0, 0, 0],
      100,
      FOCUS_BIND_GROUP,
      [
        fakeProceduralInstance({ sourceCode: 1, localIdx: 10 }),
        fakeProceduralInstance({ sourceCode: 1, localIdx: 11 }),
        fakeProceduralInstance({ sourceCode: 1, localIdx: 12 }),
      ],
    );
    const pickPass1 = makeStubPass();
    pick(renderer, pickPass1);
    expect(pickPass1.draw).toHaveBeenCalledWith(6, 3); // sanity

    // Second draw: empty. pickDisks on a fresh pass must be a no-op.
    renderer.draw(
      makeStubPass(),
      new Float32Array(16),
      [800, 600],
      [0, 0, 0],
      100,
      FOCUS_BIND_GROUP,
      [],
    );
    const pickPass2 = makeStubPass();
    pick(renderer, pickPass2);
    expect(pickPass2.setPipeline).not.toHaveBeenCalled();
    expect(pickPass2.draw).not.toHaveBeenCalled();
  });
});
