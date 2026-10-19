import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'preact-render-to-string';
import { parseDiff } from '../../shared/diff';
import { DiffView } from '../../client/src/components/diff-view';

// A diff with an @@ header, a blank line at each end (template-literal newlines), and a
// header in the middle. The header must not take a number.
const DIFF = `
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
@@ -20,2 +21,2 @@
 export {};
-// old
+// new
`;

function rowNumbers(html: string): number[] {
  return [...html.matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]));
}

describe('DiffView', () => {
  it('numbers rows with the same 1-based indices as parseDiff, skipping @@ headers', () => {
    const html = renderToStaticMarkup(<DiffView diff={DIFF} />);
    const expected = parseDiff(DIFF).map((l) => l.index);
    expect(expected).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rowNumbers(html)).toEqual(expected);
  });

  it('never shows the @@ header text', () => {
    const html = renderToStaticMarkup(<DiffView diff={DIFF} />);
    expect(html).not.toContain('@@');
  });

  it('marks added and removed rows with a visible sign and a text label, not only colour', () => {
    const html = renderToStaticMarkup(<DiffView diff={DIFF} />);
    expect(html).toMatch(/data-kind="add"[^>]*>[\s\S]*?<span[^>]*>\+<\/span>/);
    expect(html).toMatch(/data-kind="remove"[^>]*>[\s\S]*?<span[^>]*>−<\/span>/);
    expect(html).toContain('added');
    expect(html).toContain('removed');
  });

  it('renders code text as literal text, never as markup', () => {
    const hostile = '+<img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(<DiffView diff={hostile} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders no buttons when no line handler is given', () => {
    const html = renderToStaticMarkup(<DiffView diff={DIFF} />);
    expect(html).not.toContain('<button');
  });

  it('makes each line a button when onLineSelect is given', () => {
    const picked: number[] = [];
    const html = renderToStaticMarkup(
      <DiffView diff={DIFF} onLineSelect={(line) => picked.push(line.index)} />,
    );
    expect(html.match(/<button/g)?.length).toBe(7);
    expect(picked).toEqual([]);
  });

  it('renders the slot returned by renderAfterLine directly under its line', () => {
    const html = renderToStaticMarkup(
      <DiffView
        diff={DIFF}
        renderAfterLine={(line) => (line.index === 2 ? <p data-slot="after-2">SLOT</p> : null)}
      />,
    );
    const afterRow2 = html.indexOf('data-line="2"');
    const slot = html.indexOf('data-slot="after-2"');
    const row3 = html.indexOf('data-line="3"');
    expect(afterRow2).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(afterRow2);
    expect(slot).toBeLessThan(row3);
  });

  it('marks only the selected line as pressed', () => {
    const html = renderToStaticMarkup(
      <DiffView diff={DIFF} selectedLine={3} onLineSelect={() => {}} />,
    );
    const pressed = html.indexOf('aria-pressed="true"');
    expect(pressed).toBeGreaterThan(html.indexOf('data-line="3"'));
    expect(pressed).toBeLessThan(html.indexOf('data-line="4"'));
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
  });

  it('has exactly one tab stop (roving tabindex), on the selected line when there is one', () => {
    const html = renderToStaticMarkup(
      <DiffView diff={DIFF} selectedLine={3} onLineSelect={() => {}} />,
    );
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html.match(/tabindex="-1"/g)?.length).toBe(6);
    expect(html.indexOf('tabindex="0"')).toBeGreaterThan(html.indexOf('data-line="3"'));
    expect(html.indexOf('tabindex="0"')).toBeLessThan(html.indexOf('data-line="4"'));
  });
});
