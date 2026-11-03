import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, resolveTheme, THEME_COLORS } from './theme';

type Listener = (e: { matches: boolean }) => void;

/** Minimal controllable stand-in for window.matchMedia. */
function fakeWindow(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  const win = Object.create(window) as Window;
  Object.defineProperty(win, 'document', { value: document });
  Object.defineProperty(win, 'matchMedia', { value: () => mql });
  return {
    win,
    listeners,
    setDark(v: boolean) {
      dark = v;
      for (const l of [...listeners]) l({ matches: v });
    },
  };
}

function themeMetas() {
  return [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

describe('resolveTheme', () => {
  it('follows the system when pref is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('honours an explicit choice regardless of system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    document.head.innerHTML =
      '<meta name="theme-color" content="#111111" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" content="#222222" media="(prefers-color-scheme: dark)">';
  });

  it('sets data-theme on <html> to the resolved theme', () => {
    const { win } = fakeWindow(false);
    applyTheme('dark', win);
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light', win);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('replaces media-specific theme-color metas with a single one matching the theme', () => {
    const { win } = fakeWindow(true);
    applyTheme('system', win);
    let metas = themeMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0]?.hasAttribute('media')).toBe(false);
    expect(metas[0]?.content).toBe(THEME_COLORS.dark);
    applyTheme('light', win);
    metas = themeMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0]?.content).toBe(THEME_COLORS.light);
  });

  it('creates the meta when none exists', () => {
    document.head.innerHTML = '';
    applyTheme('light', fakeWindow(false).win);
    expect(themeMetas().map((m) => m.content)).toEqual([THEME_COLORS.light]);
  });

  it('re-applies on system changes when pref is system, until cleaned up', () => {
    const fw = fakeWindow(false);
    const cleanup = applyTheme('system', fw.win);
    expect(document.documentElement.dataset.theme).toBe('light');
    fw.setDark(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeMetas()[0]?.content).toBe(THEME_COLORS.dark);
    cleanup();
    expect(fw.listeners.size).toBe(0);
    fw.setDark(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('does not subscribe for an explicit pref', () => {
    const fw = fakeWindow(true);
    const cleanup = applyTheme('light', fw.win);
    expect(fw.listeners.size).toBe(0);
    fw.setDark(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    cleanup();
  });

  it('works when matchMedia is unavailable', () => {
    const win = Object.create(window) as Window;
    Object.defineProperty(win, 'document', { value: document });
    Object.defineProperty(win, 'matchMedia', { value: undefined });
    const cleanup = applyTheme('system', win);
    expect(document.documentElement.dataset.theme).toBe('light');
    cleanup();
  });

  it('exports hex theme colours', () => {
    expect(THEME_COLORS.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLORS.dark).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
