/** One realm of the 1690 political map (`REALMS_1690`): a sovereign, an HRE
 * Imperial Circle, or a colonial claim. Its fill takes one plate pigment. */
export type Realm1690 = {
  readonly key: string;
  /** Latin capitals as an Amsterdam plate of 1690 letters it (V for U is the label code's job). */
  readonly name: string;
  readonly modern: string;
  /** Realms sharing an empire meet at a rank-2 border; absent: its own empire. */
  readonly empire?: string;
  /** Label anchor [lon, lat] where the bake's interior point is not where a 1690 plate letters it. */
  readonly anchor?: readonly [number, number];
  /** Kept only this far from the sea: period maps left colonial interiors unbounded. */
  readonly coastalBandKm?: number;
};
