// The current time, refreshed every `intervalMs` while `enabled`. Used for countdowns.
import { useEffect, useState } from 'preact/hooks';

export function useNow(enabled: boolean, intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}
