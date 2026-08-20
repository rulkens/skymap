// lib/selectionEncoding.wesl — packed-identity encoding for selection / picking.
//
// ### Why this module exists
//
// Sister to 'src/data/selectionEncoding.ts'. The TS module is the
// authoritative source of truth; this file mirrors its constants and
// the 'packSelection' function so the shader side has a single
// importable home for the encoding instead of duplicating magic
// numbers inline.
//
// A parity test in 'tests/data/selectionEncoding.test.ts' reads this
// file as text, regex-extracts each 'const NAME: u32 = VALUE;' line,
// and asserts numerical equality with the TS export of the same name.
// Any future change to one side that doesn't match the other fails CI.
//
// ### Layout reminder
//
//   bits 26..31  →  sourceCode (6 bits, 0..63; 63 unallocated)
//   bits  0..25  →  localIdx   (26 bits, ≤ 67M)
//
// See the TS module's docstring for the full rationale, including why
// SELECTION_NONE_SENTINEL's literal value didn't change when the shift
// widened from 27 to 26.

/** Bit shift for the source code in the packed identity. */
const SELECTION_SOURCE_SHIFT: u32 = 26u;

/** Mask for the localIdx bits (the bottom 26 bits). */
const SELECTION_LOCAL_IDX_MASK: u32 = 0x03ffffffu;

/** 'Nothing selected' sentinel — top bits set, encoding the unallocated sourceCode. */
const SELECTION_NONE_SENTINEL: u32 = 0xffffffffu;

/** Reserved all-ones sourceCode — mirror of TS SELECTION_SOURCE_SENTINEL_CODE. */
const SELECTION_SOURCE_SENTINEL_CODE: u32 = 63u;

/** Offset the pick fragment adds before writing into the r32uint texture. */
const PICK_SENTINEL_OFFSET: u32 = 1u;

/** Source code for cluster structures — see TS Source.Cluster. */
const SOURCE_CODE_CLUSTER: u32 = 5u;

/** Source code for supercluster structures — see TS Source.Supercluster. */
const SOURCE_CODE_SUPERCLUSTER: u32 = 6u;

/** Source code for void structures — see TS Source.Void. */
const SOURCE_CODE_VOID: u32 = 7u;

/** Source code for nearby-galaxy-group structures — see TS Source.Group (= 15). */
const SOURCE_CODE_GROUP: u32 = 15u;

/**
 * Source code for the survey (Gaia bin) stars — see TS Source.GaiaStars (= 24).
 * The star pick fragment packs '(SOURCE_GAIA_STARS << 26) | recordIdx' so a
 * picked star's identity shares the one packed-encoding home instead of inlining
 * a bare 24u literal.
 */
const SOURCE_GAIA_STARS: u32 = 24u;

/** Pack a (sourceCode, localIdx) pair into the canonical u32 layout. */
fn packSelection(sourceCode: u32, localIdx: u32) -> u32 {
  return (sourceCode << SELECTION_SOURCE_SHIFT) | localIdx;
}
