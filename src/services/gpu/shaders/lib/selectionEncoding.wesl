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
//   bits 27..31  →  sourceCode (5 bits, 0..31; 31 unallocated)
//   bits  0..26  →  localIdx   (27 bits, ≤ 134M)
//
// See the TS module's docstring for the full rationale.

/** Bit shift for the source code in the packed identity. */
const SELECTION_SOURCE_SHIFT: u32 = 27u;

/** Mask for the localIdx bits (the bottom 27 bits). */
const SELECTION_LOCAL_IDX_MASK: u32 = 0x07ffffffu;

/** 'Nothing selected' sentinel — top 5 bits set, encoding unallocated source 31. */
const SELECTION_NONE_SENTINEL: u32 = 0xffffffffu;

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

/** Pack a (sourceCode, localIdx) pair into the canonical u32 layout. */
fn packSelection(sourceCode: u32, localIdx: u32) -> u32 {
  return (sourceCode << SELECTION_SOURCE_SHIFT) | localIdx;
}
