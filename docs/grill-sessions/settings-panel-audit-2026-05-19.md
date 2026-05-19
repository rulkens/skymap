# Grill Session: SettingsPanel UX Audit — 2026-05-19

Source: User-initiated audit in chat — "lets have a look at the settings menu, can you do an audit on the current layout and functionality, and let's use good UX design to come to a better version /grill-me".

The SettingsPanel had grown organically across ~30 PRs to ~10 collapsible sections and 20+ controls. This session steps back from incremental tweaking and re-asks what the panel is *for*, which audiences it serves, and which controls earn their default visibility. The output is a converged structure plus six backlog tasks (Tasks #1–#6 in the harness task list).

---

## Q1: What's triggering this audit?

**The question:** Are we chasing specific UX pain, or is this a "panel grew organically, let's step back" fresh-eyes pass? The audit's depth and scope depend on the answer.

**Considerations:**
- **Option A (specific pain):** Anchor every downstream decision to a concrete user-frustration moment. Tighter scope, faster convergence.
- **Option B (fresh-eyes pass):** Re-derive what the panel is *for* and let structural improvements fall out. Broader scope, more design decisions to make.

**Decision:** Option B — fresh-eyes pass. The user explicitly said "the panel grew organically, let's step back and see what it is actually trying to achieve." Sets the audit's framing to first-principles rather than patch-by-patch.

---

## Q2: Who is the primary user?

**The question:** The current panel weights all controls equally — every section has the same visual weight, same expand-to-see cost, same always-rendered treatment. That's a UI shaped for "all audiences at once," which produced the current sprawl. Optimizing requires picking one primary audience.

**Considerations:**
- **Option A (casual visitor):** Opened skymap.rulkens.com, wants pretty pictures and "what is this thing." Touches at most: tier, brightness, maybe a label toggle. Picking this audience would shrink the panel dramatically.
- **Option B (curious explorer / amateur astronomer):** Wants to compare surveys, toggle filaments on, dig into a cluster. Uses: Surveys, Tier, Filaments, density correction.
- **Option C (developer / research user):** Wants every knob — orientation debug, volumes with 5 sub-sliders, tone-curve experiments, SpaceMouse. Already has the DebugPanel as a destination (DEV || ?debug URL gate).

**Decision:** Option B — curious explorer. The casual visitor barely needs settings (the canvas should look good by default); the developer/research user is willing to dig and already has DebugPanel. Optimizing for the middle user lets us (a) hide developer-only stuff behind one disclosure, and (b) lift the few things the casual visitor needs toward the top. The user explicitly noted: "for the developer, we have a debug panel (stuff could be moved there)."

---

## Q3: One panel or two?

**The question:** The current panel conflates two distinct *jobs* — Scene composition ("what is on the canvas?") and Render preferences ("how do the pixels look?"). Plus outliers like camera behavior and input devices. Should "Settings" actually be two products glued together?

**Considerations:**
- **Option A (split into two panels):** Cleaner separation. Cost: discoverability — "was that filaments toggle in Scene or Display?" hunt-cost.
- **Option B (keep one panel, use Scene/Display as top-level mental model):** One discoverable surface. Naming the two jobs inside the panel structures the sprawl without splitting it.

**Decision:** Deferred but leaning toward Option B. User response: "we might split it up, lets see" — open to either, but didn't want to commit yet. Subsequent decisions are compatible with both outcomes; the structure within either approach is the same.

---

## Q5: What happens to the four per-survey toggles?

**The question:** The user reframed the explorer's mental model as three thematic layers (Galaxies, Cosmic web, Structures) — they don't think in terms of "SDSS vs GLADE vs 2MRS." If "galaxies" is one concept, what happens to the four survey toggles (Famous / 2MRS / SDSS / GLADE)?

**Considerations:**
- **Option A (disappear entirely):** Surveys all-on always, no UI. Loses the valuable "what's just the nearby stuff?" exploration use case.
- **Option B (default all-on + "Customize catalogs" disclosure):** First-time visitor sees "[✓] Galaxies — 2.5M shown." Curious-enough user expands disclosure to flip individual surveys.
- **Option C (rename section "Galaxy catalogs", clarify as sub-controls):** Keeps the current sprawl with a rename.

**Decision:** Option B. Default all-on with the disclosure preserves the exploration affordance without the explorer seeing four checkboxes they don't have a model for. Side-effect: per-source counts roll up into a single "2.5M galaxies shown" instead of four lines of numbers.

---

## Q6: Luminance knobs — keep or evict?

**The question:** The user pushed back on the assumption that brightness is touched often: "I'm not sure why one needs to touch brightness." Investigation revealed two overlapping luminance knobs:
- `brightness` (Visual section, 0.2–3.0×) — multiplied into per-galaxy intensity in the points vertex shader. Affects galaxy points only.
- `exposure` (Tone mapping section, 0.1–4.0×) — HDR multiplier applied before the tone-map curve. Affects everything.

For the explorer, the distinction between "brighten galaxy points" and "brighten whole image" is invisible — they want "the picture is too dark, fix it."

**Considerations:**
- **Option A (zero knobs):** Trust defaults + tone-map; monitor brightness is the OS's job.
- **Option B (one knob — just exposure, renamed "Brightness"):** Collapses the duplicate. Keeps a slider the explorer expects.
- **Option C (keep both, expose only exposure to explorer):** Preserves the duplicate-knob problem behind a disclosure.

**Decision:** Option A — zero knobs. Bold choice: removes both brightness AND exposure sliders entirely. The user picked the most austere option, trusting that good defaults + the tone-map curve will produce a correct image and the OS handles monitor-level brightness. This is the consistent application of "trust the defaults" and removes two controls from the explorer surface in one decision.

---

## Q7: Tone-map curve — same fate?

**The question:** If we trust defaults for luminance, do we also trust the default tone curve? "Linear / Reinhard / Asinh / Gamma 2 / ACES" is jargon the explorer has zero model for.

**Considerations:**
- **Option A (evict the dropdown too):** Pick one curve as canonical default, bake it in, kill the Tone mapping section from explorer UI. Tweaker access only via DebugPanel.
- **Option B (move to a "Display" power-user disclosure):** Explorer never sees it; tweaker who opens disclosure gets the menu.
- **Option C (keep visible):** Different curves genuinely change image character on the cosmic web.

**Decision:** Option B — tone curve survives in a "Display" power-user disclosure. User: "we should probably have a power user settings somewhere." This is the moment the power-user audience emerges as a distinct surface, intermediate between explorer (Settings) and developer (DebugPanel).

---

## Q8: Where does the power-user surface physically live?

**The question:** With "power user" newly recognized as a distinct audience (not developer, not casual), they need a home. Where?

**Considerations:**
- **Option A (inline disclosures inside Settings, per-group):** Each thematic group gets an "Advanced" disclosure-arrow. Galaxies → "Customize catalogs"; Cosmic web → "Per-cube knobs"; etc. Co-located with the group it belongs to.
- **Option B (one "Advanced" section at the bottom of Settings):** Single collapsed bucket holds every power-user control regardless of thematic group.
- **Option C (extend DebugPanel + relax its gate):** Power-user controls go alongside dev sections.
- **Option D (brand-new third panel "Advanced"):** Separate from both Settings and DebugPanel.

**Decision:** Option A — inline per-group disclosures. Reasons: co-location preserves context (the user looking at Cosmic web finds filament intensity *right there* under Advanced, not in a separate bucket); progressively-disclosable per topic (a power user who only cares about display knobs expands one disclosure); avoids a fourth surface and the discoverability problems that come with it. Option B's single-bucket pattern invites bucket-rot: every new "kind of advanced" control ends up there, recreating today's sprawl. Option C conflates audiences (a researcher tuning tone curves shouldn't see GPU timing graphs). Option D has the worst discoverability.

---

## Q9: Cosmic web granularity

**The question:** Three implementations show "the stuff between galaxies": CF-4 (DM density from velocity reconstruction, ~200 Mpc local cube), MCPM (slime-mold density on SDSS slice), DisPerSE filaments (skeleton lines). The user's words: "the cosmic web (MCPM volume, not complete, and filaments... is quite busy when you see it)." User flagged that "Volumes" is an implementation noun meaningless to users; pushed back on the initial 3-option menu and asked to think harder.

**Considerations:**
- **Option α (one master toggle, hide multiplicity):** Engine composites all three into one render. No per-source UI even in Advanced. Risk: bundled view might be visually busy.
- **Option β (one master + style picker — Smooth / Filaments / Both):** Like Google Maps' Map/Satellite/Terrain. Style defaults to whichever is the best first-impression. Adds a segmented control.
- **Option γ (split by *scope* — "Local universe density" vs "Larger-scale web"):** Honest about coverage. Costs: leaks implementation through scope framing.
- **Option δ (split by *modality* — "Density cloud" vs "Filament network"):** Current sprawl, renamed.

**Decision:** Option β. The user picked the style-picker variant. Rationale: filaments are "quite busy" and MCPM is "not complete," so forcing every explorer to see fog+threads+missing-gaps as one bundled view might produce a worse first impression than picking one mode well. β gives one on/off decision plus one style decision, both at the surface, in 2 rows. Default style: Smooth (less visually noisy), with Filaments as the upgrade.

Late refinement (post-convergence): CF-4 volume should be off by default — low information density isn't worth the rendering cost. MCPM stays as the primary "Smooth" representative. CF-4 remains available in Cosmic web → Advanced for users who enable it explicitly.

---

## Q10: Structures granularity

**The question:** The three structural POI categories (cluster / supercluster / void) — what granularity does the explorer see?

**Considerations:**
- **Option A (one master "Structures" toggle, per-category in Advanced):** Mirrors the Galaxies pattern.
- **Option B (three sub-toggles + master tri-state):** Explorer sees three rows, can mix.
- **Option C (flat single toggle including all 4 POI categories):** Lumps famous galaxies in with structural landmarks.

**Decision:** Option A — parallelism with Galaxies. The user learns the panel once: "thematic groups have one master + optional Advanced." Inconsistent patterns make the panel harder to scan even if locally sensible. The "I want just voids" workflow is power-user territory; expanding Advanced for that is acceptable. Option C conflates two different scales of naming (structural landmarks vs individual famous objects) — wrong mental model.

---

## Q11: Labels — decoupling from entities

**The question:** Where do famous galaxy names sit, and how do labels in general relate to the entities they annotate?

The user's response reframed the whole question: "we need to make the labels completely separable. i.e. labels for voids / clusters need to be togglable just like the milky way 'you are here' and the names for the famous galaxies. For the galaxies themselves, I imagine they should be always visible by default, and a sub toggle within the surveys drill down (like it is now). Hope I'm clear: one master toggle for ALL labels."

**Considerations:** The user's direction collapsed several questions at once:
- Labels are an independent axis from entity visibility, not coupled to it
- ONE master "Labels" toggle at the explorer surface, per-category in Advanced
- Galaxies always-visible by default with per-survey toggling in Advanced (confirms Q5(b))
- Milky Way "you are here" label is just another labelled annotation — controlled by the Labels master

**Decision:** A new Labels group becomes a sibling of Galaxies / Cosmic web / Structures. Master toggle controls *all* text annotations globally; per-category toggles (cluster names, SC names, void names, famous galaxy names, "you are here") live in Advanced. The Structures master, separately, controls *marker* visibility.

Implementation prerequisite captured as Task #5: `poiSubsystem.setCategoryVisible()` currently flips a single flag controlling both marker AND label. It must split into `setMarkerVisible(cat, bool)` + `setLabelVisible(cat, bool)` for the new structure to work. Otherwise the Labels group would appear to work but secretly also hide markers.

Also: Milky Way artist render becomes always-on scenery — no UI toggle. "you are here" text remains as a label (controlled by the Labels master).

---

## Q12: Galaxy thumbnails

**The question:** The close-up image-quad pass that lights up on visible galaxies as you zoom in. Currently in "Overlays." Keep where?

**Considerations:**
- **Option A (visible row in Galaxies group):** Explorer sees the toggle.
- **Option B (Advanced only):** Default on; power-user can disable.
- **Option C (no toggle at all):** Always on. Eviction destination: DebugPanel's RenderTogglesSection for emergency-off.

**Decision:** Option C — no user-facing toggle. The explorer doesn't think of thumbnails as a layer they toggle — they're an automatic visual upgrade. The legitimate "turn off" use cases (slow connection, paper-figure screenshot, debug) are all power-user-or-narrower, and RenderTogglesSection in DebugPanel already covers the emergency-off case.

Result: Galaxies group becomes beautifully minimal — one row + Advanced disclosure.

---

## Q13: Tier placement

**The question:** Tier is currently always-visible at the top with three segmented buttons. Justification in the code is "highest blast radius — each click triggers a network re-fetch + GPU re-upload." That's engineering-blast-radius reasoning, not explorer-frequency reasoning. For the explorer, tier is a one-shot performance setting.

**Considerations:**
- **Option A (stay always-visible at top):** Status quo, just smaller styling. Eats premium real estate.
- **Option B (compact chip in panel header):** Persistently visible but ~10% the space.
- **Option C (Performance section at bottom, collapsed):** Out of the way.
- **Option D (auto-detect + manual override in Advanced):** No UI unless detection fails.

**Decision:** Option A — tier stays always-visible at the top. User picked status quo on placement. Note: the original recommendation was Option B (chip), but the user disagreed. Tier remains as the panel's first-row decision, possibly with denser styling but functionally unchanged.

---

## Q14: Display section composition after evictions

**The question:** With brightness, exposure, and tone curve evicted/relegated (Q6, Q7), the Display section is hollowed out. What stays at the explorer surface — point size, depth fade, auto-rotate, auto-LOD — and what's evicted to Advanced or elsewhere?

**Considerations:** Specifically for **Point size**:
- **Option A (visible):** Display section exists with one row + Advanced.
- **Option B (Advanced only):** Display section disappears or shrinks to a bare Advanced disclosure.
- **Option C (preset switcher — Subtle/Normal/Bold):** Hides the continuous slider.

**Decision:** Option B — Point size to Advanced. The explorer has no mental model for "why would I make galaxies 6 pixels instead of 3?" — same kind of jargon-without-jargon problem as tone curve. The Display section disappears from the explorer surface, leaving 4 thematic groups + Camera + footer.

Cost: dangling "display Advanced" contents (tone curve, point size, depth fade, Auto-LOD) need a home. Resolved in Q16a-g by classifying each individually rather than lumping into a generic "Advanced" bucket.

---

## Q15: Auto-LOD investigation

**The question:** Where does Auto-LOD live? But first: what is Auto-LOD called now? The user didn't recognize the name.

**Investigation result (mid-grilling):**

Auto-LOD turned out to be **dead code**:
- `DEFAULT_LOD_MODE = 'manual'` (`data/defaults.ts:226`)
- Engine state initializes to `'manual'` (`engine.ts:426`)
- Nobody anywhere calls `setLodMode('auto')` — no caller, no auto-flip
- The `if (state.sources.lodMode === 'auto')` branch in `runFrame.ts:246` never executes at runtime
- `autoLodMask()` in `autoLod.ts` is imported but unreachable
- App.tsx already omits the UI props with a misleading comment claiming the engine runs auto-LOD internally — that comment is wrong

The whole `LodMode` machinery exists but executes zero work in any user-facing session.

**Decision:** No UI placement question to answer — Auto-LOD is dead infrastructure. Created Task #1 to delete the supporting machinery (autoLod.ts, LodMode type, setLodMode method, runFrame conditional, SettingsPanel props, useEngineSettings state, misleading App.tsx comment).

This is the audit's first "discovered bug" — the panel housed UI for a feature that didn't run.

---

## Q16a: Tone curve category

**The question:** First of seven orphan classifications — tone curve's category.

**Considerations:**
- **Global Display category:** Truly scope-free; doesn't belong to any thematic scene group.
- **Per-scene-group:** Hard to justify since tone curve shapes the final output regardless of which subsystems drew.

**Decision:** Global Display. Tone curve has no thematic home — it's the only orphan that's genuinely global.

---

## Q16b: Point size category

**The question:** Point size's category.

**Considerations:** Scope is galaxy-points-only — does nothing if Galaxies master is off.

**Decision:** Galaxies → Advanced. Functionally galaxy-only; co-locating with per-survey toggles gives the power user a "tune the galaxy layer" view all in one place.

---

## Q16c: Depth fade category

**The question:** Depth fade's category.

**Considerations:** Scope is galaxy-points-only (alpha attenuation in points fragment shader). Default ON.

**Decision:** Galaxies → Advanced. Same scope and reasoning as point size.

---

## Q16d: Auto-rotate category

**The question:** Auto-rotate's category — and is a Camera section warranted?

**Considerations:**
- **Camera section with Auto-rotate + Reset:** Tidy grouping.
- **Inline next to Reset in footer:** Looks like an unmarked section.
- **Remove entirely:** AutoRotateToggle component already exists as its own UI element.

**Decision:** Remove from Settings entirely. User noted: "there is already a play button in the top of app." Auto-rotate is already a top-bar Play button, so duplicating in Settings is redundant. Side-effect: no Camera section needed; Reset stays as a lone footer button.

---

## Q16e: Density correction category

**The question:** Where does the BiasMode dropdown + M_lim slider live? Astronomer-jargon-heavy ("M_lim", "1/V_max", "Schechter LF") — is the audience even "power user," or is it research-grade?

**Considerations:**
- **Galaxies → Advanced (flat):** Consistent scope-based categorization.
- **Galaxies → Advanced → nested sub-disclosure:** Acknowledges research audience but introduces a new pattern.
- **DebugPanel:** Wrong audience (researchers aren't engineers).
- **Remove until V_max / Schechter actually ship:** Too austere given existing User Volume-limited mode works.

**Decision:** Galaxies → Advanced (flat). User: "its just one dropdown, so it doesnt need its own submenu." Keep the pattern consistent; accept that 90% of power users will scroll past it.

---

## Q16f: SpaceMouse category

**The question:** SpaceMouse's category. Currently the App.tsx wiring suppresses the section entirely with comment "confusing for the ~99% of users without a 3DConnexion device." Same dead-UI situation as Auto-LOD?

**Considerations:**
- **Option A (restore section, auto-show only on detected device):** WebHID gating + actual device detection. Invisible to the 99%; appears for the 1% who plug in.
- **Option B (remove SettingsPanel section entirely):** Treat suppression as permanent.
- **Option C (move to DebugPanel as power-user toggle):** Wrong audience — SpaceMouse owners aren't necessarily developers.

**Decision:** Option A. Different from Auto-LOD because SpaceMouse is live engine plumbing for a real device users can buy — not dead code. Restoring with auto-detection means a SpaceMouse-owning user opens Settings and the section is *there*, ready. Captured as Task #3.

Category: Input (a new category, currently with one resident).

---

## Q16g: Orientation visibility category

**The question:** "Highlight fallback" and "Show only real" — two checkboxes that share the per-galaxy fallback-orientation flag. Diagnostic tools for auditing orientation coverage across surveys.

**Considerations:**
- **Galaxies → Advanced (by scope):** Same data layer as everything else under Galaxies → Advanced.
- **DebugPanel (by audience):** Engineering-grade data-quality audit. Same vibe as RenderTogglesSection.
- **Remove entirely:** Diagnostic purpose mostly served; data documented in CLAUDE.md.

**Decision:** DebugPanel — but in a *new section* (not the existing RenderTogglesSection). User: "we need a new section there though, the render toggles is specifically for render layers." Captured as Task #4 — add a `DataQualitySection` to DebugPanel as a fourth sibling of AssetLoading / GpuTimings / RenderToggles. The orientation toggles are the first residents; future per-data-quality filters land there too.

Audience is engineering, not power user. A research astronomer who tunes density correction wants to see the universe corrected for bias; they're not auditing per-galaxy data provenance.

---

## Q17: Converge or continue

**The question:** All 7 orphans have homes; the converged structure is laid out. Continue grilling on smaller polish questions, declare converged, or move to plan-writing?

**Considerations:**
- **Option A (declare converged, save transcript, stop):** Visual polish questions (disclosure naming, chip styling, picker control type) are better made while implementing. The structural decisions are the durable artifact.
- **Option B (continue grilling on polish):** Lower-value abstract decisions.
- **Option C (move to plan-writing now):** Some prerequisites (Tasks #3, #4, #5) aren't even written yet.

**Decision:** Option A — declare converged, save this transcript. Visual polish gets decided while implementing.

---

## Outcome — converged structure

```
SettingsPanel (explorer-facing)
│
├── Settings · Tier: small/medium/large (top, kept as-is per Q13)
│
├── Galaxies [✓] default-on                       ← Q5, Q11
│   └── ▸ Advanced
│       ├── Per-survey toggles (Famous · 2MRS · SDSS · GLADE)
│       ├── Point size [slider]                    ← Q16b
│       ├── Depth fade [✓]                         ← Q16c
│       └── Density correction [dropdown + M_lim]  ← Q16e
│
├── Cosmic web [✓] · Style: Smooth/Filaments/Both ← Q9(β)
│   └── ▸ Advanced: per-source intensity + per-cube knobs
│       (CF-4 off by default — low info density)
│
├── Structures [✓]                                ← Q10
│   └── ▸ Advanced: per-category marker toggles
│       (cluster · supercluster · void)
│
├── Labels [✓]                                    ← Q11
│   └── ▸ Advanced: per-category label toggles
│       (cluster · SC · void · famous galaxy · "you are here")
│
├── ▸ Display (default closed)                    ← Q14, Q16a
│   └── Tone curve [dropdown]
│
├── SpaceMouse (conditional, auto-detected only)  ← Q16f
│   ├── Status indicator
│   ├── [Connect] button (when not paired)
│   └── Sensitivity slider (when paired)
│
└── [Reset camera] (footer)


Always-on (no UI): Milky Way artist render        ← Q11

Evicted from SettingsPanel:
  - Brightness (Q6)
  - Exposure (Q6)
  - Auto-rotate (Q16d — already a top-bar Play button)
  - Galaxy thumbnails (Q12 — always on)
  - Milky Way toggle (Q11 — always-on scenery)
  - Auto-LOD (dead code — Task #1)
  - Orientation visibility → DebugPanel (Q16g — Task #4)
```

### Reduction summary

| Metric | Before | After |
|---|---|---|
| Sections | 9 + tier row | 4 thematic + 1 Display + 1 conditional + tier row |
| Default-visible rows | ~15 | ~6 |
| Power-user knobs hidden in Advanced disclosures | ~0 | All of them |

---

## Backlog

Six tasks tracked in the harness task list (`TaskList`) at session close:

1. **Remove dead Auto-LOD machinery** — autoLod.ts, LodMode type, setLodMode method, runFrame.ts branch, App.tsx misleading comment, test fixtures
2. **Save settings-panel audit transcript** — this file
3. **Restore SpaceMouse section with auto-detection gate** — replace `spaceMouseSupported={false}` with `isWebHIDSupported() && hasConnectedSpaceMouseDevice()`
4. **Add DataQualitySection to DebugPanel and move Orientation toggles** — fourth section sibling of AssetLoading / GpuTimings / RenderToggles
5. **Decouple POI marker visibility from label visibility** — split `setCategoryVisible` into `setMarkerVisible` + `setLabelVisible`; prerequisite for Task #6
6. **Restructure SettingsPanel per audit findings** — blocked on Tasks #3, #4, #5

---

## Notes for future sessions

- **Power-user audience emerged mid-session** (Q7). It's a real, distinct audience from "explorer" and "developer," with its own surface (per-group Advanced disclosures). Use the same lens for future feature additions: which audience is this for?
- **"Trust the defaults" is the dominant philosophy.** When in doubt, evict the control and trust a good default rather than expose a knob the user can't reason about. Applied to: brightness, exposure, galaxy thumbnails, depth fade default-on, Milky Way, Auto-LOD.
- **Implementation-noun categories are a smell.** "Volumes" / "Overlays" / "Visual" were all implementation labels that confused users. Replace with user-meaningful concepts ("Cosmic web," "Labels," etc.).
- **Dead code uncovered during audit.** Auto-LOD ran the audit lens over the codebase and revealed a feature that hadn't executed for an unknown duration. Worth doing this kind of audit periodically.
