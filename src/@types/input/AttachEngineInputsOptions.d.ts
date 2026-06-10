/**
 * AttachEngineInputsOptions — the option bag handed to
 * `attachEngineInputs`.  Each callback below is the *semantic* engine
 * action (pointer moved, pointer left, etc.) — the inputBindings
 * module already converts `e.clientX/Y` to a CSS-pixel record and
 * owns the `scheduler.requestRender()` wake for events no change
 * channel covers (Escape stays wake-free: it routes into the
 * selection setters, which own their wake).
 */

import type { RenderScheduler } from '../../services/engine/subsystems/renderScheduler';
import type { CssPx } from './CssPx';

export type AttachEngineInputsOptions = {
  /** The canvas element pointer listeners attach to. */
  canvas: HTMLCanvasElement;
  /** Render scheduler — wakes the loop for channel-uncovered events. */
  scheduler: RenderScheduler;
  /** Pointer moved over the canvas; arg is the CSS-pixel position. */
  onPointerMove: (cssPx: CssPx) => void;
  /** Pointer left the canvas; engine clears hover state. */
  onPointerLeave: () => void;
  /** Pointer pressed on the canvas; engine cancels tweens + clears hover. */
  onPointerDown: () => void;
  /** Pointer released anywhere (window-level); engine releases drag flag. */
  onPointerUp: () => void;
  /** Escape pressed anywhere (window-level); engine clears selection. */
  onEscape: () => void;
  /** Window resized; engine bumps the scheduler so the next frame resyncs. */
  onResize: () => void;
};
