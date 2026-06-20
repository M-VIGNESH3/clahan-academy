import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/auth': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/api/admin': {
        target: 'http://localhost:4002',
        changeOrigin: true,
      },
      '/api/student': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
      '/api/exams': {
        target: 'http://localhost:4004',
        changeOrigin: true,
      },
      '/api/proctor': {
        target: 'http://localhost:4005',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4005',
        ws: true,
        changeOrigin: true,
      },
      '/api/notifications': {
        target: 'http://localhost:4006',
        changeOrigin: true,
      },
    }
  },
});
