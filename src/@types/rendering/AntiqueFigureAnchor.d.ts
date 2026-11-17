/**
 * AntiqueFigureAnchor — one star a constellation figure is registered by: where
 * the engraver drew it on the sprite and where it truly is. Rows live in
 * `data/rendering/antiqueFigureAnchors.ts`.
 */
export type AntiqueFigureAnchor = {
  readonly star: string;
  /** J2000, degrees. */
  readonly raDeg: number;
  readonly decDeg: number;
  /** The star symbol's place on the sprite's atlas rect (padding included), 0..1 from its top left. */
  readonly u: number;
  readonly v: number;
};
