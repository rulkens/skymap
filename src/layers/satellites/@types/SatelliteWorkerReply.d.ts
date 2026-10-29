/** SatelliteWorkerReply — propagation worker → main thread; `swept`'s arrays arrive transferred. */
export type SatelliteWorkerReply =
  | { readonly kind: 'ready'; readonly count: number }
  | {
      readonly kind: 'swept';
      readonly simMs: number;
      readonly posKm: Float32Array;
      readonly velKmS: Float32Array;
      readonly valid: Uint8Array;
    };
