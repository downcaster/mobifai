import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2015',
    outDir: '../src/assets',
    assetsDir: '',
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'editor.html'),
      output: {
        entryFileNames: 'editor.js',
        assetFileNames: 'editor.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
});

