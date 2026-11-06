/**
 * The sky arm's memory (spec §6.1): wheel-out spent past the widest lens, as
 * Σ ln f, and when the last of it landed (the drain's clock, ms), so a pause
 * longer than the decay starts the count over. Empty is `{ 0, −∞ }`.
 */
export type SkyExitPush = { readonly pushLn: number; readonly lastPushMs: number };
