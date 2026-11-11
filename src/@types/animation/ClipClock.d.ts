/** Where a clip's clock stands: the t drawn, and `held` while a running transport is clamped at its end. */
export type ClipClock = { readonly sec: number; readonly held: boolean };
