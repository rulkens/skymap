# Grill Session: Splash Screen — 2026-05-20

Source: ad-hoc conversation. User asked to build a splash screen for skymap; this session resolved the design tree before writing the implementation plan.

We're adding a first-paint overlay that covers the awkward "blank canvas → catalog pop-in" moment with branded content + two CTAs (Explore / Tour). The splash doubles as an entry surface that funnels users into either free-roam exploration or a scripted camera tour through the dataset. Both as a UX improvement (the loading curtain) and as a marketing surface (intro blurb tells r/Astronomy / r/WebGPU visitors what they're looking at).

The session also produced one meta-decision: the existing 2026-05-07 tour design brainstorm is being **superseded** by a future "real tour" plan that will be written as a follow-up to this splash plan. The splash ships with a *stub tour* (chained `cameraTween` calls — rough but functional); the real tour engine replaces the stub later behind the same Tour button.

---

## Q1: What is the splash screen primarily *for*?

**The question:** "Splash screen" can mean very different things. The design tree branches entirely differently for a loading curtain vs. a persistent onboarding card vs. a cinematic title reveal vs. a defensive WebGPU-unsupported gate. We need the primary purpose before we can decide anything else.

**Considerations:**

- **Option A (loading curtain):** Full-screen branded overlay that covers the canvas during WebGPU init + first catalog fetch, fades away once the first real frame is ready. Solves the "blank black canvas → pop-in galaxies" moment. ~1–4 s typical lifetime. Most concrete UX problem skymap currently has.
- **Option B (onboarding intro):** Persistent "What is this?" card shown once per visitor (localStorage-gated), with explicit "Begin" button, project pitch, controls hint, credits. User dismisses explicitly. Higher friction but more informative.
- **Option C (cinematic title reveal):** Always-plays brand moment — animated title, maybe a teaser camera move — purely aesthetic, gated by click-to-enter. Highest polish, highest friction.
- **Option D (WebGPU gate):** Defensive screen that detects unsupported environments and either explains or offers a fallback. "Splash" is the explainer for unsupported clients; happy path goes straight to canvas. Separate concern that can ship alongside but doesn't need to be *the* splash.

**Decision:** Hybrid of A + B + C, with A as the primary purpose. The splash is a loading curtain that includes a small intro blurb to read during the load, plus two CTAs: **Explore** (dismiss → free-roam) and **Tour** (start scripted guided sequence through the dataset). User explicitly mentioned having existing research plans on the tour content (local group → voids → cosmic web → fully zoomed-out wide view).

This frames the splash as time-the-user-already-has-to-wait converted into onboarding value, rather than friction added on top of a working app.

---

## Q2: Dismiss model — gated entry or auto-dismiss overlay?

**The question:** Does the user have to click a button to dismiss the splash, or does it auto-dismiss when loading finishes? This choice cascades into deep-link behavior, returning-visitor experience, and whether the splash needs a "Skip" affordance.

**Considerations:**

- **Option A (gated entry):** Splash is the single front door. The canvas is paused/hidden behind it until the user clicks Explore or Tour. Loading happens during read time; CTAs are disabled until ready, then activate. User always makes an explicit choice. Predictable but adds friction on every visit unless we layer localStorage on top.
- **Option B (auto-dismiss overlay):** Splash appears, loading happens behind it, and when the catalog is ready the splash fades on its own. CTAs are shortcuts — Explore just dismisses early ("I'm done reading"), Tour starts the scripted sequence. If user does nothing, they end up in free-roam mode automatically. Zero-friction; CTAs add value without being gates.
- **Hybrid (middle ground):** Gated on first visit, auto-dismiss (or skip entirely) on subsequent visits and/or deep-link arrivals.

Sub-effects that distinguish the options:

- **Deep-link behavior:** A forces every `https://skymap.rulkens.com/#focus=NGC224` arrival to click through the splash before reaching their target. B can auto-dismiss instantly for deep-link arrivals.
- **Returning visitors:** A needs localStorage opt-out logic to avoid annoying regulars. B handles this implicitly via auto-dismiss.
- **Skip affordance:** A needs "Skip intro" or Esc-to-dismiss; B doesn't.

