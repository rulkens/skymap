import type { Vec2 } from '../../../../@types/math/Vec2';

export type TerrainPickCursor = {
  /** In the canvas's texture pixels. Null until a mouse hovers with the overlay on. */
  texPx: Readonly<Vec2> | null;
  destroy(): void;
};
