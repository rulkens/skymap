// @vitest-environment jsdom
//
// FieldStarDetailCard — rendering tests for the picked-survey-star panel.
//
// The card's job beyond the raw catalogued rows is the three derived physical
// estimates (temperature / luminosity / radius) computed via
// deriveStarProperties. We assert the labels + formatted values for a fixed
// input, and that an out-of-range colour prefixes the estimates with '~'.
// Asserting rendered text keeps the contract stable against CSS-module mangling.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import FieldStarDetailCard from '../../../src/components/InfoCard/FieldStarDetailCard/FieldStarDetailCard';
import type { FieldStarInfo } from '../../../src/@types/engine/FieldStarInfo';

// A Sun-like dwarf: absMag 4.67, BP−RP 0.82 (in range → no '~').
const sunLike: FieldStarInfo = {
  type: 'star',
  index: 0,
  displayName: 'Field star',
  x: 0,
  y: 0,
  z: 0,
  distancePc: 12,
  absMag: 4.67,
  apparentMag: 5.0,
  bpRp: 0.82,
  spectralClass: 'G',
};

describe('FieldStarDetailCard', () => {
  it('renders the three derived-property rows with formatted values', () => {
    render(createElement(FieldStarDetailCard, { target: sunLike }));

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('5,684 K')).toBeInTheDocument();
    expect(screen.getByText('Luminosity')).toBeInTheDocument();
    expect(screen.getByText('1.02 L☉')).toBeInTheDocument();
    expect(screen.getByText('Radius')).toBeInTheDocument();
    expect(screen.getByText('1.04 R☉')).toBeInTheDocument();
  });

  it("prefixes '~' when the colour is outside the relation's range", () => {
    // BP−RP 0.2 is bluer than the dwarf relation's 0.39 hot edge → extrapolated.
    const blue: FieldStarInfo = { ...sunLike, absMag: 6.0, bpRp: 0.2, spectralClass: 'A/F' };
    render(createElement(FieldStarDetailCard, { target: blue }));

    expect(screen.getByText(/^~[\d,]+ K$/)).toBeInTheDocument();
  });
});