**Decision:** Hybrid — **gated on first visit, auto-skip entirely on deep-link arrival, content remains discoverable via a small "About" affordance in the chrome.**

A deep link is any URL that expresses specific user intent: `#focus=…`, `#poi=…`, `?tour=…`. Power-user URL gates (`?debug`, `?gpuTimings`) don't count because they don't change what the user is looking *at*. A first-time visitor who lands on a deep link from social media is still given the option to discover the intro content later via the About pill — zero-friction for the deep-link user, still discoverable.

This rejects pure A (too much friction on every visit + every deep link) and pure B (collapses the marketing surface — most users would see the splash for <1 s before auto-dismiss and miss the blurb entirely).

---

## Q3: Relationship between this splash and the (currently unbuilt) tour engine?

**The question:** The Tour button is one of two equal CTAs, but the tour engine is a paused brainstorm in `docs/superpowers/specs/2026-05-07-tour-animation-design.md` with ~1 day of work and several pending design decisions (rotation slerp, MSDF labels, easing curves, API shape, UI-hide coupling). The splash project either blocks on the tour, scopes it in, or ships with the Tour button doing something rougher.

**Considerations:**

- **Option A (splash blocks on tour):** Don't start the splash until the full tour engine ships. Means picking up the 2026-05-07 brainstorm, finishing open questions, building it, then building the splash on top. ~3–4 days of work. Loading-curtain win waits on tour polish.
- **Option B (splash ships first, Tour button disabled):** Both buttons render; Tour is grayed out with "Coming soon" until the tour engine lands. Half-shipped UX. A disabled button on a marketing surface looks like a bug.
- **Option C (splash ships with a stub tour):** Tour button does a minimal canned thing — a 4–6 step queue of existing `cameraTween` calls chained in sequence. No rotation slerp, no narration, no labels, no easing polish. "Good enough" first cut that ships with the splash. Real tour engine swaps in later behind the same button. ~1 hour of `cameraTween` chaining vs. the full tour's ~1 day.
- **Option D (splash + tour as one unified deliverable):** Treat as one feature; finish brainstorm, build tour engine, build splash, ship together. Same total work as A, just framed as one project.

**Decision:** **Option C (splash ships with a stub tour).**

Trade-off acknowledged: the first version of "Tour" will not feel cinematic — `cameraTween` produces snap-rotate-then-dolly transitions (decision 1 of the original tour brainstorm). Acceptable for v1 because:

1. The splash's primary purpose (loading curtain) doesn't depend on tour polish.
2. Shipping the rough cut validates both splash UX and basic tour mechanics, informing the real tour design rather than guessing at it.
3. The stub forces a stable trigger surface (button click → tour starts) that the real tour can adopt without API churn.
4. The real tour engine is genuinely a separate project with its own open questions; bundling it into the splash inflates scope without architectural payoff.

