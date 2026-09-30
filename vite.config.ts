import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The dashboard talks directly to Convex (VITE_CONVEX_URL). No secrets are read here —
// they live in Convex environment variables.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
});
