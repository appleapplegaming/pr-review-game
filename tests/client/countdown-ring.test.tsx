import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'preact-render-to-string';
import { CountdownRing } from '../../client/src/components/countdown-ring';

describe('CountdownRing', () => {
  it('is named by its time, so a screen reader hears how long is left', () => {
    const html = renderToStaticMarkup(<CountdownRing fraction={0.5} label="1:30" urgent={false} />);
    expect(html).toMatch(/role="img"/);
    expect(html).toMatch(/aria-label="1:30 left to review"/);
  });

  it('keeps the visible label out of the accessible tree, so it is not read twice', () => {
    const html = renderToStaticMarkup(<CountdownRing fraction={0.5} label="1:30" urgent />);
    expect(html).toMatch(/aria-hidden="true">1:30<\/span>/);
  });
});
