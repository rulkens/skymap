/**
 * DensityVolumeVisualization — the raymarched overdensity overlay, ported to
 * behavioural parity with the spike's volume pass.
 *
 * This layer has NO compute work: it draws a single fullscreen triangle whose
 * fragment shader marches the shared velocity-field texture's alpha channel
 * (the overdensity delta) front-to-back through the [-1,1] world cube. The glow
 * blends additively into the engine's shared HDR target, the same way the flow
 * ribbon does, so the tonemap treats it like any other emission.
 *
 * ### Bind group from THIS pipeline's own layout
 *
 * The pipeline uses layout:'auto', and auto-derived bind-group layouts are
 * pipeline-SPECIFIC even when the binding declarations look identical (a known
 * WebGPU trap — see project memory). So the bind group is built from this
 * pipeline's getBindGroupLayout(0), never borrowed from a sibling layer.
 *
 * ### invMvp + the null-invert guard
 *
 * The fragment reconstructs each pixel's ray by unprojecting through the
 * inverse view-projection, so each frame we invert frame.viewProj with
 * gl-matrix. mat4.invert returns null for a singular matrix (degenerate camera
 * mid-tween); when that happens we skip the draw for the frame rather than
 * upload garbage that would paint NaNs into the HDR target.
 *
 * ### Fixed dMax / alpha
 *
 * Only 'intensity' (the raymarch gain) is a live slider. dMax and alpha come
 * through frame.params from the slice defaults; we destructure all three with
 * defaults both to narrow the number | undefined reads and to keep working if a
 * key is ever absent.
 */
import { mat4 } from 'gl-matrix';
import type { Visualization } from '../../../@types/visualizations/Visualization';
import type { SliderSpec } from '../../../@types/visualizations/SliderSpec';
import type { EngineContext } from '../../../@types/engine/EngineContext';
import type { FrameContext } from '../../../@types/engine/FrameContext';
import volumeWgsl from './shaders/volume.wesl?static';
import { VOLUME_PARAM_SPECS } from './params';

// Vol uniform: invMvp (16 floats) + gain + dMax + alphaScale = 19 floats, but
// the buffer is 80 bytes (20 floats) so the mat4 lands on a 16-byte boundary
// and the tail pads to a 16-byte multiple. We pack a Float32Array(20) scratch.
const VOL_BUFFER_BYTES = 80;
const VOL_FLOATS = 20;

export class DensityVolumeVisualization implements Visualization {
  readonly id = 'densityVolume';
  readonly label = 'Density';
  readonly paramSpecs: readonly SliderSpec[] = VOLUME_PARAM_SPECS;

  // GPU resources, populated by init().
  private device!: GPUDevice;
  private volBuf!: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private bindGroup!: GPUBindGroup;

  // Reusable scratch arrays to avoid per-frame allocation.
  private readonly scratch = new Float32Array(VOL_FLOATS);
  private readonly invMvp = mat4.create();

  init(ctx: EngineContext): void {
    const { device } = ctx;
    this.device = device;

    this.volBuf = device.createBuffer({
      size: VOL_BUFFER_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = ctx.createShaderModule(volumeWgsl, 'density.volume');

    // Additive (one/one) into the shared HDR target, for BOTH colour and alpha,
    // so the tonemap treats the glow exactly like the flow ribbon's emission.
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vsFull' },
      fragment: {
        module,
        entryPoint: 'fsVolume',
        targets: [
          {
            format: ctx.hdrFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.volBuf } },
        { binding: 1, resource: ctx.field.textureView },
        { binding: 2, resource: ctx.field.sampler },
      ],
    });
  }

  encode(pass: GPURenderPassEncoder, frame: FrameContext): void {
    // Destructure with defaults: params is a Record<string, number> (so each
    // read is number | undefined). intensity is the live slider; dMax and alpha
    // arrive from the slice defaults. The defaults narrow to plain numbers and
    // mirror defaultVolumeSlice in case a key is ever absent.
    const { intensity = 10, dMax = 1.2, alpha = 16 } = frame.params;

    // Invert the view-projection for ray reconstruction. mat4.invert returns
    // null for a singular matrix; skip the draw this frame rather than upload
    // garbage.
    const inverted = mat4.invert(this.invMvp, frame.viewProj as unknown as mat4);
    if (inverted === null) return;

    // Pack the 80-byte uniform: invMvp at offset 0 (16 floats), then
    // gain (intensity) @16, dMax @17, alphaScale (alpha) @18; @19 is padding.
    this.scratch.set(this.invMvp, 0);
    this.scratch[16] = intensity;
    this.scratch[17] = dMax;
    this.scratch[18] = alpha;
    this.device.queue.writeBuffer(this.volBuf, 0, this.scratch);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3); // fullscreen triangle
  }

  dispose(): void {
    this.volBuf.destroy();
  }
}
