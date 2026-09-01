/**
 * createIsmMapOutput — the packed artifact the ISM-map generator writes into,
 * and everything downstream of it: the present pass, the S4 dust-blur
 * low-pass, and the CPU readback's staging buffer. Runner-agnostic by
 * construction — it never imports the runner, only ever a `texture` object
 * something else fills, which is what lets every downstream consumer
 * (orientation chain, readback, present draw) stay wired to ONE stable
 * texture/bind-group regardless of whether the generator is running.
 */
import { ADDITIVE_BLEND } from '../../../lib/blendStates';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
} from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { alignedBytesPerRow } from '../../../../../utils/gpu/alignedBytesPerRow';

import ismMapPresentWgsl from '../../../shaders/milkyWay/ismMap/ismMapPresent.wesl?static';
import ismMapDustBlurWgsl from '../../../shaders/milkyWay/ismMap/ismMapDustBlur.wesl?static';
import ismMapCartesianBakeWgsl from '../../../shaders/milkyWay/ismMap/ismMapCartesianBake.wesl?static';

/** Mirrored by BLUR_FACTOR in ismMapDustBlur.wesl; also sets the S4 high-pass crossover (~8 texels, roughly the scale the dust splats stop resolving). */
const DUST_BLUR_FACTOR = 8;
/**
 * Cartesian re-bake side length (stage 1 of the dust-seeding perf spike —
 * docs/research/m74-jwst/07-sprite-seeding.md). Trade: ~15 pc/texel flat
 * across the square, vs the log-polar map's r-proportional 4-37 pc/texel —
 * finer than log-polar beyond roughly 1/3 of the disc radius, coarser near
 * the center. If the center visibly softens under a real consumer (stage 2),
 * the escalation is a two-level cascade (fine inner tile + this coarser
 * outer one), not a blanket resolution bump.
 */
export const ISM_MAP_CARTESIAN_SIZE = 2048;

export type IsmMapOutput = {
  /** The packed, presentable output (gas / recent SF / older SF / dust) the orientation chain and the CPU readback both read. */
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  /** 8x-downsampled gas x activity density, S4's low-pass divisor — see ismMapDustBlur.wesl. */
  readonly dustBlurTexture: GPUTexture;
  /** ISM_MAP_CARTESIAN_SIZE-square world-xz re-bake of the packed map's detail ratio (R) and stars (G) — see ismMapCartesianBake.wesl. Written, not yet read by any consumer (stage 2). */
  readonly cartesianTexture: GPUTexture;
  /** rMin/rMax — dustPresent.wesl's S4 read needs the same log-polar mapping the present pass uses. */
  readonly gridBuffer: GPUBuffer;
  /** One f32/ring, `createIsmMapRingReduce.ts`'s dispatch target and `ismMapPresent.wesl`'s own read — see that shader's binding-4 comment. */
  readonly ringMeansBuffer: GPUBuffer;
  /** Debug-only staging buffer for `createIsmMapReadbacks.ts`'s `requestRingMeans` — the probe's GPU-vs-CPU numeric check. No production reader. */
  readonly ringMeansReadbackBuffer: GPUBuffer;
  readonly mapSampler: GPUSampler;
  /** Writes `grid`'s rMin/rMax into `gridBuffer` — every dispatcher rebuild does this before running (or clearing) whichever generator is active. */
  writeGrid(grid: GalaxyIsmMapGridRadius): void;
  /**
   * Writes the "seeding" debug view's radial envelope divisor —
   * `ismMapRingMeans(map, texel => texel.dust)`'s ISM_MAP_RINGS-length array,
   * the CPU twin of `ismMapPresent.wesl`'s own ring-indexed read. Called
   * whenever the ISM-map readback lands (`createGalaxyModel.ts`'s
   * `recomputeIsmMapSeedingMeans`), not every frame — same cadence as
   * `writeGrid`, but from the readback landing rather than the rebuild that
   * requested it (see `scheduleIsmMapReadback`'s own determinism note).
   */
  writeRingMeans(means: Float32Array): void;
  /** Zero-fills `texture` and `dustBlurTexture` — the disabled/no-geometry path, shared by both generators so neither leaves the other's stale content on screen. */
  clear(): void;
  /**
   * Encode the S4 low-pass (ismMapDustBlur.wesl) against whatever `texture`
   * currently holds, into `dustBlurTexture`, inside the CALLER's encoder (no
   * submit here) — a rebuild's own dispatch shares one encoder/submit with
   * its generator's step+pack passes.
   */
  encodeDustBlurPass(enc: GPUCommandEncoder): void;
  /**
   * Encode the cartesian re-bake (ismMapCartesianBake.wesl) against whatever
   * `texture`/`dustBlurTexture` currently hold, into `cartesianTexture`,
   * inside the CALLER's encoder — same one-encoder-one-submit contract as
   * `encodeDustBlurPass`, and always called AFTER it so the bake reads the
   * blur pass's fresh output, not the previous rebuild's.
   */
  encodeCartesianBakePass(enc: GPUCommandEncoder): void;
  dispose(): void;
};

