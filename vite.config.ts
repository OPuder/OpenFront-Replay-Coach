import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: { port: 5173, strictPort: true },
});
