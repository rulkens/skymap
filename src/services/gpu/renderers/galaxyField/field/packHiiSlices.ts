/**
 * packHiiSlices — `hiiComps`' whole contents plus its buffer-wide
 * segmentation. A SEPARATE buffer rather than a further slice of `fieldComps`:
 * see `hiiComps` in createGalaxyFieldRenderer.ts for why the tier cannot share
 * the field's target, and a shared
 * BUFFER with a separate TARGET would still mean one draw painting into two
 * attachments, which WebGPU has no way to do. DIG's span is a RESERVATION
 * written zero here, exactly `packFieldSlices`' dust-tail discipline, except
 * EMBEDDED between shells and young (matching the tier's original ordering).
 */

import type { GalaxyFieldComponent } from '../../../../../@types/galaxy/GalaxyFieldComponent';
import type { HiiSegment } from '../../../../../@types/galaxy/HiiSegment';
import type { HiiShellsAndYoungResult } from '../../../../engine/galaxyGenerator/v2/hiiRegions';
import { FIELD_COMPONENT_FLOATS, packFieldComponents } from './packFieldUniforms';

export function packHiiSlices(
  hii: HiiShellsAndYoungResult,
  extras: readonly (readonly GalaxyFieldComponent[])[],
  digCount: number,
): { packed: Float32Array; segments: readonly HiiSegment[] } {
  const shellsCount = hii.segments.find((s) => s.label === 'hii:shells')?.count ?? 0;
  const packedShells = packFieldComponents(hii.components.slice(0, shellsCount));
  const packedYoung = packFieldComponents(hii.components.slice(shellsCount));
  const extrasComponents: GalaxyFieldComponent[] = [];
  for (const extra of extras) extrasComponents.push(...extra);
  const packedExtras = packFieldComponents(extrasComponents);

  const packed = new Float32Array(
    packedShells.length +
      digCount * FIELD_COMPONENT_FLOATS +
      packedYoung.length +
      packedExtras.length,
  );
  let offset = 0;
  packed.set(packedShells, offset);
  offset += packedShells.length;
  const digOffset = offset / FIELD_COMPONENT_FLOATS;
  offset += digCount * FIELD_COMPONENT_FLOATS;
  packed.set(packedYoung, offset);
  offset += packedYoung.length;
  packed.set(packedExtras, offset);

  const youngCount = hii.components.length - shellsCount;
  const extrasCount = extrasComponents.length;
  return {
    packed,
    segments: [
      { label: 'hii:shells', first: 0, count: shellsCount },
      { label: 'hii:dig', first: digOffset, count: digCount },
      { label: 'hii:young', first: digOffset + digCount, count: youngCount },
      ...(extrasCount > 0
        ? [
            {
              label: 'hii:extras',
              first: digOffset + digCount + youngCount,
              count: extrasCount,
            },
          ]
        : []),
    ],
  };
}
