/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { precachePlugin } from './vite-plugin-precache.ts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [preact(), precachePlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { sourcemap: false, target: 'es2022' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.{ts,mjs}',
      'vite-plugin-precache.test.ts',
    ],
    passWithNoTests: true,
  },
});
