# TS constants can be injected into WESL — but usually shouldn't be

**Area:** shaders / build tooling · **Readiness:** needs-design

## The capability

`wesl`'s `link()` accepts a `constants?: Record<string, string | number>` param
(`node_modules/wesl/src/Linker.ts:85-92`) that surfaces host values through
`import constants::NAME;`, and a `virtualLibs?: Record<string, VirtualLibraryFn>`
param (`:74-75`, `VirtualLibraryFn = (ctx) => string`) that can inject whole
generated WESL module text, not just scalars. Both are exercised by upstream's
own `src/test/VirtualModules.test.ts` (constants in expressions, in
`array<f32, N>` template params, in `@binding(...)`). An unbound
`constants::MISSING` is a hard link error with a caret-marked source excerpt —
failures here are loud, not silent.

None of this reaches the app today: Skymap's own `?static` plugin
(`tools/utils/vite/weslStaticPlugin.ts`) calls
`link({ weslSrc, rootModuleName, debugWeslRoot })` — no `constants`, no
`virtualLibs`. The repo's ~12 comments asserting "`?static` WESL linking has
no value injection" describe that plugin, which is real, but state it as a
property of WESL in general, which is false. Correct phrasing: "our `?static`
plugin passes no `constants` to the linker; `wesl`'s `link()` does support
them." Turning it on is a `constants` option on that plugin: the ~132
existing `.wesl?static` import sites stay as they are, and an injected value
is global to the plugin instance, not per import site.

## The AbstractInt landmine

`constants: { BULGE_DEG: 15.0 }` emits `const BULGE_DEG = 15;` — a WGSL
**AbstractInt**, because `String(15.0) === "15"` in JS. `BULGE_DEG / 2` then
silently evaluates as integer division (`7`, not `7.5`). Passing the string
`'15.0'` emits `15.0` and stays a float. Any adopter of the `constants` path
must format every float as a string (or wrap the use site in `f32(...)`) —
there is no compiler check for this on either side of the boundary.

## Cost of turning it on

`.wesl` files are linked from six build configs, each registering
`weslStaticPlugin`: the app (`vite.config.ts`), the Vitest suite
(`vitest.config.ts`, same root), and four dev tools with their own
`weslToml`. The moment one shared `.wesl` file says `import constants::X`,
every build that links it needs the constants passed in or it fails at link
time — loud, but a six-site coupling the plugin's default would have to own.

The plugin's cache and HMR react only to `wesl.toml` and `.wesl` files; a TS
module used as a `constants` source is invisible to them. Editing it does not re-link the
shader in a running dev server — Vite's own config-dependency tracking may
restart the whole server instead (unverified), which is strictly slower than
the `.wesl`-literal HMR loop shader tuning currently relies on.

Values injected into WGSL get zero TS type checking on the WGSL side; only
the inverse direction (parsing `.wesl` and emitting typed TS, already
precedented by `extensions/ReflectExtension.ts`) can be fully typed.

## Recommendation — ladder, most-preferred first

1. **Runtime-varying value → uniform.** Already the project's norm; no
   duplication exists once a value lives in a uniform buffer.
2. **Value or formula used only by shaders → one shared `.wesl` module.**
   Zero build changes, works in all four builds today. Precedent:
   `shaders/lib/starKnee.wesl` (three shaders import one `KNEE` rather than
   restating it). Covers formula duplication, which is the more common case
   in this tree than scalar duplication.
3. **Value the shader owns but TS must read → invert the direction**,
   ideally as a small codegen script (TS reads the `.wesl`, emits a typed
   module) rather than a plugin extension — no build config touched. Already
   the right shape for `FAMOUS_STAR_PICK_RADIUS_PX`, authored in
   `bodies/starPointPick.wesl` and mirrored into TS today.
4. **Value TS owns that shaders need → mirror + parity test.** ~7 parity
   suites already do this (`tests/services/gpu/shaders/constants.parity.test.ts`
   and siblings), reading the `.wesl` as text and regex-matching
   `const NAME: (u32|f32) = <number>;` against the TS export. Cheapest option
   that touches no build config; its failure mode is that it is opt-in per
   value — nothing forces a new mirror to get one (see the `labels/vertex.wesl`
   companion backlog entry for a live unguarded instance).
5. **Only if the mirror count keeps growing, or a generated table appears,
   consider codegen-to-checked-in-`.wesl`** (a script writes
   `shaders/generated/*.wesl`, committed, CI-checked for no diff on
   regeneration). This is the option that scales best across the four
   builds if injection is ever truly needed — the file is
   watched/HMR-ed/greppable like any other `.wesl`. Prefer it over a
   `constants` option on `weslStaticPlugin`: small to add, but it still
   cannot deliver typed or per-import values.

Injection via a `constants`/`virtualLibs` plugin option is the tool of
last resort — reach for it only when a value is genuinely compile-time,
genuinely shader-owned in the generated sense (a computed LUT, a generated
dispatch table), not a hand-written literal a `.wesl` module could hold
directly.

## Existing mirrors this affects

At least five distinct TS↔WESL duplications live in the tree today, almost
all already guarded by a parity test:
`lib/starKnee.wesl` ↔ `src/data/starRenderConstants.ts` (`STAR_KNEE`) and
`bodies/star/fragment.wesl` (`STAR_EMISSIVE`); `bodies/earth/fragment.wesl`
↔ `src/data/bodies/earthTileParams.ts` (three tile constants);
`labels/vertex.wesl` ↔ `src/data/fonts.ts` (unguarded — separate backlog
entry); `flow/constants.wesl` ↔ `src/data/flow/flowFieldConstants.ts` (five
values, plus three more mirrored into ISM-map shaders);
`bodies/orbitTrail/constants.wesl` (`RIBBON_SEGMENTS`) and
`starCatalog/vertex.wesl` (frozen LUT dequant windows). A pure WESL↔WESL
case — a geometry literal duplicated across two shader modules, needing no
TS involvement at all, just a shared `.wesl` module (rung 2 above) — would
also qualify; none is currently known to exist in the tree.
