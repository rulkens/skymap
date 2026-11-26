// Long-axis voxel count at the voxel-size slider's top end for a large box. The sim
// runs down to 8 (one decay workgroup), but at 64 the three grids (3 × 64³ × 4 B =
// 3 MB) are already small beside the smallest agent lanes (1M agents × 7 lanes × 4 B
// = 28 MB), and 64³ is the grid the probe's energy band was measured on. Any box up
// to 256 Mpc keeps the usual 4 Mpc top end.
export const COARSEST_LONG_AXIS_VOXELS = 64;
