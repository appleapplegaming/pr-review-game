// Marks the page while a text field has focus, so the phone bars can step aside for the keyboard.
// The mark is a data attribute on <html>; global.css hides the tab bar and the action bar under it.

import { useEffect } from 'preact/hooks';
import { isTextEntry } from './text-entry';

export const TYPING_ATTR = 'data-typing';

export function useTyping(): void {
  useEffect(() => {
    const root = document.documentElement;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const input = target instanceof HTMLInputElement ? target.type : undefined;
      if (isTextEntry(target?.tagName, input)) root.setAttribute(TYPING_ATTR, 'yes');
      else root.removeAttribute(TYPING_ATTR);
    };
    const onFocusOut = () => root.removeAttribute(TYPING_ATTR);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      root.removeAttribute(TYPING_ATTR);
    };
  }, []);
}
