import { apiClient } from 'shell/apiClient';
import { SERVICES, type IssueServiceTokenPayload, type IssuedServiceToken, type ServiceTokenMetadata } from '../model/serviceToken';

// Strips any extra/malicious field from the Host response before it ever
// reaches a component — same allowlist-projection pattern as usersApi.
function safeMetadata(value: ServiceTokenMetadata): ServiceTokenMetadata {
  if (!value || typeof value.tokenId !== 'string' || !SERVICES.includes(value.service)
    || !Array.isArray(value.permissions) || !value.permissions.every((permission) => typeof permission === 'string')
    || typeof value.issuedBy !== 'string' || typeof value.issuedAt !== 'string' || typeof value.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(value.issuedAt)) || !Number.isFinite(Date.parse(value.expiresAt))
    || Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    throw new Error('Invalid service token response');
  }
  const { tokenId, service, permissions, issuedBy, issuedAt, expiresAt } = value;
  return { tokenId, service, permissions: [...permissions], issuedBy, issuedAt, expiresAt };
}

// Both calls go through the Host's single client. No gateway URL and no
// manual credential header here: the Host attaches that after its own
// session gate (_stacks/frontend.md).
export function issueServiceToken(
  body: IssueServiceTokenPayload,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<IssuedServiceToken> {
  return apiClient
    .request<IssuedServiceToken>('/api/v1/auth/service-tokens', { method: 'POST', body: { service: body.service }, idempotencyKey, signal })
    .then((raw) => {
      const metadata = safeMetadata(raw);
      if (metadata.service !== body.service || (raw.token !== undefined && (typeof raw.token !== 'string' || !raw.token.trim()))) {
        throw new Error('Invalid service token response');
      }
      return typeof raw.token === 'string' ? { ...metadata, token: raw.token } : metadata;
    });
}

export function getServiceTokenById(id: string, signal?: AbortSignal): Promise<ServiceTokenMetadata> {
  return apiClient
    .request<ServiceTokenMetadata>(`/api/v1/auth/service-tokens/${encodeURIComponent(id)}`, { signal })
    .then(safeMetadata);
}
