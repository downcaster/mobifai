import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2015',
    outDir: '../src/assets',
    assetsDir: '',
    cssCodeSplit: false,
    rollupOptions: {
      input: './index.html',
      output: {
        entryFileNames: 'editor.js',
        assetFileNames: 'editor.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
});

