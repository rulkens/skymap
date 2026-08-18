// mcpm/constants.wesl — workgroup shapes and the cross-kernel quirk registry for skymap's
// MCPM port of Polyphorm's D3D11 kernels.
//
// Every quirk defaults to the FORK's behaviour, so the port reproduces the published SDSS
// cube rather than a tidied-up field. The host flips one by name through the pipeline's
// constants[] map, turning a quirk-by-quirk A/B hunt into a pipeline rebuild rather than a
// shader edit. Derivations live in the fork's HLSL-to-WGSL diary, translation-notes.md.
// This file is the COMPLETE QUIRK_* registry — every override lives here, since the
// quirk-sweep and the host's pipeline-constants map both enumerate it by name. Fork
// feature #defines (PROBABILISTIC_SAMPLING, AGENT_REROUTING, FIXED_AGENT_DISTANCE_SAMPLING, IGNORE_DATA) are features, not quirks, and stay put.

override PROPAGATE_WG_X: u32 = 10u;  // cs_agents_propagate.hlsl:86 numthreads(10,10,10) —
override PROPAGATE_WG_Y: u32 = 10u;  // 1000 invocations, over the DEFAULT limit of 256, so
override PROPAGATE_WG_Z: u32 = 10u;  // the harness must request 1024 or reshape via these.

override DECAY_WG_X: u32 = 8u;       // cs_field_decay.hlsl:57 numthreads(8,8,8) — 512, also
override DECAY_WG_Y: u32 = 8u;       // over 256, but each invocation writes one voxel from
override DECAY_WG_Z: u32 = 8u;       // its own global id, so a reshape is bitwise identical.

const N_HISTOGRAM_BINS: u32 = 17u;   // main.cpp:206 — 0..15 count, 16 holds 1e5 x max
// config.polyp's 'Histogram base = 10.0' default.
const HISTOGRAM_BASE: f32 = 10.0;

override HISTOGRAM_WG_X: u32 = 10u;  // cs_density_histo.wgsl's own WG_X/Y/Z override, same
override HISTOGRAM_WG_Y: u32 = 10u;  // (10,10,10) shape as propagate's; the histogram dispatch
override HISTOGRAM_WG_Z: u32 = 10u;  // reuses propagate's gridZ (main.cpp: identical formula).

// cs_agents_propagate.hlsl:44 guards m_w where it means m_z: a zero m_z is never repaired.
override QUIRK_RNG_SEED_GUARD_TYPO: bool = true;

// Dispatch truncation (main.cpp:1121) is a HOST-side quirk — the harness's dispatch math, not this kernel.
// The propagate kernel always bounds-guards its agent index, bitwise identical under the fork's truncating
// dispatch, which prevents an out-of-range index being CLAMPED onto a real agent under a covering dispatch.

// cs_field_decay.hlsl:71-73 wrap the 27-tap with integer '%' (sign of dividend): the
// deposit field is periodic across the high faces, absorbing and darkened across zero.
override QUIRK_NONPERIODIC_LOW_BOUNDARY: bool = true;

// cs_agents_propagate.hlsl:140/145 truncate the float sensing offsets toward zero with int3(); off = round instead.
override QUIRK_INT3_TRUNCATED_SENSING: bool = true;

// cs_agents_propagate.hlsl:138 loads a value that is overwritten before its only read; off = skip the dead load.
override QUIRK_DEAD_CURRENT_DEPOSIT_READ: bool = true;

// cs_field_decay.hlsl:69's all() bug: 19 of the 27 taps (centre + faces + EDGES) weigh 1.0, only the 8 corners get the falloff; off = intended centre-only 1.0 with 1/sqrt falloff elsewhere.
override QUIRK_DECAY_WEIGHT_ALL_INT3: bool = true;

// cs_field_decay.hlsl:93 trace decay is 0.985 + 0.01 * rand; off = the commented-out flat 0.99 (NOT 1.0).
override QUIRK_DITHERED_TRACE_DECAY: bool = true;
