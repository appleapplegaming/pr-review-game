import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'preact-render-to-string';
import { CountdownRing } from '../../client/src/components/countdown-ring';

describe('CountdownRing', () => {
  it('is named by its time, so a screen reader hears how long is left', () => {
    const html = renderToStaticMarkup(<CountdownRing fraction={0.5} label="1:30" urgent={false} />);
    expect(html).toMatch(/role="img"/);
    expect(html).toMatch(/aria-label="auto-merges in 1:30"/);
  });

  it('keeps the visible label out of the accessible tree, so it is not read twice', () => {
    const html = renderToStaticMarkup(<CountdownRing fraction={0.5} label="1:30" urgent />);
    expect(html).toMatch(/aria-hidden="true">1:30<\/span>/);
  });

  it('names the urgent state "auto-merges soon" and shows a text cue, not just red', () => {
    const html = renderToStaticMarkup(<CountdownRing fraction={0.1} label="0:15" urgent />);
    expect(html).toMatch(/aria-label="auto-merges soon, in 0:15"/);
    expect(html).toMatch(/Auto-merges soon/);
  });
});
