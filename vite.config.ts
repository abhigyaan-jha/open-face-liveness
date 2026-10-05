import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // dist/ holds the library build, so the demo builds elsewhere.
  build: { outDir: 'demo-dist' },
  plugins: [react()],
});
