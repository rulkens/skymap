/**
 * The `asteroids.astb` layout (little-endian), shared by `writeAsteroidCatalog` and the Layer's decoder.
 * Header: magic, u16 version, u16 column count, u32 row count, u32 firstNumber, f64 epoch JD (TT), then
 * one {u16 id, u16 pad, u32 byte offset} entry per column; each column starts 4-byte aligned.
 * Row k is minor planet number firstNumber + k. Angles are ecliptic J2000 in turns.
 * Precision per column: docs/superpowers/specs/2026-11-12-asteroids-layer-design.md §4.1.
 */
export const ASTEROID_FORMAT = {
  /** 'ASTB' read as a little-endian u32. */
  magic: 0x42545341,
  version: 1,
  firstNumber: 1,
  headerBytes: 24,
  directoryEntryBytes: 8,
  /** Index = column id; `bytes` per row. a is f32 AU, e and the angles u24, H u16, G and flags u8. */
  columns: [
    { name: 'a', bytes: 4 },
    { name: 'e', bytes: 3 },
    { name: 'i', bytes: 3 },
    { name: 'node', bytes: 3 },
    { name: 'peri', bytes: 3 },
    { name: 'm0', bytes: 3 },
    { name: 'h', bytes: 2 },
    { name: 'g', bytes: 1 },
    { name: 'flags', bytes: 1 },
  ],
  /** e and turns are stored as round(x · u24Steps); angles wrap mod u24Steps. */
  u24Steps: 2 ** 24,
  /** H is stored as round((H + hOffset) · hScale); hNone marks a row MPC gives no H. */
  hOffset: 5,
  hScale: 100,
  hNone: 0xffff,
  /** G is stored as round((G + gOffset) · gScale); a blank G is written as gDefault (MPC's own default). */
  gOffset: 0.5,
  gScale: 100,
  gDefault: 0.15,
  /** Flags bits 0–2 hold the index in ASTEROID_CLASSES. */
  flagClassMask: 0b111,
  /** A placeholder row for a number missing upstream: never drawn, picked or searched. */
  flagAbsent: 1 << 5,
} as const;
