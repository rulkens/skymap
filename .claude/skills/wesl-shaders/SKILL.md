---
name: wesl-shaders
description: Working with WESL (WebGPU Shading Extended Language) and the wesl-plugin Vite/build-time linker — covers .wesl import syntax, parser quirks, shader-module debugging, and WGSL struct layout for shared CameraUniforms-style prefixes. **Use this skill whenever you're editing a .wesl file, debugging a "Invalid ShaderModule" or "unexpected token" error from Chrome's WGSL compiler, extending a shaders/lib/ directory, or wiring wesl-plugin into a Vite or Vitest config — even if the user doesn't explicitly mention WESL.** The gotchas in this skill are linker-level constraints that aren't documented upstream and silently produce broken or unlinked WGSL output.
---

# WESL shader gotchas

These are the things wesl-plugin@0.6.74's linker gets wrong (or stricter than the WESL spec suggests). Each one cost real debugging time during this repo's WGSL→WESL conversion. Re-test all of them on every wesl-plugin version bump — they're upstream bugs that may eventually be fixed.

Shaders live in `src/services/gpu/shaders/`, with the shared modules under `shaders/lib/`; the cross-references below all point into that tree.

## The seven gotchas

### 1. No backticks in shader comments

The WESL parser tokenises `` ` `` regardless of comment context — `//` AND `/* */` both fail with "expected a semicolon" at the first backtick.

Use single quotes for inline-code callouts in `.wesl` source:

```wgsl
// 'saturate(x)' is a wrapper for clamp(x, 0, 1) — single quotes, NOT backticks.
```

`.ts`, `.md`, and other source files are unaffected. This repo did a one-time sweep across the shader tree during the WGSL→WESL rename:

```sh
perl -i -pe "s/\`/'/g" src/services/gpu/shaders/**/*.wesl
```

If you copy-paste from `.md` docs into `.wesl` files, watch for backticks the editor preserved silently.

### 2. The package prefix is the literal token `package`

Inside `.wesl` files, the import-path root is the literal string `package`, not your `package.json` name.

```wgsl
// Right
import package::lib::math::saturate;

// Wrong — Chrome's WGSL parser will reject this with "module not found"
import skymap::lib::math::saturate;
```

The npm package name is reserved for cross-package imports if your project ever publishes a shader library. Single-project builds always use `package::`. Verified in `node_modules/wesl/dist/index.js` (the plugin calls `fileToModulePath(rootModuleName, "package", false)`, hard-coding the literal).

### 3. Imports must live at the top of the file

wesl-plugin@0.6.74's linker only resolves `import` statements that appear before code emission begins. Imports placed near their call sites (e.g., next to `fn shadeGalaxy(...)`) get passed through verbatim — Chrome's WGSL parser then chokes on the `import` keyword and the whole shader module fails to compile, silently invalidating any pipeline that depends on it.

Symptom: a renderer that draws lazily (e.g., the milkyWay impostor whose draw is gated on `fadeAlpha > 0`) will work at startup, then turn the screen black the moment its draw fires for the first time. The shader compile error is in the browser console; it's the "previous error" referenced by the cascade of `Invalid ShaderModule` and `Invalid RenderPipeline` lines.

Fix: move all `import` lines to the top of the file, alongside any existing imports.

### 4. No brace-list imports

WESL's spec allows `import path::{ a, b, c };`. wesl-plugin@0.6.74 doesn't — it passes brace-list imports through verbatim and Chrome rejects them. Use one `import` per identifier:

```wgsl
// Wrong (per the spec, but doesn't link in this plugin version):
import package::lib::math::{ rot2, sabs, toPolar };

// Right:
import package::lib::math::rot2;
import package::lib::math::sabs;
import package::lib::math::toPolar;
```

The exception worth knowing: `import path::{ Type, fn };` for pulling out a struct AND a function from one module sometimes works in some plugin versions. Don't rely on it — split into two lines and re-test if you ever go back to the brace form.

### 5. Imports name a function FROM a module, not a function-as-module

WESL's import resolution treats the LAST segment of the path as the function (or struct) name and everything before it as the module path. So:

```wgsl
import package::lib::math::saturate;
```

…looks for a function `saturate` inside a module at `lib/math.wesl`. It does NOT look for a function-as-module at `lib/math/saturate.wesl`.

Implication: don't do "one function per file" under `lib/`. The import path becomes `package::lib::math::saturate::saturate` (duplicated leaf) which is verbose noise. The idiomatic shape is **one cohesive multi-function module per file** — `lib/math.wesl` exporting saturate, rot2, sabs, etc., each section-divided with a comment header.

`src/services/gpu/shaders/lib/math.wesl` is the canonical example.

### 6. Vitest doesn't auto-inherit Vite plugins

Adding `wesl-plugin` to `vite.config.ts` is necessary but not sufficient. Vitest's SSR transform pipeline runs through its own plugin chain, and wesl-plugin must be registered explicitly in `vitest.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

