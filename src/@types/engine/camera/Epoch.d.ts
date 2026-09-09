/**
 * Epoch — a pure "reset-on-reference-change, then measure since" primitive,
 * replacing one `last*Ref` + `*StartMs` pair of the mutable `CameraClock`.
 */
export type Epoch<Ref> = { readonly ref: Ref | null; readonly startMs: number | null };
