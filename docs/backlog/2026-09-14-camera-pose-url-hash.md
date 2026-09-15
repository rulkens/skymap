# Camera pose in the URL hash

**Raised:** 2026-09-14, out of the camera frame-ladder refactor-ground.

No camera-pose codec exists today. `HASH_PARAM_SOURCES`
(`src/state/url/hashParamSources.ts`) carries `focus` (:113), `t` (:193) and
`orientation` (:228) only, and `tests/state/url/watchHashWriteSaga.test.ts:151`
pins that the saga does **not** write on `commitCameraPose` — so a shared link
restores what you were looking at, never where you were standing.

The shape it would take, once the frame ladder lands: a rung-generic codec
keyed on `frameKey` (`'absolute'` / `'body:mars'` / `'site:curiosity'`) plus
the rung's `channels` cell, which already maps each rung's pose onto four
numbers for keyframes. One hash param, one round-trip test per rung, no
per-rung parsing.

Open before it can be spec'd: precision/length budget for the numbers, whether
a stale frame id (a rung the build no longer has) falls back or throws, and
whether the hash writes on every commit or only at rest.

Out of scope of `docs/superpowers/specs/completed/2026-09-14-camera-frame-ladder-site-rung.md`
by ruling — that spec builds the `channels` cell this would read.
