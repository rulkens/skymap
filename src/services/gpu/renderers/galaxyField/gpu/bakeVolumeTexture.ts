/**
 * bakeVolumeTexture — the one-shot compute bake shared by dustNoiseTex,
 * warpNoiseTex and starGrainTex: build a compute pipeline from the given
 * WGSL, dispatch it once into a fresh `size^3` rgba8unorm storage texture,
 * and hand back a repeat/linear sampler alongside it. Every caller's volume
 * is view- and param-independent (fixed octave bands, no camera/galaxy
 * input), so this runs ONCE at construction in its own encoder — never
 * inside the per-frame encoder. `repeat` addressing is what lets each
 * consumer shader tile the volume in world space with no manual wrap.
 */
export type BakeVolumeTextureSpec = {
  /** Base debug label (e.g. `'galaxy:dustNoise'`) — suffixed per sub-resource. */
  readonly label: string;
  readonly code: string;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  /** Cube edge length in texels. */
  readonly size: number;
  /** Matches the shader's own `@workgroup_size(N, N, N)` — dispatch is `size / workgroupSize` per axis. */
  readonly workgroupSize: number;
};

export type BakedVolumeTexture = {
  readonly texture: GPUTexture;
  readonly sampler: GPUSampler;
};

export function bakeVolumeTexture(
  device: GPUDevice,
  spec: BakeVolumeTextureSpec,
): BakedVolumeTexture {
  const module = spec.makeShader(spec.code, `${spec.label}Bake`);
  const pipeline = device.createComputePipeline({
    label: `${spec.label}BakePipe`,
    layout: 'auto',
    compute: { module, entryPoint: 'cs' },
  });
  const texture = device.createTexture({
    label: `${spec.label}Tex`,
    size: [spec.size, spec.size, spec.size],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const sampler = device.createSampler({
    label: `${spec.label}Sampler`,
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    addressModeW: 'repeat',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bakeBG = device.createBindGroup({
    label: `${spec.label}BakeBG`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: texture.createView() }],
  });
  const bakeEnc = device.createCommandEncoder({ label: `${spec.label}Bake` });
  const bakePass = bakeEnc.beginComputePass({ label: `${spec.label}BakePass` });
  bakePass.setPipeline(pipeline);
  bakePass.setBindGroup(0, bakeBG);
  const dispatch = spec.size / spec.workgroupSize;
  bakePass.dispatchWorkgroups(dispatch, dispatch, dispatch);
  bakePass.end();
  device.queue.submit([bakeEnc.finish()]);

  return { texture, sampler };
}
