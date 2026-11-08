import { describe, expect, it } from 'vitest';
import { expiryStatus } from './serviceToken';

describe('expiryStatus', () => {
  it('is vigente when expiresAt is in the future relative to now', () => {
    expect(expiryStatus('2026-12-01T00:00:00Z', new Date('2026-11-07T00:00:00Z'))).toBe('vigente');
  });

  it('is expirado when expiresAt is in the past relative to now', () => {
    expect(expiryStatus('2026-10-01T00:00:00Z', new Date('2026-11-07T00:00:00Z'))).toBe('expirado');
  });
});
