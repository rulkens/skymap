// mcpm/constants.wesl — workgroup shapes and the cross-kernel quirk registry for
// skymap's MCPM port of Polyphorm's D3D11 kernels.
//
// Every quirk defaults to the FORK's behaviour, so the port reproduces the published
// SDSS cube rather than a tidied-up field. The host flips one by name through the
// pipeline's constants[] map, which makes the quirk-by-quirk A/B hunt a pipeline
// rebuild instead of a shader edit. Derivations live in the fork's HLSL->WGSL diary,
// docs/superpowers/research/m2/wgsl-drafts/translation-notes.md. A toggle read by a
// single kernel stays in that kernel's own file, as it does in the fork.

override PROPAGATE_WG_X: u32 = 10u;  // cs_agents_propagate.hlsl:86 numthreads(10,10,10) —
override PROPAGATE_WG_Y: u32 = 10u;  // 1000 invocations, over the DEFAULT limit of 256, so
override PROPAGATE_WG_Z: u32 = 10u;  // the harness must request 1024 or reshape via these.

override DECAY_WG_X: u32 = 8u;       // cs_field_decay.hlsl:57 numthreads(8,8,8) — 512, also
override DECAY_WG_Y: u32 = 8u;       // over 256, but each invocation writes one voxel from
override DECAY_WG_Z: u32 = 8u;       // its own global id, so a reshape is bitwise identical.

const N_HISTOGRAM_BINS: u32 = 17u;   // main.cpp:206 — 0..15 count, 16 holds 1e5 x max

// cs_agents_propagate.hlsl:44 guards m_w where it means m_z: a zero m_z is never repaired.
override QUIRK_RNG_SEED_GUARD_TYPO: bool = true;

// main.cpp:1121 dispatches ((nAgents + nDataPoints)/100)/1000 groups under integer
// truncation; ON = propagate has NO tail guard, OFF = host covers the tail, kernel returns.
override QUIRK_DISPATCH_TRUNCATION: bool = true;

// cs_field_decay.hlsl:71-73 wrap the 27-tap with integer '%' (sign of dividend): the
// deposit field is periodic across the high faces, absorbing and darkened across zero.
override QUIRK_NONPERIODIC_LOW_BOUNDARY: bool = true;
