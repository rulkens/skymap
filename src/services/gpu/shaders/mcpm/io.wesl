// mcpm/io.wesl — the McpmUniforms layout and the storage bindings every MCPM kernel
// and view shares.
//
// The port swaps Polyphorm's RWTexture3D grids for storage buffers: WebGPU has no f16
// storage texture and allows read_write only on r32float, which caps the grid near a
// 900 long axis. 'GridElem' is the grid element type, authored as f32 so this file is
// valid standalone WGSL for the probe and editor tooling; the host rewrites the alias
// to f16 on the LINKED WGSL in specializeGridElement. That rewrite is an exact string
// match, so this alias is declared exactly once in the whole family and must keep this
// exact spelling.
alias GridElem = f32;

// Polyphorm's SimulationConfig (main.cpp:250); 'sharpness' is its move_sense_coef and
// '_pad0' its filler3. Every member is a 4-byte scalar, so offset = 4 x declaration
// index and sizeof == 64 with no padding anywhere. UNITS: angles in radians; positions
// and both distances in VOXELS — the host converts from Mpc through the grid box.
struct McpmUniforms {
  senseSpread: f32,
  senseDistance: f32,
  turnAngle: f32,
  moveDistance: f32,
  depositValue: f32,
  decayFactor: f32,
  centerAttraction: f32,
  worldWidth: i32,
  worldHeight: i32,
  worldDepth: i32,
  sharpness: f32,
  normalizationFactor: f32,
  nDataPoints: i32,
  nAgents: i32,
  nIteration: i32,
  _pad0: i32,
};

@group(0) @binding(0) var<uniform> sim: McpmUniforms;

// @group(1) is the per-pass resource group and these slot numbers are the contract the
// harness's explicit bind-group layouts are built from; a pass binds only the slots its
// kernel references (propagate 0 and 2..8, decay 0..2). Decay's slots are the fork's
// registers unchanged (u0 in, u1 out, u2 trace); propagate's sit one later than its own
// (u1 trace -> 2, u2..u7 particles -> 3..8) because slot 1 is decay's write target. The
// host swaps the physical buffers per step (the fork's is_a ping-pong); 'deposit' is
// read_write because WGSL storage has no write-only mode and propagate accumulates here.
@group(1) @binding(0) var<storage, read_write> deposit: array<GridElem>;
@group(1) @binding(1) var<storage, read_write> depositOut: array<GridElem>;
@group(1) @binding(2) var<storage, read_write> trace: array<GridElem>;

// The six SoA agent buffers in the fork's register order (u2..u7), each of length
// nDataPoints + nAgents; indices [0, nDataPoints) are the catalog points, theta = -5.0.
@group(1) @binding(3) var<storage, read_write> agentX: array<f32>;
@group(1) @binding(4) var<storage, read_write> agentY: array<f32>;
@group(1) @binding(5) var<storage, read_write> agentZ: array<f32>;
@group(1) @binding(6) var<storage, read_write> agentPhi: array<f32>;
@group(1) @binding(7) var<storage, read_write> agentTheta: array<f32>;
@group(1) @binding(8) var<storage, read_write> agentWeight: array<f32>;
