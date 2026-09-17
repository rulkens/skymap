/** How a view maps camera space to clip space; one `CAMERA_PROJECTIONS` row per kind. Metres. */
export type CameraProjection =
  | {
      readonly kind: 'perspective';
      readonly fovYRad: number;
      readonly nearM: number;
      readonly farM: number;
    }
  | {
      readonly kind: 'orthographic';
      readonly halfHeightM: number;
      readonly nearM: number;
      readonly farM: number;
    };
