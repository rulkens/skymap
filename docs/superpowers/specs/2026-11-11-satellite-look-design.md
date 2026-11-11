# Satellite light and colour

Status: approved in scope 2026-11-11, building on `worktree-satellite-look-sunlight-colours-glints`.

## 1. Intent

The satellites Layer draws about 20,000 objects as identical 2 px cool-white dots. They ignore the Sun, so a satellite
in Earth's shadow is as bright as a sunlit one, and nothing distinguishes a Starlink train from a debris cloud.

This effort makes the dots behave like sunlit objects: they go dark in Earth's shadow, dim with phase angle, carry a
colour per constellation or orbit regime, scale with panel area, and flash when a solar panel mirrors the Sun at the
camera. A debug panel tunes the colour of each group.

## 2. Goals, non-goals

**Goals**

- Sunlight per object: Earth's shadow with a soft edge, and brightness by phase angle.
- A colour per group, where a group is a major constellation, an orbit regime, debris, or other.
- Brightness from solar-panel area, with the order of objects true and the range compressed.
- Modelled specular glints from each object's panels.
- A DebugPanel section tuning each group's colour and an ambient floor live, with reset and copy-as-defaults
  (ambient added at the owner's request after the first build).
- The selected satellite's orbit ring uses its group colour.

**Non-goals**

- 3D models. A later effort; the owner's ruling is real models for ISS, Hubble, Tiangong and Starlink, all else dots.
- Velocity streaks and fleet-wide orbit rings (backlogged, spec `2026-10-28-earth-satellites-design.md` §5.4).
- Debris tumble flicker. Debris has no usable panel data, so it stays diffuse.
- Tuning anything but colour, ambient and dot size. Panel areas and glint constants are code.
- Any change to `satellites.satg`.

**Anti-goals**

- Absolute photometry. True magnitudes make the field vanish: from 20,000 km the ISS is about mag +4.5 and a Starlink
  about mag 14. Order is true; range is compressed.
- Claiming a predicted flash. Positions are measured, attitudes are a rule, so individual flashes do not match the sky.

## 3. Shape

```
SATELLITE_PROFILES          one row per group: id, label, default colour, areaM2, glintGain
satelliteProfileCodes       catalog → Uint8Array, once per load, on the main thread
GPU profile table           uniform array, written at start and when a colour changes
SatelliteInstance           + profileCode (index into the table), filled in the per-sweep upload
points/illumination.wesl    Earth shadow, phase, panel glint; called from the vertex stage
settings.satelliteTuning    { colors, ambient }; the planner compares colors by reference and writes the table
```

## 4. How it works

**Groups.** A group is assigned at catalog load, first rule that matches:

1. Class `debris`, or a `DEB` token in the name: `debris`.
2. Class `other`, or an `R/B` token in the name: `other`.
3. Name starts with a constellation: `STARLINK` (`starlink-v1` before the first V2 Mini launch designator,
   `starlink-v2-mini` from it, and for a blank designator), `ONEWEB`, `KUIPER`, `QIANFAN`, `HULIANWANG` or `GUOWANG`.
4. Orbit regime by mean motion and eccentricity: `geo` (|n − 1.0027| < 0.05 rev/day, e < 0.05), `leo` (apogee under
   2,000 km), `meo` (perigee above 2,000 km, apogee under 35,000 km, e < 0.3), otherwise `heo`.

Catalog of 2026-10-28: 11,159 Starlink (66% of active), top five constellations 76%. Class `other` is mostly unnamed
`UNKNOWN` objects with no designator. 12 objects carry `R/B`.

The class stays authoritative for the Settings toggles and fades. A group only decides the look.

**Panel area.** Hand-authored per row, each value citing its source in the table's comments. No public catalog holds
panel areas.

| Group | m² | Basis |
| --- | --- | --- |
| `starlink-v1` | 22.68 | Stated, one wing, 2.8 × 8.1 m (arXiv 2305.11123) |
| `starlink-v2-mini` | 104.96 | Stated, 2 × 52.48 (arXiv 2306.06657) |
| `geo` | 71 | Derived, Eurostar 3000 L, 8 panels of 3.915 × 2.28 m (ESA); range 42–89 |
| `meo` | 10.82 | Stated, Galileo, 2 × 5.41 (GSC metadata) |
| `leo`, `heo`, `oneweb`, `kuiper`, `qianfan`, `guowang` | 3.88 | Our default, SARAL's array. No public figure exists for these four constellations |
| `debris`, `other` | 1 | Our choice, with `glintGain` 0 |

The first V2 Mini launch is designator 2023-026. V1.5 launches continued until July 2023, so some objects launched
between those dates get the wrong Starlink row.

**Lighting**, in world axes in the vertex stage, per dot:

- *Shadow.* A cylinder along the anti-Sun direction with Earth's radius, widened by the penumbra (the Sun's 0.267°
  half-angle times distance behind Earth) and smoothstepped across it. Picking is unaffected.