export function createIsmMapOutput(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
  },
): IsmMapOutput {
  const { makeShader } = deps;

  const dustBlurMod = makeShader(ismMapDustBlurWgsl, 'galaxy:ismMapDustBlur');
  const dustBlurPipe = device.createComputePipeline({
    label: 'galaxy:ismMapDustBlurPipe',
    layout: 'auto',
    compute: { module: dustBlurMod, entryPoint: 'cs' },
  });
  const cartesianBakeMod = makeShader(ismMapCartesianBakeWgsl, 'galaxy:ismMapCartesianBake');
  const cartesianBakePipe = device.createComputePipeline({
    label: 'galaxy:ismMapCartesianBakePipe',
    layout: 'auto',
    compute: { module: cartesianBakeMod, entryPoint: 'cs' },
  });
  const presentMod = makeShader(ismMapPresentWgsl, 'galaxy:ismMapPresent');
  const presentPipe = device.createRenderPipeline({
    label: 'galaxy:ismMapPresentPipe',
    layout: 'auto',
    vertex: { module: presentMod, entryPoint: 'vs' },
    // Additive, not a bare overwrite: this pass draws straight into the scene
    // pass's `sceneTex`, which already carries any background extras' sprite
    // glow by the time this draw runs — a replace blend would erase them under
    // the diagnostic. Against a freshly-cleared target the two are identical,
    // so this is a strict fix, not a behaviour trade.
    fragment: {
      module: presentMod,
      entryPoint: 'fs',
      targets: [{ format: deps.hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // 'repeat' in U (azimuth wraps at theta=0/2*PI), 'clamp-to-edge' in V
  // (radius does not) — ismMapPresent.wesl's fs resamples through this, and
  // dustPresent.wesl's S4 read shares it for the same wrap semantics.
  const mapSampler = device.createSampler({
    label: 'galaxy:ismMapPresentSampler',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // rgba16float, not rgba8unorm: the dust channel (w) must carry raw,
  // unclamped values above 1.0 — the swept-shell rim overshoot — which an
  // 8-bit unorm store would quantize/clamp away. Same filterable-storage-
  // format precedent as ismMapDustBlurTex below. Written by EITHER
  // generator's own final pack pass.
  const texture = device.createTexture({
    label: 'galaxy:ismMapTex',
    size: [ISM_MAP_AZ, ISM_MAP_RINGS],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST,
  });
  // S4's low-pass divisor — one texel per BLUR_FACTOR x BLUR_FACTOR src
  // block (192x64 at the current grid). rgba16float for the same
  // filterable-storage-format reason ismMapDustBlur.wesl documents.
  const ismMapDustBlurTex = device.createTexture({
    label: 'galaxy:ismMapDustBlurTex',
    size: [ISM_MAP_AZ / DUST_BLUR_FACTOR, ISM_MAP_RINGS / DUST_BLUR_FACTOR],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // Stage 1 of the dust-seeding perf spike (docs/research/m74-jwst/
  // 07-sprite-seeding.md): a cartesian re-bake of ismMapCartesianBake.wesl's
  // R=detail-ratio/G=stars over world xz — see ISM_MAP_CARTESIAN_SIZE's own
  // doc for the resolution trade. rgba16float for the same filterable-
  // storage-format reason as the two textures above; B/A unused.
  const cartesianTexture = device.createTexture({
    label: 'galaxy:ismMapCartesianTex',
    size: [ISM_MAP_CARTESIAN_SIZE, ISM_MAP_CARTESIAN_SIZE],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // `copyTextureToBuffer` forces `bytesPerRow` to a 256-byte multiple; the
  // readback's decode strips the padding so it never reaches `GalaxyIsmMap.data`.
  // 8 bytes/texel (rgba16float = 4 lanes x 2 bytes), not 4 —
  // `decodeIsmMapTexels` reads f16, not raw bytes.
  const readbackBytesPerRow = alignedBytesPerRow(ISM_MAP_AZ * 8);
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:ismMapReadbackBuf',
    size: readbackBytesPerRow * ISM_MAP_RINGS,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // rMin/rMax only — ismMapPresent.wesl's own small uniform, separate from
  // io.wesl's per-frame 'u' since the two change on entirely different
  // cadences (rebuild vs every frame).
  const gridUbo = device.createBuffer({
    label: 'galaxy:ismMapGridUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // The "seeding" debug view's radial envelope divisor — one f32 per ring,
  // fixed-size at ISM_MAP_RINGS (the grid's own ring count never changes,
  // only rMin/rMax do), read via 'arrayLength' in ismMapPresent.wesl rather
  // than a second mirrored size constant. STORAGE not UNIFORM: a uniform's
  // std140-style array stride would waste 3 of every 4 lanes on padding this
  // shader never reads.
  // COPY_SRC (beyond STORAGE|COPY_DST) is for the debug readback only —
  // `ismMapPresent.wesl`'s own read never copies this buffer anywhere.
  const ringMeansBuf = device.createBuffer({
    label: 'galaxy:ismMapRingMeansBuf',
    size: ISM_MAP_RINGS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  // Debug-only staging copy of `ringMeansBuf` — see the type's own doc.
  const ringMeansReadbackBuffer = device.createBuffer({
    label: 'galaxy:ismMapRingMeansReadbackBuf',
    size: ISM_MAP_RINGS * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // Built once — `texture`/`gridUbo` are the same GPU objects for this
  // module's whole lifetime, only their CONTENT changes per rebuild, and a
  // bind group only needs rebuilding when the OBJECT it references does.
  // This is exactly why switching generators never touches this bind group:
  // whichever runner's pack pass wrote `texture` last, this reads the same one.
  const presentBindGroup = device.createBindGroup({
    label: 'galaxy:ismMapPresentBG',
    layout: presentPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: deps.fieldUbo } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: mapSampler },
      { binding: 3, resource: { buffer: gridUbo } },
      { binding: 4, resource: { buffer: ringMeansBuf } },
    ],
  });
  const dustBlurBindGroup = device.createBindGroup({
    label: 'galaxy:ismMapDustBlurBG',
    layout: dustBlurPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: ismMapDustBlurTex.createView() },
    ],
  });
  // Binding order mirrors ismMapCartesianBake.wesl's own @binding declarations.
  const cartesianBakeBindGroup = device.createBindGroup({
    label: 'galaxy:ismMapCartesianBakeBG',
    layout: cartesianBakePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: ismMapDustBlurTex.createView() },
      { binding: 2, resource: mapSampler },
      { binding: 3, resource: { buffer: gridUbo } },
      { binding: 4, resource: cartesianTexture.createView() },
    ],
  });

  function encodeDustBlurPass(enc: GPUCommandEncoder): void {
    const pass = enc.beginComputePass({ label: 'galaxy:ismMapDustBlurPass' });
    pass.setPipeline(dustBlurPipe);
    pass.setBindGroup(0, dustBlurBindGroup);
    pass.dispatchWorkgroups(
      ISM_MAP_AZ / DUST_BLUR_FACTOR / 8,
      ISM_MAP_RINGS / DUST_BLUR_FACTOR / 8,
    );
    pass.end();
  }

  function encodeCartesianBakePass(enc: GPUCommandEncoder): void {
    const pass = enc.beginComputePass({ label: 'galaxy:ismMapCartesianBakePass' });
    pass.setPipeline(cartesianBakePipe);
    pass.setBindGroup(0, cartesianBakeBindGroup);
    pass.dispatchWorkgroups(ISM_MAP_CARTESIAN_SIZE / 16, ISM_MAP_CARTESIAN_SIZE / 16);
    pass.end();
  }

  return {
    texture,
    readbackBuffer,
    readbackBytesPerRow,
    presentPipeline: presentPipe,
    presentBindGroup,
    dustBlurTexture: ismMapDustBlurTex,
    cartesianTexture,
    gridBuffer: gridUbo,
    ringMeansBuffer: ringMeansBuf,
    ringMeansReadbackBuffer,
    mapSampler,

    writeGrid(grid): void {
      device.queue.writeBuffer(gridUbo, 0, new Float32Array([grid.rMin, grid.rMax, 0, 0]));
    },

    writeRingMeans(means): void {
      device.queue.writeBuffer(ringMeansBuf, 0, means);
    },

    clear(): void {
      // All-zero bytes decode to 0.0 in rgba16float, so the zero-fill trick
      // needs only the right row width (8 bytes/texel). COPY_DST on all three
      // targets exists for these writes ALONE — drop it and every clear becomes
      // a silent validation failure that leaves the previous map on screen.
      device.queue.writeTexture(
        { texture },
        new Uint8Array(ISM_MAP_AZ * ISM_MAP_RINGS * 8),
        { bytesPerRow: ISM_MAP_AZ * 8 },
        [ISM_MAP_AZ, ISM_MAP_RINGS],
      );
      // A stale blur under a cleared map would read as detail everywhere
      // (D=0 over Dblur>0 darkens the whole column); zeros make the ratio
      // degrade to 1.
      device.queue.writeTexture(
        { texture: ismMapDustBlurTex },
        new Uint8Array((ISM_MAP_AZ / DUST_BLUR_FACTOR) * (ISM_MAP_RINGS / DUST_BLUR_FACTOR) * 8),
        { bytesPerRow: (ISM_MAP_AZ / DUST_BLUR_FACTOR) * 8 },
        [ISM_MAP_AZ / DUST_BLUR_FACTOR, ISM_MAP_RINGS / DUST_BLUR_FACTOR],
      );
      // No consumer reads cartesianTexture yet (stage 2), but zeroing it here
      // keeps its lifecycle owned by the same clear/rebuild discipline as the
      // two textures above rather than leaving a third, differently-governed
      // artifact.
      device.queue.writeTexture(
        { texture: cartesianTexture },
        new Uint8Array(ISM_MAP_CARTESIAN_SIZE * ISM_MAP_CARTESIAN_SIZE * 8),
        { bytesPerRow: ISM_MAP_CARTESIAN_SIZE * 8 },
        [ISM_MAP_CARTESIAN_SIZE, ISM_MAP_CARTESIAN_SIZE],
      );
    },

    encodeDustBlurPass,
    encodeCartesianBakePass,

    dispose(): void {
      texture.destroy();
      ismMapDustBlurTex.destroy();
      cartesianTexture.destroy();
      readbackBuffer.destroy();
      gridUbo.destroy();
      ringMeansBuf.destroy();
      ringMeansReadbackBuffer.destroy();
    },
  };
}
