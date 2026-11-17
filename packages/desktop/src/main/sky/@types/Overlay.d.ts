/** A local page laid over a whole window (addOverlay): `loaded` settles with its first load, `close` fades it out and removes it. */
export type Overlay = { loaded: Promise<void>; close: () => Promise<void> };
