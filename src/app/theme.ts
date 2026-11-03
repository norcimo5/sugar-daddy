import type { ThemePref } from '../domain/types';

export type ResolvedTheme = 'light' | 'dark';

/** Page backgrounds; must match `--bg` in src/styles.css for each theme. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#eef3f7',
  dark: '#070d14',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark ? 'dark' : 'light';
}

function setThemeColor(doc: Document, color: string): void {
  const metas = [...doc.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  let meta = metas.find((m) => !m.hasAttribute('media'));
  for (const m of metas) if (m !== meta) m.remove();
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.appendChild(meta);
  }
  meta.content = color;
}

/**
 * Applies the theme to <html data-theme> and the browser chrome colour.
 * For 'system' it follows prefers-color-scheme changes until the returned cleanup runs.
 */
export function applyTheme(pref: ThemePref, win: Window = window): () => void {
  const doc = win.document;
  const mql = typeof win.matchMedia === 'function' ? win.matchMedia(DARK_QUERY) : null;
  const apply = (systemDark: boolean) => {
    const theme = resolveTheme(pref, systemDark);
    doc.documentElement.dataset.theme = theme;
    setThemeColor(doc, THEME_COLORS[theme]);
  };
  apply(mql?.matches ?? false);
  if (pref !== 'system' || !mql) return () => {};
  const onChange = (e: { matches: boolean }) => apply(e.matches);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
