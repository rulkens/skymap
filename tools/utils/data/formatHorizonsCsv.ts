/**
 * formatHorizonsCsv — the raw-CSV text for Horizons rows: `jd,x_km,y_km,z_km`, plus
 * `vx_kms,vy_kms,vz_kms` for a `vectors: 'state'` fetch.
 */
import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';

export function formatHorizonsCsv(rows: readonly HorizonsVectorRow[], state: boolean): string {
  const lines = [
    state ? 'jd,x_km,y_km,z_km,vx_kms,vy_kms,vz_kms' : 'jd,x_km,y_km,z_km',
    ...rows.map((r) =>
      (state
        ? [r.jd, r.xKm, r.yKm, r.zKm, r.vxKmS, r.vyKmS, r.vzKmS]
        : [r.jd, r.xKm, r.yKm, r.zKm]
      ).join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}
