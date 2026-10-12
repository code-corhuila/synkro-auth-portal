import { fileURLToPath } from 'node:url';
import federation from '@originjs/vite-plugin-federation';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    return { base: env.VITE_BASE_PATH || '/', plugins: [react(), ...(mode === 'test' ? [] : [federation({
                    name: 'authPortal', filename: 'remoteEntry.js', exposes: { './Login': './src/Login.tsx', './App': './src/App.tsx' },
                    remotes: { shell: env.VITE_SHELL_ENTRY_URL || 'http://localhost:5173/assets/remoteEntry.js' },
                    shared: { react: { import: false, requiredVersion: '^19.2.8' }, 'react-dom': { import: false, requiredVersion: '^19.2.8' } },
                })])], build: { target: 'esnext', modulePreload: false, cssCodeSplit: false, minify: false },
        preview: { port: 5174, strictPort: true }, test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts',
            alias: { 'shell/authentication': fileURLToPath(new URL('./src/test-doubles/authentication.ts', import.meta.url)) },
            coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.*', 'src/test-doubles/**', 'src/test-setup.ts', 'src/**/*.d.ts'], reporter: ['text', 'lcov'], thresholds: { statements: 70 } },
        } };
});