- *Ambient.* A floor every dot gets, sunlit or eclipsed (`ambient + phase · lit`), so an object in shadow is not lost
  entirely. Tunable; the owner set the default to 0.45 after eye checks.
- *Twilight tint.* Sunlight reaching a dot behind the terminator plane skimmed past Earth first. A crude slant
  optical depth, deepest in blue and falling off with the ray's closest height above the surface (8 km scale), turns
  it orange to red near the shadow edge. It colours the sunlit glow and both flashes. Refraction is ignored.
- *Phase.* Lambert-sphere phase, compressed.
- *Range and area.* `pow(area / ref, areaExp) · pow(refKm / range, rangeExp)`, both exponents under the physical
  values, tuned by eye.
- *Glint.* The array rotates about the orbit normal `r × v` to track the Sun, so the panel normal is the Sun direction
  with its orbit-normal component removed. That single rule also covers geostationary craft, whose orbit normal is
  Earth's pole. The flash is a power lobe of `n · h` with `h` halfway between Sun and camera, scaled by `glintGain`,
  area and sunlit fraction. It adds near-white light and enlarges the dot up to a cap.

Both normalisations can meet a zero vector (`v ∥ r`, or the Sun along the orbit normal). Those return no glint: a NaN
in an additive HDR target poisons the frame.

Well-tracking panels throw light back towards the Sun, so panel glints appear when the camera is on the sunward side.
For the night side there is a second reflector, added at the owner's request:

- *Plate glint.* A flat body face pointing at Earth's centre, as a Starlink's chassis does. It is lit only when the
  Sun is below the satellite's horizon while the satellite is still sunlit, the band just past the terminator, and
  mirrors that light up and away from the Sun, towards a night-side camera. Same lobe as the panel. No source gives
  a chassis area, so every group with `glintGain` gets one strength; no geometry and no table column are added.

**Tuning.** `settings.satelliteTuning.colors` maps each profile id to linear RGB. The planner, which runs before any
encoder exists, compares that object by reference and rewrites the GPU table on change. An edit touches neither the
instances nor the sweep. The ring reads the same state. `ambient` rides the per-frame uniform.

**Honesty.** The satellite card states that brightness and flashes are modelled.

## 5. Decisions

| Decision | Why | Cost if wrong |
| --- | --- | --- |
| Assign at load, not in the file | Inputs are already in the file; no re-bake or version skew between the daily file and a deployed app | A few ms per load; a new constellation shows as its regime until a deploy |
| Profile index per instance, repacked per sweep | The upload already rewrites every record and packs valid objects densely | 80 KB for 20k objects |
| Table in a uniform, colours in the table | A colour edit must not repack 20k records | One bind-group entry |
| Lighting in world axes | `temeToWorld` exists; a Sun in TEME would need a second matrix | None |
| One attitude rule | The orbit normal covers LEO and GEO alike | Starlink's real attitude differs; the flash is modelled either way |
| Separate rows for Starlink versions | Panel area differs materially | Launches around the boundary may be misassigned |

## 6. Ground preparation

Sketch and verdicts from `refactor-ground`, 2026-11-11. An independent greenfield check reached the same answer on
load-time assignment and the uniform table.

- **Prep (one commit, first, on the feature PR):** extract `DebugColorRow`. The colour picker row is hand-copied four
  times across three files (`ZoneOfAvoidanceTuningSection` ×2, `BlackHoleLensingTuningSection`,
  `ProbeSpheresTuningSectionContainer`), and this panel needs one per group.
- **Contract, replaced:** `SatelliteUniforms.color` gives way to a `sunDir` in the same slot and the profile table at
  binding 3. Internal; the parity test pins it.
- **Contract, extended:** `SatelliteInstance` gains `profileCode`, stride 36.
- **Growth, plain additions:** the profile table and assignment function, the lighting file, the Sun direction in the
  pass, a slice in `satellitesLayerSettings`, a `slot: 'debug'` row in `layer.ts`. The Layer contract does not grow.

## 7. Success criteria

- From Earth's night side, a dark cone is visible through the satellite shell.
- Starlink, OneWeb, GEO, debris and unidentified objects read as distinct colours.
- A colour edit shows on the next frame, with the clock paused, and the ring follows it.
- Glints appear with the camera sunward of a satellite.
- A selected eclipsed satellite can still be picked and followed.
- No measurable frame-time regression at a satellites-on pose.
