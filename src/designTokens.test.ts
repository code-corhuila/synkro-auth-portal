// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Frozen from Host develop 02832db9: shared CSS names are a consumer contract.
const tokens = new Set([...readFileSync('src/test-doubles/host-tokens.css', 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
function cssFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}
it('uses only custom properties supplied by the shared Host design contract', () => {
  const unknown = cssFiles('src/auth').flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/var\((--[\w-]+)/g)]
    .filter((match) => !tokens.has(match[1])).map((match) => `${path}: ${match[1]}`));
  expect(unknown).toEqual([]);
});
