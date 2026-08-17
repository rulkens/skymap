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

None of this reaches the app today: `node_modules/wesl-plugin/src/extensions/StaticExtension.ts:44-50`
calls `link({ weslSrc, rootModuleName, debugWeslRoot, libs, conditions })` —
no `constants`, no `virtualLibs`. The repo's ~12 comments asserting "`?static`
WESL linking has no value injection" are describing this shipped extension,
which is real, but stating it as a property of WESL/`wesl-plugin` in general,
which is false. Correct phrasing: "the built-in `staticBuildExtension` passes
no `constants` to the linker; `wesl`'s `link()` does support them."

`PluginExtension` is a plain `{ extensionName, emitFn }` object
(`wesl-plugin/src/PluginExtension.ts:19-27`) registered via
`WeslPlugin.ts:59`'s `[...builtinExtensions, ...(o.extensions ?? [])]` and
looked up by name (`:84-89`). A user extension named `static` shadows the
built-in one, so injection could be turned on with zero changes to the ~132
existing `.wesl?static` import sites — only the plugin registration changes.
`emitFn` can call `link()` with any `LinkParams`, including `constants` /
`virtualLibs`.

Query-string per-import values do not work: any `?static&k=v` segment
degrades to a boolean (`WeslPlugin.ts:119-132`), so an injected constant is
global to the extension instance, not per import site.

## The AbstractInt landmine

`constants: { BULGE_DEG: 15.0 }` emits `const BULGE_DEG = 15;` — a WGSL
**AbstractInt**, because `String(15.0) === "15"` in JS. `BULGE_DEG / 2` then
silently evaluates as integer division (`7`, not `7.5`). Passing the string
`'15.0'` emits `15.0` and stays a float. Any adopter of the `constants` path
must format every float as a string (or wrap the use site in `f32(...)`) —
there is no compiler check for this on either side of the boundary.

A second landmine in the same file: `emitStaticJs` returns a JS template
literal wrapping the WGSL text. An injected string containing a backtick or
`${` corrupts the emitted JS module (same family as the project's existing
"no backticks in WESL" rule).

## Cost of turning it on

`.wesl` files are linked from four separate build configs, each with its own
`wesl-plugin` registration: the app (`vite.config.ts`), the Vitest suite
(`vitest.config.ts`, same root), and two dev tools with their own
`weslToml` (`tools/galaxy-renderer/vite.config.ts`,
`tools/flow-workbench/vite.config.ts`). The moment one shared `.wesl` file
says `import constants::X`, every build that links it needs the
constants-aware extension registered or it fails at link time — loud, but a
real four-site coupling that a shared, un-copy-pasted helper module would
need to own.

Watch/HMR only covers `wesl.toml` and the discovered `.wesl` files
(`PluginApi.ts:88,113,204`); a TS module used as a `constants` source is
invisible to the plugin's own watcher. Editing it does not re-link the
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
   builds if injection is ever truly needed — no `wesl-plugin` internals
   copied, the file is watched/HMR-ed/greppable like any other `.wesl`. Prefer
   it over copying `StaticExtension.ts` and adding `constants`/`virtualLibs`
   by hand: that copy would need re-syncing on every `wesl-plugin` upgrade,
   for a benefit (typed, per-import values) it still cannot deliver.

Injection via a custom `constants`/`virtualLibs` extension is the tool of
last resort — reach for it only when a value is genuinely compile-time,
genuinely shader-owned in the generated sense (a computed LUT, a generated
dispatch table), not a hand-written literal a `.wesl` module could hold
directly.

## Existing mirrors this affects

At least six distinct TS↔WESL or WESL↔WESL duplications live in the tree
today, almost all already guarded by a parity test:
`lib/starKnee.wesl` ↔ `src/data/starRenderConstants.ts` (`STAR_KNEE`) and
`bodies/star/fragment.wesl` (`STAR_EMISSIVE`); `bodies/earth/fragment.wesl`
↔ `src/data/bodies/earthTileParams.ts` (three tile constants);
`labels/vertex.wesl` ↔ `src/data/fonts.ts` (unguarded — separate backlog
entry); `flow/constants.wesl` ↔ `src/data/flow/flowFieldConstants.ts` (five
values, plus three more mirrored into ISM-map shaders);
`bodies/orbitTrail/constants.wesl` (`RIBBON_SEGMENTS`) and
`starCatalog/vertex.wesl` (frozen LUT dequant windows); and one pure
WESL↔WESL case, `diskRadiusRing/vertex.wesl`'s geometry literal shared with
`texturedDisks`, which needs no TS involvement at all — just a shared `.wesl`
module (rung 2 above).
