/**
 * antiqueMapRenderer — the antique look's geography on Earth (c.1690 realms,
 * borders, rivers, towns, relief) drawn into the look's geography row. Nothing
 * is built or fetched until the first `draw`, which only the look reaches
 * (`ANTIQUE_ONLY_PASSES`): the map file loads then, and the frame it lands in
 * is woken by `requestRender`. Until it lands, and if it fails, nothing draws.
 * Three pipelines on one row, each owning its channels: fills write red, lines
 * green and blue, signs alpha, the last two max-blended.
 */

import type { AntiqueEarthMap } from '../@types/AntiqueEarthMap';
import type { AntiqueMapRenderer } from '../@types/AntiqueMapRenderer';
import type { AntiqueMapGpu } from '../@types/AntiqueMapGpu';
import { createShaderModuleWithDevLog } from '../../../../../services/gpu/shaderCompileLogger';
import { ANTIQUE_GEOGRAPHY_FORMAT } from '../../../../../data/rendering/antiqueLook';
import {
  ANTIQUE_EARTH_MAP_FILE,
  ANTIQUE_FILL_VERTEX_BYTES,
  ANTIQUE_LINE_VERTEX_BYTES,
  ANTIQUE_MAP_LEVELS,
  ANTIQUE_MAP_UNIFORM_FLOATS,
  ANTIQUE_SIGN_BYTES,
} from '../data/antiqueEarthMapFormat';
import { decodeAntiqueEarthMap } from '../load/decodeAntiqueEarthMap';
import { antiqueTownSigns } from '../utils/antiqueTownSigns';
import { ANTIQUE_EARTH_TOWNS } from '../../../../../data/labels/antiqueEarthTowns';
import fillCode from '../../../../../services/gpu/shaders/bodies/earth/antiqueMap/fill.wesl?static';
import lineCode from '../../../../../services/gpu/shaders/bodies/earth/antiqueMap/line.wesl?static';
import signCode from '../../../../../services/gpu/shaders/bodies/earth/antiqueMap/sign.wesl?static';

const MAX_BLEND: GPUBlendState = {
  color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
  alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
};

