/**
 * LabelEffectsSection — live-tuning controls for the label outline.
 *
 * Pick a target category, tune outline colour + width, then bake the
 * values into `POI_STYLES.<cat>` or `youAreHereSubsystem.ts`.  The
 * override is a temporary hook, not a storage location.
 *
 * `setLabelStyleOverride` runs in `useEffect`, not during render —
 * side effects during render trigger strict-mode double-fires.
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
  type LabelStyleOverrideTarget,
} from '../../services/engine/labelStyleOverride';
import { LABEL_CATEGORIES } from '../../data/labelCategories';
import type { Vec4 } from '../../@types/math/Vec4';

// `LabelStyleOverrideTarget` is `'youAreHere' | LabelCategory`, so the dropdown
// is exactly the registry's label-bearing categories plus the you-are-here pin.
// 'youAreHere' leads so it stays first in the dropdown.
const CATEGORIES: readonly LabelStyleOverrideTarget[] = ['youAreHere', ...LABEL_CATEGORIES];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function LabelEffectsSection(): ReactElement {
  const [target, setTarget] = useState<LabelStyleOverrideTarget | ''>('');
  const [outlineHex, setOutlineHex] = useState('#000000');
  const [outlineAlpha, setOutlineAlpha] = useState(0.1);
  const [outlineEmFrac, setOutlineEmFrac] = useState(0.16);

  // Cleanup clears the override on unmount so closing the panel
  // mid-tune restores producer-default styling.
  useEffect(() => {
    if (target === '') {
      clearLabelStyleOverride();
      return;
    }
    const [or, og, ob] = hexToRgb(outlineHex);
    const outlineColor: Vec4 = [or, og, ob, outlineAlpha];
    setLabelStyleOverride({ targetCategory: target, outlineColor, outlineEmFrac });
    return () => clearLabelStyleOverride();
  }, [target, outlineHex, outlineAlpha, outlineEmFrac]);

  const labelStyle = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } as const;
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Label Effects</summary>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Target</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as LabelStyleOverrideTarget | '')}
          >
            <option value="">(off)</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Outline</span>
          <input type="color" value={outlineHex} onChange={(e) => setOutlineHex(e.target.value)} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={outlineAlpha}
            onChange={(e) => setOutlineAlpha(parseFloat(e.target.value))}
          />
          <span style={{ width: 30 }}>{outlineAlpha.toFixed(2)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Out width</span>
          <input
            type="range"
            min={0}
            max={0.28}
            step={0.005}
            value={outlineEmFrac}
            onChange={(e) => setOutlineEmFrac(parseFloat(e.target.value))}
          />
          <span style={{ width: 40 }}>{outlineEmFrac.toFixed(3)}</span>
        </label>
      </div>
    </details>
  );
}
