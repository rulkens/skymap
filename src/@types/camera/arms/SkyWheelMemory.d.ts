/** The sky arm's memory (spec §6.1): when its last wheel step landed, on the drain's clock (ms),
 * so the exit lift can wait for a fresh scroll. Empty is `−∞`. */
export type SkyWheelMemory = { readonly lastWheelMs: number };
