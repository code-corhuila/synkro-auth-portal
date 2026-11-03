import { beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '../../test-doubles/apiClient';
import { getUserById, registerUser } from './usersApi';

const payload = { name: 'Alice', email: 'alice@example.test', password: 'secret123', role: 'SALESPERSON' as const };
const profile = { userId: 'u-1', name: 'Alice', email: 'alice@example.test', role: 'SALESPERSON', registrationDate: '2026-11-03T00:00:00Z', active: true };

beforeEach(() => {
  apiClient.request.mockReset();
});

describe('registerUser', () => {
  it('POSTs to the register contract with the Idempotency-Key as a client option, never a manual header', async () => {
    apiClient.request.mockResolvedValue(profile);
    const controller = new AbortController();

    await registerUser(payload, 'key-123', controller.signal);

    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/auth/register', {
      method: 'POST',
      body: payload,
      idempotencyKey: 'key-123',
      signal: controller.signal,
    });
  });
});

describe('getUserById', () => {
  it('GETs the known-ID lookup contract and forwards the cancellation signal', async () => {
    apiClient.request.mockResolvedValue(profile);
    const controller = new AbortController();

    await getUserById('11111111-1111-1111-1111-111111111111', controller.signal);

    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/auth/users/11111111-1111-1111-1111-111111111111', {
      signal: controller.signal,
    });
  });

  it('encodes the id so it cannot break out of the path segment', async () => {
    apiClient.request.mockResolvedValue(profile);

    await getUserById('weird/id value');

    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/auth/users/weird%2Fid%20value', { signal: undefined });
  });
});
