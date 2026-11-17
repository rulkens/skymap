/**
 * STRM v1 — the stellar-streams particle bin, read straight into a GPU instance buffer.
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0     u32   magic          = "STRM" (0x4D525453)
 *     4     u32   version        = 1
 *     8     u32   particleCount
 *     12    u32   streamCount    (stream indices run 0 … streamCount − 1)
 *
 *     ── PER-PARTICLE (40 bytes = 10 × f32), particle i at 16 + 40·i ───────
 *     0     f32×3 position, heliocentric equatorial, Mpc
 *     12    f32×3 unit motion tangent (same frame)
 *     24    f32   size, Mpc
 *     28    f32   luminosity
 *     32    f32   colour t ∈ [0, 1]
 *     36    f32   stream index (integer-valued; 0 = Sagittarius)
 *
 * Total size: 16 + 40 · particleCount. The renderer's vertex attributes read offsets 0, 12 and 24
 * (size, luminosity, colour and index as one float32x4), so any change here is a version bump.
 */

/** "STRM" as a little-endian u32: bytes S T R M in memory order. */
export const STELLAR_STREAMS_MAGIC = 0x4d525453;
export const STELLAR_STREAMS_VERSION = 1;
export const STELLAR_STREAMS_HEADER_BYTES = 16;
export const STELLAR_STREAMS_RECORD_F32 = 10;
