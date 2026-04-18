import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Set base to '/' for local dev; set to '/tax-talaivaa/' for GitHub Pages deploy.
// Override via VITE_BASE env var: VITE_BASE=/tax-talaivaa/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [svelte()],
  build: {
    outDir: 'dist',
  },
});
