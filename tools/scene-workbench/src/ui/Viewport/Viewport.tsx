/**
 * Viewport — owns the <canvas>, the WebGPU device, and the rAF frame driver.
 * The scene itself lives in `resources` (`RenderResources`), created here and
 * handed to the loading sagas via `registerSagaContext`: they own every write
 * to it, this component only reads it each frame. The context is registered
 * only once `initGpu` resolves — that dispatch is what starts the registry →
 * group load, and the group loader uploads into the device it finds here.
 * Nothing is drawn until task 14; the frame clears and submits so a dead
 * device shows up as a WebGPU error rather than a canvas nobody touched.
 */
import { useEffect, useRef, type ReactNode } from 'react';

import { initGpu, resizeCanvasToDisplay } from '../../../../../src/services/gpu/device';
import { createRenderResources, disposeScene } from '../../render/renderResources';
import { deviceLost } from '../../state/view/viewSlice';
import type { RegisterSagaContext, SceneStore } from '../../store/types';
import styles from './Viewport.module.css';

export type ViewportProps = {
  readonly store: SceneStore;
  readonly registerSagaContext: RegisterSagaContext;
};

function Viewport({ store, registerSagaContext }: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // Re-typed (not just narrowed) so the closures below don't re-check
    // nullability — TS drops a `const` narrowing across a function boundary.
    const canvas: HTMLCanvasElement = canvasEl;

    const resources = createRenderResources();
    let disposed = false;
    let rafHandle = 0;
    // Starts true so the first frame after the device lands always draws.
    let dirty = true;

    const frame = (): void => {
      if (disposed) return;
      const state = store.getState();
      if (state.view.deviceLost) return; // stop for good — the device is gone
      rafHandle = requestAnimationFrame(frame);
      const { gpu } = resources;
      if (!gpu) return;

      // The DOM read runs every tick, idle or not: a pure window resize is the
      // one change no store write would ever announce.
      if (resizeCanvasToDisplay(canvas)) dirty = true;
      if (!dirty) return;
      dirty = false;

      const encoder = gpu.device.createCommandEncoder({ label: 'scene-workbench-frame' });
      encoder
        .beginRenderPass({
          colorAttachments: [
            {
              view: gpu.context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        .end();
      gpu.device.queue.submit([encoder.finish()]);
    };

    // Every store write in this tool moves something a frame reads (asset
    // statuses, visibility, camera), including the ones that ride a
    // `disposeScene` — so `resources.epoch` needs no separate seat here.
    const unsubscribe = store.subscribe(() => {
      dirty = true;
    });

    void initGpu(canvas)
      .then((gpu) => {
        if (disposed) return;
        resources.gpu = gpu;
        void gpu.device.lost.then((info) => {
          // 'destroyed' is our own teardown, not a failure.
          if (disposed || info.reason === 'destroyed') return;
          console.error(`scene-workbench: GPU device lost (${info.reason}) — reload the page`);
          store.dispatch(deviceLost());
        });
        registerSagaContext({ canvas, resources });
        rafHandle = requestAnimationFrame(frame);
      })
      .catch((err: unknown) => {
        console.error('scene-workbench: WebGPU init failed', err);
      });

    return () => {
      disposed = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      unsubscribe();
      disposeScene(resources);
    };
  }, [store, registerSagaContext]);

  return <canvas ref={canvasRef} className={styles.root} />;
}

export default Viewport;
