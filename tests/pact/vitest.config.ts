import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({test:{environment:'node',globals:true,fileParallelism:false,
  globalSetup:['tests/pact/clean.ts'],include:['tests/pact/*.test.ts'],testTimeout:30000},
  resolve:{alias:{'shell/apiClient':fileURLToPath(new URL('../../src/test-doubles/apiClient.ts',import.meta.url))}}});
