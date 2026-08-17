/**
 * GalaxyPointVertexLayout — the byte-for-byte contract shared by three homes.
 *
 * The per-instance vertex record and the pick uniform buffer form a
 * three-way contract: `galaxyPointRenderer`'s vertex-buffer packing, the
 * `pickRenderer` pipeline, and the `points/*.wesl` shaders must all agree
 * on the same stride, byte offsets, and `shaderLocation`s.  A mismatch
 * either validation-errors at pipeline creation or, worse, silently reads
 * garbage bytes into the wrong attribute.
 *
 * The layout lives in its own module rather than inside `galaxyPointRenderer.ts`
 * so neither renderer "owns" the shared truth: the point and pick pipelines
 * import the same constants from a neutral home, and a layout change is a
 * single edit here instead of a hunt for the authoritative copy.
 *
 * @module
 */

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * 4-byte slots per catalog point in the vertex buffer.  Matches the
 * `PerVertex` struct in `points/io.wesl`:
 *
 *   [x, y, z, magnitude, colorIndex,
 *    axisRatio (sign bit = isFallback flag),
 *    paCos, paSin, radiusMpc (sign bit = diameterIsFallback),
 *    vMaxWeight, schechterRatio, angularDensityWeight, absMag, sbAmp]
 *
 * Every slot is f32; the fallback-orientation bit rides on the sign of
 * axisRatio.  Identity comes from `(sourceCode << 27) | instance_index`
 * in the shader — no per-vertex global ID needed.
 *
 * paCos/paSin and absMag are galaxy-static values baked at upload so the
 * vertex stage skips a cos+sin and a log10+sqrt per invocation — see the
 * layout docblock in `buildPointInterleavedBuffer.ts` for the trade.
 */
export const SLOTS_PER_GALAXY_POINT = 14;

/**
 * Byte stride between per-instance records — 14 × 4 = 56.  Both
 * pipelines (point + pick) declare this stride; mismatched values
 * either validate-error or silently read garbage.
 */
export const POINT_STRIDE = SLOTS_PER_GALAXY_POINT * 4; // 56 bytes

/** Slot 5: galaxy b/a ratio.  `abs(axisRatio)` for the ellipse mask; sign bit flags a fallback orientation. */
const AXIS_RATIO_BYTE_OFFSET = 20;

/**
 * Slots 6/7: cos/sin of the negated east-of-north position angle —
 * the exact pair the shader forwards as `ellipse.xy`, pre-baked.
 */
const PA_COS_SIN_BYTE_OFFSET = 24;

/**
 * Slot 8: padded billboard radius in Mpc.  Baked at upload as
 * `max(diameterKpc, 30) * 2 / 1000` — folds in 4× thumbnail-footprint
 * padding and the synthetic-fallback floor.  Vertex shader takes
 * `abs()` then divides by distance_Mpc for angular radius; the sign bit
 * flags a fallback-diameter estimate (mirrors axisRatio's sign bit).
 */
const RADIUS_MPC_BYTE_OFFSET = 32;

/** Slot 9: per-galaxy 1/V_max multiplier (Malmquist mode 2).  Baked from m, distance, and the galaxy catalog flux limit. */
const VMAX_WEIGHT_BYTE_OFFSET = 36;

/** Slot 10: Schechter density-correction ratio (Malmquist mode 3).  Default 1.0; real values spliced in lazily when the user picks mode 3. */
const SCHECHTER_RATIO_BYTE_OFFSET = 40;

/**
 * Slot 11: HEALPix angular re-weight (Malmquist mode 4).  Default
 * 1.0; real per-galaxy values spliced in lazily by
 * `biasCorrectionSubsystem` when the user first picks mode 4 (same
 * pattern as Schechter).
 *
 * Per-vertex (not uniform) because the weight depends on each galaxy's
 * HEALPix cell + log-distance shell, which in turn depend on the
 * whole cloud's distribution.  The bake is three linear passes plus
 * one sort — ~150 ms for full GLADE, fine for a user-initiated toggle
 * but too slow for the .bin-arrival path.
 */
