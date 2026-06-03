/**
 * FilamentStore — thin store tracking filament-skeleton load status.
 *
 * The line-strip geometry lives on `filamentRenderer` (GPU-resident); the
 * store holds only the status the CPU reads — whether filaments are loaded
 * and their strip / vertex counts (for the status UI). Before per-type
 * stores these counts had no durable home; this gives them one alongside
 * the other data stores.
 */
export type FilamentStore = {
  /** True once the filament skeleton has been committed to the renderer. */
  readonly loaded: boolean;
  /** Number of line strips in the loaded skeleton (0 until loaded). */
  readonly stripCount: number;
  /** Total vertex count across all strips (0 until loaded). */
  readonly vertexCount: number;
  /** Record a successful load with its geometry counts. */
  setLoaded(stripCount: number, vertexCount: number): void;
};
