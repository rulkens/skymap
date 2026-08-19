# `AtmosphereParams.sunIrradiance` is a named pad

Surfaced during the atmosphere-constituents ground pass
(`docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`).

`AtmosphereUniforms` fills every `vec3<f32>`'s trailing 4-byte slot with a real
field instead of padding — the dense vec3-tail convention `RingUniforms` established
(`src/services/gpu/shaders/lib/sphere.wesl:406-421`):

```
offset  80..91:  camPosLocal   (vec3<f32> — 16-byte aligned at 80)
offset  92..95:  sunIrradiance (f32 — fills camPosLocal's 4th slot)
```

Byte 92 has to hold something. It was given a physical-sounding name, and the
plumbing then grew backwards to feed it: an authored `AtmosphereParams.sunIrradiance`
field, `1.0` in all nine rows, passed at
`src/services/engine/frame/passes/atmosphereShellLayer.ts:136`. No fragment reads
`u.sunIrradiance` — the shell reads `exposure`, `bottomRadius`, `camPosLocal` and the
ring ratios.

Not to be confused with `EARTH_SURFACE_PARAMS.sunIrradiance`, which is a different
field and genuinely live: the Earth surface scales its direct term by it
(`packEarthSurfaceUniforms.ts:120`).

## Shape of a fix

The **byte** cannot go — it is structural alignment. The authored field, the nine
`1.0`s, and the argument threaded through the layer can. Either rename the slot to
`_pad1` and drop the field, or give the slot a job (a real per-body solar-irradiance
scale would be one, since irradiance genuinely falls as 1/r² and Pluto's is ~1/1560
of Earth's — but that is a feature, not a cleanup, and the LUTs would need to agree).

Deciding which is the work; both are small.

## Why it is worth doing

A named pad is worse than a pad: it reads as a dial someone might reach for, and the
comment already has to say "fragment-unused today" to stop them. `[[feedback_delete_proxy_surfaces]]`.
