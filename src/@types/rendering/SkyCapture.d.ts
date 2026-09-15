/**
 * SkyCapture — one six-face bake of the SKY as a row: where its faces go, when
 * it runs, and which view slots it claims. Its faces are layers of a declared
 * render-target row, which is what separates it from a `ProbeCapture`.
 */

import type { BodyRegion } from '../scene/BodyRegion';
import type { FadeBand } from '../math/FadeBand';

export type SkyCapture = {
  readonly kind: 'sky';
  /** `RenderTargetSpec.id` of the row whose 6 layers are this capture's faces. */
  readonly target: string;
  /** Region whose anchor the band keys on — camera distance to it, Mpc. */
  readonly anchor: BodyRegion;
  /** Outside this band nothing is captured and the target row is released. */
  readonly band: FadeBand;
  /**
   * Capture-camera near plane, Mpc. NOT the live cosmo near plane (0.01 Mpc):
   * the captured content sits at hundreds of au, INSIDE it, so reusing the live
   * one clips every S-star away.
   */
  readonly nearMpc: number;
  /** First `ReadyFrameContext.viewSlot` this capture's faces claim (base … base+5). */
  readonly viewSlotBase: number;
  /** false ⇒ one bake per band entry (settings writes are ignored once baked). */
  readonly rebakeOnSettings: boolean;
};
