/** One typed coordinate: signed degrees, and the axis its compass letter named (null when bare). */
export type CompassDegrees = {
  readonly deg: number;
  readonly axis: 'lat' | 'lon' | null;
};
