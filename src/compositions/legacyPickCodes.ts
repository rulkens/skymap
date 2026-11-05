/**
 * LEGACY_PICK_CODES — layer name → pick-source id → today's `Source` value, seeding the
 * allocator so Layers can move onto `pickCode` before codes go dense. Deleted with the
 * dense-code step; no new entries after that.
 */

export const LEGACY_PICK_CODES: Readonly<Record<string, Readonly<Record<string, number>>>> = {};
