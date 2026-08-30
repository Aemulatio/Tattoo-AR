import browserslistToEsbuild from 'browserslist-to-esbuild';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

const target = browserslistToEsbuild();

export default defineConfig({
  plugins: [react()],
  build: {
    // Resolve targets from .browserslistrc instead of TypeScript's no-emit config.
    target,
    cssTarget: target,
  },
});
