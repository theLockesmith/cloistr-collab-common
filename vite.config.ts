/**
 * @fileoverview Vite configuration for UMD build
 * Produces a standalone bundle for vanilla JS environments (e.g., cloistr-stash)
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // Entry point for the UMD auth bundle
      entry: resolve(__dirname, 'src/auth/index.ts'),
      name: 'CloistAuth',
      fileName: (format) => `cloistr-auth.${format}.js`,
      formats: ['umd', 'es'],
    },
    outDir: 'dist/umd',
    // Don't clear outDir to preserve ESM build in dist/
    emptyOutDir: true,
    rollupOptions: {
      // Bundle all dependencies for UMD (standalone)
      external: [],
      output: {
        // Provide global variables for external dependencies if needed
        globals: {},
        // Ensure proper UMD wrapper
        inlineDynamicImports: true,
      },
    },
    // Target modern browsers for smaller bundle
    target: 'es2020',
    // Generate sourcemap for debugging
    sourcemap: true,
    // Minify for production
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      // Ensure proper module resolution
    },
  },
  // Define environment for browser
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
