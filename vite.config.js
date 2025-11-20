// vite.config.js
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({

  base: '/indonesia-earthquake-stc-map/',

  plugins: [
    tailwindcss(),
  ],
});