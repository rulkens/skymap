# Orbit trail / trajectory rendering — annotated prior art

Compiled 2026-08-01 for the orbit-trail ribbon-impostor work (analytic screen-space
conic impostor: f64 CPU homography, exact conic distance in the fragment, ribbon-hull
bounding geometry). Every link fetched and verified live at compile time; dead links
were dropped rather than cited unread. Headline finding: **no public write-up combines
orbit rendering with an analytic conic impostor — the field uniformly tessellates
polylines** (adaptive or not), so skymap's approach is a genuine departure, and the
hard parts (camera on the curve, projective fold, sub-pixel width) have to be solved
here rather than looked up.

## 1. GPU wide-line / polyline rendering (joins, caps, AA)

- **Shader-Based Antialiased, Dashed, Stroked Polylines** — Nicolas P. Rougier, JCGT
  2(2), 2013. https://jcgt.org/published/0002/02/08/paper.pdf · code:
  https://github.com/rougier/JCGT-2014a — dashing/joins/caps entirely in the fragment
  shader against a segment SDF; the rigorous treatment of stroke profiles and AA.
- **Drawing Lines is Hard** — Matt DesLauriers, 2015.
  https://mattdesl.svbtle.com/drawing-lines-is-hard — the practitioner survey of
  triangulated vs screen-space-expanded lines and the miter blowup.
- **Instanced Line Rendering Part I** — Rye Terrell, 2019.
  https://wwwtyro.net/2019/11/18/instanced-lines.html — one-draw-call caps+joins.
- **Instanced Line Rendering Part II: Alpha Blending** — Rye Terrell, 2021.
  https://wwwtyro.net/2021/10/01/instanced-lines-part-2.html — fixes overlap
  double-blending by moving vertices so geometry never overlaps. Skymap solved this
  fragment-side with an E-ownership discard, then deleted it with the rest of the
  fold machinery; where sag-widened quads overlap under the one/one blend, this
  vertex-side construction is the prior art to reach for.
- **Robust Polyline Rendering with WebGL** — Dan Bagnell, Cesium, 2013.
  https://cesium.com/blog/2013/04/22/robust-polyline-rendering-with-webgl/ — the
  canonical near-plane fix: clip segment endpoints against the near plane in eye
  space before screen-space extrusion — per segment, in the vertex stage. Skymap
  tried exactly that and could not make it robust; it now clips once per orbit on
  the CPU instead, in closed form, because a conic's clip-w is a sinusoid in E and
  the visible part is therefore a single interval no segment can straddle.
- **deck.gl PathLayer** — https://deck.gl/docs/api-reference/layers/path-layer —
  production API precedent for widthMinPixels/widthMaxPixels pixel clamping.

## 2. Sub-pixel line width (clamp + brightness compensation)

Folklore, not literature — no rigorous primary source found (documented absence).

- **Khronos forum: "Line width less than 1 pixel"**
  https://community.khronos.org/t/line-width-less-than-1-pixel/36752 — the trick
  stated plainly: clamp to 1 px and reduce alpha/brightness proportionally.
- **Line rendering notes** — Almar Klein, 2024. https://almarklein.org/line_rendering.html
  — squares the AA coverage so thin lines don't read thinner than nominal.
- **Antialiased lines with OpenGL** — Vitali Burkov, 2016.
  https://vitaliburkov.wordpress.com/2016/09/17/simple-and-fast-high-quality-antialiased-lines-with-opengl/
  — fragment distance-to-centerline with a pow() falloff band.
- Rougier and the Mapbox posts assume >= ~1 px widths; the energy-conserving
  sub-pixel case has no rigorous public derivation that this sweep could find.

## 3. Precision at astronomical scale

- **Precisions, Precisions** — Deron Ohlarik, 2008.
  https://help.agi.com/AGIComponents/html/BlogPrecisionsPrecisions.htm — the
  foundational GPU relative-to-eye write-up (high/low float split, CPU-side
  subtraction; ~1.35 cm error at 5.5e14 m).
- **3D Engine Design for Virtual Globes** — Cozzi & Ring, 2011 (ISBN 9781568817118) —
  textbook RTE/DSFUN90 treatment; OpenGlobe reference code.
- **Emulating Double Precision on the GPU** — Clay John, Godot, 2022.
  https://godotengine.org/article/emulating-double-precision-gpu-render-large-worlds/
  — df64 scoped to only the model->camera translation; same scoping principle as our
  f64-compose-then-narrow seam.
- **KSP Deep Space Kraken / Krakensbane** —
  https://wiki.kerbalspaceprogram.com/wiki/Deep_Space_Kraken — floating-origin
  precedent ("recenter, don't widen precision").
- Celestia's smooth-orbit patch thread is bot-walled (unverifiable) — omitted.

## 4. Resolution-independent implicit curves

- **Loop & Blinn 2005** — Resolution Independent Curve Rendering, ACM TOG 24(3).
  https://www.microsoft.com/en-us/research/wp-content/uploads/2005/01/p1000-loop.pdf
  — the academic ancestor of evaluating an implicit curve per fragment.
- **GPU Gems 3 ch. 25** — Loop & Blinn.
  https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-25-rendering-vector-art-gpu
  — adds AA; explicitly does NOT solve stroking at a given width (offset curves) —
  the gap our ribbon hull + exact distance fills for conics.
- **2D distance to ellipse** — Inigo Quilez. https://iquilezles.org/articles/ellipsedist/
  — exact ellipse distance; flags the analytic route's instability near-circular and
  highly eccentric, exactly where orbits live.
- **Quadric surface impostors** (Tarini et al. lineage) —
  https://www.researchgate.net/publication/262333739 — rasterize a cheap proxy,
  per-fragment-correct against the exact quadric: the impostor pattern in 3D.

## 5. Orbit-specific write-ups

- **Drawing Nice Orbits** — Quentin Santos, 2021. https://qsantos.fr/2021/01/28/drawing-nice-orbits/
  — non-uniform ellipse tessellation by tangent angle; concedes perspective breaks it
  (4096 segments for close-ups) — the polyline counterpoint motivating our approach,
  and the reference for curvature-adaptive sample spacing if skymap's fixed 96
  samples ever prove too coarse near a projected turning point.
- **Drawing Curved Lines in Space** — Guy Cirino, 2024.
  https://blogofsomeguy.com/a/orbitallines/ — three failed/partial iterations of orbit
  lines in Godot; documents why screen-space hacks fail for orbits (depth ordering).
- **Celestia CurvePlot** — https://github.com/CelestiaProject/Celestia — production
  approach is still adaptive polyline tessellation (~100 samples/orbit default).
- Documented absences: no KSP orbit-line devblog (only Krakensbane), no Stellarium or
  SpaceEngine rendering-technique write-up, no GMAT/STK rendering paper.
