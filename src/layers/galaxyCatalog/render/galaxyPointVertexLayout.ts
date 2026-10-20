/**
 * GalaxyPointVertexLayout — byte layout contract (exempt from the comment
 * budget: the tables are the source of truth shared with the WGSL).
 *
 * The per-instance vertex record and the pick uniform buffer must agree across
 * `galaxyPointRenderer`'s packing, the `galaxyPickRenderer` pipeline and the
 * `points/*.wesl` shaders: a mismatch either fails pipeline creation or silently
 * reads garbage. Neutral home so neither renderer owns the truth.
 *
 * @module
 */

/**
 * 4-byte slots per catalog point.  Matches `PerVertex` in `points/io.wesl`:
 *
 *   [x, y, z, magnitude, colorIndex,
 *    axisRatio (sign bit = isFallback flag),
 *    paCos, paSin, radiusMpc (sign bit = diameterIsFallback),
 *    angularWeight, absMag, sbAmp]
 *
 * Every slot is f32.  Identity comes from
 * `(sourceCode << 26) | instance_index` in the shader.  paCos/paSin and absMag
 * are baked at upload so the vertex stage skips the trig and log10+sqrt.
 */
export const SLOTS_PER_GALAXY_POINT = 12;

/** Byte stride between per-instance records; point and pick pipelines both declare it. */
export const POINT_STRIDE = SLOTS_PER_GALAXY_POINT * 4;

/** Slot 5: galaxy b/a ratio.  `abs(axisRatio)` for the ellipse mask; sign bit flags a fallback orientation. */
const AXIS_RATIO_BYTE_OFFSET = 20;

/** Slots 6/7: cos/sin of the negated east-of-north position angle, forwarded as `ellipse.xy`. */
const PA_COS_SIN_BYTE_OFFSET = 24;

/**
 * Slot 8: padded billboard radius in Mpc, `max(diameterKpc, 30) * 2 / 1000`
 * (4× thumbnail-footprint padding and the missing-diameter floor).  Sign bit
 * flags a fallback diameter; the shader takes `abs()`.
 */
const RADIUS_MPC_BYTE_OFFSET = 32;

/** Slot 9: build-time angular weight (SKMP byte 55, decoded to f32); per-vertex because it depends on HEALPix cell and distance shell. */
const ANGULAR_WEIGHT_BYTE_OFFSET = 36;

/** Slot 10: absolute magnitude from the offset-normalised apparent magnitude (slot 3); the Malmquist mode-1 gate compares it to `u.absMagLimit`. */
const ABS_MAG_BYTE_OFFSET = 40;

/** Slot 11: physical surface-brightness amplitude (see `derivePointRecord`'s `sbAmp`). */
const SB_AMP_BYTE_OFFSET = 44;

/**
 * Vertex attribute table, imported verbatim by `GalaxyPickRenderer`.
 *
 *   0  position (vec3<f32>)
 *   1  magnitude (f32)
 *   2  colorIndex (f32)
 *   3  axisRatio (sign bit = isFallback)
 *   4  paCosSin (vec2<f32>)
 *   5  radiusMpc (sign bit = diameterIsFallback)
 *   6  angularWeight
 *   7  absMag
 *   8  sbAmp
 */
export const GALAXY_POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32' },
  { shaderLocation: 2, offset: 16, format: 'float32' },
  { shaderLocation: 3, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 4, offset: PA_COS_SIN_BYTE_OFFSET, format: 'float32x2' },
  { shaderLocation: 5, offset: RADIUS_MPC_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 6, offset: ANGULAR_WEIGHT_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 7, offset: ABS_MAG_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 8, offset: SB_AMP_BYTE_OFFSET, format: 'float32' },
];

/**
 * Byte offsets into `Uniforms` for the three slots the pick pack shapes
 * differently from the visual pack (`pickUniformBytesOf` bakes them).
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
 *   bytes 72..75  : cam.pxPerRad      f32          (focal term)            } lib/camera.wesl
 *   bytes 76..79  : cam._pad0          f32          (alignment slack)       } (80 B total)
 *   bytes 80..83  : selectedPacked    u32          ← (selectedSource << 26) | selectedLocalIdx, or 0xFFFFFFFF
 *   bytes 84..87  : sourceCode        u32          ← per-draw source tag (6 bits used)
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
 *   bytes 136..139: apparentMagLimit  f32          (padding, unwritten)  } 32 bytes
 *   bytes 140..143: schechterMStar    f32          (padding, unwritten)  }  (two vec4 slots)
 *   bytes 144..147: schechterAlpha    f32          (padding, unwritten)  }
 *   bytes 148..151: schechterMLim     f32          (padding, unwritten)  }
 *   bytes 152..155: schechterNRef     f32          (padding, unwritten)  }
 *   bytes 156..159: depthFadeEnabled  u32          (UI toggle)           }
 *   bytes 160..163: pxFadeStart       f32          (procedural-disk band low)  }
 *   bytes 164..167: pxFadeEnd         f32          (procedural-disk band high) } 16 bytes
 *   bytes 168..171: pickPass          u32          (0 = visual, 1 = pick)      }
 *   bytes 172..175: galaxySbScale         f32      (overall SB → HDR gain)         }
 *   bytes 176..179: galaxySbMax           f32      (bloom-ceiling clamp on sbAmp)  } 16 bytes
 *   bytes 180..183: galaxyFalloffStrength f32      (resolved-fraction exponent)    }
 *   bytes 184..191: _padU0 / _padU1       f32×2    (written as 0)                  }
 *
 * Total: 192 bytes, a multiple of 16.
 *
 * `vec3<f32>` needs 16-byte alignment, which is why `pointSizePx` +
 * `brightness` fill the 8 bytes before `camPosWorld`.
 *
 * The picker (`galaxyPickRenderer.ts`) writes `selectedPacked` and
 * `sourceCode` per source draw, plus `pointSizePx`.  The `apparentMagLimit` /
 * `schechter*` words are unwritten padding that keeps `pickPass`'s offset stable.
 *
 * The value (192) is defined in `packGalaxyPointUniforms.ts`.
 */
export { UNIFORM_BYTES } from './packGalaxyPointUniforms';
