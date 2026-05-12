import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { hostname } from 'os';

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host:"0.0.0.0",
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
});
