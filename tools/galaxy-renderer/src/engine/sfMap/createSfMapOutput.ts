/**
 * createSfMapOutput — the packed artifact BOTH SF-map generators write into,
 * and everything downstream of it: the present pass, the S4 dust-blur
 * low-pass, and the CPU readback's staging buffer. Generator-agnostic by
 * construction — it never imports either runner, only ever a `texture`
 * object something else fills. `createSfMapGenerator.ts`'s dispatcher owns
 * one instance and hands it to both `createSfMapAutomatonRunner` and
 * `createSfMapFluidRunner`, which is what lets every OTHER downstream
 * consumer (orientation chain, readback, present draw) stay wired to ONE
 * stable texture/bind-group regardless of which generator last wrote it —
 * switching the toggle never rebuilds a single bind group outside this file.
 */
import { ADDITIVE_BLEND } from '../../../../../src/services/gpu/lib/blendStates';
import {
  SF_MAP_AZ,
  SF_MAP_RINGS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import { alignedBytesPerRow } from '../../../../../src/utils/gpu/alignedBytesPerRow';

import sfMapPresentWgsl from '../shaders/milkyWay/sfMap/sfMapPresent.wesl?static';
import sfMapDustBlurWgsl from '../shaders/milkyWay/sfMap/sfMapDustBlur.wesl?static';

/** Mirrored by BLUR_FACTOR in sfMapDustBlur.wesl; also sets the S4 high-pass crossover (~8 texels, roughly the scale the dust splats stop resolving). */
const DUST_BLUR_FACTOR = 8;

export type SfMapOutput = {
  /** The packed, presentable output (gas / recent SF / older SF / dust) the orientation chain and the CPU readback both read. */
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  /** 8x-downsampled gas x activity density, S4's low-pass divisor — see sfMapDustBlur.wesl. */
  readonly dustBlurTexture: GPUTexture;
  /** rMin/rMax — dustPresent.wesl's S4 read needs the same log-polar mapping the present pass uses. */
  readonly gridBuffer: GPUBuffer;
  readonly mapSampler: GPUSampler;
  /** Writes `grid`'s rMin/rMax into `gridBuffer` — every dispatcher rebuild does this before running (or clearing) whichever generator is active. */
  writeGrid(grid: GalaxySfMapGridRadius): void;
  /** Zero-fills `texture` and `dustBlurTexture` — the disabled/no-geometry path, shared by both generators so neither leaves the other's stale content on screen. */
  clear(): void;
  /**
   * Encode the S4 low-pass (sfMapDustBlur.wesl) against whatever `texture`
   * currently holds, into `dustBlurTexture`, inside the CALLER's encoder (no
   * submit here) — a rebuild's own dispatch shares one encoder/submit with
   * its generator's step+pack passes.
   */
  encodeDustBlurPass(enc: GPUCommandEncoder): void;
  dispose(): void;
};

export function createSfMapOutput(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
  },
): SfMapOutput {
  const { makeShader } = deps;

  const dustBlurMod = makeShader(sfMapDustBlurWgsl, 'galaxy:sfMapDustBlur');
  const dustBlurPipe = device.createComputePipeline({
    label: 'galaxy:sfMapDustBlurPipe',
    layout: 'auto',
    compute: { module: dustBlurMod, entryPoint: 'cs' },
  });
  const presentMod = makeShader(sfMapPresentWgsl, 'galaxy:sfMapPresent');
  const presentPipe = device.createRenderPipeline({
    label: 'galaxy:sfMapPresentPipe',
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
  // (radius does not) — sfMapPresent.wesl's fs resamples through this, and
  // dustPresent.wesl's S4 read shares it for the same wrap semantics.
  const mapSampler = device.createSampler({
    label: 'galaxy:sfMapPresentSampler',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // rgba16float, not rgba8unorm: the dust channel (w) must carry raw,
  // unclamped values above 1.0 — the swept-shell rim overshoot — which an
  // 8-bit unorm store would quantize/clamp away. Same filterable-storage-
  // format precedent as sfMapDustBlurTex below. Written by EITHER
  // generator's own final pack pass.
  const texture = device.createTexture({
    label: 'galaxy:sfMapTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  // S4's low-pass divisor — one texel per BLUR_FACTOR x BLUR_FACTOR src
  // block (192x64 at the current grid). rgba16float for the same
  // filterable-storage-format reason sfMapDustBlur.wesl documents.
  const sfMapDustBlurTex = device.createTexture({
    label: 'galaxy:sfMapDustBlurTex',
    size: [SF_MAP_AZ / DUST_BLUR_FACTOR, SF_MAP_RINGS / DUST_BLUR_FACTOR],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  // `copyTextureToBuffer` forces `bytesPerRow` to a 256-byte multiple; the
  // readback's decode strips the padding so it never reaches `GalaxySfMap.data`.
  // 8 bytes/texel (rgba16float = 4 lanes x 2 bytes), not 4: `decodeSfMapTexels`
  // is the f16 counterpart of the old direct-byte read.
  const readbackBytesPerRow = alignedBytesPerRow(SF_MAP_AZ * 8);
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:sfMapReadbackBuf',
    size: readbackBytesPerRow * SF_MAP_RINGS,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // rMin/rMax only — sfMapPresent.wesl's own small uniform, separate from
  // io.wesl's per-frame 'u' since the two change on entirely different
  // cadences (rebuild vs every frame).
  const gridUbo = device.createBuffer({
    label: 'galaxy:sfMapGridUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Built once — `texture`/`gridUbo` are the same GPU objects for this
  // module's whole lifetime, only their CONTENT changes per rebuild, and a
  // bind group only needs rebuilding when the OBJECT it references does.
  // This is exactly why switching generators never touches this bind group:
  // whichever runner's pack pass wrote `texture` last, this reads the same one.
  const presentBindGroup = device.createBindGroup({
    label: 'galaxy:sfMapPresentBG',
    layout: presentPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: deps.fieldUbo } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: mapSampler },
      { binding: 3, resource: { buffer: gridUbo } },
    ],
  });
  const dustBlurBindGroup = device.createBindGroup({
    label: 'galaxy:sfMapDustBlurBG',
    layout: dustBlurPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: sfMapDustBlurTex.createView() },
    ],
  });

  function encodeDustBlurPass(enc: GPUCommandEncoder): void {
    const pass = enc.beginComputePass({ label: 'galaxy:sfMapDustBlurPass' });
    pass.setPipeline(dustBlurPipe);
    pass.setBindGroup(0, dustBlurBindGroup);
    pass.dispatchWorkgroups(SF_MAP_AZ / DUST_BLUR_FACTOR / 8, SF_MAP_RINGS / DUST_BLUR_FACTOR / 8);
    pass.end();
  }

  return {
    texture,
    readbackBuffer,
    readbackBytesPerRow,
    presentPipeline: presentPipe,
    presentBindGroup,
    dustBlurTexture: sfMapDustBlurTex,
    gridBuffer: gridUbo,
    mapSampler,

    writeGrid(grid): void {
      device.queue.writeBuffer(gridUbo, 0, new Float32Array([grid.rMin, grid.rMax, 0, 0]));
    },

    clear(): void {
      // All-zero bytes decode to 0.0 in rgba16float, so the zero-fill trick
      // needs only the right row width (8 bytes/texel).
      device.queue.writeTexture(
        { texture },
        new Uint8Array(SF_MAP_AZ * SF_MAP_RINGS * 8),
        { bytesPerRow: SF_MAP_AZ * 8 },
        [SF_MAP_AZ, SF_MAP_RINGS],
      );
      // A stale blur under a cleared map would read as detail everywhere
      // (D=0 over Dblur>0 darkens the whole column); zeros make the ratio
      // degrade to 1.
      device.queue.writeTexture(
        { texture: sfMapDustBlurTex },
        new Uint8Array((SF_MAP_AZ / DUST_BLUR_FACTOR) * (SF_MAP_RINGS / DUST_BLUR_FACTOR) * 8),
        { bytesPerRow: (SF_MAP_AZ / DUST_BLUR_FACTOR) * 8 },
        [SF_MAP_AZ / DUST_BLUR_FACTOR, SF_MAP_RINGS / DUST_BLUR_FACTOR],
      );
    },

    encodeDustBlurPass,

    dispose(): void {
      texture.destroy();
      sfMapDustBlurTex.destroy();
      readbackBuffer.destroy();
      gridUbo.destroy();
    },
  };
}
