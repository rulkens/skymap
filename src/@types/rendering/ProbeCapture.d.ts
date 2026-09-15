/**
 * ProbeCapture — one six-face bake of a BODY's surroundings, for its own
 * reflection probe. No target and no band: the faces write the subject body's
 * own cube texture, and which body that is changes frame to frame
 * (`ProbeCaptureRuntime.subject`) rather than being a property of the row.
 */

export type ProbeCapture = {
  readonly kind: 'probe';
  /** Edge of one cube face, px — fixed: a probe is minted with its mesh. */
  readonly faceSizePx: number;
  /** Capture-camera near plane, Mpc — the same role as `SkyCapture.nearMpc`. */
  readonly nearMpc: number;
  /** First `ReadyFrameContext.viewSlot` this capture's faces claim (base … base+5). */
  readonly viewSlotBase: number;
};
