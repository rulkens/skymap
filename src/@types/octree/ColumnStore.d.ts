/**
 * How one record column is stored on the wire. Scalars take their natural size; `u16x3`
 * packs three u16 into 6 bytes.
 */
export type ColumnStore = 'f32' | 'f16' | 'u8' | 'u16' | 'u32' | 'i8' | 'u16x3';