Follow-up: the user decided mid-session that the existing 2026-05-07 brainstorm should be **superseded** by a new dedicated "real tour" plan, written as a follow-up to the splash plan. The old spec gets retired (or rewritten as the new plan's spec doc) when that new plan is written — not as part of the splash plan.

---

## Q4: Readiness gating + escape valve for slow loads

**The question:** What must be true before Explore / Tour activate? And what happens if loading takes a long time on a slow connection?

**Considerations — gating level:**

- **Option A (aggressive, gate on WebGPU init only):** CTAs enable in <500 ms. User clicks Explore → splash dismisses → catalog pops in over the next 1–5 s, visible behind the disappearing splash. Fast time-to-interactive but the moment-of-reveal is a wave of incoming dots, not a populated cosmos. Defeats the loading-curtain purpose.
- **Option B (medium, gate on WebGPU + first catalog batch):** CTAs enable when there's something to look at. Maybe 2MRS done (2.4 MB) plus first galaxy source. User clicks → splash dismisses → cosmos is already there. Higher-quality reveal at the cost of 1–3 s additional gated time.
- **Option C (conservative, gate on full catalog + famous meta + everything):** Best reveal, worst patience cost. Most users reach for a button in 3–4 s of reading and forcing them to wait for filaments + volumes + tier-3 GLADE feels broken.

**Considerations — escape valve:**

- **Slow but not failed:** Show inline progress (we already have `LoadProgressState` aggregating this). After threshold (8 s) surface a "Continue anyway" link. Or trust the load and never offer escape.
- **WebGPU unsupported:** Swap splash content for browser-compatibility message. No CTAs.
- **Fetch fails:** Retry with backoff; surface error state with reload button.

**Considerations — should Tour have a different readiness signal than Explore?** The stub tour needs anchor lookups in `famous_meta.json` (Milky Way, M31, etc.). Could gate Tour stricter than Explore, or use a single shared signal.

**Decision:** **Medium gating (option B) + famous-meta also required + "Continue anyway" escape after 8 s.**

User explicitly asked for famous-meta to be loaded before CTAs activate — "famous meta should definitely have loaded." This means both CTAs share a single readiness signal: **WebGPU init done + first catalog batch loaded + `famous_meta.json` loaded.** No differentiation between Explore and Tour readiness — simplifies state, prevents "Tour disabled, Explore enabled" intermediate UI.

Aggressive (A) rejected because it defeats the splash's core purpose. Conservative (C) rejected because waiting for filaments / volumes / tier-3 GLADE creates an unfairly long gate on slow connections.

The 8 s "Continue anyway" escape is a safety valve for slow-network users who otherwise feel trapped. It's a small link that fades in only after the threshold elapses, doesn't clutter the happy-path UI for normal-speed users.

WebGPU-unsupported and fetch-failure states are deferred to Q7.

---

## Q5: Visual relationship to the canvas behind

**The question:** How does the splash surface relate to the WebGPU canvas it's covering? This decision drives polish budget, when the engine starts rendering, mobile considerations, and how the tour transitions feel.

**Considerations:**

- **Option A (opaque curtain):** Full-viewport solid surface (dark cosmic-styled background, maybe static starfield SVG). Canvas behind may or may not render. When dismissed, fade-out reveals populated cosmos in one beat. Simple, robust, no engine coordination needed. Boring-correct.
- **Option B (translucent / blurred over a live canvas):** Engine starts rendering as soon as it can; splash sits on top as semi-transparent + backdrop-blurred panel. User sees galaxies materializing softly behind during load. Costs: galaxies pop in *behind* splash visibly, careful contrast handling against moving background, `backdrop-filter: blur` has real perf cost (especially on mobile Safari).
- **Option C (splash-as-cinematic):** Canvas plays a deliberate intro camera move during the splash — camera starts very far out, slowly dollies in. Splash card sits over this directed shot. Clicking Tour seamlessly continues the motion. Most cinematic, most coupled to engine + tour code.

These compose with the tour-stub choice (Q3): C makes the splash's ambient camera move essentially leg-zero of the tour, but adds days of coordination work (what if loading finishes mid-shot? how does handoff to tour stub feel?).

Mobile / low-end-GPU: B's `backdrop-filter: blur` is the most fragile (some browsers drop it); A is essentially free; C runs renderer harder during startup, competing with catalog uploads.

**Decision:** **Option B (translucent + blurred over live canvas), with auto-rotate explicitly OFF.**

User overrode my recommendation of A here. Going with B because the tease/atmosphere payoff is worth the perf and contrast complexity. The "UI fully hidden" rider (panels, InfoCard, search trigger, ScaleBar, even the existing LoadingBar) reuses the existing `uiHidden` mechanism in App.tsx (`appStyles.uiStackHidden`), so hiding all chrome during splash costs essentially nothing to implement.

Auto-rotate stays in its default off state during splash (user's explicit pushback: "lets not make it hard"). The user still sees catalog dots materialize through the blur as load progresses — just without motion. Removes coordination complexity (no need to start/stop auto-rotate on mount/dismiss, no need to remember and restore the user's previous autoRotate preference).

Mobile fallback documented for later: if `backdrop-filter: blur` perf hurts on iOS Safari, fall back to higher-opacity solid dark backdrop via `@media (max-width: 768px)` CSS override. Cheap insurance, one-line change if needed.

C rejected: cinematic ambient shot is a project of its own that doesn't pay back proportionally for a 2–4 s screen. Splash should be replaceable later without painting into a corner.

---

## Q6: First-visit detection mechanism

**The question:** The gated-on-first-visit decision (Q2) only works if we have a reliable signal for "is this the user's first visit?" Plus a sub-question: should the splash *reappear* when content changes meaningfully?

**Considerations — detection:**

- **Option A (`localStorage["skymap.splash.seen"]`):** Set when user dismisses. Survives across sessions and tabs. Easy to opt-out test (clear site data → splash returns). Fails silently in privacy modes that block localStorage — user gets splash every time, which is a worse-but-acceptable degradation.
- **Option B (`sessionStorage["skymap.splash.seen"]`):** Survives reload within one tab but not new tabs / next-day visits. Every new tab triggers the splash. Too noisy for regulars.
- **Option C (cookie):** Same as A but works under stricter privacy regimes. Skymap doesn't use cookies anywhere else; adding one is a (small) policy/banner question in EU jurisdictions.
- **Option D (no persistence — splash always shows):** Honest, no storage to manage. Annoying for regulars.

**Considerations — version-busting:**

- **Sub-option i (never re-show once seen):** Set-and-forget.
- **Sub-option ii (re-show on version bump):** Bake a version constant; store `seen-version`; re-show when current version > stored version. Cheap to implement; gives a deliberate lever to re-engage returning visitors when there's genuinely new content.
- **Sub-option iii (re-show after N days of inactivity):** "Welcome back, here's what's new." Cuter, more complex, requires timestamp storage.

**Decision:** **A + ii — `localStorage["skymap.splash.seenVersion"] = <int>` compared against a `CURRENT_SPLASH_VERSION` constant in code.** Splash shows when stored value is missing or lower than current. Bumping the version is a single-line change made alongside meaningful content edits.

Caveat acknowledged: the first deploy of the splash shows it to *every* existing returning user once (no stored version exists yet). That's the desired behavior — existing visitors are the audience most likely to benefit from learning the new affordance.

B / C / D rejected per their cons above; iii rejected as added complexity without proportional benefit (the cuteness of an inactivity-based reappearance doesn't pay back the storage management).

---

## Q7: Failure-state handling

**The question:** The splash is now the entire visual surface during startup, making it the natural place to surface what goes wrong. Four failure modes are possible:
1. WebGPU unsupported (browser lacks `navigator.gpu`).
2. WebGPU init fails (`requestAdapter()` returns null on supported browser).
3. Catalog fetch fails (R2 down, network error, CORS regression).
4. Famous-meta fetch fails (small JSON; Tour needs it, Explore doesn't strictly).

**Considerations:**

- **Option A (one unified "something went wrong" state):** Splash content swaps to an error message with Reload button. Same surface for all four; message text differentiates. Simple, but loses information — "WebGPU unsupported" needs fundamentally different recovery (switch browsers) vs. "fetch failed" (retry).
- **Option B (fully differentiated states):** WebGPU-unsupported gets dedicated screen with browser compat list and fallback link. Fetch failures get "Reconnecting…" with backoff retry. Famous-meta failure degrades gracefully (Explore live, Tour disabled with tooltip). More polish, more code paths.
- **Option B-lite (mostly B, with WebGPU-unsupported handled OUTSIDE the splash entirely):** WebGPU-unsupported is detectable synchronously before React mounts (`typeof navigator.gpu === 'undefined'`). Render a static HTML page from `index.html`-style markup at that point; never mount React or splash machinery. Splash handles the remaining three runtime failures distinctly.
- **Option C (splash punts; defer to existing surfaces):** Splash assumes happy path. WebGPU-unsupported handled separately; catalog failures fall through to whatever engine does today (probably nothing graceful).

**Decision:** **Option B-lite.**

Rationale:

- WebGPU-unsupported is silly to handle inside the React tree — it's a synchronous boolean check that should fail fast and render a static page. Avoids instantiating React, useEngine, useFamousMeta just to show "your browser can't do this."
- Splash handles the three runtime failures as differentiated in-splash states because they need different recovery affordances. Bundling them into one error state loses meaningful information.
- Famous-meta failure is the one graceful-degradation case worth treating specially: Explore stays live, Tour disables with explanation tooltip. Because the famous-meta gate is required for tour anchor lookups (Q4), this is also the only failure mode where the splash can still complete its primary purpose.

A rejected (loses recovery information). Full B rejected (over-engineered WebGPU-unsupported path adds React weight for a fast-fail case). C rejected (if we're building the splash, building its failure path is part of the job, not a separate concern).

Open sub-decision deferred: the exact browser-compat copy on the WebGPU-unsupported page (whether to say "Use Chrome or Edge" or list the real WebGPU support matrix). That's a copy iteration, not architectural.

---

## Q8: Tour stub itinerary — what are the actual stops?

**The question:** What is the scripted sequence the stub tour plays when the user clicks Tour? Knowing the implementation is chained `cameraTween` calls with snap-rotate-then-dolly transitions (no smooth orientation slerp until the real tour engine ships).

**Considerations:**

- **Option A (faithful to original spec, 3 stops, ~25 s):** Milky Way impostor → M31 → wide SDSS wedge view. Hits the "familiar → bigger neighbour → cosmic structure" beat. Tightest scope; stub is genuinely a rough cut of the planned tour.
- **Option B (expanded "powers of ten" arc, 5–6 stops, ~40–60 s):** Milky Way → Local Group (zoom out) → Virgo Cluster → Coma / Great Wall (filaments visible) → Boötes Void or similar → fully zoomed out wide view. More content, more "story" — but more snap-rotate-stub transitions to hit bugs at, bigger gap between stub feel and final tour feel.
- **Option C (minimal teaser, 2 stops, ~15 s):** MW → wide view. Shortest possible stub. Lets you ship faster; intentionally undersells so the real tour is a clear upgrade.

Sub-flag: the **void beat** in option B is risky in a snap-cut stub without narration text — "camera arrives at a location with no galaxies" reads ambiguously, could be intentional or could read as "the app broke."

**Decision:** **Option B (expanded "powers of ten" arc).**

Risk mitigation for the void beat carried forward into spec/plan stage: either (a) put the void beat earlier in the sequence so the climax is the cosmic-web wide-view payoff (where it's visual not conceptual), or (b) add a temporary on-screen caption per beat using the existing MSDF labels system ("Boötes Void — 330M ly across, ~60 known galaxies"). The MSDF system is already shipped, so per-beat captions are cheap even in the stub. The exact arc, per-leg durations, and caption-vs-no-caption decision happen during the splash plan's task breakdown.

A rejected as too narrow given the user's stated intent (they explicitly mentioned local group, voids, cosmic web, zooming out). C rejected as too short — at ~15 s the user has barely registered "oh, this is a tour" before it's over.

---

## Q9: Tour mode UX (interaction model + end state)

**The question:** Once the Tour starts, how does it behave? Specifically: (1) UI visibility during tour, (2) what happens when user interacts mid-tour, (3) what end state does the tour leave the user in?

These were decision 6 of the original 2026-05-07 brainstorm. For the stub, we lock conservative defaults; the future real-tour plan will revisit all three.

**Considerations — UI visibility:**

- **1A (auto-hide chrome on Tour start, restore on Tour end):** Matches splash's UI-hidden choice. User can Tab to reveal manually. Cohesive cinematic feel.
- **1B (leave chrome visible):** Less cinematic but lets user bail via UI clicks.

**Considerations — interaction during tour:**

- **2A (any input cancels tour and returns control):** Standard cinematic-tour pattern (Google Earth, planetariums). Predictable, never feels trapped.
- **2B (uninterruptible until end or explicit Esc):** Pure "sit back and watch." Controlled but frustrating for inspect-mid-flight intent.
- **2C (drag pauses, Esc cancels):** Most sophisticated, most code. Better than 2A but punts to the real tour plan.

**Considerations — end state:**

- **3A (stop at final position, restore UI, user explores from there):** End-state = looking at the whole dataset from outside. Natural starting point for free exploration.
- **3B (loop back to start):** Right for installations, weird for normal visitors.
- **3C (return camera to home):** Symmetric with Explore but wastes the climax — undoing the journey.

**Decision:** **1A + 2A + 3A — auto-hide UI on Tour start, any input cancels and returns control, tour ends at final position with UI restored.** Conservative/simple choices; the real tour plan revisits all three.

Implementation note: 2A requires the tour engine to poll a "cancel requested" flag every frame and bail cleanly between legs. The existing `cameraTween` is already cancelable (starting a new tween snapshots current state), so the stub just needs to (a) detect any input and (b) stop scheduling the next leg.

Side effect: clicking the About pill mid-tour reopens the splash AND cancels the tour (treated as input). Confirmed and intentional.

---

## Q10: About reopener placement

**The question:** Where in the existing chrome does the "About" affordance live? This is the post-dismissal reopener for deep-link arrivals who want to see the intro content, and for returning users who want to re-read.

**Considerations:**

- **Option A (top-right corner pill):** Small `?` or "About" button matching SearchTrigger pill styling, in empty top-right space. Canonical "help in top-right" pattern. Unambiguously meta; doesn't crowd existing controls.
- **Option B (fold into top-center cluster):** Add About pill next to SearchTrigger + AutoRotateToggle. Keeps chrome lean (one cluster, not two) but top-center gets busy.
- **Option C (settings panel section):** "Show intro" link inside SettingsPanel. Lowest discoverability — casual users never find it.
- **Option D (combine with future "replay tour" affordance):** Defer About to a tour-replay button that doesn't exist yet. Cuter, more deferred.

**Decision:** **Option B — pill in the top-center cluster, next to the play (AutoRotateToggle) button.** Top-bar flex row becomes `[SearchTrigger | AutoRotate | About]`. All three share `appStyles.topBar` and the palette-open fade-out coordination is already wired.

User explicitly chose this layout over my recommendation of A (top-right). Top-center clustering keeps related controls in one visual group; the user is comfortable with the slight density increase.

The About pill participates in the Tab-hide behavior and the splash's own UI-hidden state. Clicking About mid-tour reopens splash AND cancels the tour (per Q9 sub-decision).

C rejected (worst discoverability — deep-link arrivals won't think to open Settings). D rejected as coupling About's design to a tour-replay feature that doesn't exist yet; better to ship About now and decide later whether to merge with a tour-replay affordance.

---

## Q11: Blurb content

**The question:** What does the splash actually say? Has to land for multiple audiences (astronomy nerds, WebGPU devs, casual social-share visitors, returning users on version bumps).

**Considerations — structure:**

- **Option A (one-line tagline + buttons):** Maximum speed. "Three million galaxies. In your browser." Pithy, mysterious; relies on visual context.
- **Option B (tagline + 1–2 sentence supporting blurb + buttons):** Standard hero pattern. Names the thing and the differentiator (real data, not procedural art).
- **Option C (tagline + blurb + controls hint + buttons):** Adds "Drag • Scroll • Cmd+K". Most informative but crowds focal point and competes with CTAs for attention.

**Considerations — sub-decisions:**

- **Attribution:** Inside blurb (signed), tertiary footer, separate About panel, or omitted.
- **Version / build info:** Helps bug reports but adds noise.
- **"What's new" callout on version bump:** Requires changelog-line-in-code per bump.

**Decision:** **Option B, with these specifics:**

- **Title:** "Explore millions of galaxies in 3D" (user's wording; action-first, matches the existing meta description style "Fly through millions of galaxies...").
- **Body:** Mentions real data + the three survey names (SDSS, GLADE, 2MRS). Survey names linked inline (`target="_blank" rel="noopener"`) to their project homepages — gives astronomy-curious visitors a credibility anchor. Links don't dismiss splash.
- **Footer:** Tertiary muted text with author name + attribution / GitHub link.
- **No controls hint inside the splash** — relies on user's natural drag-to-orbit instinct. Compensating tooltip after dismissal is a separate future polish question.
- **No version / build info on splash.**
- **No "what's new" line on version bump** — bumps are for content that the main blurb itself announces.

Working stub copy (the user explicitly said "we can iterate on the copy later"):

```
Explore millions of galaxies in 3D

Drawn in your browser with WebGPU. Built from real cosmic data —
the SDSS, GLADE, and 2MRS galaxy surveys.

[Explore]   [Tour]

by Alexander Rulkens · github.com/rulkens/skymap
```

A rejected (too cool-kid mysterious — visitor from a Bluesky link doesn't know SDSS or 2MRS but cares that "this is real data"). C rejected (controls hint adds visual weight to "this might be complicated" exactly when you want it to feel inviting).

---

## Q12: Mobile / small-viewport behavior

**The question:** Skymap has a 768 px breakpoint via `initialMobile`. The desktop splash layout (centered card, ~480 px wide, side-by-side CTAs, footer attribution) won't fit comfortably below ~400 px viewport width. How do we adapt?

**Considerations:**

- **Option A (single responsive layout):** One splash component with CSS that gracefully reflows below 768 px — smaller type, stacked-vertical CTAs, tighter padding, footer wraps. Standard responsive web pattern.
- **Option B (two distinct layouts via `initialMobile`):** Mobile gets fuller-bleed card, drops attribution to tap-to-reveal, prioritizes CTAs above fold. More polish potential, more divergence to maintain.
- **Option C (auto-skip splash entirely on small viewports):** Mobile visitor is more likely a quick-tap-from-social arrival who closes the tab on friction. Render canvas directly; surface splash content only via About pill.

**Decision:** **Option A — single responsive layout.**

Specific mobile adaptations to bake into CSS (no JS branch):
- Stack CTAs vertically (full-width, tappable) when viewport < ~480 px.
- Reduce title ~32 → ~24 px, body ~16 → ~14 px.
- Footer wraps to two lines.
- About pill in chrome stays in top-center cluster, shrinks like its siblings.
- Touch targets ≥44×44 px for About pill and CTAs.

B rejected: divergent code paths buy slight polish at the cost of every copy iteration being two edits. C rejected: the loading-curtain purpose is *most* valuable on mobile networks (slowest connections), not least; throwing away the read-during-load moment on the audience that needs it most is backwards.

Backdrop-blur perf fallback flagged for spec/plan stage: if iOS Safari has issues, `@media (max-width: 768px)` swaps the blur for higher-opacity solid dark backdrop. Cheap insurance, one-line CSS change if needed.

---

## Q13: Remaining details (Explore behavior, accessibility, visual styling, architectural placement)

**The question:** Four small/mechanical decisions presented as a single cluster to respect the user's preference for not over-segmenting design presentation. Defaults proposed for each; user accepted all four with "ok".

### (a) Explore button behavior

**Decision:** **Just dismiss.** Splash fades out (200 ms), UI chrome fades in via existing `uiHidden`-style transition, camera stays at engine's initial home position. No auto-focus, no auto-rotate trigger, no welcome tooltip. Simple, predictable, fewest interactions to test.

Alternatives considered but punted to follow-up UX polish:
- Auto-rotate on after Explore (gives the user something visually alive immediately).
- One-time "Drag • Scroll • Cmd+K" tooltip near canvas to compensate for hidden chrome on the way in.

Neither rejected; just not Splash v1.

### (b) Accessibility

**Decisions:**
- Esc dismisses splash (treated identically to Explore — sets `seenVersion`).
- Focus trapped inside splash while visible. Tab cycles: external survey links → Explore → Tour → loop. Initial focus on Explore.
- Splash is an accessible dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title, `aria-describedby` → body.
- Background canvas `aria-hidden="true"`, not focusable while splash up.
- About pill: `aria-label="About skymap"`, reopens splash with focus on close affordance or first button (TBD during implementation).
- Continue-anyway escape is keyboard-reachable; appearance announced via `aria-live="polite"`.

Standard a11y-dialog pattern. Nothing surprising.

### (c) Visual styling

**Decisions (defaults — open to taste calls during implementation):**
- Card: rounded-rect (matches existing panels), semi-transparent dark backdrop with `backdrop-filter: blur(20px)`, max-width ~520 px desktop / 90vw mobile, vertically centered.
- Backdrop overlay outside card: full-viewport dim layer (~60% black) without blur — cosmos motion still legible behind.
- Typography: reuse existing font stack from `index.html` / `App.module.css`. Title matches InfoCard headings; body matches StatusBar / InfoCard body. No new font.
- CTAs: **Explore is primary (filled accent), Tour is secondary (outlined / ghost).** Equal-weight buttons risk decision paralysis; Explore is the most-frequent intent.
- Survey links inline: underlined-on-hover, accent color, opens in new tab.
- Footer: small muted text, ~12 px.

User flagged this is the one opinion most likely to be revisited — if Tour should feel co-equal with Explore (treating it as a peer experience rather than a "scenic alternative"), the button weights flip to equal during implementation.

### (d) Architectural placement

**File layout:**

```
src/components/Splash/
  Splash.tsx                  Dialog component (pure presentational)
  Splash.module.css
  AboutPill.tsx               Top-bar reopener, sits in topBar row
  splashStubTour.ts           Chained-tween itinerary + runner (pure function, no React)

src/hooks/
  useSplash.ts                Orchestration: seenVersion, deep-link detection,
                              readiness signal, dismiss state, Continue-Anyway timer
```

`useSplash` reads `useEngine`'s existing `loadProgress` + `status` plus a famous-meta-loaded signal (probably pulled up from `useFamousMeta`). Returns `{ splashVisible, blocked, canDismiss, dismissExplore, dismissTour, reopen }`. App.tsx uses it alongside other hooks — small wiring footprint.

`splashStubTour.ts` is called by `dismissTour`; chains `handleRef.current?.camera.focusOn(...)` calls with await-able tween completion.

WebGPU-unsupported handling lives **outside** all of this — synchronous check at top of `main.tsx`, before React mounts; renders static HTML page if `typeof navigator.gpu === 'undefined'`. Keeps the React tree out of the failure case entirely (per Q7 decision).

---

## Out-of-scope items flagged for future plans

These came up during the grill but explicitly belong to follow-up work, not the splash plan:

1. **Real tour engine.** New plan to be written as a follow-up to the splash plan. Picks up the 2026-05-07 brainstorm's open questions (rotation slerp, easing, narration, MSDF labels integration, API shape, pause-on-drag, UI-hide coupling). Replaces the splash plan's stub tour behind the same Tour button. The old `2026-05-07-tour-animation-design.md` spec gets retired (or rewritten as the new plan's spec doc) during that work.
2. **Per-beat tour captions / narration text.** Either implemented in the splash stub via MSDF labels (mitigation for the void-beat ambiguity from Q8) or punted entirely to the real tour plan. Decision happens during splash plan's task breakdown.
3. **Post-dismiss controls tooltip.** A one-time "Drag • Scroll • Cmd+K" hint near the canvas after Explore is clicked, to compensate for hidden chrome on the way in. Solves a UX gap but isn't part of Splash v1.
4. **Browser-compat copy on WebGPU-unsupported page.** Whether to say "Use Chrome or Edge" (true today, ages conservatively) or list the actual WebGPU support matrix (more accurate, ages worse). Copy iteration, not architectural.
5. **Tour-replay UI affordance.** Once the real tour ships, the chrome may want a way to re-trigger the tour from outside the splash. Decision then whether to merge with About pill or keep separate.
