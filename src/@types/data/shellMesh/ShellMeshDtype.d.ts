/**
 * ShellMeshDtype — vertex storage width for a `.shell` file. f16 halves the
 * file size (steps ~0.25 pc at 256–512 pc, ~0.2 px from 1.5 kpc away); f32 is
 * available via the bake's `--dtype f32` flag for precision debugging.
 */
export type ShellMeshDtype = 'f16' | 'f32';
