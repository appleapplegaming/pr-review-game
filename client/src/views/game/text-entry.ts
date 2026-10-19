// Whether a focused element takes typed text. Used to hide the phone bars while the on-screen
// keyboard is up, so the comment box is never covered. Pure, so it is unit-tested in Vitest.

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isTextEntry(tagName: string | undefined, inputType?: string): boolean {
  const tag = tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has((inputType ?? 'text').toLowerCase());
}