export default defineConfig({
  plugins: [viteWesl({ extensions: [staticBuildExtension] })],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

Without this, Vitest fetches `.wesl` files and rolldown tries to parse them as JavaScript. The error message ("expected a semicolon" or "unexpected token") looks identical to gotcha #3 but the cause is completely different — check the test command first when you see this error.

### 7. TypeScript types need a triple-slash reference, not just the tsconfig types array

wesl-plugin ships ambient module declarations at the subpath `wesl-plugin/suffixes` (declares `*.wesl?static` as resolving to `string`). Adding `"wesl-plugin/suffixes"` to `compilerOptions.types` in `tsconfig.json` does not reliably resolve under `moduleResolution: "bundler"`. The fix is a triple-slash reference in a project ambient `.d.ts`:

```ts
// src/@types/wesl.d.ts
/// <reference types="wesl-plugin/suffixes" />
export {};
```

Belt-and-braces: keep the `compilerOptions.types` entry too, so the IDE picks it up. The triple-slash ensures the build itself resolves correctly.

## Runtime-only failure: duplicate @builtin(position)

Declaring `@builtin(position)` twice in one entry point (once on a member of the input struct and again on a bare parameter) fails ONLY at runtime: the build and the wesl linker both pass, and it is `device.createShaderModule` that rejects the module. Fix: read the position from the struct member and delete the bare parameter. Because nothing fails until module creation, the symptom is the same "Invalid ShaderModule" cascade as gotcha #3; the dev-mode compile logger (below) shows the real error.

## Mitigations baked into skymap

- **shaderCompileLogger.ts** — every renderer routes `device.createShaderModule` through `createShaderModuleWithDevLog(device, code, label)`, which logs the linked WGSL alongside any compile-time error in dev mode. wesl-plugin doesn't yet emit sourcemaps that survive into Chrome's WGSL diagnostics, so error line numbers refer to the LINKED output, not your source `.wesl` files. Reading the linked output in the dev console is the only way to map "error at line 142" back to a source file. The helper is at `src/services/gpu/shaderCompileLogger.ts`; copy the pattern into other projects.

- **`label:` everywhere** — every WebGPU resource (shader module, render pipeline, bind group, bind group layout, pipeline layout, buffer, texture) has a `label` field. Browser-console errors that previously said "(unlabeled)" now name the offending resource. Worth its weight in debugging time.

## CameraUniforms shared-prefix pattern

For a renderer with multiple shader passes that all need `viewProj` + `viewportPx`, declare a shared 80-byte `CameraUniforms` struct in `lib/camera.wesl`:

```wgsl
struct CameraUniforms {
  viewProj:    mat4x4<f32>,  // bytes 0..63
  viewportPx:  vec2<f32>,    // bytes 64..71
  _pad0:       f32,          // bytes 72..75 — reserved for vec3 alignment
  _pad1:       f32,          // bytes 76..79
};

fn worldToClip(cam: CameraUniforms, p: vec3<f32>) -> vec4<f32> {
  return cam.viewProj * vec4<f32>(p, 1.0);
}
```

Each renderer's `Uniforms` struct embeds it as the first member (`cam: CameraUniforms,`). Renderer-specific fields go AFTER the 80-byte prefix — typically at offset 80 onward, which is 16-byte-aligned and ready for a `vec3<f32>` if the renderer has one.

The two reserved pad bytes (72–79) exist because WGSL requires 16-byte alignment before any `vec3<f32>` field. Don't put scalars there — that defeats the purpose. Instead, place renderer-specific scalars at offsets 88+ if you need to stay within an existing 16-byte slot, or accept a slightly larger struct.

The CPU-side `Float32Array` write must match the WGSL struct byte-for-byte. Mismatch = silent garbage uniforms = visible-but-wrong rendering. Document the offset table in a docblock on the renderer's TS file (the skymap project does this for every uniform-bearing renderer).

## TS ↔ WESL constant parity

`?static` linking is pure build-time text linking; there is NO value injection from TS into the shader. When a constant must exist on both sides, keep the TS export authoritative, hand-mirror it into the `.wesl`, and pin the pair with a Vitest parity test that reads the `.wesl` as text and regex-extracts each declaration:

```ts
const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
```

Exemplar: skymap's `tests/services/gpu/shaders/constants.parity.test.ts`. It asserts both directions (each mirrored WESL constant equals its TS export, and no WESL constant lacks an asserted TS twin). The test, not the compiler, is what keeps the mirror from drifting.

## Versions pinned

- `wesl@^0.7.26`
- `wesl-plugin@^0.6.74`

Re-test gotchas 1-4 on every plugin version bump — they're all linker bugs that may be fixed upstream. If they're fixed, the workarounds become unnecessary noise; if they're not, document the version that confirmed them.

## When wesl-plugin gives you a parse error

Before debugging the shader itself, run through this checklist:

1. Any `` ` `` in comments? (gotcha #1) Strip them.
2. Any `import` not at the top of the file? (gotcha #3) Hoist them.
3. Any `import path::{ a, b }` brace lists? (gotcha #4) Split into one-per-line.
4. Is the prefix `package::` or your npm name? (gotcha #2) It must be `package::`.
5. Does `npm test` fail but `npm run build` pass? (gotcha #6) Vitest config is missing wesl-plugin.
6. Does TypeScript complain about `?static` resolving to `any`? (gotcha #7) Add the triple-slash reference.

If none of these apply, you're looking at a real WGSL bug — read the linked output via the dev-mode logger (above) to see what reached Chrome's compiler.
