/**
 * encodeVolumes — unit tests for the pre-HDR half-res render-pass helper.
 *
 * Coverage:
 *   - opens exactly one beginRenderPass against the half-res view with
 *     loadOp='clear', clearValue=(0,0,0,0)
 *   - calls scalarVolumeRenderer.draw inside the pass, passing the
 *     HALF-RES viewport size (not the full canvas size)
 *   - ends the render pass exactly once
 *   - threads timestampWrites onto the pass descriptor when one is
 *     passed in (split-encoder / timing path)
 *   - omits timestampWrites when one isn't passed (single-pass path)
 *   - does nothing if scalarVolumeRenderer is null
 */
import { describe, it, expect, vi } from 'vitest';
import { encodeVolumes } from '../../../../src/services/engine/frame/encodeVolumes';
import type { mat4 } from 'gl-matrix';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

function makeFakePass() {
  return {
    end: vi.fn(),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeFakeEncoder() {
  const pass = makeFakePass();
  const beginRenderPass = vi.fn(() => pass);
  return {
    encoder: { beginRenderPass } as unknown as GPUCommandEncoder,
    pass,
    beginRenderPass,
  };
}

function makeCtx(): ReadyFrameContext {
  const offscreenView = { __id: 'half' } as unknown as GPUTextureView;
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    renderer: {} as never,
    postProcess: { view: {} as GPUTextureView, resize: vi.fn(), draw: vi.fn(), destroy: vi.fn() } as never,
    volumeOffscreen: { view: offscreenView, resize: vi.fn(), destroy: vi.fn() },
    texturedImpostors: {} as never,
  };
}

describe('encodeVolumes', () => {
  it('opens one render pass against the half-res view with a (0,0,0,0) clear', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const scalarVolumeRenderer = { draw: vi.fn(), hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      fadeOpacityOf: () => 1,
      timestampWrites: undefined,
    });
    expect(env.beginRenderPass).toHaveBeenCalledTimes(1);
    const desc = (env.beginRenderPass as ReturnType<typeof vi.fn>).mock.calls[0]![0] as GPURenderPassDescriptor;
    const att = Array.from(desc.colorAttachments as any)[0] as any;
    expect(att.view).toBe(ctx.volumeOffscreen.view);
    expect(att.loadOp).toBe('clear');
    expect(att.storeOp).toBe('store');
    expect(att.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(env.pass.end).toHaveBeenCalledTimes(1);
  });

  it('passes the half-res viewport size to scalarVolumeRenderer.draw', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx(); // canvas 1280x720 → half-res 640x360
    const drawSpy = vi.fn();
    const scalarVolumeRenderer = { draw: drawSpy, hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      fadeOpacityOf: () => 1,
      timestampWrites: undefined,
    });
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    // The viewport size passed to the raymarcher must be the HALF-RES
    // size — that's what its per-fragment jitter dither is normalised
    // against, and it controls the dither pattern's spatial frequency.
    expect(args[2]).toEqual([640, 360]);
  });

  it('floors the half-res viewport size and clamps to min 1 px', () => {
    const env = makeFakeEncoder();
    const ctx: ReadyFrameContext = { ...makeCtx(), canvasSize: { width: 1, height: 1 } };
    const drawSpy = vi.fn();
    const scalarVolumeRenderer = { draw: drawSpy, hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      fadeOpacityOf: () => 1,
      timestampWrites: undefined,
    });
    expect(drawSpy.mock.calls[0]![2]).toEqual([1, 1]);
  });

  it('threads timestampWrites onto the pass descriptor when provided', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const tw = {
      querySet: {} as GPUQuerySet,
      beginningOfPassWriteIndex: 18,
      endOfPassWriteIndex: 19,
    };
    const scalarVolumeRenderer = { draw: vi.fn(), hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      fadeOpacityOf: () => 1,
      timestampWrites: tw,
    });
    const desc = (env.beginRenderPass as ReturnType<typeof vi.fn>).mock.calls[0]![0] as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(desc.timestampWrites).toBe(tw);
  });

  it('omits timestampWrites when none is provided', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const scalarVolumeRenderer = { draw: vi.fn(), hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      fadeOpacityOf: () => 1,
      timestampWrites: undefined,
    });
    const desc = (env.beginRenderPass as ReturnType<typeof vi.fn>).mock.calls[0]![0] as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(desc.timestampWrites).toBeUndefined();
  });

  it('is a no-op when scalarVolumeRenderer is null', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer: null,
      fadeOpacityOf: () => 1,
      timestampWrites: undefined,
    });
    expect(env.beginRenderPass).not.toHaveBeenCalled();
  });

  it('is a no-op when no fields are active (no empty render pass)', () => {
    // Renderer present but `hasActiveFields()` returns false — e.g. all
    // fields disabled or at zero intensity.  Without this guard we'd
    // still open a `beginRenderPass(loadOp: 'clear')` for nothing, which
    // on M1 costs a tile-RAM round-trip per frame for an unused target.
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const drawSpy = vi.fn();
    const scalarVolumeRenderer = {
      draw: drawSpy,
      hasActiveFields: () => false,
    } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      fadeOpacityOf: () => 1,
      timestampWrites: undefined,
    });
    expect(env.beginRenderPass).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });
});
