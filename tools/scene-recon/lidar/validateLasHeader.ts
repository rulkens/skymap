/**
 * validateLasHeader — catches a truncated download. The LASF public header
 * block is fixed at 227 bytes through the Z-bounds field (ASPRS LAS 1.2+):
 * a short read or a zero point count are cheap truncation signals. The
 * decisive check is the byte-size formula below (offset + pointCount *
 * recordLength vs. actual file size) — NOT the header's Z bounds, which are
 * garbage on every real tile regardless of completeness (see
 * data/raw/dhm/README.md's "LAS header Z bounds are garbage" landmine).
 */
const LAS_HEADER_BYTES = 227;

export type LasHeaderInfo = {
  readonly pointCount: number;
};

export type LasValidationResult =
  | { readonly ok: true; readonly header: LasHeaderInfo }
  | { readonly ok: false; readonly reason: string };

export function validateLasHeader(buffer: Buffer, fileSizeBytes: number): LasValidationResult {
  if (buffer.length < LAS_HEADER_BYTES) {
    return {
      ok: false,
      reason: `truncated: only ${buffer.length} header bytes read, need ${LAS_HEADER_BYTES}`,
    };
  }

  const signature = buffer.toString('ascii', 0, 4);
  if (signature !== 'LASF') {
    return { ok: false, reason: `bad signature: expected "LASF", got "${signature}"` };
  }

  const offsetToPointData = buffer.readUInt32LE(96);
  const pointDataRecordLength = buffer.readUInt16LE(105);
  const pointCount = buffer.readUInt32LE(107);
  const maxZ = buffer.readDoubleLE(211);
  const minZ = buffer.readDoubleLE(219);

  if (pointCount === 0) {
    return { ok: false, reason: 'zero point count in header' };
  }
  // Not a plausibility band (see module header) — only rules out a header
  // read that landed on the wrong bytes entirely (NaN, or min above max).
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ) || minZ > maxZ) {
    return { ok: false, reason: `corrupt Z-bounds field: min ${minZ}, max ${maxZ}` };
  }

  const impliedMinBytes = offsetToPointData + pointCount * pointDataRecordLength;
  if (impliedMinBytes > fileSizeBytes) {
    return {
      ok: false,
      reason:
        `truncated: header implies at least ${impliedMinBytes} bytes ` +
        `(offset ${offsetToPointData} + ${pointCount} pts × ${pointDataRecordLength} B), ` +
        `file is only ${fileSizeBytes}`,
    };
  }

  return { ok: true, header: { pointCount } };
}
