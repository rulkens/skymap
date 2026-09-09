/** Epoch — reset-on-reference-change, then measure since. See `cameraEpochs.ts`. */
export type Epoch<Ref> = { readonly ref: Ref | null; readonly startMs: number | null };
