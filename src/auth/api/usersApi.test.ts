import { beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '../../test-doubles/apiClient';
import { getUserById, registerUser, resetUserPassword } from './usersApi';

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

describe('resetUserPassword', () => {
  const target = '11111111-1111-1111-1111-111111111111';
  const request = { newPassword: 'Another-pass-9', confirmPassword: 'Another-pass-9' };
  const result = { userId: target, passwordResetAt: '2026-11-10T20:00:00.123456Z' };

  it('POSTs to the reset contract with the Idempotency-Key as a client option and the password only in the body', async () => {
    apiClient.request.mockResolvedValue(result);
    const controller = new AbortController();

    await resetUserPassword(target, request, 'reset-key-1', controller.signal);

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const [path, options] = apiClient.request.mock.calls[0];
    expect(path).toBe('/api/v1/auth/users/' + target + '/password-reset');
    expect(options).toEqual({ method: 'POST', body: request, idempotencyKey: 'reset-key-1', signal: controller.signal });
    expect(path).not.toContain('Another-pass-9');
    expect(options).not.toHaveProperty('headers');
  });

  it('encodes the id so it cannot break out of the path segment', async () => {
    apiClient.request.mockResolvedValue(result);

    await resetUserPassword('weird/id value', request, 'reset-key-1');

    expect(apiClient.request.mock.calls[0][0]).toBe('/api/v1/auth/users/weird%2Fid%20value/password-reset');
  });

  it('returns only the two fields the contract promises, dropping anything else the server might add', async () => {
    apiClient.request.mockResolvedValue({ ...result, passwordHash: 'must-not-travel', newPassword: 'must-not-travel' });

    const value = await resetUserPassword(target, request, 'reset-key-1');

    expect(value).toEqual(result);
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'ok'],
    ['no user id', { passwordResetAt: result.passwordResetAt }],
    ['a numeric instant', { userId: target, passwordResetAt: 1731268800000 }],
    ['an unparseable instant', { userId: target, passwordResetAt: 'yesterday' }],
  ])('rejects a malformed answer (%s) instead of reporting a success it cannot back', async (_label, answer) => {
    apiClient.request.mockResolvedValue(answer);

    await expect(resetUserPassword(target, request, 'reset-key-1')).rejects.toThrow('Invalid password reset response');
  });

  it('lets a failure of the Host client through untouched, so the caller can classify it', async () => {
    const failure = { status: 422, body: { error: 'BUSINESS_RULE_VIOLATION', message: 'm', traceId: 't' } };
    apiClient.request.mockRejectedValue(failure);

    await expect(resetUserPassword(target, request, 'reset-key-1')).rejects.toBe(failure);
  });
});
