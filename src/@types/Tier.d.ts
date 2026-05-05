/**
 * Tier — three-way data-volume preset shared between the build pipeline and
 * the runtime hot-swap.
 *
 * - `small`  — mobile target, ~300k galaxies total. SDSS dropped, GLADE cut
 *              to its brightest ~256k, 2MRS + Famous kept whole (small).
 * - `medium` — default for desktops, ~600k total. Brightest ~156k SDSS +
 *              brightest ~400k GLADE + full 2MRS + full Famous.
 * - `large`  — opt-in full catalog (~3.5M). The pre-tier behaviour.
 *
 * The values are persisted in URL query strings and the runtime API only
 * (never on disk: the binary format is tier-agnostic). String-union — not a
 * numeric enum — because tier identity is human-readable telemetry, not a
 * file-format token.
 */
export type Tier = 'small' | 'medium' | 'large';
