/**
 * bayerGreek — a star's Bayer letter as period atlases wrote it: "Tau Ceti" is
 * "τ Ceti". Only a leading spelled-out letter followed by a capitalised
 * constellation (genitive) is turned; the antique italic carries the glyphs
 * (`GREEK_LOWERCASE` in data/fonts.ts), the other cuts do not.
 */

const GREEK_LETTERS: Readonly<Record<string, string>> = {
  Alpha: 'α',
  Beta: 'β',
  Gamma: 'γ',
  Delta: 'δ',
  Epsilon: 'ε',
  Zeta: 'ζ',
  Eta: 'η',
  Theta: 'θ',
  Iota: 'ι',
  Kappa: 'κ',
  Lambda: 'λ',
  Mu: 'μ',
  Nu: 'ν',
  Xi: 'ξ',
  Omicron: 'ο',
  Pi: 'π',
  Rho: 'ρ',
  Sigma: 'σ',
  Tau: 'τ',
  Upsilon: 'υ',
  Phi: 'φ',
  Chi: 'χ',
  Psi: 'ψ',
  Omega: 'ω',
};

const BAYER = new RegExp(`^(${Object.keys(GREEK_LETTERS).join('|')}) (?=[A-Z])`);

export function bayerGreek(text: string): string {
  return text.replace(BAYER, (_, name: string) => `${GREEK_LETTERS[name]} `);
}
