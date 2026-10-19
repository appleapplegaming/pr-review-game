import { describe, expect, it } from 'vitest';
import { isTextEntry } from '../../client/src/views/game/text-entry';

describe('isTextEntry', () => {
  it('is true for a textarea', () => {
    expect(isTextEntry('TEXTAREA')).toBe(true);
  });

  it('is true for text-like inputs, including when the type is missing', () => {
    expect(isTextEntry('INPUT', 'text')).toBe(true);
    expect(isTextEntry('INPUT', 'search')).toBe(true);
    expect(isTextEntry('INPUT')).toBe(true);
  });

  it('is false for buttons, checkboxes and other inputs that take no typing', () => {
    expect(isTextEntry('INPUT', 'checkbox')).toBe(false);
    expect(isTextEntry('INPUT', 'button')).toBe(false);
    expect(isTextEntry('BUTTON')).toBe(false);
  });

  it('is false when nothing is focused', () => {
    expect(isTextEntry(undefined)).toBe(false);
  });
});
