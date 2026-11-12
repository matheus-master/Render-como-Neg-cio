import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Em dev, /api vai para o Worker local (npm run worker:dev, porta 8787).
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
