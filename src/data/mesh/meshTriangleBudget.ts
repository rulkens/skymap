/**
 * meshTriangleBudget — the most triangles one mesh body may ship with. It lives
 * in `src/data` because it describes what the renderer affords; the Blender
 * prebake decimates to it (via `prebakeMesh.ts`) and `buildMeshes` refuses more.
 */

export const MESH_TRIANGLE_BUDGET = 600_000;
