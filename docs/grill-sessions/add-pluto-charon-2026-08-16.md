# Grill Session: Add Pluto (and Charon) to the planets — 2026-08-16

Source: user ask in the `add-pluto-planets` worktree session ("can we add pluto to the list of 'planets' (even though its a dwarf planet)"), expanded mid-grill to the Pluto–Charon pair.

Add Pluto to the solar-system scene as a first-class body, honest about its dwarf-planet status, together with Charon as a binary pair. A codebase survey ran before Q1; its findings (no per-planet UI list, one `planet` source row toggles all planets, 3-row minimum edit surface, no body-class axis anywhere) shaped every question below.

---

## Q1: One-off Pluto, or a dwarf-planet category?

**The question:** Is this "add Pluto as a ninth entry in the existing planet list" or "introduce *dwarf planet* as a category" (implying Ceres, Eris, Makemake, Haumea later, with its own source row / toggle / label treatment)? The fork shapes the registry, settings keys, URL hash, and fade layers.

**Considerations:**
- **Option A (ninth row on the existing `planet` source):** Minimum machinery — labels, search, focus, picking, InfoCard all derive from the seed tables automatically. "Dwarf planet" honesty lives in InfoCard data. Con: no dedicated toggle for dwarfs later.
- **Option B (new `dwarf-planet` source row):** A proper category from day one. Con: widens the settings key domain, URL hash, fade layers, and caption rules — real machinery for one body, against the project convention of generalizing when the *second* variant actually arrives.
- **User tension:** wants other dwarf planets eventually, but wants Pluto to *toggle together with the planets*.

**Decision:** Option A — and the tension dissolves because the toggle question and the classification question are separable. Pluto rides the existing `planet` source row (so it toggles with the planets); "dwarf planet" is *data* in the facts seed and InfoCard copy, not machinery. Future dwarfs can ride the same row too; nothing today forces or blocks a category then. The type field stays data so a second dwarf never requires a prose-hunt.

## Q2: Flat-albedo ball, or textured with the New Horizons map?

**The question:** The minimum viable Pluto is 3 rows (`SCENE_PLANETS`, `ORBITAL_ELEMENTS`, palette tint) rendering as a flat-lit albedo sphere. Texturing adds the `BodyTextureId` union entry, texture registry + rotation elements, raw-source fetch + sha256 + ATTRIBUTIONS, and a `build-textures` run (~8 more files plus asset work).

**Considerations:**
- **Option A (flat-albedo first, texture later):** Fastest to on-screen. Con: two PRs' worth of ceremony for one body, and a beige billiard ball misses the point of adding Pluto at all.
- **Option B (textured, `small` 2k tier):** What everyone knows about Pluto is Tombaugh Regio — the heart. The USGS/NASA New Horizons global mosaic exists; its sub-Charon hemisphere is fuzzy (low-res imagery), which is a documented property of the best map humanity has and a good InfoCard story. `small` matches the source ceiling precedent (Uranus, Neptune) and costs one free atlas cell.

**Decision:** Option B — textured at `small`, in one go. "Everyone knows Pluto" is the argument for showing the heart, not a placeholder ball.

## Q3: Model the barycentre, or Charon as a Moon-style satellite?

**The question:** The user expanded scope: Pluto and Charon must appear *as a pair*. The focus graph is strictly one-hop (`focusId` — a body orbits its parent's center), but the real Pluto–Charon barycentre lies outside Pluto (~1.8 Pluto radii); both bodies orbit it. How do we place Charon?

**Considerations:**
- **Option A (Charon as an ordinary satellite of Pluto):** One `satelliteBody` row + one JPL satellite element row, identical machinery to the Moon. Separation, 6.39-day period, and mutual tidal lock all come out right. The physical lie: Pluto sits pinned at its heliocentric position instead of wobbling ~2,000 km around the barycentre — ~10% of the pair separation, visible only when parked at the barycentre with time running. Precedent: Earth–Moon already makes exactly this approximation (Earth doesn't wobble around the EMB).
- **Option B (invisible barycentre node in the focus graph):** Physically honest. Con: new machinery — focus graph, pick tables, and region extents all assume nodes are visible bodies. A real feature with its own spec, bolted onto a 2-body data addition.

**Decision:** Option A, with Option B filed as a backlog follow-up (barycentric pairs). The approximation is documented on Charon's element row as a "looks wrong, don't fix it back" landmine.

## Q4: Does Charon get a texture too?

**The question:** New Horizons mapped Charon (Mordor Macula polar cap; same one-sharp-hemisphere caveat). Texturing it doubles the per-body texture ceremony from Q2 — another union entry, registry row, rotation elements, fetch source, sha256; attribution is shared (same USGS block).

**Considerations:**
- **Option A (flat-albedo Charon):** Cheaper. Con: a sharp Pluto next to a gray cue-ball undercuts the double-world image that motivated the pair.
- **Option B (textured, `small` tier, same PR):** Marginal cost is one more row per table plus one atlas tile (Pluto + Charon fill 2 of the 3 free 4×4-atlas cells) and one more download from the already-attributed USGS source. Rotation elements are trivially derived: Charon is mutually tide-locked, so its rotation *is* the 6.39-day orbit.

**Decision:** Option B — textured Charon, same PR.

## Q5: The four small moons — Styx, Nix, Kerberos, Hydra?

**The question:** Pluto has four more satellites: 10–50 km, irregular, chaotically rotating, orbiting the *barycentre* (so they'd inherit the Q3 approximation proportionally worse). No usable surface maps exist.

**Considerations:**
- **Option A (skip entirely):** The story is the binary pair; four sub-pixel rocks clutter the label view at pair scale and can never resolve.
- **Option B (include now):** Four element rows + labels, drawn dishonestly around Pluto's center rather than the barycentre.
- **Option C (backlog, blocked on barycentric pairs):** Barycentric orbits are exactly what these bodies need to be drawn honestly; the Q3 follow-up is their natural unblocking moment.

**Decision:** Option C — backlogged, linked to and blocked on the barycentric-pairs item.

## Q6: Written plan, or direct implementation?

**The question:** Convention says substantial features get refactor-ground → spec → plan; but the survey found zero ground preparation needed — every touchpoint is an existing, deliberately data-gated extension point (closed unions force completeness at compile time). Edit surface ≈ 12 files of rows + asset fetching + 4–5 test re-pins.

**Considerations:**
- **Option A (short plan, subagent-driven execution):** Not for design (this grill was the design) but for sequencing — texture fetch → sha256/attribution → registry rows → element rows → facts seed → build steps → test re-pins have real ordering dependencies, and asset-pipeline steps are where direct runs skip verification. Ground-preparation section reads "none needed — survey confirmed all extension points exist."
- **Option B (direct TDD implementation in the worktree):** Defensible given how mechanical the work is; saves plan overhead.

**Decision:** Option A — short plan, executed via subagent-driven-development.

## Decisions made without grilling (stated for veto, none exercised)

- **Pluto's orbital elements:** JPL approx-positions Table 2a (the only table including Pluto) with linear rates, *dropping* the b/c/s/f correction terms the propagator doesn't support — they matter over millennia; within a few centuries of J2000 the linear form is within visual accuracy. Documented on the element row.
- **Charon's rotation** = its 6.39-day orbital period (mutual tidal lock), giving correct same-face geometry.
- **Known consequence:** the `solar-system` region extent (max member distance from Sun) grows from Neptune's ~30 au to Pluto's J2000 ~31 au (perihelion-side; a ≈ 39.5 au), shifting orbit-trail reach, texture load radius, and scale fade bands; region/foreground extent tests re-pin.
