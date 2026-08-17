/**
 * Viewport — owns the <canvas> and drives the render loop.
 *
 * T1 has no MCPM simulation yet: each frame clears the RenderGraph's HDR
 * accumulation target to a fixed colour and tonemaps it through to the
 * swap-chain, so the empty shell shows a visibly non-black canvas rather than
 * an ambiguous "did it even boot" blank. `createRenderGraph`/`initGpu` are
 * async-boundary work, so mount runs them in an effect and disposes on
 * unmount; a `disposed` flag guards the case where unmount races the GPU init.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { initGpu, resizeCanvasToDisplay } from '../../../../src/services/gpu/device';
import { createRenderGraph, type RenderGraph } from '../render/RenderGraph';

// Placeholder clear colour — deep violet, distinct from both black (a dead
// canvas) and the runtime app's palette, so the visual check can tell "the
// shell booted" apart from "nothing rendered".
const CLEAR_COLOR: readonly [number, number, number] = [0.08, 0.03, 0.16];
const EXPOSURE = 1;
const CONTRAST = 1;

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100vw',
  height: '100vh',
};

function Viewport(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let rafHandle = 0;
    let renderGraph: RenderGraph | null = null;

    initGpu(canvas)
      .then(({ device, context, format }) => {
        if (disposed) return;
        const makeShader = (code: string, label: string): GPUShaderModule =>
          device.createShaderModule({ code, label });
        const graph = createRenderGraph(device, format, makeShader);
        renderGraph = graph;

        const frame = (): void => {
          if (disposed) return;
          rafHandle = requestAnimationFrame(frame);

          resizeCanvasToDisplay(canvas);
          graph.resize(canvas.width, canvas.height);

          const encoder = device.createCommandEncoder({ label: 'mcpm-workbench-frame' });
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: graph.accumView(),
                loadOp: 'clear',
                clearValue: { r: CLEAR_COLOR[0], g: CLEAR_COLOR[1], b: CLEAR_COLOR[2], a: 1 },
                storeOp: 'store',
              },
            ],
          });
          pass.end();

          graph.tonemap(encoder, context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
          device.queue.submit([encoder.finish()]);
        };
        rafHandle = requestAnimationFrame(frame);
      })
      .catch((err: unknown) => {
        console.error('mcpm-workbench: GPU init failed', err);
      });

    return () => {
      disposed = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      renderGraph?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

export default Viewport;