export function createAntiqueMapRenderer(
  device: GPUDevice,
  requestRender: () => void,
): AntiqueMapRenderer {
  let map: AntiqueEarthMap | null = null;
  let requested = false;
  let destroyed = false;
  let gpu: AntiqueMapGpu | null = null;

  function load(): void {
    requested = true;
    fetch(`/antique/${ANTIQUE_EARTH_MAP_FILE}`)
      .then((response) => {
        if (!response.ok) throw new Error(`answered ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => {
        if (destroyed) return;
        map = decodeAntiqueEarthMap(bytes);
        requestRender();
      })
      .catch((error: unknown) => console.warn('antique look: Earth map unavailable', error));
  }

  function upload(label: string, bytes: Uint8Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buffer = device.createBuffer({
      label,
      size: Math.max(16, Math.ceil(bytes.byteLength / 4) * 4),
      usage: usage | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return buffer;
  }

  function build(data: AntiqueEarthMap): AntiqueMapGpu {
    const uniforms = device.createBuffer({
      label: 'antique-map-uniforms',
      size: ANTIQUE_MAP_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const fillModule = createShaderModuleWithDevLog(device, fillCode, 'antique-map.fill');
    const lineModule = createShaderModuleWithDevLog(device, lineCode, 'antique-map.line');
    const signModule = createShaderModuleWithDevLog(device, signCode, 'antique-map.sign');
    const fill = device.createRenderPipeline({
      label: 'antique-map-fill-pipeline',
      layout: 'auto',
      vertex: {
        module: fillModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: ANTIQUE_FILL_VERTEX_BYTES,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }],
          },
        ],
      },
      fragment: {
        module: fillModule,
        entryPoint: 'fs',
        targets: [{ format: ANTIQUE_GEOGRAPHY_FORMAT, writeMask: GPUColorWrite.RED }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    const line = device.createRenderPipeline({
      label: 'antique-map-line-pipeline',
      layout: 'auto',
      vertex: {
        module: lineModule,
        entryPoint: 'vs',
        // The vertex array twice, the second slot bound one vertex on: segment i is (i, i + 1).
        buffers: [0, 2].map((first) => ({
          arrayStride: ANTIQUE_LINE_VERTEX_BYTES,
          stepMode: 'instance' as const,
          attributes: [
            { shaderLocation: first, offset: 0, format: 'float32x3' as const },
            { shaderLocation: first + 1, offset: 12, format: 'uint32' as const },
          ],
        })),
      },
      fragment: {
        module: lineModule,
        entryPoint: 'fs',
        targets: [
          {
            format: ANTIQUE_GEOGRAPHY_FORMAT,
            blend: MAX_BLEND,
            writeMask: GPUColorWrite.GREEN | GPUColorWrite.BLUE,
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    const sign = device.createRenderPipeline({
      label: 'antique-map-sign-pipeline',
      layout: 'auto',
      vertex: {
        module: signModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: ANTIQUE_SIGN_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'uint32' },
            ],
          },
        ],
      },
      fragment: {
        module: signModule,
        entryPoint: 'fs',
        targets: [
          // Replacing, in painter order: a nearer hill's body covers the one behind.
          { format: ANTIQUE_GEOGRAPHY_FORMAT, writeMask: GPUColorWrite.ALPHA },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    const bind = (pipeline: GPURenderPipeline, label: string) =>
      device.createBindGroup({
        label,
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniforms } }],
      });
    const fillVertices = upload(
      'antique-map-fill-vertices',
      data.fillVertices,
      GPUBufferUsage.VERTEX,
    );
    const fillIndices = upload('antique-map-fill-indices', data.fillIndices, GPUBufferUsage.INDEX);
    const lines = upload('antique-map-lines', data.lineVertices, GPUBufferUsage.VERTEX);
    const signs = upload('antique-map-signs', data.signs, GPUBufferUsage.VERTEX);
    const townBytes = antiqueTownSigns(ANTIQUE_EARTH_TOWNS);
    const towns = upload('antique-map-towns', townBytes, GPUBufferUsage.VERTEX);
    return {
      fill,
      line,
      sign,
      uniforms,
      fillBind: bind(fill, 'antique-map-fill-bind'),
      lineBind: bind(line, 'antique-map-line-bind'),
      signBind: bind(sign, 'antique-map-sign-bind'),
      buffers: [uniforms, fillVertices, fillIndices, lines, signs, towns],
      fillVertices,
      fillIndices,
      fillIndexCount: data.fillIndexCount,
      lines,
      lineLevelEnds: data.lineLevelEnds,
      signs,
      signCount: data.signCount,
      towns,
      townCount: townBytes.byteLength / ANTIQUE_SIGN_BYTES,
    };
  }

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    if (!requested) load();
    if (map === null) return;
    gpu ??= build(map);
    const g = gpu;
    device.queue.writeBuffer(g.uniforms, 0, uniforms);
    if (g.fillIndexCount > 0) {
      pass.setPipeline(g.fill);
      pass.setBindGroup(0, g.fillBind);
      pass.setVertexBuffer(0, g.fillVertices);
      pass.setIndexBuffer(g.fillIndices, 'uint32');
      pass.drawIndexed(g.fillIndexCount);
    }
    // Every level the zoom has begun to reveal: the strips are sorted by level.
    const detail = uniforms[22]!;
    const level = Math.min(ANTIQUE_MAP_LEVELS - 1, Math.floor(detail));
    const lineVertices = level < 0 ? 0 : g.lineLevelEnds[level]!;
    if (lineVertices > 1) {
      pass.setPipeline(g.line);
      pass.setBindGroup(0, g.lineBind);
      pass.setVertexBuffer(0, g.lines);
      pass.setVertexBuffer(1, g.lines, ANTIQUE_LINE_VERTEX_BYTES);
      pass.draw(6, lineVertices - 1);
    }
    // Signs keep painter order across levels, towns over hills; the vertex stage
    // culls the unrevealed.
    if (level >= 0) {
      pass.setPipeline(g.sign);
      pass.setBindGroup(0, g.signBind);
      for (const [buffer, count] of [
        [g.signs, g.signCount],
        [g.towns, g.townCount],
      ] as const) {
        if (count === 0) continue;
        pass.setVertexBuffer(0, buffer);
        pass.draw(6, count);
      }
    }
  }

  function destroy(): void {
    destroyed = true;
    gpu?.buffers.forEach((buffer) => buffer.destroy());
    gpu = null;
    map = null;
  }

  return { label: 'antiqueMapRenderer', draw, destroy };
}
