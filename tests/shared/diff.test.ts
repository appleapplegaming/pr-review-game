import { describe, expect, it } from 'vitest';
import { parseDiff } from '../../shared/diff';

// The spec's pay-004 example, verbatim (SPEC.md → PR Content).
const SPEC_PAY_004_DIFF = [
  '@@ checkout/total.ts @@',
  ' export function total(cart: Cart, promo?: Promo): number {',
  '   let sum = cart.items.reduce((s, i) => s + i.price * i.qty, 0);',
  '-  sum -= memberDiscount(cart);',
  '+  sum -= memberDiscount(cart);',
  '+  if (promo) sum -= sum * promo.percent;',
  '+  if (promo) sum -= sum * promo.percent;',
  '   return Math.round(sum * 100) / 100;',
  ' }',
].join('\n');

describe('parseDiff', () => {
  it('skips @@ headers and numbers the remaining lines from 1', () => {
    const lines = parseDiff(SPEC_PAY_004_DIFF);
    expect(lines.map((l) => l.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(lines.some((l) => l.text.includes('checkout/total.ts'))).toBe(false);
  });

  it('points the spec pay-004 bug.lines [6] at a + line', () => {
    const lines = parseDiff(SPEC_PAY_004_DIFF);
    const sixth = lines[5];
    expect(sixth?.index).toBe(6);
    expect(sixth?.kind).toBe('add');
    expect(sixth?.text).toBe('  if (promo) sum -= sum * promo.percent;');
  });

  it('labels + as add, - as remove and a leading space as context, and strips the prefix', () => {
    const lines = parseDiff(SPEC_PAY_004_DIFF);
    expect(lines[0]).toEqual({
      index: 1,
      kind: 'context',
      text: 'export function total(cart: Cart, promo?: Promo): number {',
    });
    expect(lines[2]).toEqual({ index: 3, kind: 'remove', text: '  sum -= memberDiscount(cart);' });
    expect(lines[3]).toEqual({ index: 4, kind: 'add', text: '  sum -= memberDiscount(cart);' });
  });

  it('keeps numbering continuous across several @@ hunks', () => {
    const diff = ['@@ a.ts @@', '+one', ' two', '@@ b.ts @@', '-three', '+four'].join('\n');
    const lines = parseDiff(diff);
    expect(lines.map((l) => [l.index, l.kind, l.text])).toEqual([
      [1, 'add', 'one'],
      [2, 'context', 'two'],
      [3, 'remove', 'three'],
      [4, 'add', 'four'],
    ]);
  });

  it('drops the blank lines a template literal adds at its start and end', () => {
    const lines = parseDiff('\n@@ a.ts @@\n+x\n-y\n\n');
    expect(lines.map((l) => l.text)).toEqual(['x', 'y']);
    expect(lines[0]?.index).toBe(1);
  });

  it('keeps an interior blank line as a context line', () => {
    const lines = parseDiff('@@ a.ts @@\n+x\n\n+y');
    expect(lines).toEqual([
      { index: 1, kind: 'add', text: 'x' },
      { index: 2, kind: 'context', text: '' },
      { index: 3, kind: 'add', text: 'y' },
    ]);
  });

  it('returns no lines for an empty diff or a header-only diff', () => {
    expect(parseDiff('')).toEqual([]);
    expect(parseDiff('\n@@ a.ts @@\n')).toEqual([]);
  });
});
