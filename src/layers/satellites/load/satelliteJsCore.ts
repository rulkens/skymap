/**
 * The three `satellite.js` functions this Layer uses, imported from the package's plain-JS modules.
 * Its entry point also re-exports a WASM bulk propagator whose threaded build Vite cannot bundle
 * (a nested worker with top-level await), and whose bytes the app would ship unused; the package's
 * `exports` map offers no narrower entry, so `satellite.js/dist` is a resolve alias (vite/vitest
 * config) and a tsconfig `paths` entry. Not a relative node_modules path: a fresh worktree has
 * none of its own and Node would resolve the package from the main checkout's copy.
 */
export { json2satrec } from 'satellite.js/dist/io.js';
export { gstime, sgp4 } from 'satellite.js/dist/propagation.js';
