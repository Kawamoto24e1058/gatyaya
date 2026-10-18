import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Phaser 本体だけで 1MB 超になるため警告閾値を上げる
    chunkSizeWarningLimit: 2000,
  },
});
