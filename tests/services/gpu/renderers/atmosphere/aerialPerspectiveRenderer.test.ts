import { describe, it, expect, vi } from 'vitest';
import { createAerialPerspectiveRenderer } from '../../../../../src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer';
import { FROXEL_DIMS } from '../../../../../src/data/atmosphere/froxelVolume';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../../src/utils/gpu/packAtmosphereUniforms';

/**
 * The bake/apply split is a cross-file contract nothing type-checks: the bake
 * owns the frame's single write of the shell uniform record and the apply
 * unprojects with it, so a second write between them (or a lost one) points the
 * two at different cameras. Pinned here with the volume allocation — one pair
 * for the renderer, not one per body — and the `rebind` the tier switch needs.
 */

/** `bake.wesl`'s `@workgroup_size(8, 8, 1)`, restated as the test's own truth. */
const BAKE_WORKGROUP_SIZE = 8;

type Harness = {
  device: GPUDevice;
  textures: GPUTextureDescriptor[];
  bindGroups: GPUBindGroupDescriptor[];
  writeBuffer: ReturnType<typeof vi.fn>;
  descOf: Map<unknown, GPURenderPipelineDescriptor>;
};

function mockDevice(): Harness {
  const textures: GPUTextureDescriptor[] = [];
  const bindGroups: GPUBindGroupDescriptor[] = [];
  const descOf = new Map<unknown, GPURenderPipelineDescriptor>();
  const writeBuffer = vi.fn();
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => {
      textures.push(desc);
      return { createView: vi.fn(() => ({})), destroy: vi.fn() };
    }),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroups.push(desc);
      return {};
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      const handle = {};
      descOf.set(handle, desc);
      return handle;
    }),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  return { device, textures, bindGroups, writeBuffer, descOf };
}

function bundle() {
  const texture = () => ({ createView: vi.fn(() => ({})) }) as unknown as GPUTexture;
  return {
    scatteringBuffer: {} as GPUBuffer,
    skyViewParamsBuffer: {} as GPUBuffer,
    shellUniformBuffer: {} as GPUBuffer,
    transmittanceTex: texture(),
    multiScatterTex: texture(),
    skyViewTex: texture(),
  };
}

function build(bodyIds: readonly string[] = ['earth']) {
  const h = mockDevice();
  const bodies = new Map(bodyIds.map((id) => [id, bundle()]));
  const renderer = createAerialPerspectiveRenderer(
    h.device,
    'rgba16float',
    {} as GPUSampler,
    {} as GPUTextureView,
    bodies,
  );
  return { ...h, renderer, bodies };
}

/** Classify an apply pipeline by what its colour blend DOES, not by its label. */
function blendRole(desc: GPURenderPipelineDescriptor): string {
  const color = Array.from(desc.fragment!.targets!)[0]!.blend!.color;
  if (color.srcFactor === 'zero' && color.dstFactor === 'src') return 'multiply';
  if (color.srcFactor === 'one' && color.dstFactor === 'one') return 'add';
  return `other(${color.srcFactor}/${color.dstFactor})`;
}

function mockRenderPass(order: string[], descOf: Map<unknown, GPURenderPipelineDescriptor>) {
  return {
    setPipeline: vi.fn((p: unknown) => {
      const desc = descOf.get(p);
      order.push(desc === undefined ? 'unknown' : blendRole(desc));
    }),
    setBindGroup: vi.fn(),
    draw: vi.fn(() => order.push('draw')),
  } as unknown as GPURenderPassEncoder;
}

function mockComputePass() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
  } as unknown as GPUComputePassEncoder;
}

describe('createAerialPerspectiveRenderer — the froxel volumes', () => {
  it('allocates one 3D volume pair at FROXEL_DIMS, never one per body', () => {
    // The volume is keyed on the CAMERA's screen rays and the camera is inside
    // at most one atmosphere, so a per-body pair is ~512 KiB of waste each.
    const { textures } = build(['earth', 'mars']);
    const volumes = textures.filter((desc) => desc.dimension === '3d');
    expect(volumes).toHaveLength(2);
    for (const desc of volumes) {
      expect(Array.from(desc.size as number[])).toEqual([
        FROXEL_DIMS.x,
        FROXEL_DIMS.y,
        FROXEL_DIMS.z,
      ]);
    }
  });
});

describe('createAerialPerspectiveRenderer — bake and apply share one uniform write', () => {
  it('bake writes the body shell uniform record once and dispatches FROXEL_DIMS / 8 workgroups', () => {
    // z is `bake.wesl`'s own slice loop, so the grid covers (x, y) only —
    // dispatching the depth too would re-march every column 64 times.
    const { renderer, writeBuffer, bodies } = build();
    const pass = mockComputePass();
    const uniforms = new Float32Array(ATMOSPHERE_UNIFORM_FLOATS);

    renderer.bake(pass, 'earth', uniforms);

    expect(writeBuffer).toHaveBeenCalledTimes(1);
    expect(writeBuffer).toHaveBeenCalledWith(bodies.get('earth')!.shellUniformBuffer, 0, uniforms);
    expect(pass.dispatchWorkgroups).toHaveBeenCalledWith(
      FROXEL_DIMS.x / BAKE_WORKGROUP_SIZE,
      FROXEL_DIMS.y / BAKE_WORKGROUP_SIZE,
      1,
    );
  });

  it('draw writes no buffer', () => {
    // A second write of the same record between the bake and the apply would
    // unproject the apply's rays from a camera the volume never saw.
    const { renderer, writeBuffer, descOf } = build();
    const pass = mockRenderPass([], descOf);

    renderer.draw(pass, 'earth', {} as GPUTextureView);

    expect(writeBuffer).not.toHaveBeenCalled();
  });

  it('draws twice, MULTIPLY before ADD', () => {
    const { renderer, descOf } = build();
    const order: string[] = [];
    const pass = mockRenderPass(order, descOf);

    renderer.draw(pass, 'earth', {} as GPUTextureView);

    expect(order).toEqual(['multiply', 'draw', 'add', 'draw']);
  });

  it('rebuilds the apply bind group only when the depth view changes identity', () => {
    // `depthViewOf('foreground:0')` hands back a NEW view once `reconcile`
    // reallocates the row; a group cached over the destroyed texture is a
    // validation error, and on iOS a silently dropped frame.
    const { renderer, descOf, bindGroups } = build();
    const pass = mockRenderPass([], descOf);
    const first = {} as GPUTextureView;
    const before = bindGroups.length;

    renderer.draw(pass, 'earth', first);
    renderer.draw(pass, 'earth', first);
    expect(bindGroups.length).toBe(before + 1);

    renderer.draw(pass, 'earth', {} as GPUTextureView);
    expect(bindGroups.length).toBe(before + 2);
  });
});

describe('rebind', () => {
  it('rebuilds the bake bind group for that body', () => {
    // The bake group holds the bundle's LUT VIEWS, not the variables, so the
    // shell's tier `reconcile` leaves it pointing at a destroyed texture.
    const { renderer, bindGroups } = build();
    const replacement = bundle();

    renderer.rebind('earth', replacement);

    const rebuilt = bindGroups.filter((desc) => desc.label === 'atmosphere-froxel-bg-earth');
    expect(rebuilt).toHaveLength(2);
  });
});
