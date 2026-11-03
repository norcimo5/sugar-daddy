import type { Plugin, ResolvedConfig } from 'vite';

// The project has no @types/node, so Node builtins are loaded at build time through
// process.getBuiltinModule with the few signatures this plugin needs.
interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
  readdirSync(
    path: string,
    options: { recursive: true; withFileTypes: true },
  ): { name: string; parentPath: string; isFile(): boolean }[];
}
interface NodePath {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  resolve(...parts: string[]): string;
}
interface NodeCrypto {
  createHash(algorithm: string): {
    update(data: string): ReturnType<NodeCrypto['createHash']>;
    digest(encoding: 'hex'): string;
  };
}

function builtin<T>(id: string): T {
  const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } })
    .process;
  return proc.getBuiltinModule(id) as T;
}

const PRECACHE_PLACEHOLDER = /^self\.__PRECACHE__ = \[\];$/m;
const BUILD_ID_PLACEHOLDER = /^const BUILD_ID = 'dev';$/m;
const EXCLUDED = new Set(['/sw.js', '/_headers']);

/** Normalise emitted file names into a sorted, deduped list of root-relative URLs. */
export function buildPrecacheList(files: string[]): string[] {
  const urls = new Set<string>();
  for (const file of files) {
    const posix = file.replace(/\\/g, '/');
    const url = posix.startsWith('/') ? posix : `/${posix}`;
    if (EXCLUDED.has(url) || url.endsWith('.map')) continue;
    urls.add(url);
  }
  return [...urls].sort();
}

/** Replace the two placeholder lines in the service worker source. Throws if either is missing. */
export function injectPrecache(swSource: string, list: string[], buildId: string): string {
  if (!PRECACHE_PLACEHOLDER.test(swSource)) {
    throw new Error('sw.js: placeholder `self.__PRECACHE__ = [];` not found');
  }
  if (!BUILD_ID_PLACEHOLDER.test(swSource)) {
    throw new Error("sw.js: placeholder `const BUILD_ID = 'dev';` not found");
  }
  // Function replacers so `$` sequences in the JSON are never interpreted as patterns.
  return swSource
    .replace(PRECACHE_PLACEHOLDER, () => `self.__PRECACHE__ = ${JSON.stringify(list)};`)
    .replace(BUILD_ID_PLACEHOLDER, () => `const BUILD_ID = ${JSON.stringify(buildId)};`);
}

function listFiles(fs: NodeFs, path: NodePath, dir: string): string[] {
  const { existsSync, readdirSync } = fs;
  const { join, relative } = path;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/** Build-only plugin: writes the precache list and a build id into dist/sw.js. */
export function precachePlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'sugar-daddy-precache',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    writeBundle(options, bundle) {
      const fs = builtin<NodeFs>('node:fs');
      const path = builtin<NodePath>('node:path');
      const { existsSync, readFileSync, writeFileSync } = fs;
      const { join, resolve } = path;
      const outDir = resolve(config.root, options.dir ?? config.build.outDir);
      const publicDir = config.publicDir;
      const publicFiles = publicDir
        ? listFiles(fs, path, publicDir).filter(
            (f) => f === 'manifest.webmanifest' || f.replace(/\\/g, '/').startsWith('icons/'),
          )
        : [];
      const list = buildPrecacheList(['/', 'index.html', ...Object.keys(bundle), ...publicFiles]);
      const buildId = builtin<NodeCrypto>('node:crypto')
        .createHash('sha256')
        .update(JSON.stringify(list))
        .update(String(Date.now()))
        .digest('hex')
        .slice(0, 12);
      const swPath = join(outDir, 'sw.js');
      if (!existsSync(swPath)) {
        this.error('dist/sw.js not found; public/sw.js must exist');
      }
      writeFileSync(swPath, injectPrecache(readFileSync(swPath, 'utf8'), list, buildId));
    },
  };
}
