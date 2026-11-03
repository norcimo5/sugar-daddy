import { useEffect, useState } from 'preact/hooks';
import type { Clock } from '../app/clock';

/** Current time, refreshed every 30 s and whenever the app becomes visible. */
export function useNow(clock: Clock, intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const tick = () => setNow(clock.now());
    const id = setInterval(tick, intervalMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
    };
  }, [clock, intervalMs]);
  return now;
}
