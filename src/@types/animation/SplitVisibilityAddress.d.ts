/** A visibility address read into its bare part (`flow`, `label:structure`) and its scoped
 * item, `undefined` for a bare address. */
export type SplitVisibilityAddress = {
  readonly bare: string;
  readonly item: string | undefined;
};
