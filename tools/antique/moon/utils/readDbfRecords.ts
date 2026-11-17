/**
 * The records of a dBASE III table (the attribute file beside a shapefile), every field
 * as trimmed text; deleted records are skipped. Header: record count at byte 4 (u32),
 * header and record lengths at 8 and 10 (u16), then 32-byte field descriptors (name in
 * bytes 0-10, length at 16) up to a 0x0D terminator.
 */
export function readDbfRecords(bytes: Uint8Array): Record<string, string>[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const text = new TextDecoder('utf-8');
  const fields: { name: string; length: number }[] = [];
  for (let at = 32; bytes[at] !== 0x0d; at += 32) {
    const raw = bytes.subarray(at, at + 11);
    const end = raw.indexOf(0);
    fields.push({
      name: text.decode(raw.subarray(0, end < 0 ? 11 : end)),
      length: bytes[at + 16]!,
    });
  }
  const records: Record<string, string>[] = [];
  for (let i = 0; i < count; i++) {
    let at = headerLength + i * recordLength;
    if (bytes[at] === 0x2a) continue;
    at += 1;
    const record: Record<string, string> = {};
    for (const field of fields) {
      record[field.name] = text.decode(bytes.subarray(at, at + field.length)).trim();
      at += field.length;
    }
    records.push(record);
  }
  return records;
}
