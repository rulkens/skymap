/**
 * PanelModel — CameraStateSection's view model: the one derivation that feeds
 * both the on-screen degrees and the full-precision-radians `copy all` dump,
 * so a pasted bug report matches what was looked at.
 */
import type { DofModel } from './DofModel';
import type { RawRow } from './RawRow';

export type PanelModel = {
  readonly header: string;
  readonly badge: string | null;
  readonly dofs: readonly DofModel[];
  /** Radians/raw for the dump; the `*Readout` strings are the same band on screen. */
  readonly band: readonly RawRow[];
  readonly markerReadout: string;
  readonly weightReadout: string;
  readonly rememberedTiltReadout: string;
  /** Null off a site arm. */
  readonly site: readonly RawRow[] | null;
  readonly raw: readonly RawRow[];
};
