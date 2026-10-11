/**
 * How one record column is stored on the wire. Scalars take their natural size; `u10x3`
 * packs three 10-bit components into a u32, `u16x3` three u16 into 6 bytes.
 */
export type ColumnStore = 'f32' | 'f16' | 'u8' | 'u16' | 'u32' | 'u64' | 'i8' | 'u10x3' | 'u16x3';
