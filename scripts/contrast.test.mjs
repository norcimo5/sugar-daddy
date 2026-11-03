// WCAG 2.x contrast checks for the colour tokens in src/styles.css, both themes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME_COLORS } from '../src/app/theme.ts';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

/** Returns the declarations body of the first rule whose selector list matches `selectorRe`. */
function blockBody(selectorRe) {
  const re = new RegExp(`(^|\\n)\\s*([^{}]*${selectorRe.source}[^{}]*)\\{([^{}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`No CSS block matching ${selectorRe}`);
  return m[3];
}

function tokens(body) {
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6) throw new Error(`Use opaque 6-digit hex for checked tokens: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = {
  light: tokens(blockBody(/:root\[data-theme='light'\]/)),
  dark: tokens(blockBody(/:root\[data-theme='dark'\]/)),
};

const TEXT = 4.5;
const UI = 3;

/** [foreground, background, minimum] */
const PAIRS = [
  ...['text', 'text-muted', 'primary', 'accent', 'alert'].flatMap((fg) =>
    ['bg', 'surface', 'surface-2'].map((bg) => [fg, bg, TEXT]),
  ),
  ['accent', 'accent-soft', TEXT],
  ['text', 'accent-soft', TEXT],
  ['primary', 'primary-soft', TEXT],
  ['text', 'primary-soft', TEXT],
  ['ok', 'ok-bg', TEXT],
  ['warn', 'warn-bg', TEXT],
  ['alert', 'alert-bg', TEXT],
  ['text', 'neutral-bg', TEXT],
  ['text', 'warn-bg', TEXT],
  ['on-cta', 'cta-from', TEXT],
  ['on-cta', 'cta-to', TEXT],
  ['toast-fg', 'toast-bg', TEXT],
  ['toast-error-fg', 'toast-error-bg', TEXT],
  ['status-ok', 'surface', TEXT],
  ['status-ok', 'bg', TEXT],
  ['field-border', 'surface', UI],
  ['field-border', 'bg', UI],
  ['focus', 'bg', UI],
  ['focus', 'surface', UI],
  ['chart-line', 'surface', UI],
];

describe('theme tokens', () => {
  it('default :root and the dark media fallback mirror the explicit themes', () => {
    const fallback = tokens(blockBody(/:root:not\(\[data-theme\]\)/));
    expect(fallback).toEqual(THEMES.dark);
    // Default :root shares the light block (selector list ":root, :root[data-theme='light']").
    expect(css).toMatch(/:root,\s*:root\[data-theme='light'\]\s*\{/);
  });

  it('THEME_COLORS matches each theme --bg', () => {
    expect(THEMES.light.bg).toBe(THEME_COLORS.light);
    expect(THEMES.dark.bg).toBe(THEME_COLORS.dark);
  });
});

for (const [theme, t] of Object.entries(THEMES)) {
  describe(`${theme} theme contrast`, () => {
    it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
      expect(t[fg], `--${fg} missing`).toBeDefined();
      expect(t[bg], `--${bg} missing`).toBeDefined();
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
    });
  });
}
