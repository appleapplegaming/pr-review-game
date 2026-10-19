// True while a CSS media query matches. Re-renders when it changes (for example on rotation).
// Used only where the component's behaviour depends on the layout, not for styling.

import { useSyncExternalStore } from 'preact/compat';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
