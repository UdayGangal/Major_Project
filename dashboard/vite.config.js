
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',

    proxy: {
      '/prometheus': {
        target: process.env.PROMETHEUS_URL || 'http://localhost:9091',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/prometheus/, '')
      }
    }
  }
});
