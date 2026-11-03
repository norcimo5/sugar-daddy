import { buildPrecacheList, injectPrecache } from './vite-plugin-precache';

describe('buildPrecacheList', () => {
  it('adds a leading slash, dedupes and sorts', () => {
    expect(buildPrecacheList(['b.js', '/a.css', 'b.js', 'assets/c.js'])).toEqual([
      '/a.css',
      '/assets/c.js',
      '/b.js',
    ]);
  });

  it('excludes sw.js, _headers and source maps', () => {
    expect(
      buildPrecacheList(['sw.js', '/_headers', 'assets/x.js.map', 'assets/x.js', 'index.html']),
    ).toEqual(['/assets/x.js', '/index.html']);
  });

  it('keeps the root path', () => {
    expect(buildPrecacheList(['/', 'index.html'])).toEqual(['/', '/index.html']);
  });

  it('normalises backslashes from Windows paths', () => {
    expect(buildPrecacheList(['icons\\icon-192.png'])).toEqual(['/icons/icon-192.png']);
  });
});

describe('injectPrecache', () => {
  const source = [
    "'use strict';",
    'self.__PRECACHE__ = [];',
    "const BUILD_ID = 'dev';",
    'console.warn(BUILD_ID);',
  ].join('\n');

  it('replaces both placeholder lines', () => {
    const out = injectPrecache(source, ['/', '/index.html'], 'abc123');
    expect(out).toContain('self.__PRECACHE__ = ["/","/index.html"];');
    expect(out).toContain('const BUILD_ID = "abc123";');
    expect(out).not.toContain("'dev'");
    expect(out).toContain('console.warn(BUILD_ID);');
  });

  it('throws when the precache placeholder is missing', () => {
    expect(() => injectPrecache("const BUILD_ID = 'dev';", ['/'], 'x')).toThrow(/__PRECACHE__/);
  });

  it('throws when the build id placeholder is missing', () => {
    expect(() => injectPrecache('self.__PRECACHE__ = [];', ['/'], 'x')).toThrow(/BUILD_ID/);
  });

  it('escapes list entries safely as JSON', () => {
    const out = injectPrecache(source, ['/a"b.js'], 'id');
    expect(out).toContain('self.__PRECACHE__ = ["/a\\"b.js"];');
  });
});