const ANGULAR_WEIGHT_BYTE_OFFSET = 44;

/**
 * Slot 12: absolute magnitude from the offset-normalised apparent
 * magnitude (slot 3) — the Malmquist mode-1 gate compares this against
 * `u.absMagLimit` directly instead of re-deriving it per vertex.
 */
const ABS_MAG_BYTE_OFFSET = 48;

/** Slot 13: physical surface-brightness amplitude (see buildPointInterleavedBuffer slot 13). */
const SB_AMP_BYTE_OFFSET = 52;

/**
 * Vertex buffer attribute table — single source of truth, imported
 * verbatim by `PickRenderer` so both pipelines stay layout-locked.
 *
 *   0  position (vec3<f32>)
 *   1  magnitude (f32)
 *   2  colorIndex (f32)
 *   3  axisRatio (sign bit = isFallback)
 *   4  paCosSin (vec2<f32>)
 *   5  radiusMpc (sign bit = diameterIsFallback)
 *   6  vMaxWeight
 *   7  schechterRatio
 *   8  angularDensityWeight
 *   9  absMag
 *   10 sbAmp
 *
 * Named offset constants only exist for slots that other code reads by
 * name (bake / shader); position/magnitude/colorIndex use literal
 * offsets.
 */
export const GALAXY_POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32' },
  { shaderLocation: 2, offset: 16, format: 'float32' },
  { shaderLocation: 3, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 4, offset: PA_COS_SIN_BYTE_OFFSET, format: 'float32x2' },
  { shaderLocation: 5, offset: RADIUS_MPC_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 6, offset: VMAX_WEIGHT_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 7, offset: SCHECHTER_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 8, offset: ANGULAR_WEIGHT_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 9, offset: ABS_MAG_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 10, offset: SB_AMP_BYTE_OFFSET, format: 'float32' },
];

// ─── Uniform buffer byte offsets (per-pass partial writes) ──────────────────

/**
 * Byte offsets into the shared `Uniforms` buffer for the three slots the pick
 * pack shapes differently from the visual pack.  `pickUniformBytesOf` bakes all
 * three at pack time (there is no post-upload override); these named offsets
 * document the layout and back the byte-equality tests that prove the pick
 * pack matches the old override end-state.
 *
 *   - `SELECTED_PACKED_BYTE_OFFSET` — the "no selection" sentinel so the 8×
 *     ring scaling doesn't inflate the pick area.
 *   - `POINT_SIZE_BYTE_OFFSET` — the `+PICK_PADDING_PX` point size that widens
 *     far-field click targets without growing visible sprites.
 *   - `PICK_PASS_BYTE_OFFSET` — 1 in the pick pack so the shared vertex shader
 *     skips visual-only culls (crossfade-out, intensity floor) that would make
 *     disk-sized galaxies unpickable.
 */
