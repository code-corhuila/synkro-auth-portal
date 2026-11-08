import { beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '../../test-doubles/apiClient';
import { getServiceTokenById, issueServiceToken } from './serviceTokensApi';

const issued = {
  tokenId: 't-1', service: 'synkro-workflow' as const,
  permissions: ['customers:read', 'stock:reserve', 'stock:release', 'sales:register'],
  issuedBy: 'admin-1', issuedAt: '2026-11-07T00:00:00Z', expiresAt: '2026-12-07T00:00:00Z',
  token: 'eyJ.header.payload',
};
const metadata = { ...issued, token: undefined } as const;

beforeEach(() => {
  apiClient.request.mockReset();
});

describe('issueServiceToken (first emission)', () => {
  it('POSTs to the contract with the Idempotency-Key as a client option and returns the token once', async () => {
    apiClient.request.mockResolvedValue(issued);
    const controller = new AbortController();

    const result = await issueServiceToken({ service: 'synkro-workflow' }, 'key-123', controller.signal);

    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/auth/service-tokens', {
      method: 'POST',
      body: { service: 'synkro-workflow' },
      idempotencyKey: 'key-123',
      signal: controller.signal,
    });
    expect(result.token).toBe('eyJ.header.payload');
    expect(result.tokenId).toBe('t-1');
  });
});

describe('issueServiceToken (replay)', () => {
  it('returns metadata without a token when the Host replays a 200', async () => {
    apiClient.request.mockResolvedValue(metadata);

    const result = await issueServiceToken({ service: 'synkro-workflow' }, 'key-123');

    expect(result.token).toBeUndefined();
    expect(result.tokenId).toBe('t-1');
  });
});

describe('issueServiceToken (malformed response)', () => {
  it.each([null, '', 42])('rejects a malformed credential instead of calling it a replay (%s)', async (token) => {
    apiClient.request.mockResolvedValue({ ...issued, token });
    await expect(issueServiceToken({ service: 'synkro-workflow' }, 'key-123')).rejects.toThrow();
  });

  it('rejects metadata with invalid dates', async () => {
    apiClient.request.mockResolvedValue({ ...issued, expiresAt: 'invalid' });
    await expect(issueServiceToken({ service: 'synkro-workflow' }, 'key-123')).rejects.toThrow();
  });

  it('rejects an unexpected service and sends only the selected service', async () => {
    apiClient.request.mockResolvedValue(issued);
    await expect(issueServiceToken({ service: 'synkro-worker' }, 'key-123')).rejects.toThrow();
    expect(apiClient.request.mock.calls[0][1].body).toEqual({ service: 'synkro-worker' });
  });
  it('rejects a response with an unknown service instead of trusting it', async () => {
    apiClient.request.mockResolvedValue({ ...metadata, service: 'not-a-real-service' });

    await expect(issueServiceToken({ service: 'synkro-workflow' }, 'key-123')).rejects.toThrow();
  });

  it('rejects a response missing permissions', async () => {
    apiClient.request.mockResolvedValue({ ...metadata, permissions: undefined });

    await expect(issueServiceToken({ service: 'synkro-workflow' }, 'key-123')).rejects.toThrow();
  });

  it('strips any extra field the Host did not promise, such as a stray secret-looking key', async () => {
    apiClient.request.mockResolvedValue({ ...issued, roles: ['SERVICE'], secretHint: 'nope' });

    const result = await issueServiceToken({ service: 'synkro-workflow' }, 'key-123');

    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('secretHint');
  });
});

describe('getServiceTokenById', () => {
  it('GETs the known-ID metadata contract and forwards the cancellation signal', async () => {
    apiClient.request.mockResolvedValue(metadata);
    const controller = new AbortController();

    await getServiceTokenById('11111111-1111-1111-1111-111111111111', controller.signal);

    expect(apiClient.request).toHaveBeenCalledWith(
      '/api/v1/auth/service-tokens/11111111-1111-1111-1111-111111111111',
      { signal: controller.signal },
    );
  });

  it('encodes the id so it cannot break out of the path segment', async () => {
    apiClient.request.mockResolvedValue(metadata);

    await getServiceTokenById('weird/id value');

    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/auth/service-tokens/weird%2Fid%20value', { signal: undefined });
  });

  it('never exposes a token field even if the Host mistakenly sends one', async () => {
    apiClient.request.mockResolvedValue({ ...metadata, token: 'leaked' });

    const result = await getServiceTokenById('11111111-1111-1111-1111-111111111111');

    expect(result).not.toHaveProperty('token');
  });
});
