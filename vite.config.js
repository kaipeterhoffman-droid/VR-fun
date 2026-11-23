import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: command === 'serve' ? [iwsdkDev({ emulator: { device: 'metaQuest3', environment: 'sunlit_living_room' } })] : [],
  base: './',
  build: { outDir: 'dist', target: 'esnext' },
  esbuild: { target: 'esnext' },
  resolve: { dedupe: ['three', '@pmndrs/uikit'] },
  optimizeDeps: { exclude: ['@babylonjs/havok'], esbuildOptions: { target: 'esnext' } },
}));
