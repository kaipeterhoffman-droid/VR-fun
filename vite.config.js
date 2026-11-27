import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: command === 'serve' ? [iwsdkDev({ emulator: { device: 'metaQuest3', environment: 'sunlit_living_room' } })] : [],
  base: './',
  // two pages: Trick Shot at the root, and the river at ifing/
  build: { outDir: 'dist', target: 'esnext', rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), ifing: resolve(import.meta.dirname, 'ifing/index.html') } } },
  esbuild: { target: 'esnext' },
  resolve: { dedupe: ['three', '@pmndrs/uikit'] },
  optimizeDeps: { exclude: ['@babylonjs/havok'], esbuildOptions: { target: 'esnext' } },
}));
