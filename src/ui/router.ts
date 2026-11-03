import { useEffect, useState } from 'preact/hooks';

/**
 * Tiny hash router. Routes never contain health values — only record ids and metric ids.
 *   #/            Today
 *   #/log/:metric Log a reading
 *   #/edit/:id    Edit a reading
 *   #/history  #/trends  #/settings  #/about
 */
export type Route =
  | { name: 'today' }
  | { name: 'log'; metricId: string }
  | { name: 'edit'; id: string }
  | { name: 'history' }
  | { name: 'trends' }
  | { name: 'settings' }
  | { name: 'about' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case undefined:
      return { name: 'today' };
    case 'log':
      return { name: 'log', metricId: parts[1] ?? 'glucose' };
    case 'edit':
      return parts[1] ? { name: 'edit', id: parts[1] } : { name: 'history' };
    case 'history':
    case 'trends':
    case 'settings':
    case 'about':
      return { name: parts[0] };
    default:
      return { name: 'today' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(route: string): void {
  const target = route.startsWith('#') ? route : `#${route}`;
  if (location.hash === target) return;
  location.hash = target;
}
