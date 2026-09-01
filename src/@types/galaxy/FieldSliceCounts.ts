/**
 * FieldSliceCounts — how the last repack sliced `fieldComps`: the `emission`
 * components first, of which the leading `primary` belong to the central
 * galaxy, then the central galaxy's `dust`.
 *
 * `emission` is what the field pass instances. The trailing dust slice is only
 * ever read from inside an emission fragment, never drawn as its own quad, so
 * this is deliberately NOT the buffer's own record count, which covers both.
 */

export type FieldSliceCounts = {
  readonly emission: number;
  readonly primary: number;
  readonly dust: number;
};
