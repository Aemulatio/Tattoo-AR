import browserslistToEsbuild from 'browserslist-to-esbuild';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

const target = browserslistToEsbuild();

export default defineConfig(({ command, mode }) => {
  const useDevelopmentHttps = command === 'serve' && mode === 'https';

  return {
    plugins: [
      react(),
      ...(useDevelopmentHttps
        ? [
            basicSsl({
              name: 'ar-tattoo-dev',
              ttlDays: 30,
            }),
          ]
        : []),
    ],
    server: useDevelopmentHttps
      ? {
          host: '0.0.0.0',
          port: 5173,
          strictPort: true,
        }
      : undefined,
    build: {
      // Resolve targets from .browserslistrc instead of TypeScript's no-emit config.
      target,
      cssTarget: target,
    },
  };
});
