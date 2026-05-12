import type { SpaceMouseInputFactory } from '../../input/SpaceMouseInputFactory';

export type CreateSpaceMouseSubsystemInput = {
  /**
   * Tween-cancel hook.  Called from `applyToCamera()` whenever the
   * puck is deflected.  Engine wires this to `tweens.cancel()`.
   */
  cancelTween: () => void;
  /**
   * Connection-change hook.  Forwarded from the underlying
   * SpaceMouseInput's onConnectionChange.  Engine wires this to the
   * `onSpaceMouseConnectedChange` UI callback so React's "Connected"
   * indicator drops back to false when the puck is unplugged.
   */
  onConnectionChange: (connected: boolean) => void;
  /**
   * Render-on-demand wake-up.  Called from the WebHID inputreport
   * listener (outside the rAF loop) so the next frame sees the new
   * axes.  Engine wires this to `scheduler.requestRender()`.
   */
  onAxes: () => void;
  /**
   * Optional factory override.  Production omits this and we use the
   * real `SpaceMouseInput` class; tests pass a stub factory so they
   * can drive `onAxes` / `onConnectionChange` directly.
   */
  inputFactory?: SpaceMouseInputFactory;
};
