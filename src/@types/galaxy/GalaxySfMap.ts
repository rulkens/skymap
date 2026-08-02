/**
 * GalaxySfMap — one CPU-side readback of the SSPSF automaton's packed output
 * (`sfMapPack.wesl`): a log-polar RGBA8 grid, R=gas fraction, G=recent SF,
 * B=older activity (A unused). `data` is TIGHTLY packed (az*4 bytes per row,
 * no GPU `copyTextureToBuffer` row-alignment padding) — see
 * `createGalaxyEngine.ts`'s `scheduleSfMapReadback` for where the 256-byte
 * stride gets stripped back out. `rMin`/`rMax` are the log-radial bounds THIS
 * readback's grid was built over (`sfMapGridRadius`), needed to invert
 * `sfMapRingRadius` when sampling.
 */
export type GalaxySfMap = {
  readonly az: number;
  readonly rings: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly data: Uint8Array;
};
