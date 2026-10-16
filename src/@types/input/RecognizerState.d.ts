import type { Press } from './Press';
import type { UnitPoint } from './UnitPoint';

/** Everything `recognize` carries between events; the pixel size is kept so a pinch span gets its aspect. */
export type RecognizerState = {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Pressed pointers in press order, each with its latest point. */
  readonly pointers: ReadonlyMap<number, UnitPoint>;
  /** The open held press, its driving pointer and the press point; null when nothing is held. */
  readonly held: {
    readonly press: Press;
    readonly driver: number;
    readonly from: UnitPoint;
  } | null;
  readonly pinching: boolean;
  /** Last pinch span in px; a lifted finger breaks the pair and the survivor drives nothing. */
  readonly pinchSpanPx: number;
  readonly pinchBroken: boolean;
  readonly lastTap: { readonly t: number; readonly at: UnitPoint; readonly press: Press } | null;
};
