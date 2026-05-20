/**
 * LabelEffectsSection — live-tuning controls for the label outline +
 * glow effects.
 *
 * ## Workflow
 *
 * 1. Pick a target category from the dropdown.
 * 2. Tune outline colour + em-fraction and glow colour + em-fraction
 *    via the four controls.  Changes apply on the next frame; the
 *    label director re-flushes when the override version increments.
 * 3. Once the values look right, commit them into `POI_STYLES.<cat>`
 *    or `youAreHereSubsystem.ts`'s producer defaults as a follow-up
 *    edit.  The override is a temporary hook, not a long-term storage
 *    location.
 *
 * ## Why a single override slot + a dropdown
 *
 * See `labelStyleOverride.ts`'s docstring — the per-category record
 * alternative was rejected because it invites stale values to leak
 * across category switches.
 *
 * ## Why these specific control ranges
 *
 * - `outlineEmFrac` slider: 0 to 0.2.  Beyond 0.2 the outline starts
 *   eating into adjacent labels at typical em sizes; 0.05–0.1 is the
 *   readable sweet spot.
 * - `glowEmFrac` slider: 0 to 0.5.  Glow can extend further than the
 *   outline before becoming visually noisy; 0.15–0.3 is the typical
 *   "soft halo behind the text" range.
 *
 * ## Why `useEffect` and not a render-time setter call
 *
 * Calling `setLabelStyleOverride` during render would be a React
 * anti-pattern (side effects during render are officially discouraged
 * and trigger strict-mode warnings / double-fires).  A `useEffect`
 * synchronised to the seven control values fires once per commit and
 * stays cheap.
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
  type LabelStyleOverrideTarget,
} from '../../services/engine/labelStyleOverride';
import type { Vec4 } from '../../@types/math/Vec4';

const CATEGORIES: readonly LabelStyleOverrideTarget[] = [
  'youAreHere',
  'cluster',
  'supercluster',
  'famousGalaxy',
  'void',
];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function LabelEffectsSection(): ReactElement {
  const [target, setTarget] = useState<LabelStyleOverrideTarget | ''>('');
  const [outlineHex, setOutlineHex] = useState('#000000');
  const [outlineAlpha, setOutlineAlpha] = useState(1);
  const [outlineEmFrac, setOutlineEmFrac] = useState(0.05);
  const [glowHex, setGlowHex] = useState('#ffffff');
  const [glowAlpha, setGlowAlpha] = useState(0.4);
  const [glowEmFrac, setGlowEmFrac] = useState(0.2);

  // The cleanup clears the override on unmount so toggling the
  // DebugPanel off restores production label styling even if the
  // dropdown was still pointing at a category.  Without it, closing
  // the panel mid-tune would leave the engine applying outline/glow
  // forever — surprising asymmetry with the dropdown's own "(off)".
  useEffect(() => {
    if (target === '') {
      clearLabelStyleOverride();
      return;
    }
    const [or, og, ob] = hexToRgb(outlineHex);
    const [gr, gg, gb] = hexToRgb(glowHex);
    const outlineColor: Vec4 = [or, og, ob, outlineAlpha];
    const glowColor: Vec4 = [gr, gg, gb, glowAlpha];
    setLabelStyleOverride({
      targetCategory: target,
      outlineColor,
      outlineEmFrac,
      glowColor,
      glowEmFrac,
    });
    return () => clearLabelStyleOverride();
  }, [target, outlineHex, outlineAlpha, outlineEmFrac, glowHex, glowAlpha, glowEmFrac]);

  const labelStyle = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } as const;
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Label Effects</summary>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Target</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as LabelStyleOverrideTarget | '')}>
            <option value="">(off)</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Outline</span>
          <input type="color" value={outlineHex} onChange={(e) => setOutlineHex(e.target.value)} />
          <input type="range" min={0} max={1} step={0.01} value={outlineAlpha} onChange={(e) => setOutlineAlpha(parseFloat(e.target.value))} />
          <span style={{ width: 30 }}>{outlineAlpha.toFixed(2)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Out width</span>
          <input type="range" min={0} max={0.2} step={0.005} value={outlineEmFrac} onChange={(e) => setOutlineEmFrac(parseFloat(e.target.value))} />
          <span style={{ width: 40 }}>{outlineEmFrac.toFixed(3)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Glow</span>
          <input type="color" value={glowHex} onChange={(e) => setGlowHex(e.target.value)} />
          <input type="range" min={0} max={1} step={0.01} value={glowAlpha} onChange={(e) => setGlowAlpha(parseFloat(e.target.value))} />
          <span style={{ width: 30 }}>{glowAlpha.toFixed(2)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Glow rad</span>
          <input type="range" min={0} max={0.5} step={0.005} value={glowEmFrac} onChange={(e) => setGlowEmFrac(parseFloat(e.target.value))} />
          <span style={{ width: 40 }}>{glowEmFrac.toFixed(3)}</span>
        </label>
      </div>
    </details>
  );
}
