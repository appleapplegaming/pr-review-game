import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../client/src/styles/contrast';

// WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and for UI borders or focus rings.
const AA_TEXT = 4.5;

const css = {
  global: readFileSync('client/src/styles/global.css', 'utf8'),
  diff: readFileSync('client/src/components/diff-view.module.css', 'utf8'),
  postmortem: readFileSync('client/src/views/postmortem/postmortem.module.css', 'utf8'),
};

/**
 * A colour token as the page defines it. The light value is the first declaration in the file
 * (the :root block). The dark value is the last one, which is the data-theme dark block that the
 * media query and the attribute both repeat. Files that define a token twice must keep this order.
 */
function token(file: keyof typeof css, name: string, mode: 'light' | 'dark'): string {
  const found = [...css[file].matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'g'))];
  const hit = mode === 'light' ? found[0] : found[found.length - 1];
  if (hit === undefined) throw new Error(`token --${name} not found in ${file}`);
  return (hit[1] ?? '').toLowerCase();
}

// Text and background pairs that the game draws on top of each other.
const PAIRS: ReadonlyArray<[string, file: keyof typeof css, text: string, bg: string]> = [
  ['body text on page', 'global', 'color-text', 'color-bg'],
  ['body text on surface', 'global', 'color-text', 'color-surface'],
  ['muted text on page', 'global', 'color-muted', 'color-bg'],
  ['muted text on surface', 'global', 'color-muted', 'color-surface'],
  ['accent link or label on surface', 'global', 'color-accent', 'color-surface'],
  ['accent on page', 'global', 'color-accent', 'color-bg'],
  ['danger text on surface', 'global', 'color-danger', 'color-surface'],
  ['text on accent button', 'global', 'color-surface', 'color-accent'],
  ['text on danger badge', 'global', 'color-surface', 'color-danger'],
  ['added line text', 'diff', 'diff-add-fg', 'diff-add-bg'],
  ['removed line text', 'diff', 'diff-remove-fg', 'diff-remove-bg'],
  ['gutter on added line', 'diff', 'diff-gutter', 'diff-add-bg'],
  ['gutter on removed line', 'diff', 'diff-gutter', 'diff-remove-bg'],
  ['bug line text', 'postmortem', 'bug-fg', 'bug-bg'],
  ['bug tag text', 'postmortem', 'bug-bg', 'bug-fg'],
];

describe('contrastRatio', () => {
  it('gives 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2b5fd9', '#2b5fd9')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#5b6372', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#5b6372'), 9);
  });
});

describe('colour tokens meet WCAG AA in both themes', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const [label, file, text, bg] of PAIRS) {
      it(`${mode}: ${label} (--${text} on --${bg})`, () => {
        const ratio = contrastRatio(token(file, text, mode), token(file, bg, mode));
        expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('the postmortem primary button and bug tag do not hard-code white text', () => {
    // White on the dark accent or the dark bug border fails AA, so these take a theme token.
    expect(css.postmortem).not.toMatch(/color:\s*#ffffff/i);
  });
});
