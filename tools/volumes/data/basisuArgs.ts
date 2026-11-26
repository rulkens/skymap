// basisu flags as the spike measured them (spec §5); never hand-fill a block, since an all-zero
// ASTC block decodes as an error block.
export const BASISU_ARGS = {
  bc4: { flags: ['-dds', '-dds_format', 'BC4', '-linear'], ext: 'dds' },
  astc6: { flags: ['-ldr_6x6', '-tl', '-effort', '3', '-ktx2_no_zstandard'], ext: 'ktx2' },
} as const;