export const SELECTED_PACKED_BYTE_OFFSET = 80;
export const POINT_SIZE_BYTE_OFFSET = 88;
export const PICK_PASS_BYTE_OFFSET = 168;

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.  Byte offsets
 * from the start of the buffer:
 *
 *   bytes  0..63  : cam.viewProj      mat4x4<f32>  (16 floats = 64 bytes)  } CameraUniforms
 *   bytes 64..71  : cam.viewportPx    vec2<f32>    (2 floats)              } prefix from
 *   bytes 72..75  : cam._pad0         f32          (alignment slack)       } lib/camera.wesl
 *   bytes 76..79  : cam._pad1         f32          (alignment slack)       } (80 B total)
 *   bytes 80..83  : selectedPacked    u32          ← (selectedSource << 27) | selectedLocalIdx, or 0xFFFFFFFF
 *   bytes 84..87  : sourceCode        u32          ← per-draw source tag (5 bits used)
 *   bytes 88..91  : pointSizePx       f32
 *   bytes 92..95  : brightness        f32
 *   bytes 96..107 : camPosWorld       vec3<f32>    (3 floats)        } 16 bytes (one vec4 slot)
 *   bytes 108..111: pxPerRad          f32          (1 float)         }
 *   bytes 112..115: orientationHighlight u32       (audit tint on/off)   }
 *   bytes 116..119: orientationFilter u32          (0 all/1 measured/2 estimated) } 16 bytes
 *   bytes 120..123: sizeHighlight     u32          (audit tint on/off)   } (one vec4 slot)
 *   bytes 124..127: sizeFilter        u32          (0 all/1 measured/2 estimated) }
 *   bytes 128..131: biasMode          u32          (Malmquist mode)  }
 *   bytes 132..135: absMagLimit       f32          (volume-limit M)  }
 *   bytes 136..139: apparentMagLimit  f32          (reserved, unwritten) } 32 bytes
 *   bytes 140..143: schechterMStar    f32          (reserved, unwritten) }  (two vec4 slots)
 *   bytes 144..147: schechterAlpha    f32          (reserved, unwritten) }
 *   bytes 148..151: schechterMLim     f32          (reserved, unwritten) }
 *   bytes 152..155: schechterNRef     f32          (reserved, unwritten) }
 *   bytes 156..159: depthFadeEnabled  u32          (UI toggle)           }
 *   bytes 160..163: pxFadeStart       f32          (procedural-disk band low)  }
 *   bytes 164..167: pxFadeEnd         f32          (procedural-disk band high) } 16 bytes
 *   bytes 168..171: pickPass          u32          (0 = visual, 1 = pick)      }
 *   bytes 172..175: galaxySbScale         f32      (overall SB → HDR gain)         }
 *   bytes 176..179: galaxySbMax           f32      (bloom-ceiling clamp on sbAmp)  } 16 bytes
 *   bytes 180..183: galaxyFalloffStrength f32      (resolved-fraction exponent)    }
 *   bytes 184..191: _padU0 / _padU1       f32×2    (written as 0)                  }
 *
 * Byte 172 was the former `_padFade1` pad word, repurposed to `galaxySbScale`
 * when the three galaxy surface-brightness calibration knobs became live
 * uniforms; the two trailing pad words round the struct out to 192.
 *
 * Total: 192 bytes — a multiple of 16 ✓
 *
 * WGSL uniform buffers follow rules similar to std140 (WGSL spec §13,
 * "Memory Layout").  `vec3<f32>` requires 16-byte alignment, which is why
 * 8 bytes sit between `sourceCode` (offset 84) and `camPosWorld` (offset
 * 96) — filled here by `pointSizePx` + `brightness`.
 *
 * The picker (`pickRenderer.ts`) writes `selectedPacked` (offset 80) +
 * `sourceCode` (offset 84) for every per-source draw — see its `pick()`
 * docblock for the per-source uniform-write pattern that lets the pick
 * pass see the same packed identity space the visual pass does.  It also
 * writes `pointSizePx` at offset 88.
 *
 * The trailing u32 padding words round the struct out to a 16-byte
 * boundary so a future vec3/vec4 append doesn't fall into mis-alignment.
 * The `apparentMagLimit` / `schechterMStar` / `schechterAlpha` slots are
 * reserved-but-unwritten: the shader's Schechter / 1-over-Vmax modes read
 * their per-galaxy weights from the per-vertex `schechterRatio` + angular
 * slots (spliced in by `biasCorrectionSubsystem`), never from these
 * uniforms.  They stay in the layout only to keep `pickPass`'s byte offset
 * stable; the WGSL struct still declares them but no shader reads them.
 *
 * The value (192) is defined in `src/utils/gpu/packGalaxyPointUniforms.ts` and
 * re-exported from here so callers that already import the layout don't
 * need a second import path.
 */
export { UNIFORM_BYTES } from '../../../../utils/gpu/packGalaxyPointUniforms';
