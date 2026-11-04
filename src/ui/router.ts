import { useEffect, useState } from 'preact/hooks';

/**
 * Tiny hash router. Routes never contain health values — only record ids and metric ids.
 *   #/            Today
 *   #/log/:metric Log a reading
 *   #/edit/:id    Edit a reading
 *   #/metric/:id  Per-measurement screen
 *   #/history[/:metricId]  #/trends  #/settings  #/about  #/guide
 */
export type Route =
  | { name: 'today' }
  | { name: 'log'; metricId: string }
  | { name: 'edit'; id: string }
  | { name: 'history'; metricId?: string }
  | { name: 'metric'; metricId: string }
  | { name: 'guide' }
  | { name: 'install' }
  | { name: 'trends' }
  | { name: 'settings' }
  | { name: 'about' };

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(safeDecode);
  switch (parts[0]) {
    case undefined:
      return { name: 'today' };
    case 'log':
      return { name: 'log', metricId: parts[1] ?? '' }; // '' → primary metric
    case 'edit':
      return parts[1] ? { name: 'edit', id: parts[1] } : { name: 'history' };
    case 'history':
      return parts[1] ? { name: 'history', metricId: parts[1] } : { name: 'history' };
    case 'metric':
      return parts[1] ? { name: 'metric', metricId: parts[1] } : { name: 'today' };
    case 'guide':
      return { name: 'guide' };
    case 'install':
      return { name: 'install' };
    case 'trends':
    case 'settings':
    case 'about':
      return { name: parts[0] };
    default:
      return { name: 'today' };
  }
}

let previousHash: string | null = null;
let currentHash: string | null = null;

/** The in-app screen the user came from (never a page outside the app). */
export function previousRoute(): string | null {
  return previousHash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    currentHash = location.hash || '#/';
    const on = () => {
      previousHash = currentHash;
      currentHash = location.hash || '#/';
      setRoute(parseRoute(location.hash));
    };
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
