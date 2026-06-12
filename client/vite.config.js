import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy vendors so the first-paint bundle is small. Recharts
        // and framer-motion are huge and only needed after the user clicks
        // through to specific pages, so we shove them into their own chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-dom') || id.match(/\\react\\/) || id.match(/\/react\//)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});
