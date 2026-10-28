/** SatelliteWorkerRequest — main thread → propagation worker. `init` transfers a `satellites.bin` copy. */
export type SatelliteWorkerRequest =
  | { readonly kind: 'init'; readonly buffer: ArrayBuffer }
  | { readonly kind: 'sweep'; readonly simMs: number };
