import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 }, // three.js alone is ~700 kB
  worker: { format: 'es' }, // the cave worker is an ES module
  // (Each build its own name: what a world's rivers were worked out by, so a
  // new build, which may shape the land differently, never reuses them. See riverStore.)
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
});
